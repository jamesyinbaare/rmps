from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.config import settings
from app.dependencies.database import DBSessionDep, get_sessionmanager
from app.models import Document, Exam, ExamType, ExamSeries
from app.schemas.document import (
    BulkUploadResponse,
    ContentExtractionResponse,
    DocumentListResponse,
    DocumentQueueStatus,
    DocumentResponse,
    DocumentUpdate,
    ReductoQueueRequest,
    ReductoQueueResponse,
    ReductoStatusResponse,
)
from app.schemas.id_extraction import IDExtractionResponse
from app.services.content_extraction import content_extraction_service
from app.services.id_extraction import id_extraction_service
from app.services.reducto_queue import reducto_queue_service
from app.services.storage import storage_service
from app.utils.file_utils import calculate_checksum

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    session: DBSessionDep,
    file: UploadFile = File(...),
    exam_id: int = Form(...),
) -> DocumentResponse:
    """Upload a single document."""
    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exam with id {exam_id} not found",
        )
    # Validate file type
    allowed_mime_types = ["image/jpeg", "image/png"]
    if file.content_type not in allowed_mime_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Allowed types: {', '.join(allowed_mime_types)}",
        )

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > settings.storage_max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {settings.storage_max_size} bytes",
        )

    # Calculate checksum before saving
    checksum = calculate_checksum(content)

    # Check for duplicate file
    duplicate_stmt = select(Document).where(Document.checksum == checksum)
    duplicate_result = await session.execute(duplicate_stmt)
    existing_document = duplicate_result.scalar_one_or_none()

    if existing_document:
        if settings.reject_duplicate_files:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"File already exists. Duplicate of document ID: {existing_document.id}",
            )
        else:
            # Return existing document
            return DocumentResponse.model_validate(existing_document)

    # Save file
    file_path, _ = await storage_service.save(content, file.filename or "unknown")

    # Create document record
    db_document = Document(
        file_path=file_path,
        file_name=file.filename or "unknown",
        mime_type=file.content_type or "application/octet-stream",
        file_size=len(content),
        checksum=checksum,
        exam_id=exam_id,
        id_extraction_status="pending",
    )
    session.add(db_document)
    await session.commit()
    await session.refresh(db_document)

    # Extract ID synchronously (file content is already in memory)
    try:
        extraction_result = await id_extraction_service.extract_id(
            content, session, db_document.id, db_document.exam_id
        )

        # Update document with extraction results
        if extraction_result["is_valid"]:
            db_document.extracted_id = extraction_result["extracted_id"]
            db_document.id_extraction_method = extraction_result["method"]
            db_document.id_extraction_confidence = extraction_result["confidence"]
            db_document.school_id = extraction_result.get("school_id")
            db_document.subject_id = extraction_result.get("subject_id")
            db_document.test_type = extraction_result.get("test_type")
            db_document.subject_series = extraction_result.get("subject_series")
            db_document.sheet_number = extraction_result.get("sheet_number")
            db_document.id_extraction_status = "success"
            db_document.id_extracted_at = datetime.utcnow()
        else:
            db_document.id_extraction_method = extraction_result.get("method")
            db_document.id_extraction_confidence = extraction_result.get("confidence", 0.0)
            db_document.id_extraction_status = "error"

        await session.commit()
        await session.refresh(db_document)
    except Exception:
        # If extraction fails, document is still saved but marked as error
        db_document.id_extraction_status = "error"
        await session.commit()
        await session.refresh(db_document)

    return DocumentResponse.model_validate(db_document)


async def _extract_ids_for_documents(document_ids: list[int]) -> None:
    """Background helper to extract IDs for multiple documents."""
    sessionmanager = get_sessionmanager()
    async with sessionmanager.session() as session:
        for document_id in document_ids:
            try:
                # Get document
                stmt = select(Document).where(Document.id == document_id)
                result = await session.execute(stmt)
                document = result.scalar_one_or_none()
                if not document:
                    continue

                # Retrieve file content
                try:
                    file_content = await storage_service.retrieve(document.file_path)
                except FileNotFoundError:
                    document.id_extraction_status = "error"
                    await session.commit()
                    continue

                # Extract ID
                extraction_result = await id_extraction_service.extract_id(
                    file_content, session, document_id, document.exam_id
                )

                # Update document with extraction results
                if extraction_result["is_valid"]:
                    document.extracted_id = extraction_result["extracted_id"]
                    document.id_extraction_method = extraction_result["method"]
                    document.id_extraction_confidence = extraction_result["confidence"]
                    document.school_id = extraction_result.get("school_id")
                    document.subject_id = extraction_result.get("subject_id")
                    document.test_type = extraction_result.get("test_type")
                    document.subject_series = extraction_result.get("subject_series")
                    document.sheet_number = extraction_result.get("sheet_number")
                    document.id_extraction_status = "success"
                    document.id_extracted_at = datetime.utcnow()
                else:
                    document.id_extraction_method = extraction_result.get("method")
                    document.id_extraction_confidence = extraction_result.get("confidence", 0.0)
                    document.id_extraction_status = "error"

                await session.commit()
            except Exception:
                # If extraction fails, mark document as error but continue with others
                try:
                    stmt = select(Document).where(Document.id == document_id)
                    result = await session.execute(stmt)
                    document = result.scalar_one_or_none()
                    if document:
                        document.id_extraction_status = "error"
                        await session.commit()
                except Exception:
                    pass  # Continue even if marking as error fails


