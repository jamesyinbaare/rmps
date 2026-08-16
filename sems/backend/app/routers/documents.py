from datetime import datetime, timedelta
import asyncio
import io
import logging
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies.database import DBSessionDep, get_sessionmanager
from app.dependencies.auth import DataClerkDep, RegistrarDep
from app.models import Document, Exam, ExamType, ExamSeries, DataExtractionMethod, School, Subject
from app.schemas.document import (
    AbandonedUploadCleanupResponse,
    BackfillTestTypeResponse,
    BulkDeleteResponse,
    BulkDocumentIdsRequest,
    BulkExtractIdResponse,
    BulkUploadResponse,
    ContentExtractionResponse,
    DocumentExamFacet,
    DocumentListItem,
    DocumentListResponse,
    DocumentQueueStatus,
    DocumentResponse,
    IdExtractionErrorCodeCount,
    IdExtractionStatusCounts,
    ReductoQueueStatusResponse,
    ReductoWorkersUpdateRequest,
    DocumentSchoolFacet,
    DocumentSubjectFacet,
    DocumentUpdate,
    ReductoQueueRequest,
    ReductoQueueResponse,
    ReductoDequeueRequest,
    ReductoDequeueResponse,
    ReductoStatusResponse,
    UploadConfirmItem,
    UploadConfirmRequest,
    UploadConfirmResponse,
    UploadInitiateFailed,
    UploadInitiateRequest,
    UploadInitiateResponse,
    UploadInitiateSkipped,
    UploadSlot,
)
from app.schemas.id_extraction import IDExtractionResponse
from app.services.content_extraction import (
    STRUCTURED_EXTRACTION_METHODS,
    content_extraction_service,
    extraction_provider_error,
)
from app.services.id_extraction import (
    IDExtractionErrorCode,
    IDValidator,
    apply_id_extraction_result,
    clear_id_extraction_error,
    id_extraction_service,
    mark_id_extraction_failure,
)
from app.services.reducto_queue import reducto_queue_service
from app.services.document_score_extraction import (
    apply_extract_result,
    get_extraction,
    get_or_create_extraction,
    normalize_provider,
    sync_document_snapshot,
)
from app.services.storage import storage_service
from app.utils.file_utils import calculate_checksum
from app.utils.score_utils import add_extraction_method_to_document

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])

# Bounded concurrency for background ID extraction (CPU-heavy barcode/OCR)
ID_EXTRACTION_CONCURRENCY = 4
THUMBNAIL_MAX_SIZE = 320


def _document_to_list_item(doc: Document) -> DocumentListItem:
    """Build a slim list item without scores_extraction_data."""
    item = DocumentListItem.model_validate(doc)
    return item.model_copy(
        update={
            "school_name": doc.school.name if getattr(doc, "school", None) else None,
            "subject_name": doc.subject.name if getattr(doc, "subject", None) else None,
        }
    )


def _make_thumbnail_jpeg(image_data: bytes, max_size: int = THUMBNAIL_MAX_SIZE) -> bytes:
    """Resize image to a JPEG thumbnail (longest edge <= max_size)."""
    with Image.open(io.BytesIO(image_data)) as image:
        image = image.convert("RGB")
        resample = getattr(Image, "Resampling", None)
        resample_filter = getattr(resample, "LANCZOS", Image.LANCZOS) if resample else Image.LANCZOS
        image.thumbnail((max_size, max_size), resample_filter)
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=72, optimize=True)
        return buffer.getvalue()


async def _extract_one_document_id(document_id: int, semaphore: asyncio.Semaphore) -> None:
    """Extract ID for a single document using its own DB session."""
    async with semaphore:
        sessionmanager = get_sessionmanager()
        async with sessionmanager.session() as session:
            try:
                stmt = select(Document).where(Document.id == document_id)
                result = await session.execute(stmt)
                document = result.scalar_one_or_none()
                if not document:
                    return

                try:
                    if document.upload_status != "uploaded":
                        return
                    file_content = await storage_service.retrieve(document.file_path)
                except FileNotFoundError:
                    mark_id_extraction_failure(
                        document,
                        error_code=IDExtractionErrorCode.FILE_MISSING.value,
                        error_message="File not found in storage",
                    )
                    await session.commit()
                    return

                extraction_result = await id_extraction_service.extract_id(
                    file_content, session, document_id, document.exam_id
                )
                apply_id_extraction_result(document, extraction_result)
                await session.commit()
            except Exception as exc:
                try:
                    stmt = select(Document).where(Document.id == document_id)
                    result = await session.execute(stmt)
                    document = result.scalar_one_or_none()
                    if document:
                        mark_id_extraction_failure(
                            document,
                            error_code=IDExtractionErrorCode.EXCEPTION.value,
                            error_message=f"Unexpected error during ID extraction: {exc}",
                        )
                        await session.commit()
                except Exception:
                    pass


