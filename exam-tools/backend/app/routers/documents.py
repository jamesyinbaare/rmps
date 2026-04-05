"""Exam documents: super admin upload/delete; supervisors, inspectors, and admins list/download."""

from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.dependencies.auth import ExamDocumentReaderDep, SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import ExamDocument
from app.schemas.exam_document import ExamDocumentListResponse, ExamDocumentResponse
from app.services.exam_documents import (
    ExamDocumentUploadError,
    absolute_stored_path,
    ensure_storage_dir,
    normalized_extension,
    remove_stored_file,
    write_stored_file,
)

router = APIRouter(prefix="/documents", tags=["documents"])


def _content_disposition_attachment(filename: str) -> str:
    ascii_name = filename.encode("ascii", "replace").decode("ascii").replace('"', "'") or "download"
    encoded = quote(filename, safe="")
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'


@router.get("", response_model=ExamDocumentListResponse)
async def list_exam_documents(
    session: DBSessionDep,
    _user: ExamDocumentReaderDep,
) -> ExamDocumentListResponse:
    ensure_storage_dir()
    count_stmt = select(func.count()).select_from(ExamDocument)
    total = int((await session.execute(count_stmt)).scalar_one())

    stmt = select(ExamDocument).order_by(ExamDocument.created_at.desc())
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return ExamDocumentListResponse(
        items=[ExamDocumentResponse.model_validate(r) for r in rows],
        total=total,
    )


@router.get("/{document_id}/file")
async def download_exam_document(
    session: DBSessionDep,
    document_id: UUID,
    _user: ExamDocumentReaderDep,
) -> StreamingResponse:
    stmt = select(ExamDocument).where(ExamDocument.id == document_id)
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    path = absolute_stored_path(row.stored_path)
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File missing on server",
        )

    media_type = row.content_type or "application/octet-stream"
    data = path.read_bytes()

    return StreamingResponse(
        iter([data]),
        media_type=media_type,
        headers={"Content-Disposition": _content_disposition_attachment(row.original_filename)},
    )


@router.post("", response_model=ExamDocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_exam_document(
    session: DBSessionDep,
    admin: SuperAdminDep,
    title: str = Form(..., min_length=1, max_length=255),
    description: str | None = Form(None),
    file: UploadFile = File(...),
) -> ExamDocumentResponse:
    title_clean = title.strip()
    if not title_clean:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")

    raw = await file.read()
    try:
        ext = normalized_extension(file.filename or "")
        stored_name = write_stored_file(raw, ext)
    except ExamDocumentUploadError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    desc_clean = description.strip() if description else None
    if desc_clean == "":
        desc_clean = None

    doc = ExamDocument(
        title=title_clean,
        description=desc_clean,
        original_filename=file.filename or "upload",
        stored_path=stored_name,
        content_type=file.content_type,
        size_bytes=len(raw),
        uploaded_by_id=admin.id,
    )
    session.add(doc)
    try:
        await session.commit()
        await session.refresh(doc)
    except Exception:
        await session.rollback()
        try:
            remove_stored_file(stored_name)
        except ExamDocumentUploadError:
            pass
        raise
    return ExamDocumentResponse.model_validate(doc)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exam_document(
    session: DBSessionDep,
    document_id: UUID,
    _admin: SuperAdminDep,
) -> None:
    stmt = select(ExamDocument).where(ExamDocument.id == document_id)
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    stored = row.stored_path
    await session.delete(row)
    await session.commit()

    try:
        remove_stored_file(stored)
    except ExamDocumentUploadError:
        pass