@router.post("/bulk-upload", response_model=BulkUploadResponse, status_code=status.HTTP_201_CREATED)
async def bulk_upload_documents(
    session: DBSessionDep,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    exam_id: int = Form(...),
) -> BulkUploadResponse:
    """Upload multiple documents and trigger background ID extraction."""
    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exam with id {exam_id} not found",
        )

    allowed_mime_types = ["image/jpeg", "image/png"]

    total = len(files)
    successful = 0
    failed = 0
    skipped = 0
    document_ids: list[int] = []
    new_documents: list[Document] = []

    for file in files:
        try:
            # Validate file type
            if file.content_type not in allowed_mime_types:
                skipped += 1
                continue

            # Read file content
            content = await file.read()

            # Validate file size
            if len(content) > settings.storage_max_size:
                skipped += 1
                continue

            # Calculate checksum before saving
            checksum = calculate_checksum(content)

            # Check for duplicate file
            duplicate_stmt = select(Document).where(Document.checksum == checksum)
            duplicate_result = await session.execute(duplicate_stmt)
            existing_document = duplicate_result.scalar_one_or_none()

            if existing_document:
                if settings.reject_duplicate_files:
                    skipped += 1
                    continue
                else:
                    # Use existing document
                    document_ids.append(existing_document.id)
                    successful += 1
                    continue

            # Save file
            file_path, _ = await storage_service.save(content, file.filename or "unknown")

            # Create document record
            db_document = Document(
                file_path=file_path,
                file_name=file.filename or "unknown",
                mime_type=file.content_type or "application/octet-stream",
                file_size=len(content),
                checksum=checksum,
                exam_id=exam_id,
                id_extraction_status="pending",
            )
            session.add(db_document)
            new_documents.append(db_document)
            successful += 1
        except Exception:
            failed += 1
            continue

    # Commit all documents and get their IDs
    await session.flush()

    # Get all newly created document IDs
    for doc in new_documents:
        if doc.id:
            document_ids.append(doc.id)

    await session.commit()

    # Trigger background extraction for all uploaded documents
    if document_ids:
        background_tasks.add_task(_extract_ids_for_documents, document_ids)

    return BulkUploadResponse(
        total=total,
        successful=successful,
        failed=failed,
        skipped=skipped,
        document_ids=document_ids,
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: int, session: DBSessionDep) -> DocumentResponse:
    """Retrieve document metadata."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return DocumentResponse.model_validate(document)


@router.get("/{document_id}/download")
async def download_document(document_id: int, session: DBSessionDep) -> StreamingResponse:
    """Download document file."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    try:
        file_content = await storage_service.retrieve(document.file_path)
        return StreamingResponse(
            iter([file_content]),
            media_type=document.mime_type,
            headers={"Content-Disposition": f'attachment; filename="{document.file_name}"'},
        )
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in storage")


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    session: DBSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    exam_id: int | None = Query(None),
    exam_type: ExamType | None = Query(None, description="Filter by examination type"),
    series: ExamSeries | None = Query(None, description="Filter by examination series"),
    year: int | None = Query(None, ge=1900, le=2100, description="Filter by examination year"),
    school_id: int | None = Query(None),
    subject_id: int | None = Query(None),
) -> DocumentListResponse:
    """List documents with pagination and optional filters."""
    offset = (page - 1) * page_size

    # Build base query with filters
    # If filtering by exam_type, series, or year (and not using exam_id), join with Exam table
    if (exam_type is not None or series is not None or year is not None) and exam_id is None:
        base_stmt = select(Document).join(Exam, Document.exam_id == Exam.id)
    else:
        base_stmt = select(Document)

    # Apply filters
    if exam_id is not None:
        base_stmt = base_stmt.where(Document.exam_id == exam_id)

    # Apply exam_type, series, year filters (these require the join above)
    if exam_type is not None and exam_id is None:
        base_stmt = base_stmt.where(Exam.name == exam_type)
    if series is not None and exam_id is None:
        base_stmt = base_stmt.where(Exam.series == series)
    if year is not None and exam_id is None:
        base_stmt = base_stmt.where(Exam.year == year)

    if school_id is not None:
        base_stmt = base_stmt.where(Document.school_id == school_id)
    if subject_id is not None:
        base_stmt = base_stmt.where(Document.subject_id == subject_id)

    # Get total count with same filters
    if (exam_type is not None or series is not None or year is not None) and exam_id is None:
        count_stmt = select(func.count(Document.id)).select_from(Document).join(Exam, Document.exam_id == Exam.id)
    else:
        count_stmt = select(func.count(Document.id))

    # Apply filters
    if exam_id is not None:
        count_stmt = count_stmt.where(Document.exam_id == exam_id)

    # Apply exam_type, series, year filters (these require the join above)
    if exam_type is not None and exam_id is None:
        count_stmt = count_stmt.where(Exam.name == exam_type)
    if series is not None and exam_id is None:
        count_stmt = count_stmt.where(Exam.series == series)
    if year is not None and exam_id is None:
        count_stmt = count_stmt.where(Exam.year == year)

    if school_id is not None:
        count_stmt = count_stmt.where(Document.school_id == school_id)
    if subject_id is not None:
        count_stmt = count_stmt.where(Document.subject_id == subject_id)
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get documents with filters
    stmt = base_stmt.offset(offset).limit(page_size).order_by(Document.uploaded_at.desc())
    result = await session.execute(stmt)
    documents = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return DocumentListResponse(
        items=[DocumentResponse.model_validate(doc) for doc in documents],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: int, session: DBSessionDep) -> None:
    """Delete document and its file."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Delete file from storage
    try:
        await storage_service.delete(document.file_path)
    except Exception:
        pass  # Continue even if file deletion fails

    # Delete document record
    await session.delete(document)
    await session.commit()


@router.get("/{document_id}/checksum")
async def verify_checksum(document_id: int, session: DBSessionDep) -> dict[str, Any]:
    """Verify file integrity by comparing checksums."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    try:
        current_checksum = await storage_service.get_checksum(document.file_path)
        is_valid = current_checksum == document.checksum
        return {
            "document_id": document_id,
            "stored_checksum": document.checksum,
            "current_checksum": current_checksum,
            "is_valid": is_valid,
        }
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in storage")