async def _extract_ids_for_documents(document_ids: list[int]) -> None:
    """Background helper to extract IDs for multiple documents with bounded concurrency."""
    if not document_ids:
        return
    semaphore = asyncio.Semaphore(ID_EXTRACTION_CONCURRENCY)
    await asyncio.gather(*[_extract_one_document_id(doc_id, semaphore) for doc_id in document_ids])


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
        upload_status="uploaded",
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
        apply_id_extraction_result(db_document, extraction_result)
        await session.commit()
        await session.refresh(db_document)
    except Exception as exc:
        # If extraction fails, document is still saved but marked as error
        mark_id_extraction_failure(
            db_document,
            error_code=IDExtractionErrorCode.EXCEPTION.value,
            error_message=f"Unexpected error during ID extraction: {exc}",
        )
        await session.commit()
        await session.refresh(db_document)

    return DocumentResponse.model_validate(db_document)


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
                upload_status="uploaded",
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


ALLOWED_UPLOAD_MIME_TYPES = {"image/jpeg", "image/png"}
REUSABLE_UPLOAD_STATUSES = frozenset({"pending_upload", "failed"})


async def _mint_upload_slot(
    *,
    document_id: int,
    file_name: str,
    checksum: str,
    mime_type: str,
    relative_path: str,
) -> UploadSlot:
    headers = {"Content-Type": mime_type}
    if storage_service.backend_name == "gcs":
        upload_url = await storage_service.create_signed_put_url(
            relative_path,
            content_type=mime_type,
        )
    else:
        upload_url = f"/api/v1/documents/uploads/{document_id}/content"
    return UploadSlot(
        document_id=document_id,
        file_name=file_name,
        checksum=checksum,
        upload_url=upload_url,
        headers=headers,
    )


async def cleanup_abandoned_pending_uploads(*, ttl_hours: int | None = None) -> AbandonedUploadCleanupResponse:
    """Delete pending_upload documents older than TTL and remove any orphan storage objects."""
    hours = ttl_hours if ttl_hours is not None else settings.upload_pending_ttl_hours
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    deleted = 0
    errors: list[str] = []

    sessionmanager = get_sessionmanager()
    async with sessionmanager.session() as session:
        stmt = select(Document).where(
            Document.upload_status == "pending_upload",
            Document.uploaded_at < cutoff,
        )
        result = await session.execute(stmt)
        pending_docs = list(result.scalars().all())

        for doc in pending_docs:
            try:
                await storage_service.delete(doc.file_path)
            except Exception as exc:
                errors.append(f"storage delete {doc.id}: {exc}")
            try:
                await session.delete(doc)
                deleted += 1
            except Exception as exc:
                errors.append(f"db delete {doc.id}: {exc}")

        await session.commit()

    return AbandonedUploadCleanupResponse(deleted=deleted, errors=errors)


@router.post("/uploads/initiate", response_model=UploadInitiateResponse, status_code=status.HTTP_201_CREATED)
async def initiate_document_uploads(
    body: UploadInitiateRequest,
    session: DBSessionDep,
) -> UploadInitiateResponse:
    """Mint pending Document rows and return direct PUT URLs (GCS signed or local content path)."""
    if len(body.files) > settings.upload_initiate_batch_max:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batch size exceeds maximum of {settings.upload_initiate_batch_max}",
        )

    exam_stmt = select(Exam).where(Exam.id == body.exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exam with id {body.exam_id} not found",
        )

    uploads: list[UploadSlot] = []
    skipped_files: list[UploadInitiateSkipped] = []
    failed_files: list[UploadInitiateFailed] = []
    seen_checksums: set[str] = set()

    for item in body.files:
        file_name = item.file_name
        try:
            checksum = item.checksum.lower()
            if item.mime_type not in ALLOWED_UPLOAD_MIME_TYPES:
                skipped_files.append(
                    UploadInitiateSkipped(file_name=file_name, reason="unsupported_mime_type")
                )
                continue
            if item.file_size > settings.storage_max_size:
                skipped_files.append(
                    UploadInitiateSkipped(file_name=file_name, reason="file_too_large")
                )
                continue
            if checksum in seen_checksums:
                skipped_files.append(
                    UploadInitiateSkipped(file_name=file_name, reason="duplicate_in_batch")
                )
                continue
            seen_checksums.add(checksum)

            duplicate_stmt = select(Document).where(Document.checksum == checksum)
            duplicate_result = await session.execute(duplicate_stmt)
            existing = duplicate_result.scalar_one_or_none()
            if existing:
                if existing.upload_status == "uploaded":
                    skipped_files.append(
                        UploadInitiateSkipped(
                            file_name=file_name,
                            reason="duplicate_checksum",
                            existing_document_id=existing.id,
                        )
                    )
                    continue
                if existing.upload_status in REUSABLE_UPLOAD_STATUSES:
                    # Incomplete prior attempt: remint URL so the client can retry PUT+confirm
                    existing.file_name = file_name
                    existing.mime_type = item.mime_type
                    existing.file_size = item.file_size
                    existing.exam_id = body.exam_id
                    existing.upload_status = "pending_upload"
                    existing.uploaded_at = datetime.utcnow()
                    await session.flush()
                    uploads.append(
                        await _mint_upload_slot(
                            document_id=existing.id,
                            file_name=file_name,
                            checksum=checksum,
                            mime_type=item.mime_type,
                            relative_path=existing.file_path,
                        )
                    )
                    continue
                skipped_files.append(
                    UploadInitiateSkipped(
                        file_name=file_name,
                        reason=f"unexpected_status:{existing.upload_status}",
                        existing_document_id=existing.id,
                    )
                )
                continue

            relative_path = storage_service.allocate_path(file_name)
            db_document = Document(
                file_path=relative_path,
                file_name=file_name,
                mime_type=item.mime_type,
                file_size=item.file_size,
                checksum=checksum,
                exam_id=body.exam_id,
                upload_status="pending_upload",
                id_extraction_status="pending",
            )
            session.add(db_document)
            await session.flush()

            uploads.append(
                await _mint_upload_slot(
                    document_id=db_document.id,
                    file_name=file_name,
                    checksum=checksum,
                    mime_type=item.mime_type,
                    relative_path=relative_path,
                )
            )
        except Exception as exc:
            logger.exception("Failed to initiate upload for %s", file_name)
            failed_files.append(UploadInitiateFailed(file_name=file_name, error=str(exc)))

    await session.commit()

    return UploadInitiateResponse(
        total=len(body.files),
        initiated=len(uploads),
        skipped=len(skipped_files),
        failed=len(failed_files),
        uploads=uploads,
        skipped_files=skipped_files,
        failed_files=failed_files,
    )


