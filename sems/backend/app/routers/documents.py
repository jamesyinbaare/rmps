from datetime import datetime, timedelta
import asyncio
import io
import logging
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from PIL import Image
from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.orm import aliased, selectinload

from app.config import settings
from app.dependencies.database import DBSessionDep, get_sessionmanager
from app.dependencies.auth import DataClerkDep, RegistrarDep
from app.models import (
    Document,
    Exam,
    ExamType,
    ExamSeries,
    DataExtractionMethod,
    School,
    Subject,
    SubjectType,
)
from app.schemas.document import (
    AbandonedUploadCleanupResponse,
    BackfillTestTypeResponse,
    BulkDeleteResponse,
    BulkDocumentIdsRequest,
    BulkExtractIdResponse,
    BulkReclassifyPaperItem,
    BulkReclassifyPaperRequest,
    BulkReclassifyPaperResponse,
    BulkUploadResponse,
    ContentExtractionResponse,
    DocumentExamFacet,
    DocumentListItem,
    DocumentListResponse,
    DocumentQueueStatus,
    DocumentResponse,
    IdExtractionConflictItem,
    IdExtractionConflictsResponse,
    IdExtractionErrorCodeCount,
    IdExtractionStatusCounts,
    PaperCounterpartResponse,
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
    ScoreMigrationConflictItem,
    ScoreMigrationEndpointMeta,
    ScoreMigrationPreviewRequest,
    ScoreMigrationPreviewResponse,
    ScoreMigrationUnregisteredItem,
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
    resolve_id_extraction_conflicts,
)
from app.services.paper_reclassify import (
    apply_subject_change_markers,
    apply_test_type_change_markers,
    find_paper_counterpart,
    migrate_applied_scores_for_id_change,
    reclassify_document_paper,
)
from app.services.reducto_queue import reducto_queue_service
from app.services.document_score_extraction import (
    apply_extract_result,
    get_extraction,
    get_or_create_extraction,
    normalize_provider,
    reset_stale_extraction_row,
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


def _has_complete_sheet_identity(document: Document) -> bool:
    """True when the document has a fully resolved sheet identity for score migration."""
    return bool(
        document.extracted_id
        and document.school_id is not None
        and document.subject_id is not None
        and document.test_type in ("1", "2")
        and document.sheet_number
    )


def _apply_reassignment_filters(
    stmt: Any,
    *,
    test_type_changed: bool | None,
    subject_changed: bool | None,
    paper_changed: bool | None,
) -> Any:
    """Filter documents by sheet reassignment (subject, paper, or either)."""
    if subject_changed is True:
        return stmt.where(Document.subject_changed_at.isnot(None))
    if paper_changed is True:
        return stmt.where(Document.test_type_changed_at.isnot(None))
    if test_type_changed is True:
        return stmt.where(
            or_(
                Document.test_type_changed_at.isnot(None),
                Document.subject_changed_at.isnot(None),
            )
        )
    return stmt


def _parse_csv_ints(value: str | None) -> list[int]:
    if not value:
        return []
    ids: list[int] = []
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            ids.append(int(part))
        except ValueError:
            continue
    return ids


def _subject_changed_scope_ids(
    subject_id: int | None,
    subject_changed_subject_ids: str | None,
    subject_ids: list[int] | None = None,
) -> list[int]:
    ids = _parse_csv_ints(subject_changed_subject_ids)
    if subject_ids:
        for sid in subject_ids:
            if sid not in ids:
                ids.append(sid)
    if subject_id is not None and subject_id not in ids:
        ids.append(subject_id)
    return ids


def _apply_subject_filter(
    stmt: Any,
    *,
    subject_id: int | None,
    subject_ids: list[int] | None = None,
    subject_changed: bool | None,
    subject_changed_subject_ids: str | None,
    subject_changed_subject_scope: str | None,
) -> Any:
    if subject_changed is True:
        scope_ids = _subject_changed_scope_ids(
            subject_id, subject_changed_subject_ids, subject_ids
        )
        if scope_ids:
            scope = (subject_changed_subject_scope or "either").lower()
            if scope == "current":
                return stmt.where(Document.subject_id.in_(scope_ids))
            if scope == "prior":
                return stmt.where(Document.subject_changed_from.in_(scope_ids))
            return stmt.where(
                or_(
                    Document.subject_id.in_(scope_ids),
                    Document.subject_changed_from.in_(scope_ids),
                )
            )
        return stmt
    if subject_ids:
        return stmt.where(Document.subject_id.in_(subject_ids))
    if subject_id is not None:
        return stmt.where(Document.subject_id == subject_id)
    return stmt


def _parse_subject_ids_param(subject_ids: str | None) -> list[int] | None:
    ids = _parse_csv_ints(subject_ids)
    return ids or None


PAPER_PAIR_VALUES = frozenset({"paired", "missing", "missing_1", "missing_2"})


def _apply_paper_pair_filter(stmt: Any, paper_pair: str) -> Any:
    """Filter documents by presence/absence of the other-paper counterpart."""
    Counterpart = aliased(Document)
    flipped = case((Document.test_type == "1", "2"), else_="1")
    has_sheet_key = and_(
        Document.school_id.isnot(None),
        Document.subject_id.isnot(None),
        Document.subject_series.isnot(None),
        Document.sheet_number.isnot(None),
        Document.test_type.in_(("1", "2")),
    )
    counterpart_exists = exists(
        select(Counterpart.id).where(
            Counterpart.exam_id == Document.exam_id,
            Counterpart.school_id == Document.school_id,
            Counterpart.subject_id == Document.subject_id,
            Counterpart.subject_series == Document.subject_series,
            Counterpart.sheet_number == Document.sheet_number,
            Counterpart.test_type == flipped,
            Counterpart.upload_status == "uploaded",
            Counterpart.id != Document.id,
        )
    )
    stmt = stmt.where(has_sheet_key)
    if paper_pair == "paired":
        return stmt.where(counterpart_exists)
    return stmt.where(~counterpart_exists)


def _document_to_list_item(
    doc: Document,
    *,
    prior_subjects: dict[int, Subject] | None = None,
) -> DocumentListItem:
    """Build a slim list item without scores_extraction_data."""
    item = DocumentListItem.model_validate(doc)
    prior = None
    if doc.subject_changed_from and prior_subjects:
        prior = prior_subjects.get(doc.subject_changed_from)
    return item.model_copy(
        update={
            "school_name": doc.school.name if getattr(doc, "school", None) else None,
            "subject_name": doc.subject.name if getattr(doc, "subject", None) else None,
            "subject_changed_from_code": prior.code if prior else None,
            "subject_changed_from_name": prior.name if prior else None,
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


@router.post("/bulk-reclassify-paper", response_model=BulkReclassifyPaperResponse)
async def bulk_reclassify_paper(
    body: BulkReclassifyPaperRequest,
    session: DBSessionDep,
) -> BulkReclassifyPaperResponse:
    """Bulk change document paper (test_type) and migrate applied scores."""
    updated = 0
    failed = 0
    scores_moved_total = 0
    results: list[BulkReclassifyPaperItem] = []

    for document_id in body.document_ids:
        stmt = select(Document).where(Document.id == document_id)
        result = await session.execute(stmt)
        document = result.scalar_one_or_none()
        if not document:
            failed += 1
            results.append(
                BulkReclassifyPaperItem(
                    document_id=document_id,
                    new_test_type=body.target_test_type,
                    error="Not found",
                )
            )
            continue

        try:
            outcome = await reclassify_document_paper(
                session, document, body.target_test_type, overwrite=body.overwrite
            )
            item = BulkReclassifyPaperItem(
                document_id=outcome.document_id,
                old_extracted_id=outcome.old_extracted_id,
                new_extracted_id=outcome.new_extracted_id,
                old_test_type=outcome.old_test_type,
                new_test_type=outcome.new_test_type,
                scores_moved=outcome.scores_moved,
                error=outcome.error,
                error_code=outcome.error_code,
                conflict_document_id=outcome.conflict_document_id,
            )
            results.append(item)
            if outcome.error:
                failed += 1
                await session.rollback()
                # Re-open work for remaining docs after rollback clears session state
                continue
            updated += 1
            scores_moved_total += outcome.scores_moved
            await session.commit()
        except Exception as exc:
            failed += 1
            await session.rollback()
            results.append(
                BulkReclassifyPaperItem(
                    document_id=document_id,
                    new_test_type=body.target_test_type,
                    error=str(exc),
                )
            )

    return BulkReclassifyPaperResponse(
        updated=updated,
        failed=failed,
        scores_moved=scores_moved_total,
        results=results,
    )


def _apply_document_scope_filters(
    stmt: Any,
    *,
    exam_id: int | None,
    exam_type: ExamType | None,
    series: ExamSeries | None,
    year: int | None,
    school_id: int | None,
    subject_id: int | None,
    subject_ids: list[int] | None = None,
    subject_type: SubjectType | None = None,
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
    if subject_ids:
        stmt = stmt.where(Document.subject_id.in_(subject_ids))
    elif subject_id is not None:
        stmt = stmt.where(Document.subject_id == subject_id)
    if subject_type is not None:
        stmt = stmt.where(Subject.subject_type == subject_type)
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
    subject_ids: str | None = Query(
        None, description="Comma-separated subject IDs (preferred over subject_id)"
    ),
    subject_type: SubjectType | None = Query(
        None, description="Filter by subject type: CORE or ELECTIVE"
    ),
    q: str | None = Query(None, description="Search file_name or extracted_id (case-insensitive)"),
) -> IdExtractionStatusCounts:
    """Return ID extraction status and error-type counts for the current document scope.

    Ignores id_extraction_status / error-code filters so the pills stay accurate.
    """
    subject_id_list = _parse_subject_ids_param(subject_ids)
    join_exam = (exam_type is not None or series is not None or year is not None) and exam_id is None
    join_subject = subject_type is not None

    def _scoped_from(stmt: Any) -> Any:
        if join_exam:
            stmt = stmt.join(Exam, Document.exam_id == Exam.id)
        if join_subject:
            stmt = stmt.join(Subject, Document.subject_id == Subject.id)
        return _apply_document_scope_filters(
            stmt,
            exam_id=exam_id,
            exam_type=exam_type,
            series=series,
            year=year,
            school_id=school_id,
            subject_id=subject_id,
            subject_ids=subject_id_list,
            subject_type=subject_type,
            q=q,
        )

    status_stmt = _scoped_from(
        select(Document.id_extraction_status, func.count(Document.id)).select_from(Document)
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

    code_stmt = _scoped_from(
        select(Document.id_extraction_error_code, func.count(Document.id)).select_from(Document)
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
    prior_code = None
    prior_name = None
    if document.subject_changed_from is not None:
        prior = (
            await session.execute(
                select(Subject).where(Subject.id == document.subject_changed_from)
            )
        ).scalar_one_or_none()
        if prior:
            prior_code = prior.code
            prior_name = prior.name
    return response.model_copy(
        update={
            "school_name": document.school.name if document.school else None,
            "subject_name": document.subject.name if document.subject else None,
            "subject_changed_from_code": prior_code,
            "subject_changed_from_name": prior_name,
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
    subject_ids: str | None = Query(
        None, description="Comma-separated subject IDs (preferred over subject_id)"
    ),
    subject_type: SubjectType | None = Query(
        None, description="Filter by subject type: CORE or ELECTIVE"
    ),
    id_extraction_status: str | None = Query(
        None, description="Filter by ID extraction status: pending, success, error"
    ),
    id_extraction_error_code: str | None = Query(
        None,
        description="Filter by ID extraction error code (comma-separated): no_id, duplicate, invalid_format, validation, low_confidence, file_missing, exception",
    ),
    q: str | None = Query(None, description="Search file_name or extracted_id (case-insensitive)"),
    test_type: str | None = Query(
        None, description="Filter by paper/test type: 1=Objectives, 2=Essay"
    ),
    test_type_changed: bool | None = Query(
        None,
        description=(
            "When true, only documents whose paper or subject was reassigned "
            "(test_type_changed_at or subject_changed_at set)"
        ),
    ),
    subject_changed: bool | None = Query(
        None,
        description="When true, only documents whose subject was reassigned (subject_changed_at set)",
    ),
    paper_changed: bool | None = Query(
        None,
        description="When true, only documents whose paper was reassigned (test_type_changed_at set)",
    ),
    subject_changed_subject_ids: str | None = Query(
        None,
        description=(
            "Comma-separated subject IDs; with subject_changed=true, matches subjects "
            "per subject_changed_subject_scope"
        ),
    ),
    subject_changed_subject_scope: str | None = Query(
        None,
        description=(
            "With subject_changed=true: either (default), current (subject_id only), "
            "or prior (subject_changed_from only)"
        ),
    ),
    paper_pair: str | None = Query(
        None,
        description=(
            "Filter by other-paper counterpart: paired | missing | missing_1 | missing_2 "
            "(missing_1 = Objectives without Essay, missing_2 = Essay without Objectives)"
        ),
    ),
) -> DocumentListResponse:
    """List documents with pagination and optional filters."""
    offset = (page - 1) * page_size

    if subject_changed_subject_scope is not None:
        normalized_scope = subject_changed_subject_scope.lower()
        if normalized_scope not in {"either", "current", "prior"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="subject_changed_subject_scope must be either, current, or prior",
            )
        subject_changed_subject_scope = normalized_scope

    if paper_pair is not None and paper_pair not in PAPER_PAIR_VALUES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="paper_pair must be paired, missing, missing_1, or missing_2",
        )

    subject_id_list = _parse_subject_ids_param(subject_ids)

    effective_test_type = test_type
    if paper_pair == "paired" and effective_test_type is None:
        # One row per pair when browsing paired sheets without a paper filter.
        effective_test_type = "1"
    elif paper_pair == "missing_1":
        effective_test_type = "1"
    elif paper_pair == "missing_2":
        effective_test_type = "2"

    join_exam = (exam_type is not None or series is not None or year is not None) and exam_id is None
    join_subject = subject_type is not None

    # Build base query with filters
    base_stmt = select(Document)
    if join_exam:
        base_stmt = base_stmt.join(Exam, Document.exam_id == Exam.id)
    if join_subject:
        base_stmt = base_stmt.join(Subject, Document.subject_id == Subject.id)

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
    base_stmt = _apply_subject_filter(
        base_stmt,
        subject_id=subject_id,
        subject_ids=subject_id_list,
        subject_changed=subject_changed,
        subject_changed_subject_ids=subject_changed_subject_ids,
        subject_changed_subject_scope=subject_changed_subject_scope,
    )
    if subject_type is not None:
        base_stmt = base_stmt.where(Subject.subject_type == subject_type)
    if id_extraction_status is not None:
        base_stmt = base_stmt.where(Document.id_extraction_status == id_extraction_status)
    if effective_test_type is not None:
        base_stmt = base_stmt.where(Document.test_type == effective_test_type)
    base_stmt = _apply_reassignment_filters(
        base_stmt,
        test_type_changed=test_type_changed,
        subject_changed=subject_changed,
        paper_changed=paper_changed,
    )

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

    if paper_pair in PAPER_PAIR_VALUES:
        base_stmt = _apply_paper_pair_filter(base_stmt, paper_pair)

    # Get total count with same filters
    count_stmt = select(func.count(Document.id)).select_from(Document)
    if join_exam:
        count_stmt = count_stmt.join(Exam, Document.exam_id == Exam.id)
    if join_subject:
        count_stmt = count_stmt.join(Subject, Document.subject_id == Subject.id)

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
    count_stmt = _apply_subject_filter(
        count_stmt,
        subject_id=subject_id,
        subject_ids=subject_id_list,
        subject_changed=subject_changed,
        subject_changed_subject_ids=subject_changed_subject_ids,
        subject_changed_subject_scope=subject_changed_subject_scope,
    )
    if subject_type is not None:
        count_stmt = count_stmt.where(Subject.subject_type == subject_type)
    if id_extraction_status is not None:
        count_stmt = count_stmt.where(Document.id_extraction_status == id_extraction_status)
    if effective_test_type is not None:
        count_stmt = count_stmt.where(Document.test_type == effective_test_type)
    count_stmt = _apply_reassignment_filters(
        count_stmt,
        test_type_changed=test_type_changed,
        subject_changed=subject_changed,
        paper_changed=paper_changed,
    )
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

    if paper_pair in PAPER_PAIR_VALUES:
        count_stmt = _apply_paper_pair_filter(count_stmt, paper_pair)

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

    prior_ids = {
        doc.subject_changed_from
        for doc in documents
        if doc.subject_changed_from is not None
    }
    prior_subjects: dict[int, Subject] = {}
    if prior_ids:
        prior_rows = (
            await session.execute(select(Subject).where(Subject.id.in_(prior_ids)))
        ).scalars().all()
        prior_subjects = {s.id: s for s in prior_rows}

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return DocumentListResponse(
        items=[
            _document_to_list_item(doc, prior_subjects=prior_subjects)
            for doc in documents
        ],
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
        conflict_document_id=extraction_result.get("conflict_document_id"),
    )


@router.get("/{document_id}/id-extraction-conflicts", response_model=IdExtractionConflictsResponse)
async def get_id_extraction_conflicts(
    document_id: int, session: DBSessionDep
) -> IdExtractionConflictsResponse:
    """Return documents that share this sheet ID (duplicate extraction conflicts)."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    conflicts = await resolve_id_extraction_conflicts(session, document)
    return IdExtractionConflictsResponse(
        items=[IdExtractionConflictItem.model_validate(item) for item in conflicts]
    )


@router.get("/{document_id}/paper-counterpart", response_model=PaperCounterpartResponse)
async def get_paper_counterpart(
    document_id: int, session: DBSessionDep
) -> PaperCounterpartResponse:
    """Return the other-paper document for the same school/subject/series/page, if any."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    counterpart = await find_paper_counterpart(session, document)
    return PaperCounterpartResponse(
        counterpart=(
            IdExtractionConflictItem.model_validate(counterpart) if counterpart else None
        )
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
    """Manually correct document ID and metadata; migrate applied scores on subject/paper change."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    old_extracted_id = document.extracted_id
    old_test_type = document.test_type or (
        old_extracted_id[10:11] if old_extracted_id and len(old_extracted_id) == 13 else None
    )
    old_subject_id = document.subject_id
    prior_identity_complete = _has_complete_sheet_identity(document)
    scores_moved = 0

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
                if update.subject_id is None and validation_result.subject_code:
                    subj_result = await session.execute(
                        select(Subject).where(Subject.code == validation_result.subject_code)
                    )
                    subject = subj_result.scalar_one_or_none()
                    if subject:
                        document.subject_id = subject.id
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

    new_extracted_id = document.extracted_id
    new_test_type = document.test_type
    new_subject_id = document.subject_id

    subject_or_paper_changed = (
        old_subject_id != new_subject_id
        or (old_test_type and new_test_type and old_test_type != new_test_type)
    )
    id_changed = bool(old_extracted_id and new_extracted_id and old_extracted_id != new_extracted_id)

    # Always block ownership collisions when assigning a different extracted_id
    if new_extracted_id and new_extracted_id != old_extracted_id:
        conflict_stmt = select(Document).where(
            Document.extracted_id == new_extracted_id,
            Document.exam_id == document.exam_id,
            Document.id != document.id,
            Document.upload_status == "uploaded",
        )
        conflict_doc = (await session.execute(conflict_stmt)).scalar_one_or_none()
        if conflict_doc:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": (
                        f"Another document (#{conflict_doc.id}) already uses ID "
                        f"{new_extracted_id}"
                    ),
                    "error_code": "id_ownership",
                    "conflict_document_id": conflict_doc.id,
                },
            )

    if (
        prior_identity_complete
        and old_extracted_id
        and new_extracted_id
        and (subject_or_paper_changed or id_changed)
    ):
        migration = await migrate_applied_scores_for_id_change(
            session,
            exam_id=document.exam_id,
            old_extracted_id=old_extracted_id,
            new_extracted_id=new_extracted_id,
            old_test_type=old_test_type,
            new_test_type=new_test_type,
            old_subject_id=old_subject_id,
            new_subject_id=new_subject_id,
            overwrite=update.overwrite_scores,
            dry_run=False,
        )
        if migration.conflicts and not update.overwrite_scores:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Target already has scores; confirm overwrite to replace them",
                    "conflicts": [
                        {
                            "index_number": c.index_number,
                            "candidate_name": c.candidate_name,
                            "existing_score": c.existing_score,
                            "existing_document_id": c.existing_document_id,
                            "subject_score_id": c.subject_score_id,
                        }
                        for c in migration.conflicts
                    ],
                },
            )
        if migration.blocking_errors or migration.unregistered:
            await session.rollback()
            parts = list(migration.blocking_errors)
            if migration.unregistered:
                n = len(migration.unregistered)
                parts.append(
                    f"{n} candidate{'s' if n != 1 else ''} not registered for the new subject"
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="; ".join(parts),
            )
        scores_moved = migration.scores_moved

    if prior_identity_complete and old_test_type and new_test_type and old_test_type != new_test_type:
        apply_test_type_change_markers(
            document,
            old_test_type=old_test_type,
            new_test_type=new_test_type,
        )
    if prior_identity_complete and old_subject_id != new_subject_id:
        apply_subject_change_markers(
            document,
            old_subject_id=old_subject_id,
            new_subject_id=new_subject_id,
        )

    await session.commit()
    await session.refresh(document)

    response = DocumentResponse.model_validate(document)
    prior_code = None
    prior_name = None
    if document.subject_changed_from is not None:
        prior = (
            await session.execute(
                select(Subject).where(Subject.id == document.subject_changed_from)
            )
        ).scalar_one_or_none()
        if prior:
            prior_code = prior.code
            prior_name = prior.name
    return response.model_copy(
        update={
            "scores_moved": scores_moved,
            "subject_changed_from_code": prior_code,
            "subject_changed_from_name": prior_name,
        }
    )


@router.post(
    "/{document_id}/score-migration-preview",
    response_model=ScoreMigrationPreviewResponse,
)
async def score_migration_preview(
    document_id: int,
    body: ScoreMigrationPreviewRequest,
    session: DBSessionDep,
) -> ScoreMigrationPreviewResponse:
    """Preview applied-score migration for a proposed sheet ID / subject change."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    old_extracted_id = document.extracted_id
    old_test_type = document.test_type or (
        old_extracted_id[10:11] if old_extracted_id and len(old_extracted_id) == 13 else None
    )
    old_subject_id = document.subject_id

    new_extracted_id = body.extracted_id
    new_subject_id = body.subject_id if body.subject_id is not None else document.subject_id
    new_test_type = document.test_type

    parsed = IDValidator.parse_id(new_extracted_id)
    if parsed.is_valid:
        new_test_type = parsed.test_type
        if body.subject_id is None and parsed.subject_code:
            subj = (
                await session.execute(select(Subject).where(Subject.code == parsed.subject_code))
            ).scalar_one_or_none()
            if subj:
                new_subject_id = subj.id

    ownership_conflict_id: int | None = None
    if new_extracted_id and new_extracted_id != old_extracted_id:
        ownership_stmt = select(Document).where(
            Document.extracted_id == new_extracted_id,
            Document.exam_id == document.exam_id,
            Document.id != document.id,
            Document.upload_status == "uploaded",
        )
        ownership_doc = (await session.execute(ownership_stmt)).scalar_one_or_none()
        if ownership_doc:
            ownership_conflict_id = ownership_doc.id

    # Incomplete prior identity: correction / first assignment — no scores to migrate
    if not _has_complete_sheet_identity(document) or not old_extracted_id:
        to_subject = None
        if new_subject_id is not None:
            to_subject = (
                await session.execute(select(Subject).where(Subject.id == new_subject_id))
            ).scalar_one_or_none()
        return ScoreMigrationPreviewResponse(
            requires_confirm=False,
            subject_changed=False,
            paper_changed=False,
            scores_to_move=0,
            from_meta=ScoreMigrationEndpointMeta(
                extracted_id=old_extracted_id,
                subject_id=old_subject_id,
                test_type=old_test_type,
            ),
            to_meta=ScoreMigrationEndpointMeta(
                extracted_id=new_extracted_id,
                subject_id=new_subject_id,
                subject_code=to_subject.code if to_subject else None,
                subject_name=to_subject.name if to_subject else None,
                test_type=new_test_type,
                paper_label=(
                    "Objectives"
                    if new_test_type == "1"
                    else "Essay"
                    if new_test_type == "2"
                    else None
                ),
            ),
            conflicts=[],
            unregistered=[],
            blocking_errors=[],
            conflict_document_id=ownership_conflict_id,
        )

    migration = await migrate_applied_scores_for_id_change(
        session,
        exam_id=document.exam_id,
        old_extracted_id=old_extracted_id,
        new_extracted_id=new_extracted_id,
        old_test_type=old_test_type,
        new_test_type=new_test_type,
        old_subject_id=old_subject_id,
        new_subject_id=new_subject_id,
        overwrite=False,
        dry_run=True,
    )

    # Keep hard blockers separate from ownership (surfaced via conflict_document_id)
    blocking_errors = [
        e
        for e in migration.blocking_errors
        if "already uses ID" not in e
    ]

    from_meta = migration.from_meta
    to_meta = migration.to_meta
    return ScoreMigrationPreviewResponse(
        requires_confirm=migration.requires_confirm,
        subject_changed=migration.subject_changed,
        paper_changed=migration.paper_changed,
        scores_to_move=migration.scores_to_move,
        from_meta=ScoreMigrationEndpointMeta(
            extracted_id=from_meta.extracted_id if from_meta else old_extracted_id,
            subject_id=from_meta.subject_id if from_meta else old_subject_id,
            subject_code=from_meta.subject_code if from_meta else None,
            subject_name=from_meta.subject_name if from_meta else None,
            test_type=from_meta.test_type if from_meta else old_test_type,
            paper_label=from_meta.paper_label if from_meta else None,
        ),
        to_meta=ScoreMigrationEndpointMeta(
            extracted_id=to_meta.extracted_id if to_meta else new_extracted_id,
            subject_id=to_meta.subject_id if to_meta else new_subject_id,
            subject_code=to_meta.subject_code if to_meta else None,
            subject_name=to_meta.subject_name if to_meta else None,
            test_type=to_meta.test_type if to_meta else new_test_type,
            paper_label=to_meta.paper_label if to_meta else None,
        ),
        conflicts=[
            ScoreMigrationConflictItem(
                index_number=c.index_number,
                candidate_name=c.candidate_name,
                existing_score=c.existing_score,
                existing_document_id=c.existing_document_id,
                subject_score_id=c.subject_score_id,
            )
            for c in migration.conflicts
        ],
        unregistered=[
            ScoreMigrationUnregisteredItem(
                index_number=u.index_number,
                candidate_name=u.candidate_name,
            )
            for u in migration.unregistered
        ],
        blocking_errors=blocking_errors,
        conflict_document_id=ownership_conflict_id,
    )


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
    not_queued_ids = list(result["skipped_not_queued"])

    db_changed = False
    still_not_queued: list[int] = []
    for document_id in [*result["removed"], *not_queued_ids]:
        if document_id in processing_ids:
            continue
        stmt = select(Document).where(Document.id == document_id)
        doc_result = await session.execute(stmt)
        document = doc_result.scalar_one_or_none()
        if not document:
            if document_id not in removed_ids:
                still_not_queued.append(document_id)
            continue
        row = await get_extraction(session, document.id, request.method)
        if row is not None and reset_stale_extraction_row(document, row):
            removed_ids.add(document_id)
            db_changed = True
        elif document_id not in removed_ids:
            still_not_queued.append(document_id)

    if db_changed:
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
        removed_count=len(removed_ids),
        skipped_processing=len(result["skipped_processing"]),
        skipped_not_queued=len(still_not_queued),
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
