"""Subject-officer examiner marking attendance sheet download and signed upload."""

from __future__ import annotations

from datetime import date
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, select

from app.dependencies.auth import SubjectOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import ExaminerMarkingAttendanceSheet, Subject, SubjectMarkingGroup
from app.schemas.examiner_attendance_sheet import (
    ExaminerAttendanceSheetListResponse,
    ExaminerAttendanceSheetResponse,
)
from app.services.exam_documents import ensure_storage_dir
from app.services.examiner_attendance_sheet_files import (
    ExaminerAttendanceSheetUploadError,
    build_examiner_attendance_sheet_filename,
    examiner_attendance_normalized_extension,
    read_examiner_attendance_sheet_bytes,
    remove_examiner_attendance_sheet_file,
    write_examiner_attendance_sheet_file,
)
from app.services.examiner_attendance_sheet_pdf import generate_examiner_attendance_sheet_pdf
from app.services.examiner_invitation import subject_display_code
from app.services.script_control import (
    assert_script_packing_calendar_allowed,
    script_packing_today_in_configured_zone,
)
from app.services.subject_marking_group import load_group
from app.services.subject_officer_scope import assert_subject_officer_access

router = APIRouter(tags=["examiner-attendance-sheets"])


def _content_disposition_attachment(filename: str) -> str:
    ascii_name = filename.encode("ascii", "replace").decode("ascii").replace('"', "'") or "download"
    encoded = quote(filename, safe="")
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'


def _sheet_to_response(row: ExaminerMarkingAttendanceSheet, cohort: SubjectMarkingGroup) -> ExaminerAttendanceSheetResponse:
    return ExaminerAttendanceSheetResponse(
        id=row.id,
        examination_id=row.examination_id,
        subject_id=row.subject_id,
        cohort_id=row.subject_marking_group_id,
        cohort_name=cohort.name,
        attendance_date=row.attendance_date,
        notes=row.notes,
        original_filename=row.original_filename,
        size_bytes=row.size_bytes,
        uploaded_by_id=row.uploaded_by_id,
        created_at=row.created_at,
    )


async def _load_cohort_or_404(
    session: DBSessionDep,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID,
) -> SubjectMarkingGroup:
    group = await load_group(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cohort not found")
    return group


async def _collision_index(
    session: DBSessionDep,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID,
    attendance_date: date,
) -> int:
    stmt = select(func.count()).where(
        ExaminerMarkingAttendanceSheet.examination_id == examination_id,
        ExaminerMarkingAttendanceSheet.subject_id == subject_id,
        ExaminerMarkingAttendanceSheet.subject_marking_group_id == group_id,
        ExaminerMarkingAttendanceSheet.attendance_date == attendance_date,
    )
    count = int((await session.execute(stmt)).scalar_one())
    return count + 1


@router.get(
    "/examinations/{examination_id}/subject-officer/examiner-attendance-sheets/blank.pdf",
)
async def download_blank_examiner_attendance_sheet(
    examination_id: int,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
    group_id: UUID = Query(...),
    attendance_date: date = Query(...),
) -> Response:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    await _load_cohort_or_404(session, examination_id=examination_id, subject_id=subject_id, group_id=group_id)

    pdf_bytes, filename = await generate_examiner_attendance_sheet_pdf(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
        attendance_date=attendance_date,
    )
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition_attachment(filename)},
    )


@router.get(
    "/examinations/{examination_id}/subject-officer/examiner-attendance-sheets",
    response_model=ExaminerAttendanceSheetListResponse,
)
async def list_examiner_attendance_sheets(
    examination_id: int,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
    attendance_date: date | None = Query(None),
    group_id: UUID | None = Query(None),
) -> ExaminerAttendanceSheetListResponse:
    await assert_subject_officer_access(session, user, examination_id, subject_id)

    stmt = (
        select(ExaminerMarkingAttendanceSheet, SubjectMarkingGroup)
        .join(
            SubjectMarkingGroup,
            ExaminerMarkingAttendanceSheet.subject_marking_group_id == SubjectMarkingGroup.id,
        )
        .where(
            ExaminerMarkingAttendanceSheet.examination_id == examination_id,
            ExaminerMarkingAttendanceSheet.subject_id == subject_id,
        )
        .order_by(
            ExaminerMarkingAttendanceSheet.attendance_date.desc(),
            SubjectMarkingGroup.name,
            ExaminerMarkingAttendanceSheet.created_at.desc(),
        )
    )
    if attendance_date is not None:
        stmt = stmt.where(ExaminerMarkingAttendanceSheet.attendance_date == attendance_date)
    if group_id is not None:
        stmt = stmt.where(ExaminerMarkingAttendanceSheet.subject_marking_group_id == group_id)

    rows = (await session.execute(stmt)).all()
    items = [_sheet_to_response(sheet, cohort) for sheet, cohort in rows]
    return ExaminerAttendanceSheetListResponse(items=items, total=len(items))