@router.put("/uploads/{document_id}/content", status_code=status.HTTP_204_NO_CONTENT)
async def put_document_upload_content(
    document_id: int,
    request: Request,
    session: DBSessionDep,
) -> Response:
    """Receive file bytes for a pending local-storage upload slot."""
    if storage_service.backend_name != "local":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Content PUT endpoint is only used with local storage backend",
        )

    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if document.upload_status != "pending_upload":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Document upload_status is {document.upload_status}, expected pending_upload",
        )

    content = await request.body()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty body")
    if len(content) > settings.storage_max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {settings.storage_max_size} bytes",
        )
    if document.file_size and len(content) != document.file_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Body size {len(content)} does not match expected file_size {document.file_size}",
        )

    content_type = request.headers.get("content-type") or document.mime_type
    await storage_service.save_at_path(
        document.file_path,
        content,
        content_type=content_type,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/uploads/confirm", response_model=UploadConfirmResponse)
async def confirm_document_uploads(
    body: UploadConfirmRequest,
    session: DBSessionDep,
    background_tasks: BackgroundTasks,
) -> UploadConfirmResponse:
    """Verify storage objects exist, mark uploaded, and enqueue ID extraction."""
    if len(body.document_ids) > settings.upload_initiate_batch_max:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batch size exceeds maximum of {settings.upload_initiate_batch_max}",
        )

    results: list[UploadConfirmItem] = []
    confirmed_ids: list[int] = []

    for document_id in body.document_ids:
        try:
            stmt = select(Document).where(Document.id == document_id)
            result = await session.execute(stmt)
            document = result.scalar_one_or_none()
            if not document:
                results.append(
                    UploadConfirmItem(document_id=document_id, status="failed", error="not_found")
                )
                continue

            if document.upload_status == "uploaded":
                results.append(
                    UploadConfirmItem(document_id=document_id, status="already_uploaded")
                )
                continue

            if document.upload_status != "pending_upload":
                results.append(
                    UploadConfirmItem(
                        document_id=document_id,
                        status="failed",
                        error=f"unexpected_status:{document.upload_status}",
                    )
                )
                continue

            size = await storage_service.get_size(document.file_path)
            if size is None:
                results.append(
                    UploadConfirmItem(
                        document_id=document_id,
                        status="failed",
                        error="object_missing",
                    )
                )
                continue
            if size != document.file_size:
                results.append(
                    UploadConfirmItem(
                        document_id=document_id,
                        status="failed",
                        error=f"size_mismatch:expected={document.file_size},actual={size}",
                    )
                )
                continue

            document.upload_status = "uploaded"
            document.uploaded_at = datetime.utcnow()
            confirmed_ids.append(document_id)
            results.append(UploadConfirmItem(document_id=document_id, status="confirmed"))
        except Exception as exc:
            logger.exception("Failed to confirm upload for document %s", document_id)
            results.append(
                UploadConfirmItem(document_id=document_id, status="failed", error=str(exc))
            )

    await session.commit()

    if confirmed_ids:
        background_tasks.add_task(_extract_ids_for_documents, confirmed_ids)

    confirmed = sum(1 for r in results if r.status in ("confirmed", "already_uploaded"))
    failed = sum(1 for r in results if r.status == "failed")
    return UploadConfirmResponse(
        total=len(body.document_ids),
        confirmed=confirmed,
        failed=failed,
        results=results,
    )


@router.post("/uploads/cleanup-abandoned", response_model=AbandonedUploadCleanupResponse)
async def cleanup_abandoned_uploads_endpoint(
    _current_user: RegistrarDep,
) -> AbandonedUploadCleanupResponse:
    """Remove abandoned pending_upload rows older than TTL (and their storage objects)."""
    return await cleanup_abandoned_pending_uploads()


