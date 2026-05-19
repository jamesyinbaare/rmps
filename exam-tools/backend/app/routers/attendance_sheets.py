"""Inspector attendance sheet uploads; super admin and finance officer review."""

from __future__ import annotations

from datetime import date
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import contains_eager, joinedload

from app.dependencies.auth import (
    InspectorDep,
    InspectorJwtPostingIdDep,
    SuperAdminOrFinanceOfficerDep,
)
from app.dependencies.database import DBSessionDep
from app.models import InspectorAttendanceSheet, InspectorExamPosting, School, User
from app.schemas.attendance_sheet import (
    AttendanceCentreComplianceItem,
    AttendanceCentreComplianceListResponse,
    AttendanceSheetAdminListResponse,
    AttendanceSheetAdminResponse,
    AttendanceSheetAdminSummaryResponse,
    AttendanceSheetListResponse,
    AttendanceSheetResponse,
    AttendanceSheetScheduledDatesResponse,
)
from app.services.admin_attendance_compliance import admin_attendance_summary, list_compliance_centres
from app.services.admin_attendance_zip import (
    attendance_zip_download_filename,
    build_attendance_sheets_zip_bytes,
)
from app.services.attendance_sheet_files import (
    AttendanceSheetUploadError,
    attendance_normalized_extension,
    build_attendance_sheet_filename,
    read_attendance_sheet_bytes,
    remove_attendance_sheet_file,
    write_attendance_sheet_file,
)
from app.services.exam_documents import ensure_storage_dir
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.inspector_posting import resolve_inspector_workspace
from app.services.timetable_dates import (
    scheduled_examination_dates_for_exam,
    scheduled_examination_dates_for_inspector_workspace,
)

router = APIRouter(tags=["attendance-sheets"])

inspector_router = APIRouter(prefix="/examinations/{examination_id}/attendance-sheets")
admin_router = APIRouter(prefix="/admin/examinations/{examination_id}/attendance-sheets")


def admin_attendance_list_search_pattern(q: str | None) -> str | None:
    """Case-insensitive ILIKE pattern for admin list search, or None if empty."""
    if not q or not q.strip():
        return None
    return f"%{q.strip()}%"


def _content_disposition_attachment(filename: str) -> str:
    ascii_name = filename.encode("ascii", "replace").decode("ascii").replace('"', "'") or "download"
    encoded = quote(filename, safe="")
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'


def _sheet_to_response(row: InspectorAttendanceSheet, center: School) -> AttendanceSheetResponse:
    return AttendanceSheetResponse(
        id=row.id,
        examination_id=row.examination_id,
        inspector_exam_posting_id=row.inspector_exam_posting_id,
        center_id=row.center_id,
        center_code=str(center.code),
        center_name=str(center.name),
        examination_date=row.examination_date,
        notes=row.notes,
        original_filename=row.original_filename,
        size_bytes=row.size_bytes,
        uploaded_by_id=row.uploaded_by_id,
        created_at=row.created_at,
    )


async def _resolve_inspector_ctx(
    session: DBSessionDep,
    examination_id: int,
    user: User,
    posting_id: UUID | None,
    jwt_posting_id: UUID | None,
):
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None
    return await resolve_inspector_workspace(
        session,
        examination_id=examination_id,
        user=user,
        posting_id=posting_id,
        jwt_posting_id=jwt_posting_id,
    )


async def _collision_index(
    session: DBSessionDep,
    *,
    examination_id: int,
    center_id: UUID,
    examination_date: date,
) -> int:
    stmt = (
        select(func.count())
        .select_from(InspectorAttendanceSheet)
        .where(
            InspectorAttendanceSheet.examination_id == examination_id,
            InspectorAttendanceSheet.center_id == center_id,
            InspectorAttendanceSheet.examination_date == examination_date,
        )
    )
    existing = int((await session.execute(stmt)).scalar_one())
    return existing + 1