@router.post("/{document_id}/extract-id", response_model=IDExtractionResponse)
async def extract_id(session: DBSessionDep, document_id: int) -> IDExtractionResponse:
    """Extract ID from document using barcode or OCR."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Retrieve file content
    try:
        file_content = await storage_service.retrieve(document.file_path)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in storage")

    # Extract ID
    extraction_result = await id_extraction_service.extract_id(file_content, session, document_id, document.exam_id)

    # Update document with extraction results
    if extraction_result["is_valid"]:
        document.extracted_id = extraction_result["extracted_id"]
        document.id_extraction_method = extraction_result["method"]
        document.id_extraction_confidence = extraction_result["confidence"]
        document.school_id = extraction_result.get("school_id")
        document.subject_id = extraction_result.get("subject_id")
        document.test_type = extraction_result.get("test_type")
        document.subject_series = extraction_result.get("subject_series")
        document.sheet_number = extraction_result.get("sheet_number")
        document.id_extraction_status = "success"
        document.id_extracted_at = datetime.utcnow()
    else:
        document.id_extraction_method = extraction_result.get("method")
        document.id_extraction_confidence = extraction_result.get("confidence", 0.0)
        document.id_extraction_status = "error"

    await session.commit()
    await session.refresh(document)

    return IDExtractionResponse(**extraction_result)


@router.post("/{document_id}/parse-content", response_model=ContentExtractionResponse)
async def parse_content(
    session: DBSessionDep,
    document_id: int,
    method: str | None = Query(None, description="Extraction method: 'ocr' or 'reducto'. If None, uses configured default"),
) -> ContentExtractionResponse:
    """Parse document content and extract full text and tables."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Retrieve file content
    try:
        file_content = await storage_service.retrieve(document.file_path)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in storage")

    # Extract content
    extraction_result = await content_extraction_service.extract_content(
        file_content, method=method, test_type=document.test_type
    )

    # Update document with extraction results
    if extraction_result["is_valid"]:
        document.scores_extraction_data = extraction_result["parsed_content"]
        document.scores_extraction_method = extraction_result["parsing_method"]
        document.scores_extraction_confidence = extraction_result["parsing_confidence"]
        document.scores_extraction_status = "success"
        document.scores_extracted_at = datetime.utcnow()
    else:
        document.scores_extraction_method = extraction_result.get("parsing_method")
        document.scores_extraction_confidence = extraction_result.get("parsing_confidence", 0.0)
        document.scores_extraction_status = "error"

    await session.commit()
    await session.refresh(document)

    # Map internal result to response schema
    return ContentExtractionResponse(
        scores_extraction_data=extraction_result["parsed_content"],
        scores_extraction_method=extraction_result["parsing_method"],
        scores_extraction_confidence=extraction_result["parsing_confidence"],
        is_valid=extraction_result["is_valid"],
        error_message=extraction_result.get("error_message"),
    )