@router.get("/facets/exams", response_model=list[DocumentExamFacet])
async def list_document_exam_facets(session: DBSessionDep) -> list[DocumentExamFacet]:
    """Exams that have uploaded documents, with counts."""
    stmt = (
        select(
            Exam.id,
            Exam.exam_type,
            Exam.series,
            Exam.year,
            Exam.description,
            func.count(Document.id).label("document_count"),
        )
        .join(Document, Document.exam_id == Exam.id)
        .where(Document.upload_status == "uploaded")
        .group_by(Exam.id)
        .order_by(Exam.year.desc(), Exam.exam_type)
    )
    result = await session.execute(stmt)
    rows = result.all()
    return [
        DocumentExamFacet(
            id=row.id,
            exam_type=row.exam_type.value if hasattr(row.exam_type, "value") else str(row.exam_type),
            series=row.series.value if hasattr(row.series, "value") else str(row.series),
            year=row.year,
            description=row.description,
            document_count=row.document_count,
        )
        for row in rows
    ]


@router.get("/facets/schools", response_model=list[DocumentSchoolFacet])
async def list_document_school_facets(
    session: DBSessionDep,
    exam_id: int = Query(...),
) -> list[DocumentSchoolFacet]:
    """Schools that have uploaded documents for an exam."""
    stmt = (
        select(
            School.id,
            School.name,
            School.code,
            func.count(Document.id).label("document_count"),
        )
        .join(Document, Document.school_id == School.id)
        .where(Document.exam_id == exam_id, Document.upload_status == "uploaded")
        .group_by(School.id)
        .order_by(School.name)
    )
    result = await session.execute(stmt)
    return [
        DocumentSchoolFacet(
            id=row.id,
            name=row.name,
            code=row.code,
            document_count=row.document_count,
        )
        for row in result.all()
    ]


@router.get("/facets/subjects", response_model=list[DocumentSubjectFacet])
async def list_document_subject_facets(
    session: DBSessionDep,
    exam_id: int = Query(...),
    school_id: int | None = Query(None),
) -> list[DocumentSubjectFacet]:
    """Subjects that have uploaded documents for an exam (optionally school)."""
    stmt = (
        select(
            Subject.id,
            Subject.name,
            Subject.code,
            func.count(Document.id).label("document_count"),
        )
        .join(Document, Document.subject_id == Subject.id)
        .where(Document.exam_id == exam_id, Document.upload_status == "uploaded")
        .group_by(Subject.id)
        .order_by(Subject.name)
    )
    if school_id is not None:
        stmt = stmt.where(Document.school_id == school_id)
    result = await session.execute(stmt)
    return [
        DocumentSubjectFacet(
            id=row.id,
            name=row.name,
            code=row.code,
            document_count=row.document_count,
        )
        for row in result.all()
    ]


@router.post("/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_documents(
    body: BulkDocumentIdsRequest,
    session: DBSessionDep,
) -> BulkDeleteResponse:
    """Delete multiple documents and their files."""
    deleted = 0
    failed = 0
    errors: list[dict[str, str]] = []
    for document_id in body.document_ids:
        try:
            stmt = select(Document).where(Document.id == document_id)
            result = await session.execute(stmt)
            document = result.scalar_one_or_none()
            if not document:
                failed += 1
                errors.append({"document_id": str(document_id), "error": "Not found"})
                continue
            try:
                await storage_service.delete(document.file_path)
            except Exception:
                pass
            await session.delete(document)
            deleted += 1
        except Exception as exc:
            failed += 1
            errors.append({"document_id": str(document_id), "error": str(exc)})
    await session.commit()
    return BulkDeleteResponse(deleted=deleted, failed=failed, errors=errors)


@router.post("/bulk-extract-id", response_model=BulkExtractIdResponse)
async def bulk_extract_id(
    body: BulkDocumentIdsRequest,
    background_tasks: BackgroundTasks,
    session: DBSessionDep,
) -> BulkExtractIdResponse:
    """Queue ID re-extraction for multiple documents."""
    stmt = select(Document.id).where(
        Document.id.in_(body.document_ids),
        Document.upload_status == "uploaded",
    )
    result = await session.execute(stmt)
    ids = [row[0] for row in result.all()]
    # Mark pending so UI can poll
    if ids:
        pending_stmt = select(Document).where(Document.id.in_(ids))
        pending_result = await session.execute(pending_stmt)
        for doc in pending_result.scalars().all():
            doc.id_extraction_status = "pending"
            doc.id_extraction_error = None
            doc.id_extraction_error_code = None
        await session.commit()
        background_tasks.add_task(_extract_ids_for_documents, ids)
    return BulkExtractIdResponse(queued=len(ids), document_ids=ids)


def _apply_document_scope_filters(
    stmt: Any,
    *,
    exam_id: int | None,
    exam_type: ExamType | None,
    series: ExamSeries | None,
    year: int | None,
    school_id: int | None,
    subject_id: int | None,
    q: str | None,
) -> Any:
    if exam_id is not None:
        stmt = stmt.where(Document.exam_id == exam_id)
    else:
        if exam_type is not None:
            stmt = stmt.where(Exam.exam_type == exam_type)
        if series is not None:
            stmt = stmt.where(Exam.series == series)
        if year is not None:
            stmt = stmt.where(Exam.year == year)
    if school_id is not None:
        stmt = stmt.where(Document.school_id == school_id)
    if subject_id is not None:
        stmt = stmt.where(Document.subject_id == subject_id)
    if q and q.strip():
        search = f"%{q.strip()}%"
        stmt = stmt.where(
            (Document.file_name.ilike(search)) | (Document.extracted_id.ilike(search))
        )
    return stmt.where(Document.upload_status == "uploaded")