@router.post(
    "/examinations/{examination_id}/subject-officer/examiner-attendance-sheets",
    response_model=ExaminerAttendanceSheetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_examiner_attendance_sheet(
    examination_id: int,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Form(...),
    group_id: UUID = Form(...),
    attendance_date: date = Form(...),
    notes: str | None = Form(None),
    file: UploadFile = File(...),
) -> ExaminerAttendanceSheetResponse:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    cohort = await _load_cohort_or_404(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )

    try:
        assert_script_packing_calendar_allowed(
            attendance_date,
            script_packing_today_in_configured_zone(),
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    subject = await session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    raw = await file.read()
    try:
        ext = examiner_attendance_normalized_extension(file.filename or "")
    except ExaminerAttendanceSheetUploadError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    ensure_storage_dir()
    collision = await _collision_index(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
        attendance_date=attendance_date,
    )
    display_name = build_examiner_attendance_sheet_filename(
        cohort.name,
        subject_display_code(subject),
        attendance_date,
        ext,
        collision_index=collision,
    )

    try:
        stored_name = write_examiner_attendance_sheet_file(raw, examination_id, display_name)
    except ExaminerAttendanceSheetUploadError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    notes_clean = notes.strip() if notes else None
    if notes_clean == "":
        notes_clean = None

    row = ExaminerMarkingAttendanceSheet(
        examination_id=examination_id,
        subject_id=subject_id,
        subject_marking_group_id=group_id,
        attendance_date=attendance_date,
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
            remove_examiner_attendance_sheet_file(stored_name)
        except ExaminerAttendanceSheetUploadError:
            pass
        raise

    return _sheet_to_response(row, cohort)


async def _load_sheet_for_officer(
    session: DBSessionDep,
    *,
    examination_id: int,
    subject_id: int,
    sheet_id: UUID,
    user: SubjectOfficerDep,
) -> tuple[ExaminerMarkingAttendanceSheet, SubjectMarkingGroup]:
    await assert_subject_officer_access(session, user, examination_id, subject_id)

    stmt = (
        select(ExaminerMarkingAttendanceSheet, SubjectMarkingGroup)
        .join(
            SubjectMarkingGroup,
            ExaminerMarkingAttendanceSheet.subject_marking_group_id == SubjectMarkingGroup.id,
        )
        .where(
            ExaminerMarkingAttendanceSheet.id == sheet_id,
            ExaminerMarkingAttendanceSheet.examination_id == examination_id,
            ExaminerMarkingAttendanceSheet.subject_id == subject_id,
        )
    )
    row = (await session.execute(stmt)).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance sheet not found")
    return row


@router.get(
    "/examinations/{examination_id}/subject-officer/examiner-attendance-sheets/{sheet_id}/file",
)
async def download_examiner_attendance_sheet(
    examination_id: int,
    sheet_id: UUID,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
) -> StreamingResponse:
    sheet, _cohort = await _load_sheet_for_officer(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        sheet_id=sheet_id,
        user=user,
    )
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


@router.delete(
    "/examinations/{examination_id}/subject-officer/examiner-attendance-sheets/{sheet_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_examiner_attendance_sheet(
    examination_id: int,
    sheet_id: UUID,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
) -> None:
    sheet, _cohort = await _load_sheet_for_officer(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        sheet_id=sheet_id,
        user=user,
    )
    stored_path = sheet.stored_path
    await session.delete(sheet)
    await session.commit()
    try:
        remove_examiner_attendance_sheet_file(stored_path)
    except ExaminerAttendanceSheetUploadError:
        pass