@inspector_router.get("/scheduled-dates", response_model=AttendanceSheetScheduledDatesResponse)
async def list_scheduled_dates(
    examination_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(
        default=None,
        description="Inspector posting (workspace); overrides JWT when set.",
    ),
) -> AttendanceSheetScheduledDatesResponse:
    ctx = await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    dates = await scheduled_examination_dates_for_inspector_workspace(session, examination_id, ctx)
    return AttendanceSheetScheduledDatesResponse(dates=dates)


@inspector_router.get("", response_model=AttendanceSheetListResponse)
async def list_inspector_attendance_sheets(
    examination_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
    examination_date: date | None = Query(default=None),
) -> AttendanceSheetListResponse:
    ctx = await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    assert ctx.posting is not None

    stmt = (
        select(InspectorAttendanceSheet, School)
        .join(School, InspectorAttendanceSheet.center_id == School.id)
        .where(InspectorAttendanceSheet.inspector_exam_posting_id == ctx.posting.id)
        .order_by(InspectorAttendanceSheet.examination_date.desc(), InspectorAttendanceSheet.created_at.desc())
    )
    if examination_date is not None:
        stmt = stmt.where(InspectorAttendanceSheet.examination_date == examination_date)

    result = await session.execute(stmt)
    rows = result.all()
    items = [_sheet_to_response(sheet, center) for sheet, center in rows]
    return AttendanceSheetListResponse(items=items, total=len(items))


@inspector_router.post("", response_model=AttendanceSheetResponse, status_code=status.HTTP_201_CREATED)
async def upload_inspector_attendance_sheet(
    examination_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    examination_date: date = Form(...),
    notes: str | None = Form(None),
    file: UploadFile = File(...),
    posting_id: UUID | None = Query(default=None),
) -> AttendanceSheetResponse:
    ctx = await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    assert ctx.posting is not None

    allowed_dates = await scheduled_examination_dates_for_inspector_workspace(session, examination_id, ctx)
    if examination_date not in allowed_dates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="examination_date is not a scheduled date for this examination centre",
        )

    raw = await file.read()
    try:
        ext = attendance_normalized_extension(file.filename or "")
    except AttendanceSheetUploadError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    ensure_storage_dir()
    collision = await _collision_index(
        session,
        examination_id=examination_id,
        center_id=ctx.center_host.id,
        examination_date=examination_date,
    )
    display_name = build_attendance_sheet_filename(
        str(ctx.center_host.code),
        str(ctx.center_host.name),
        examination_date,
        ext,
        collision_index=collision,
    )

    try:
        stored_name = write_attendance_sheet_file(raw, ext)
    except AttendanceSheetUploadError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    notes_clean = notes.strip() if notes else None
    if notes_clean == "":
        notes_clean = None

    row = InspectorAttendanceSheet(
        examination_id=examination_id,
        inspector_exam_posting_id=ctx.posting.id,
        center_id=ctx.center_host.id,
        examination_date=examination_date,
        notes=notes_clean,
        original_filename=display_name,
        stored_path=stored_name,
        content_type=file.content_type,
        size_bytes=len(raw),
        uploaded_by_id=user.id,
    )
    session.add(row)
    try:
        await session.commit()
        await session.refresh(row)
    except Exception:
        await session.rollback()
        try:
            remove_attendance_sheet_file(stored_name)
        except AttendanceSheetUploadError:
            pass
        raise

    return _sheet_to_response(row, ctx.center_host)


async def _load_sheet_for_inspector(
    session: DBSessionDep,
    examination_id: int,
    sheet_id: UUID,
    user: User,
    posting_id: UUID | None,
    jwt_posting_id: UUID | None,
) -> tuple[InspectorAttendanceSheet, School]:
    ctx = await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    assert ctx.posting is not None

    stmt = (
        select(InspectorAttendanceSheet, School)
        .join(School, InspectorAttendanceSheet.center_id == School.id)
        .where(
            InspectorAttendanceSheet.id == sheet_id,
            InspectorAttendanceSheet.examination_id == examination_id,
        )
    )
    row = (await session.execute(stmt)).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance sheet not found")
    sheet, center = row
    if sheet.inspector_exam_posting_id != ctx.posting.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed for this workspace")
    return sheet, center


