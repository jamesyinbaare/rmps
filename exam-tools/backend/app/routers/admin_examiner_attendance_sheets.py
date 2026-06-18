"""Admin/finance review of subject-officer examiner marking attendance sheet uploads."""

from __future__ import annotations

from datetime import date
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import joinedload

from app.dependencies.auth import SuperAdminOrFinanceOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import ExaminerMarkingAttendanceSheet, Subject, SubjectMarkingGroup, User
from app.schemas.examiner_attendance_sheet import (
    ExaminerAttendanceSheetAdminListResponse,
    ExaminerAttendanceSheetAdminResponse,
    ExaminerAttendanceSheetAdminSummaryResponse,
)
from app.services.admin_examiner_attendance_zip import (
    build_examiner_attendance_sheets_zip_bytes,
    examiner_attendance_zip_download_filename,
)
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.examiner_attendance_sheet_files import read_examiner_attendance_sheet_bytes
from app.services.examiner_invitation import subject_display_code

router = APIRouter(prefix="/admin/examinations/{examination_id}/examiner-attendance-sheets", tags=["examiner-attendance-sheets"])


def _content_disposition_attachment(filename: str) -> str:
    ascii_name = filename.encode("ascii", "replace").decode("ascii").replace('"', "'") or "download"
    encoded = quote(filename, safe="")
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'


def admin_list_search_pattern(q: str | None) -> str | None:
    if not q or not q.strip():
        return None
    return f"%{q.strip()}%"


def _sheet_to_admin_response(
    sheet: ExaminerMarkingAttendanceSheet,
    cohort: SubjectMarkingGroup,
    subject: Subject,
    uploader: User | None,
) -> ExaminerAttendanceSheetAdminResponse:
    return ExaminerAttendanceSheetAdminResponse(
        id=sheet.id,
        examination_id=sheet.examination_id,
        subject_id=sheet.subject_id,
        cohort_id=sheet.subject_marking_group_id,
        cohort_name=cohort.name,
        attendance_date=sheet.attendance_date,
        notes=sheet.notes,
        original_filename=sheet.original_filename,
        size_bytes=sheet.size_bytes,
        uploaded_by_id=sheet.uploaded_by_id,
        created_at=sheet.created_at,
        subject_code=subject_display_code(subject),
        subject_name=(subject.name or "").strip(),
        uploader_full_name=(uploader.full_name if uploader else None),
    )


@router.get("/summary", response_model=ExaminerAttendanceSheetAdminSummaryResponse)
async def get_examiner_attendance_sheet_summary(
    examination_id: int,
    session: DBSessionDep,
    _user: SuperAdminOrFinanceOfficerDep,
    subject_id: int | None = Query(None),
    attendance_date: date | None = Query(None),
) -> ExaminerAttendanceSheetAdminSummaryResponse:
    await load_examination_or_raise(session, examination_id)

    upload_stmt = select(func.count()).select_from(ExaminerMarkingAttendanceSheet).where(
        ExaminerMarkingAttendanceSheet.examination_id == examination_id,
    )
    cohort_stmt = select(func.count()).select_from(SubjectMarkingGroup).where(
        SubjectMarkingGroup.examination_id == examination_id,
    )
    cohorts_with_uploads_stmt = (
        select(func.count(func.distinct(ExaminerMarkingAttendanceSheet.subject_marking_group_id)))
        .select_from(ExaminerMarkingAttendanceSheet)
        .where(ExaminerMarkingAttendanceSheet.examination_id == examination_id)
    )

    if subject_id is not None:
        upload_stmt = upload_stmt.where(ExaminerMarkingAttendanceSheet.subject_id == subject_id)
        cohort_stmt = cohort_stmt.where(SubjectMarkingGroup.subject_id == subject_id)
        cohorts_with_uploads_stmt = cohorts_with_uploads_stmt.where(
            ExaminerMarkingAttendanceSheet.subject_id == subject_id,
        )

    if attendance_date is not None:
        upload_stmt = upload_stmt.where(ExaminerMarkingAttendanceSheet.attendance_date == attendance_date)
        cohorts_with_uploads_stmt = cohorts_with_uploads_stmt.where(
            ExaminerMarkingAttendanceSheet.attendance_date == attendance_date,
        )

    total_uploads = int((await session.execute(upload_stmt)).scalar_one())
    cohorts_expected = int((await session.execute(cohort_stmt)).scalar_one())
    cohorts_with_uploads = int((await session.execute(cohorts_with_uploads_stmt)).scalar_one())
    cohorts_missing = max(0, cohorts_expected - cohorts_with_uploads) if cohorts_expected else None

    return ExaminerAttendanceSheetAdminSummaryResponse(
        total_uploads=total_uploads,
        cohorts_with_uploads=cohorts_with_uploads,
        cohorts_expected=cohorts_expected or None,
        cohorts_missing=cohorts_missing,
    )


