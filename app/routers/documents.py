from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.config import settings
from app.dependencies.database import DBSessionDep, get_sessionmanager
from app.models import Document, Exam
from app.schemas.document import BulkUploadResponse, DocumentListResponse, DocumentResponse, DocumentUpdate
from app.schemas.id_extraction import IDExtractionResponse
from app.services.id_extraction import id_extraction_service
from app.services.storage import storage_service
from app.utils import calculate_checksum

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
        status="pending",
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
            db_document.extraction_method = extraction_result["method"]
            db_document.extraction_confidence = extraction_result["confidence"]
            db_document.school_id = extraction_result.get("school_id")
            db_document.subject_id = extraction_result.get("subject_id")
            db_document.test_type = extraction_result.get("test_type")
            db_document.subject_series = extraction_result.get("subject_series")
            db_document.sheet_number = extraction_result.get("sheet_number")
            db_document.status = "processed"
        else:
            db_document.extraction_method = extraction_result.get("method")
            db_document.extraction_confidence = extraction_result.get("confidence", 0.0)
            db_document.status = "error"

        await session.commit()
        await session.refresh(db_document)
    except Exception:
        # If extraction fails, document is still saved but marked as error
        db_document.status = "error"
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
                    document.status = "error"
                    await session.commit()
                    continue

                # Extract ID
                extraction_result = await id_extraction_service.extract_id(
                    file_content, session, document_id, document.exam_id
                )

                # Update document with extraction results
                if extraction_result["is_valid"]:
                    document.extracted_id = extraction_result["extracted_id"]
                    document.extraction_method = extraction_result["method"]
                    document.extraction_confidence = extraction_result["confidence"]
                    document.school_id = extraction_result.get("school_id")
                    document.subject_id = extraction_result.get("subject_id")
                    document.test_type = extraction_result.get("test_type")
                    document.subject_series = extraction_result.get("subject_series")
                    document.sheet_number = extraction_result.get("sheet_number")
                    document.status = "processed"
                else:
                    document.extraction_method = extraction_result.get("method")
                    document.extraction_confidence = extraction_result.get("confidence", 0.0)
                    document.status = "error"

                await session.commit()
            except Exception:
                # If extraction fails, mark document as error but continue with others
                try:
                    stmt = select(Document).where(Document.id == document_id)
                    result = await session.execute(stmt)
                    document = result.scalar_one_or_none()
                    if document:
                        document.status = "error"
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
                status="pending",
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
) -> DocumentListResponse:
    """List documents with pagination."""
    offset = (page - 1) * page_size

    # Get total count
    count_stmt = select(func.count(Document.id))
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get documents
    stmt = select(Document).offset(offset).limit(page_size).order_by(Document.uploaded_at.desc())
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
        document.extraction_method = extraction_result["method"]
        document.extraction_confidence = extraction_result["confidence"]
        document.school_id = extraction_result.get("school_id")
        document.subject_id = extraction_result.get("subject_id")
        document.test_type = extraction_result.get("test_type")
        document.subject_series = extraction_result.get("subject_series")
        document.sheet_number = extraction_result.get("sheet_number")
        document.status = "processed"
    else:
        document.extraction_method = extraction_result.get("method")
        document.extraction_confidence = extraction_result.get("confidence", 0.0)
        document.status = "error"

    await session.commit()
    await session.refresh(document)

    return IDExtractionResponse(**extraction_result)


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
    if update.extraction_method is not None:
        document.extraction_method = update.extraction_method
    if update.extraction_confidence is not None:
        document.extraction_confidence = update.extraction_confidence
    if update.status is not None:
        document.status = update.status

    # If extracted_id is set manually, mark as manual
    if update.extracted_id is not None and document.extraction_method != "manual":
        document.extraction_method = "manual"

    await session.commit()
    await session.refresh(document)

    return DocumentResponse.model_validate(document)