@inspector_router.get("/{sheet_id}/file")
async def download_inspector_attendance_sheet(
    examination_id: int,
    sheet_id: UUID,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
) -> StreamingResponse:
    sheet, _center = await _load_sheet_for_inspector(
        session, examination_id, sheet_id, user, posting_id, jwt_posting_id
    )
    try:
        data = read_attendance_sheet_bytes(sheet.stored_path)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File missing on server",
        ) from None

    return StreamingResponse(
        iter([data]),
        media_type=sheet.content_type or "application/octet-stream",
        headers={"Content-Disposition": _content_disposition_attachment(sheet.original_filename)},
    )


@inspector_router.delete("/{sheet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inspector_attendance_sheet(
    examination_id: int,
    sheet_id: UUID,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
) -> None:
    sheet, _center = await _load_sheet_for_inspector(
        session, examination_id, sheet_id, user, posting_id, jwt_posting_id
    )
    stored = sheet.stored_path
    await session.delete(sheet)
    await session.commit()
    try:
        remove_attendance_sheet_file(stored)
    except AttendanceSheetUploadError:
        pass


@admin_router.get("/scheduled-dates", response_model=AttendanceSheetScheduledDatesResponse)
async def admin_attendance_scheduled_dates(
    examination_id: int,
    session: DBSessionDep,
    _staff: SuperAdminOrFinanceOfficerDep,
) -> AttendanceSheetScheduledDatesResponse:
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None
    dates = await scheduled_examination_dates_for_exam(session, examination_id)
    return AttendanceSheetScheduledDatesResponse(dates=dates)


@admin_router.get("/summary", response_model=AttendanceSheetAdminSummaryResponse)
async def admin_attendance_sheet_summary(
    examination_id: int,
    session: DBSessionDep,
    _staff: SuperAdminOrFinanceOfficerDep,
    examination_date: date | None = Query(default=None),
    q: str | None = Query(None),
) -> AttendanceSheetAdminSummaryResponse:
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    search_pattern = admin_attendance_list_search_pattern(q)
    total_uploads, centres_with_uploads, centres_expected, centres_missing = await admin_attendance_summary(
        session,
        examination_id,
        examination_date=examination_date,
        search_pattern=search_pattern,
    )
    return AttendanceSheetAdminSummaryResponse(
        total_uploads=total_uploads,
        centres_with_uploads=centres_with_uploads,
        centres_expected=centres_expected,
        centres_missing=centres_missing,
    )


@admin_router.get("/compliance-centres", response_model=AttendanceCentreComplianceListResponse)
async def admin_attendance_compliance_centres(
    examination_id: int,
    session: DBSessionDep,
    _staff: SuperAdminOrFinanceOfficerDep,
    examination_date: date = Query(..., description="Scheduled examination date (ISO)"),
    upload_status: str = Query("all", pattern="^(all|uploaded|missing)$"),
    q: str | None = Query(None),
) -> AttendanceCentreComplianceListResponse:
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    rows = await list_compliance_centres(
        session,
        examination_id,
        examination_date,
        upload_status=upload_status,
        search=q,
    )
    items = [
        AttendanceCentreComplianceItem(
            center_id=r.center_id,
            center_code=r.center_code,
            center_name=r.center_name,
            inspector_user_id=r.inspector_user_id,
            inspector_full_name=r.inspector_full_name,
            inspector_phone=r.inspector_phone,
            file_count=r.file_count,
            upload_status=r.upload_status,
        )
        for r in rows
    ]
    return AttendanceCentreComplianceListResponse(items=items, total=len(items))