@router.get("/id-extraction-status-counts", response_model=IdExtractionStatusCounts)
async def get_id_extraction_status_counts(
    session: DBSessionDep,
    exam_id: int | None = Query(None),
    exam_type: ExamType | None = Query(None),
    series: ExamSeries | None = Query(None),
    year: int | None = Query(None, ge=1900, le=2100),
    school_id: int | None = Query(None),
    subject_id: int | None = Query(None),
    q: str | None = Query(None, description="Search file_name or extracted_id (case-insensitive)"),
) -> IdExtractionStatusCounts:
    """Return ID extraction status and error-type counts for the current document scope.

    Ignores id_extraction_status / error-code filters so the pills stay accurate.
    """
    join_exam = (exam_type is not None or series is not None or year is not None) and exam_id is None
    status_stmt = select(Document.id_extraction_status, func.count(Document.id)).select_from(Document)
    if join_exam:
        status_stmt = status_stmt.join(Exam, Document.exam_id == Exam.id)
    status_stmt = _apply_document_scope_filters(
        status_stmt,
        exam_id=exam_id,
        exam_type=exam_type,
        series=series,
        year=year,
        school_id=school_id,
        subject_id=subject_id,
        q=q,
    ).group_by(Document.id_extraction_status)

    status_result = await session.execute(status_stmt)
    counts = IdExtractionStatusCounts()
    for status_value, n in status_result.all():
        counts.total += n
        if status_value == "pending":
            counts.pending = n
        elif status_value == "success":
            counts.success = n
        elif status_value == "error":
            counts.error = n

    code_stmt = select(Document.id_extraction_error_code, func.count(Document.id)).select_from(Document)
    if join_exam:
        code_stmt = code_stmt.join(Exam, Document.exam_id == Exam.id)
    code_stmt = _apply_document_scope_filters(
        code_stmt,
        exam_id=exam_id,
        exam_type=exam_type,
        series=series,
        year=year,
        school_id=school_id,
        subject_id=subject_id,
        q=q,
    ).where(Document.id_extraction_status == "error").group_by(Document.id_extraction_error_code)

    code_result = await session.execute(code_stmt)
    counts.error_codes = [
        IdExtractionErrorCodeCount(code=code or "exception", count=n)
        for code, n in code_result.all()
    ]
    return counts


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: int, session: DBSessionDep) -> DocumentResponse:
    """Retrieve document metadata."""
    stmt = (
        select(Document)
        .options(selectinload(Document.school), selectinload(Document.subject))
        .where(Document.id == document_id)
    )
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    response = DocumentResponse.model_validate(document)
    return response.model_copy(
        update={
            "school_name": document.school.name if document.school else None,
        }
    )


@router.get("/by-extracted-id/{extracted_id}/download")
async def download_document_by_extracted_id(
    extracted_id: str,
    exam_id: int = Query(..., description="Exam ID to filter by"),
    session: DBSessionDep = ...,
) -> StreamingResponse:
    """Download document file by extracted_id and exam_id."""
    stmt = select(Document).where(
        Document.extracted_id == extracted_id,
        Document.exam_id == exam_id,
    )
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    try:
        file_content = await storage_service.retrieve(document.file_path)
        return StreamingResponse(
            iter([file_content]),
            media_type=document.mime_type,
            headers={
                "Content-Disposition": f'inline; filename="{document.file_name}"',
                "Cache-Control": "private, max-age=86400, immutable",
            },
        )
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in storage")


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
        safe_name = (document.file_name or f"document-{document.id}").replace('"', "")
        content_disposition = (
            f'attachment; filename="{safe_name}"; filename*=UTF-8\'\'{quote(safe_name)}'
        )
        return StreamingResponse(
            iter([file_content]),
            media_type=document.mime_type or "application/octet-stream",
            headers={
                "Content-Disposition": content_disposition,
                "Cache-Control": "private, max-age=600, immutable",
            },
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found in storage. The document record exists but the file is missing.",
        )