@router.patch("/{document_id}/id", response_model=DocumentResponse)
async def update_document_id(document_id: int, update: DocumentUpdate, session: DBSessionDep) -> DocumentResponse:
    """Manually correct document ID and metadata."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Update fields
    if update.school_id is not None:
        document.school_id = update.school_id
    if update.subject_id is not None:
        document.subject_id = update.subject_id
    if update.exam_id is not None:
        # Validate exam exists
        exam_stmt = select(Exam).where(Exam.id == update.exam_id)
        exam_result = await session.execute(exam_stmt)
        exam = exam_result.scalar_one_or_none()
        if not exam:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Exam with id {update.exam_id} not found",
            )
        document.exam_id = update.exam_id
    if update.test_type is not None:
        document.test_type = update.test_type
    if update.subject_series is not None:
        document.subject_series = update.subject_series
    if update.sheet_number is not None:
        document.sheet_number = update.sheet_number
    if update.extracted_id is not None:
        document.extracted_id = update.extracted_id
    if update.id_extraction_method is not None:
        document.id_extraction_method = update.id_extraction_method
    if update.id_extraction_confidence is not None:
        document.id_extraction_confidence = update.id_extraction_confidence
    if update.id_extraction_status is not None:
        document.id_extraction_status = update.id_extraction_status

    # If extracted_id is set manually, mark as manual
    if update.extracted_id is not None and document.id_extraction_method != "manual":
        document.id_extraction_method = "manual"

    await session.commit()
    await session.refresh(document)

    return DocumentResponse.model_validate(document)


@router.post("/queue-reducto-extraction", response_model=ReductoQueueResponse)
async def queue_reducto_extraction(
    request: ReductoQueueRequest, session: DBSessionDep
) -> ReductoQueueResponse:
    """Queue documents for Reducto extraction."""
    document_statuses: list[DocumentQueueStatus] = []

    for document_id in request.document_ids:
        # Verify document exists
        stmt = select(Document).where(Document.id == document_id)
        result = await session.execute(stmt)
        document = result.scalar_one_or_none()

        if not document:
            document_statuses.append(
                DocumentQueueStatus(document_id=document_id, queue_position=None, status="not_found")
            )
            continue

        # Enqueue document
        reducto_queue_service.enqueue_document(document_id)

        # Update document status to queued
        document.scores_extraction_status = "queued"
        await session.commit()

        # Get queue position
        queue_position = reducto_queue_service.get_document_queue_position(document_id)

        document_statuses.append(
            DocumentQueueStatus(
                document_id=document_id, queue_position=queue_position, status="queued"
            )
        )

    queue_status = reducto_queue_service.get_queue_status()

    return ReductoQueueResponse(
        queued_count=len([d for d in document_statuses if d.status == "queued"]),
        documents=document_statuses,
        queue_length=queue_status["queue_length"],
    )


@router.get("/{document_id}/reducto-status", response_model=ReductoStatusResponse)
async def get_reducto_status(document_id: int, session: DBSessionDep) -> ReductoStatusResponse:
    """Get Reducto extraction status for a document."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    queue_position = reducto_queue_service.get_document_queue_position(document_id)

    return ReductoStatusResponse(
        document_id=document_id,
        scores_extraction_status=document.scores_extraction_status,
        scores_extraction_method=document.scores_extraction_method,
        scores_extraction_confidence=document.scores_extraction_confidence,
        scores_extracted_at=document.scores_extracted_at,
        queue_position=queue_position,
    )