@admin_router.get("", response_model=AttendanceSheetAdminListResponse)
async def list_admin_attendance_sheets(
    examination_id: int,
    session: DBSessionDep,
    _staff: SuperAdminOrFinanceOfficerDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    center_id: UUID | None = Query(default=None),
    examination_date: date | None = Query(default=None),
    inspector_user_id: UUID | None = Query(default=None),
    q: str | None = Query(None, description="Search centre code/name or inspector name"),
) -> AttendanceSheetAdminListResponse:
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    filters = [InspectorAttendanceSheet.examination_id == examination_id]
    if center_id is not None:
        filters.append(InspectorAttendanceSheet.center_id == center_id)
    if examination_date is not None:
        filters.append(InspectorAttendanceSheet.examination_date == examination_date)
    if inspector_user_id is not None:
        filters.append(
            InspectorAttendanceSheet.inspector_exam_posting_id.in_(
                select(InspectorExamPosting.id).where(
                    InspectorExamPosting.inspector_user_id == inspector_user_id,
                    InspectorExamPosting.examination_id == examination_id,
                )
            )
        )

    search_pattern = admin_attendance_list_search_pattern(q)
    if search_pattern is not None:
        filters.append(
            or_(
                School.code.ilike(search_pattern),
                School.name.ilike(search_pattern),
                User.full_name.ilike(search_pattern),
            )
        )

    count_stmt = (
        select(func.count(InspectorAttendanceSheet.id))
        .select_from(InspectorAttendanceSheet)
        .join(InspectorAttendanceSheet.center)
        .join(InspectorAttendanceSheet.inspector_exam_posting)
    )
    if search_pattern is not None:
        count_stmt = count_stmt.join(InspectorExamPosting.inspector_user)
    count_stmt = count_stmt.where(*filters)
    total = int((await session.execute(count_stmt)).scalar_one())

    load_opts = [
        contains_eager(InspectorAttendanceSheet.center),
        contains_eager(InspectorAttendanceSheet.inspector_exam_posting),
    ]
    if search_pattern is not None:
        load_opts[1] = contains_eager(InspectorAttendanceSheet.inspector_exam_posting).contains_eager(
            InspectorExamPosting.inspector_user
        )
    else:
        load_opts[1] = contains_eager(InspectorAttendanceSheet.inspector_exam_posting).joinedload(
            InspectorExamPosting.inspector_user
        )

    base = (
        select(InspectorAttendanceSheet)
        .join(InspectorAttendanceSheet.center)
        .join(InspectorAttendanceSheet.inspector_exam_posting)
    )
    if search_pattern is not None:
        base = base.join(InspectorExamPosting.inspector_user)
    base = base.where(*filters).options(*load_opts)

    stmt = (
        base.order_by(
            School.code.asc(),
            InspectorAttendanceSheet.examination_date.desc(),
            InspectorAttendanceSheet.created_at.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await session.execute(stmt)
    sheets = result.scalars().unique().all()

    items: list[AttendanceSheetAdminResponse] = []
    for sheet in sheets:
        center = sheet.center
        posting = sheet.inspector_exam_posting
        insp = posting.inspector_user if posting else None
        items.append(
            AttendanceSheetAdminResponse(
                id=sheet.id,
                examination_id=sheet.examination_id,
                inspector_exam_posting_id=sheet.inspector_exam_posting_id,
                center_id=sheet.center_id,
                center_code=str(center.code) if center else "",
                center_name=str(center.name) if center else "",
                examination_date=sheet.examination_date,
                notes=sheet.notes,
                original_filename=sheet.original_filename,
                size_bytes=sheet.size_bytes,
                uploaded_by_id=sheet.uploaded_by_id,
                created_at=sheet.created_at,
                inspector_user_id=posting.inspector_user_id if posting else sheet.uploaded_by_id or sheet.id,
                inspector_full_name=insp.full_name if insp else "—",
                inspector_phone=insp.phone_number if insp else None,
            )
        )

    return AttendanceSheetAdminListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@admin_router.get("/download-zip")
async def download_admin_attendance_sheets_zip(
    examination_id: int,
    session: DBSessionDep,
    _staff: SuperAdminOrFinanceOfficerDep,
    center_id: UUID = Query(..., description="Centre whose attendance sheets to include"),
    examination_date: date | None = Query(default=None),
    inspector_user_id: UUID | None = Query(default=None),
    q: str | None = Query(None, description="Search centre code/name or inspector name"),
) -> Response:
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    filters = [InspectorAttendanceSheet.examination_id == examination_id]
    filters.append(InspectorAttendanceSheet.center_id == center_id)
    if examination_date is not None:
        filters.append(InspectorAttendanceSheet.examination_date == examination_date)
    if inspector_user_id is not None:
        filters.append(
            InspectorAttendanceSheet.inspector_exam_posting_id.in_(
                select(InspectorExamPosting.id).where(
                    InspectorExamPosting.inspector_user_id == inspector_user_id,
                    InspectorExamPosting.examination_id == examination_id,
                )
            )
        )

    search_pattern = admin_attendance_list_search_pattern(q)
    if search_pattern is not None:
        filters.append(
            or_(
                School.code.ilike(search_pattern),
                School.name.ilike(search_pattern),
                User.full_name.ilike(search_pattern),
            )
        )

    load_opts = [
        contains_eager(InspectorAttendanceSheet.center),
        contains_eager(InspectorAttendanceSheet.inspector_exam_posting),
    ]
    if search_pattern is not None:
        load_opts[1] = contains_eager(InspectorAttendanceSheet.inspector_exam_posting).contains_eager(
            InspectorExamPosting.inspector_user
        )
    else:
        load_opts[1] = contains_eager(InspectorAttendanceSheet.inspector_exam_posting).joinedload(
            InspectorExamPosting.inspector_user
        )

    base = (
        select(InspectorAttendanceSheet)
        .join(InspectorAttendanceSheet.center)
        .join(InspectorAttendanceSheet.inspector_exam_posting)
    )
    if search_pattern is not None:
        base = base.join(InspectorExamPosting.inspector_user)
    stmt = (
        base.where(*filters)
        .options(*load_opts)
        .order_by(
            School.code.asc(),
            InspectorAttendanceSheet.examination_date.desc(),
            InspectorAttendanceSheet.created_at.desc(),
        )
    )
    result = await session.execute(stmt)
    sheets = list(result.scalars().unique().all())
    if not sheets:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No attendance sheets match the filters.",
        )

    center = sheets[0].center
    try:
        payload = build_attendance_sheets_zip_bytes(sheets)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File missing on server",
        ) from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    zip_name = attendance_zip_download_filename(
        str(center.code) if center else "centre",
        str(center.name) if center else "",
        examination_date,
    )
    return Response(
        content=payload,
        media_type="application/zip",
        headers={"Content-Disposition": _content_disposition_attachment(zip_name)},
    )


@admin_router.get("/{sheet_id}/file")
async def download_admin_attendance_sheet(
    examination_id: int,
    sheet_id: UUID,
    session: DBSessionDep,
    _staff: SuperAdminOrFinanceOfficerDep,
) -> StreamingResponse:
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    stmt = select(InspectorAttendanceSheet).where(
        InspectorAttendanceSheet.id == sheet_id,
        InspectorAttendanceSheet.examination_id == examination_id,
    )
    sheet = (await session.execute(stmt)).scalar_one_or_none()
    if sheet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance sheet not found")

    try:
        data = read_attendance_sheet_bytes(sheet.stored_path)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File missing on server",
        ) from None

    return StreamingResponse(
        iter([data]),
        media_type=sheet.content_type or "application/octet-stream",
        headers={"Content-Disposition": _content_disposition_attachment(sheet.original_filename)},
    )