@router.get("/{document_id}/thumbnail")
async def get_document_thumbnail(
    document_id: int,
    session: DBSessionDep,
    size: int = Query(THUMBNAIL_MAX_SIZE, ge=64, le=640),
) -> Response:
    """Return a resized JPEG thumbnail for grid/list previews."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    try:
        file_content = await storage_service.retrieve(document.file_path)
        thumb = await asyncio.to_thread(_make_thumbnail_jpeg, file_content, size)
        return Response(
            content=thumb,
            media_type="image/jpeg",
            headers={
                "Cache-Control": "private, max-age=86400, immutable",
                "Content-Disposition": f'inline; filename="thumb-{document.id}.jpg"',
            },
        )
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in storage")
    except Exception as exc:
        logger.warning("Thumbnail generation failed for document %s: %s", document_id, exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not generate thumbnail for this document",
        )


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
    id_extraction_status: str | None = Query(
        None, description="Filter by ID extraction status: pending, success, error"
    ),
    id_extraction_error_code: str | None = Query(
        None,
        description="Filter by ID extraction error code (comma-separated): no_id, duplicate, invalid_format, validation, low_confidence, file_missing, exception",
    ),
    q: str | None = Query(None, description="Search file_name or extracted_id (case-insensitive)"),
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
        base_stmt = base_stmt.where(Exam.exam_type == exam_type)
    if series is not None and exam_id is None:
        base_stmt = base_stmt.where(Exam.series == series)
    if year is not None and exam_id is None:
        base_stmt = base_stmt.where(Exam.year == year)

    if school_id is not None:
        base_stmt = base_stmt.where(Document.school_id == school_id)
    if subject_id is not None:
        base_stmt = base_stmt.where(Document.subject_id == subject_id)
    if id_extraction_status is not None:
        base_stmt = base_stmt.where(Document.id_extraction_status == id_extraction_status)

    error_codes: list[str] = []
    if id_extraction_error_code:
        error_codes = [c.strip() for c in id_extraction_error_code.split(",") if c.strip()]
        if error_codes:
            base_stmt = base_stmt.where(Document.id_extraction_error_code.in_(error_codes))
            # Filtering by error code implies failed extractions
            if id_extraction_status is None:
                base_stmt = base_stmt.where(Document.id_extraction_status == "error")

    if q and q.strip():
        search = f"%{q.strip()}%"
        base_stmt = base_stmt.where(
            (Document.file_name.ilike(search)) | (Document.extracted_id.ilike(search))
        )

    # Incomplete direct uploads are not listed until confirm succeeds
    base_stmt = base_stmt.where(Document.upload_status == "uploaded")

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
        count_stmt = count_stmt.where(Exam.exam_type == exam_type)
    if series is not None and exam_id is None:
        count_stmt = count_stmt.where(Exam.series == series)
    if year is not None and exam_id is None:
        count_stmt = count_stmt.where(Exam.year == year)

    if school_id is not None:
        count_stmt = count_stmt.where(Document.school_id == school_id)
    if subject_id is not None:
        count_stmt = count_stmt.where(Document.subject_id == subject_id)
    if id_extraction_status is not None:
        count_stmt = count_stmt.where(Document.id_extraction_status == id_extraction_status)
    if error_codes:
        count_stmt = count_stmt.where(Document.id_extraction_error_code.in_(error_codes))
        if id_extraction_status is None:
            count_stmt = count_stmt.where(Document.id_extraction_status == "error")
    if q and q.strip():
        search = f"%{q.strip()}%"
        count_stmt = count_stmt.where(
            (Document.file_name.ilike(search)) | (Document.extracted_id.ilike(search))
        )

    count_stmt = count_stmt.where(Document.upload_status == "uploaded")
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get documents with filters (eager-load school/subject for list names)
    stmt = (
        base_stmt.options(selectinload(Document.school), selectinload(Document.subject))
        .offset(offset)
        .limit(page_size)
        .order_by(Document.uploaded_at.desc())
    )
    result = await session.execute(stmt)
    documents = result.scalars().unique().all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return DocumentListResponse(
        items=[_document_to_list_item(doc) for doc in documents],
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
    apply_id_extraction_result(document, extraction_result)

    await session.commit()
    await session.refresh(document)

    return IDExtractionResponse(
        extracted_id=extraction_result.get("extracted_id"),
        method=extraction_result.get("method"),
        confidence=extraction_result.get("confidence", 0.0),
        is_valid=extraction_result.get("is_valid", False),
        school_id=extraction_result.get("school_id"),
        subject_id=extraction_result.get("subject_id"),
        school_code=extraction_result.get("school_code"),
        subject_code=extraction_result.get("subject_code"),
        subject_series=extraction_result.get("subject_series"),
        test_type=extraction_result.get("test_type"),
        sheet_number=extraction_result.get("sheet_number"),
        error_code=extraction_result.get("error_code"),
        error_message=extraction_result.get("error_message"),
    )


@router.post("/{document_id}/parse-content", response_model=ContentExtractionResponse)
async def parse_content(
    session: DBSessionDep,
    document_id: int,
    method: str | None = Query(None, description="Extraction method: 'ocr', 'reducto', or 'llama'. If None, uses Llama Extract when configured"),
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
    # Determine extraction method based on the method used
    extraction_method_to_add: DataExtractionMethod | None = None
    parsing_method = extraction_result.get("parsing_method")
    if method in STRUCTURED_EXTRACTION_METHODS or parsing_method in STRUCTURED_EXTRACTION_METHODS:
        extraction_method_to_add = DataExtractionMethod.AUTOMATED_EXTRACTION
    else:
        if parsing_method:
            try:
                extraction_method_to_add = DataExtractionMethod(parsing_method)
            except (ValueError, KeyError):
                extraction_method_to_add = None

    if extraction_result["is_valid"]:
        if extraction_method_to_add:
            add_extraction_method_to_document(document, extraction_method_to_add)
        provider = normalize_provider(parsing_method or method)
        row = await get_or_create_extraction(session, document.id, provider)
        apply_extract_result(
            row,
            is_valid=True,
            parsed_content=extraction_result["parsed_content"],
            confidence=extraction_result["parsing_confidence"],
            error_message=extraction_result.get("error_message"),
        )
        sync_document_snapshot(document, row)
    else:
        if extraction_method_to_add:
            add_extraction_method_to_document(document, extraction_method_to_add)
        provider = normalize_provider(parsing_method or method)
        row = await get_or_create_extraction(session, document.id, provider)
        apply_extract_result(
            row,
            is_valid=False,
            parsed_content=extraction_result.get("parsed_content"),
            confidence=extraction_result.get("parsing_confidence", 0.0),
            error_message=extraction_result.get("error_message"),
        )
        sync_document_snapshot(document, row)

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

        # Parse extracted_id to extract test_type, subject_series, and sheet_number
        try:
            validator = IDValidator()
            validation_result = validator.parse_id(update.extracted_id)

            if validation_result.is_valid:
                # Only set these if not explicitly provided in update
                if update.test_type is None:
                    document.test_type = validation_result.test_type
                if update.subject_series is None:
                    document.subject_series = validation_result.subject_series
                if update.sheet_number is None:
                    document.sheet_number = validation_result.sheet_number
        except Exception as e:
            # Log warning but don't fail the update
            logger.warning(f"Failed to parse extracted_id {update.extracted_id}: {e}")

    if update.id_extraction_method is not None:
        document.id_extraction_method = update.id_extraction_method
    if update.id_extraction_confidence is not None:
        document.id_extraction_confidence = update.id_extraction_confidence
    if update.id_extraction_status is not None:
        document.id_extraction_status = update.id_extraction_status
    if update.scores_extraction_method is not None:
        # Validate that only MANUAL_TRANSCRIPTION_DIGITAL or MANUAL_ENTRY_PHYSICAL can be set
        # (excluding AUTOMATED_EXTRACTION for now)
        if update.scores_extraction_method == DataExtractionMethod.AUTOMATED_EXTRACTION:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="AUTOMATED_EXTRACTION cannot be set via this endpoint. Use the parse-content endpoint instead.",
            )
        add_extraction_method_to_document(document, update.scores_extraction_method)

    # If extracted_id is set manually, mark as manual and clear extraction errors
    if update.extracted_id is not None and document.id_extraction_method != "manual":
        document.id_extraction_method = "manual"
    if update.extracted_id is not None or update.id_extraction_status == "success":
        if update.id_extraction_status is None:
            document.id_extraction_status = "success"
        clear_id_extraction_error(document)

    await session.commit()
    await session.refresh(document)

    return DocumentResponse.model_validate(document)


@router.get("/reducto-queue/status", response_model=ReductoQueueStatusResponse)
async def get_reducto_queue_status(
    _current_user: DataClerkDep,
) -> ReductoQueueStatusResponse:
    """Get Reducto extraction queue length and worker pool status."""
    return ReductoQueueStatusResponse.model_validate(reducto_queue_service.get_queue_status())


@router.patch("/reducto-queue/workers", response_model=ReductoQueueStatusResponse)
async def update_reducto_queue_workers(
    request: ReductoWorkersUpdateRequest,
    _current_user: RegistrarDep,
) -> ReductoQueueStatusResponse:
    """
    Resize how many documents process concurrently.

    Does not change the Reducto API rate limit — the shared token bucket still
    caps requests/sec. Extra workers mostly wait when submit rate is saturated.
    """
    status_dict = await reducto_queue_service.set_worker_count(request.workers)
    return ReductoQueueStatusResponse.model_validate(status_dict)


@router.post("/queue-reducto-extraction", response_model=ReductoQueueResponse)
async def queue_reducto_extraction(
    request: ReductoQueueRequest, session: DBSessionDep
) -> ReductoQueueResponse:
    """Queue documents for structured extraction (Reducto or Llama Extract)."""
    provider_error = extraction_provider_error(request.method)
    if provider_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=provider_error)

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

        if document.id_extraction_status == "error" or (
            request.require_extracted_id and not document.extracted_id
        ):
            document_statuses.append(
                DocumentQueueStatus(
                    document_id=document_id,
                    queue_position=None,
                    status="skipped_no_extracted_id",
                )
            )
            continue

        row = await get_or_create_extraction(session, document.id, request.method)
        row.status = "queued"
        sync_document_snapshot(document, row)
        await session.commit()

        # Enqueue after commit so the worker finds the existing row instead of
        # racing an insert on the same (document_id, provider).
        reducto_queue_service.enqueue_document(document_id, request.method)

        # Get queue position
        queue_position = reducto_queue_service.get_document_queue_position(
            document_id, request.method
        )

        document_statuses.append(
            DocumentQueueStatus(
                document_id=document_id, queue_position=queue_position, status="queued"
            )
        )

    queue_status = reducto_queue_service.get_queue_status()
    queued_count = len([d for d in document_statuses if d.status == "queued"])
    skipped_count = len([d for d in document_statuses if d.status == "skipped_no_extracted_id"])

    return ReductoQueueResponse(
        queued_count=queued_count,
        skipped_count=skipped_count,
        documents=document_statuses,
        queue_length=queue_status["queue_length"],
    )


@router.post("/dequeue-reducto-extraction", response_model=ReductoDequeueResponse)
async def dequeue_reducto_extraction(
    request: ReductoDequeueRequest, session: DBSessionDep
) -> ReductoDequeueResponse:
    """Remove queued documents from the structured extraction queue.

    Processing jobs are left running. Removed rows return to pending for that provider.
    """
    provider_error = extraction_provider_error(request.method)
    if provider_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=provider_error)

    result = reducto_queue_service.dequeue_documents(request.document_ids, request.method)
    removed_ids = set(result["removed"])
    processing_ids = set(result["skipped_processing"])

    for document_id in result["removed"]:
        stmt = select(Document).where(Document.id == document_id)
        doc_result = await session.execute(stmt)
        document = doc_result.scalar_one_or_none()
        if document:
            row = await get_extraction(session, document.id, request.method)
            if row is not None and row.status == "queued":
                row.status = "pending"
                sync_document_snapshot(document, row)
    if result["removed"]:
        await session.commit()

    document_statuses: list[DocumentQueueStatus] = []
    for document_id in request.document_ids:
        if document_id in removed_ids:
            document_statuses.append(
                DocumentQueueStatus(document_id=document_id, queue_position=None, status="pending")
            )
        elif document_id in processing_ids:
            document_statuses.append(
                DocumentQueueStatus(
                    document_id=document_id, queue_position=None, status="processing"
                )
            )
        else:
            document_statuses.append(
                DocumentQueueStatus(
                    document_id=document_id, queue_position=None, status="not_queued"
                )
            )

    queue_status = reducto_queue_service.get_queue_status()
    return ReductoDequeueResponse(
        removed_count=len(result["removed"]),
        skipped_processing=len(result["skipped_processing"]),
        skipped_not_queued=len(result["skipped_not_queued"]),
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
        scores_extraction_methods=(
            [method.value for method in document.scores_extraction_methods]
            if document.scores_extraction_methods
            else None
        ),
        scores_extraction_confidence=document.scores_extraction_confidence,
        scores_extracted_at=document.scores_extracted_at,
        queue_position=queue_position,
    )


@router.post("/admin/backfill-from-extracted-id", response_model=BackfillTestTypeResponse)
async def backfill_from_extracted_id(
    session: DBSessionDep,
    _current_user: RegistrarDep,  # Require REGISTRAR role or above (used for authorization)
    dry_run: bool = Query(False, description="If true, only report what would be updated without making changes"),
) -> BackfillTestTypeResponse:
    """Backfill test_type, subject_series, sheet_number, school_id, and subject_id from extracted_id for existing documents."""
    # Find documents with extracted_id but missing at least one field
    stmt = select(Document).where(
        Document.extracted_id.isnot(None),
        (
            (Document.test_type.is_(None))
            | (Document.subject_series.is_(None))
            | (Document.sheet_number.is_(None))
            | (Document.school_id.is_(None))
            | (Document.subject_id.is_(None))
        )
    )
    result = await session.execute(stmt)
    documents = result.scalars().all()

    total_found = len(documents)
    updated = 0
    failed = 0
    skipped = 0
    errors: list[dict[str, str]] = []

    validator = IDValidator()

    for document in documents:
        try:
            # Parse extracted_id
            validation_result = validator.parse_id(document.extracted_id)

            if not validation_result.is_valid:
                skipped += 1
                errors.append({
                    "document_id": str(document.id),
                    "extracted_id": document.extracted_id,
                    "error": f"Invalid extracted_id format: {validation_result.error_message}"
                })
                continue

            # Validate against database (checks school/subject exist and are associated)
            is_valid, error_message = await validator.validate_against_database(session, validation_result)
            if not is_valid:
                skipped += 1
                errors.append({
                    "document_id": str(document.id),
                    "extracted_id": document.extracted_id,
                    "error": f"Database validation failed: {error_message}"
                })
                continue

            # Query School and Subject to get IDs
            school_stmt = select(School).where(School.code == validation_result.school_code)
            school_result = await session.execute(school_stmt)
            school = school_result.scalar_one_or_none()

            subject_stmt = select(Subject).where(Subject.code == validation_result.subject_code)
            subject_result = await session.execute(subject_stmt)
            subject = subject_result.scalar_one_or_none()

            if not school or not subject:
                skipped += 1
                errors.append({
                    "document_id": str(document.id),
                    "extracted_id": document.extracted_id,
                    "error": f"School or Subject not found: school_code={validation_result.school_code}, subject_code={validation_result.subject_code}"
                })
                continue

            # Update document if not dry run
            if not dry_run:
                # Only update fields that are missing
                if document.test_type is None:
                    document.test_type = validation_result.test_type
                if document.subject_series is None:
                    document.subject_series = validation_result.subject_series
                if document.sheet_number is None:
                    document.sheet_number = validation_result.sheet_number
                if document.school_id is None:
                    document.school_id = school.id
                if document.subject_id is None:
                    document.subject_id = subject.id
                updated += 1
            else:
                # In dry run, just count as would-be updated
                updated += 1

        except Exception as e:
            failed += 1
            errors.append({
                "document_id": str(document.id),
                "extracted_id": document.extracted_id or "N/A",
                "error": str(e)
            })
            logger.error(f"Failed to backfill from extracted_id for document {document.id}: {e}")

    # Commit changes if not dry run
    if not dry_run and updated > 0:
        await session.commit()

    return BackfillTestTypeResponse(
        total_found=total_found,
        updated=updated,
        failed=failed,
        skipped=skipped,
        errors=errors
    )
