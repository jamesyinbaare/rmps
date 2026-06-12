"""Admin examiner attendance list and mark."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination
from app.schemas.examiner_attendance import (
    ExaminerAttendanceListResponse,
    ExaminerAttendanceMarkRequest,
    ExaminerAttendanceMarkResponse,
    ExaminerAttendanceRow,
)
from app.services.examiner_attendance import (
    list_examiner_attendances,
    list_examiner_attendances_all,
    mark_examiner_attendance,
    mark_examiner_attendance_scan,
)

router = APIRouter(prefix="/admin/examinations", tags=["admin-examiner-attendance"])
scan_router = APIRouter(prefix="/admin", tags=["admin-examiner-attendance"])


async def _all_examination_ids(session) -> list[int]:
    rows = (await session.execute(select(Examination.id).order_by(Examination.created_at.desc()))).scalars().all()
    return list(rows)


@scan_router.get("/examiner-attendance", response_model=ExaminerAttendanceListResponse)
async def get_admin_examiner_attendance_all(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int | None = Query(None),
    attendance_date: date | None = Query(None),
) -> ExaminerAttendanceListResponse:
    if examination_id is not None:
        items = await list_examiner_attendances(
            session,
            examination_id=examination_id,
            officer_subject_ids=None,
            attendance_date=attendance_date,
        )
    else:
        exam_ids = await _all_examination_ids(session)
        items = await list_examiner_attendances_all(
            session,
            examination_ids=exam_ids,
            officer_subject_ids_by_exam=None,
            attendance_date=attendance_date,
        )
    return ExaminerAttendanceListResponse(
        items=[ExaminerAttendanceRow(**item) for item in items],
        total=len(items),
    )


@scan_router.post("/examiner-attendance/mark-scan", response_model=ExaminerAttendanceMarkResponse)
async def post_admin_examiner_attendance_mark_scan(
    body: ExaminerAttendanceMarkRequest,
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
) -> ExaminerAttendanceMarkResponse:
    exam_ids = await _all_examination_ids(session)
    result = await mark_examiner_attendance_scan(
        session,
        examination_ids=exam_ids,
        officer_subject_ids_by_exam=None,
        reference_code=body.reference_code,
        marked_by_user_id=user.id,
    )
    if result.get("recorded"):
        await session.commit()
    return ExaminerAttendanceMarkResponse(**result)


@router.get("/{exam_id}/examiner-attendance", response_model=ExaminerAttendanceListResponse)
async def get_admin_examiner_attendance(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    attendance_date: date | None = Query(None),
) -> ExaminerAttendanceListResponse:
    items = await list_examiner_attendances(
        session,
        examination_id=exam_id,
        officer_subject_ids=None,
        attendance_date=attendance_date,
    )
    return ExaminerAttendanceListResponse(
        items=[ExaminerAttendanceRow(**item) for item in items],
        total=len(items),
    )


@router.post("/{exam_id}/examiner-attendance/mark", response_model=ExaminerAttendanceMarkResponse)
async def post_admin_examiner_attendance_mark(
    exam_id: int,
    body: ExaminerAttendanceMarkRequest,
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
) -> ExaminerAttendanceMarkResponse:
    result = await mark_examiner_attendance(
        session,
        examination_id=exam_id,
        officer_subject_ids=None,
        reference_code=body.reference_code,
        marked_by_user_id=user.id,
    )
    if result.get("recorded"):
        await session.commit()
    return ExaminerAttendanceMarkResponse(**result)