@router.get("", response_model=ExaminerAttendanceSheetAdminListResponse)
async def list_admin_examiner_attendance_sheets(
    examination_id: int,
    session: DBSessionDep,
    _user: SuperAdminOrFinanceOfficerDep,
    subject_id: int | None = Query(None),
    group_id: UUID | None = Query(None),
    attendance_date: date | None = Query(None),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> ExaminerAttendanceSheetAdminListResponse:
    await load_examination_or_raise(session, examination_id)

    pattern = admin_list_search_pattern(q)
    base = (
        select(ExaminerMarkingAttendanceSheet, SubjectMarkingGroup, Subject, User)
        .join(
            SubjectMarkingGroup,
            ExaminerMarkingAttendanceSheet.subject_marking_group_id == SubjectMarkingGroup.id,
        )
        .join(Subject, ExaminerMarkingAttendanceSheet.subject_id == Subject.id)
        .outerjoin(User, ExaminerMarkingAttendanceSheet.uploaded_by_id == User.id)
        .where(ExaminerMarkingAttendanceSheet.examination_id == examination_id)
    )

    if subject_id is not None:
        base = base.where(ExaminerMarkingAttendanceSheet.subject_id == subject_id)
    if group_id is not None:
        base = base.where(ExaminerMarkingAttendanceSheet.subject_marking_group_id == group_id)
    if attendance_date is not None:
        base = base.where(ExaminerMarkingAttendanceSheet.attendance_date == attendance_date)
    if pattern:
        base = base.where(
            or_(
                SubjectMarkingGroup.name.ilike(pattern),
                Subject.name.ilike(pattern),
                Subject.code.ilike(pattern),
                Subject.original_code.ilike(pattern),
                ExaminerMarkingAttendanceSheet.original_filename.ilike(pattern),
                User.full_name.ilike(pattern),
            )
        )

    count_stmt = select(func.count()).select_from(base.subquery())
    total = int((await session.execute(count_stmt)).scalar_one())

    stmt = (
        base.order_by(
            ExaminerMarkingAttendanceSheet.attendance_date.desc(),
            SubjectMarkingGroup.name,
            ExaminerMarkingAttendanceSheet.created_at.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(stmt)).all()
    items = [_sheet_to_admin_response(sheet, cohort, subject, uploader) for sheet, cohort, subject, uploader in rows]

    return ExaminerAttendanceSheetAdminListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


async def _load_admin_sheet(
    session: DBSessionDep,
    examination_id: int,
    sheet_id: UUID,
) -> ExaminerMarkingAttendanceSheet:
    stmt = (
        select(ExaminerMarkingAttendanceSheet)
        .options(
            joinedload(ExaminerMarkingAttendanceSheet.subject_marking_group),
            joinedload(ExaminerMarkingAttendanceSheet.subject),
        )
        .where(
            ExaminerMarkingAttendanceSheet.id == sheet_id,
            ExaminerMarkingAttendanceSheet.examination_id == examination_id,
        )
    )
    sheet = (await session.execute(stmt)).scalar_one_or_none()
    if sheet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance sheet not found")
    return sheet


@router.get("/{sheet_id}/file")
async def download_admin_examiner_attendance_sheet(
    examination_id: int,
    sheet_id: UUID,
    session: DBSessionDep,
    _user: SuperAdminOrFinanceOfficerDep,
) -> StreamingResponse:
    sheet = await _load_admin_sheet(session, examination_id, sheet_id)
    try:
        data = read_examiner_attendance_sheet_bytes(sheet.stored_path)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found") from None

    media_type = sheet.content_type or "application/octet-stream"
    return StreamingResponse(
        iter([data]),
        media_type=media_type,
        headers={"Content-Disposition": _content_disposition_attachment(sheet.original_filename)},
    )


@router.get("/download-zip")
async def download_admin_examiner_attendance_sheets_zip(
    examination_id: int,
    session: DBSessionDep,
    _user: SuperAdminOrFinanceOfficerDep,
    subject_id: int = Query(...),
    group_id: UUID | None = Query(None),
    attendance_date: date | None = Query(None),
) -> StreamingResponse:
    await load_examination_or_raise(session, examination_id)

    stmt = select(ExaminerMarkingAttendanceSheet).where(
        ExaminerMarkingAttendanceSheet.examination_id == examination_id,
        ExaminerMarkingAttendanceSheet.subject_id == subject_id,
    )
    if group_id is not None:
        stmt = stmt.where(ExaminerMarkingAttendanceSheet.subject_marking_group_id == group_id)
    if attendance_date is not None:
        stmt = stmt.where(ExaminerMarkingAttendanceSheet.attendance_date == attendance_date)

    sheets = list((await session.execute(stmt)).scalars().all())
    if not sheets:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No sheets match filters")

    try:
        zip_bytes = build_examiner_attendance_sheets_zip_bytes(sheets)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    subject = await session.get(Subject, subject_id)
    subject_code = subject_display_code(subject) if subject else str(subject_id)

    cohort_name = "all-cohorts"
    if group_id is not None:
        group = await session.get(SubjectMarkingGroup, group_id)
        if group is not None:
            cohort_name = group.name

    filename = examiner_attendance_zip_download_filename(subject_code, cohort_name, attendance_date)
    return StreamingResponse(
        iter([zip_bytes]),
        media_type="application/zip",
        headers={"Content-Disposition": _content_disposition_attachment(filename)},
    )
