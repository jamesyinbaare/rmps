from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select

from app.config import settings
from app.dependencies.database import DBSessionDep
from app.models import Batch, BatchDocument, Document
from app.schemas.batch import BatchCreate, BatchDocumentStatus, BatchReport, BatchResponse
from app.services.batch_processor import batch_processor
from app.services.storage import storage_service
from app.utils import calculate_checksum

router = APIRouter(prefix="/api/v1/batches", tags=["batches"])


@router.post("", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
async def create_batch(batch: BatchCreate, session: DBSessionDep) -> BatchResponse:
    """Create a new batch from existing document IDs."""
    # Validate document IDs exist
    if batch.document_ids:
        doc_stmt = select(Document).where(Document.id.in_(batch.document_ids))
        result = await session.execute(doc_stmt)
        existing_docs = result.scalars().all()
        if len(existing_docs) != len(batch.document_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Some document IDs not found")

        if len(batch.document_ids) > settings.batch_max_files:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Batch size exceeds maximum of {settings.batch_max_files} files",
            )

    # Create batch
    db_batch = Batch(name=batch.name, total_files=len(batch.document_ids))
    session.add(db_batch)
    await session.flush()  # Get batch ID

    # Create batch documents
    for doc_id in batch.document_ids:
        batch_doc = BatchDocument(batch_id=db_batch.id, document_id=doc_id, processing_status="pending")
        session.add(batch_doc)

    await session.commit()
    await session.refresh(db_batch)

    return BatchResponse.model_validate(db_batch)


@router.post("/batch-upload", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
async def batch_upload(
    session: DBSessionDep,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    batch_name: str | None = None,
) -> BatchResponse:
    """Upload multiple files and create a batch."""
    if len(files) > settings.batch_max_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Number of files exceeds maximum of {settings.batch_max_files}",
        )

    # Validate and upload files
    allowed_mime_types = ["application/pdf", "image/jpeg", "image/png", "image/tiff"]
    uploaded_documents: list[Document] = []

    for file in files:
        if file.content_type not in allowed_mime_types:
            continue  # Skip invalid files

        # Read file content
        content = await file.read()

        # Validate file size
        if len(content) > settings.storage_max_size:
            continue  # Skip oversized files

        # Calculate checksum before saving
        checksum = calculate_checksum(content)

        # Check for duplicate file
        duplicate_stmt = select(Document).where(Document.checksum == checksum)
        duplicate_result = await session.execute(duplicate_stmt)
        existing_document = duplicate_result.scalar_one_or_none()

        if existing_document:
            if settings.reject_duplicate_files:
                continue  # Skip duplicate files in batch upload
            else:
                # Use existing document
                uploaded_documents.append(existing_document)
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
            status="pending",
        )
        session.add(db_document)
        uploaded_documents.append(db_document)

    await session.flush()

    # Create batch
    batch_name = batch_name or f"Batch_{len(uploaded_documents)}_files"
    db_batch = Batch(name=batch_name, total_files=len(uploaded_documents))
    session.add(db_batch)
    await session.flush()

    # Create batch documents
    for doc in uploaded_documents:
        batch_doc = BatchDocument(batch_id=db_batch.id, document_id=doc.id, processing_status="pending")
        session.add(batch_doc)

    await session.commit()
    await session.refresh(db_batch)

    # Trigger background extraction for all documents in the batch
    from app.dependencies.database import get_sessionmanager

    sessionmanager = get_sessionmanager()

    async def process_batch_extraction():
        async with sessionmanager.session() as new_session:
            await batch_processor.process_batch(db_batch.id, new_session)

    # Process extraction in background
    background_tasks.add_task(process_batch_extraction)

    return BatchResponse.model_validate(db_batch)


@router.get("", response_model=list[BatchResponse])
async def list_batches(
    session: DBSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> list[BatchResponse]:
    """List batches with pagination."""
    offset = (page - 1) * page_size
    stmt = select(Batch).offset(offset).limit(page_size).order_by(Batch.created_at.desc())
    result = await session.execute(stmt)
    batches = result.scalars().all()
    return [BatchResponse.model_validate(batch) for batch in batches]


@router.get("/{batch_id}", response_model=BatchResponse)
async def get_batch(batch_id: int, session: DBSessionDep) -> BatchResponse:
    """Get batch details."""
    stmt = select(Batch).where(Batch.id == batch_id)
    result = await session.execute(stmt)
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")
    return BatchResponse.model_validate(batch)


@router.post("/{batch_id}/process", response_model=dict[str, Any])
async def process_batch(batch_id: int, background_tasks: BackgroundTasks, session: DBSessionDep) -> dict[str, Any]:
    """Start batch processing."""
    stmt = select(Batch).where(Batch.id == batch_id)
    result = await session.execute(stmt)
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")

    if batch.status == "processing":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Batch is already being processed")

    # Get a new session manager for background task
    from app.dependencies.database import get_sessionmanager

    sessionmanager = get_sessionmanager()

    async def process_with_new_session():
        async with sessionmanager.session() as new_session:
            await batch_processor.process_batch(batch_id, new_session)

    # Process in background
    background_tasks.add_task(process_with_new_session)

    return {"batch_id": batch_id, "status": "processing_started", "message": "Batch processing started"}


@router.get("/{batch_id}/report", response_model=BatchReport)
async def get_batch_report(batch_id: int, session: DBSessionDep) -> BatchReport:
    """Get batch processing report."""
    stmt = select(Batch).where(Batch.id == batch_id)
    result = await session.execute(stmt)
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")

    # Get batch documents
    batch_doc_stmt = select(BatchDocument).where(BatchDocument.batch_id == batch_id)
    result = await session.execute(batch_doc_stmt)
    batch_documents = result.scalars().all()

    documents = [
        BatchDocumentStatus(
            document_id=bd.document_id,
            processing_status=bd.processing_status,
            error_message=bd.error_message,
        )
        for bd in batch_documents
    ]

    # Validate batch
    validation_result = await batch_processor.validate_batch(batch_id, session)

    return BatchReport(
        batch_id=batch.id,
        batch_name=batch.name,
        status=batch.status,
        total_files=batch.total_files,
        processed_files=batch.processed_files,
        failed_files=batch.failed_files,
        documents=documents,
        validation_errors=validation_result.get("validation_errors", []),
        sequence_gaps=validation_result.get("sequence_gaps", []),
        duplicates=validation_result.get("duplicates", []),
    )


@router.post("/{batch_id}/validate", response_model=dict[str, Any])
async def validate_batch(batch_id: int, session: DBSessionDep) -> dict[str, Any]:
    """Validate batch for sequence gaps and duplicates."""
    return await batch_processor.validate_batch(batch_id, session)


@router.post("/{batch_id}/rename", response_model=dict[str, Any])
async def rename_batch_files(batch_id: int, session: DBSessionDep) -> dict[str, Any]:
    """Rename files in batch using extracted IDs."""
    return await batch_processor.rename_files(batch_id, session)
