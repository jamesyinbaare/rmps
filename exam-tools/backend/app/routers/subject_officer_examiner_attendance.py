"""Subject officer examiner attendance (QR scan)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies.auth import SubjectOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import UserRole
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
from app.services.subject_officer_scope import (
    assert_subject_officer_examination_access,
    load_subject_officer_multi_exam_scope,
)

router = APIRouter(tags=["examiner-attendance"])


async def _subject_officer_scan_scope(session, user) -> tuple[list[int], dict[int, set[int]]]:
    if user.role != UserRole.SUBJECT_OFFICER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    examination_ids, by_exam = await load_subject_officer_multi_exam_scope(session, user_id=user.id)
    if not examination_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No subject assignment for any examination",
        )
    return examination_ids, by_exam


@router.get(
    "/subject-officer/examiner-attendance",
    response_model=ExaminerAttendanceListResponse,
)
async def get_examiner_attendance_all(
    session: DBSessionDep,
    user: SubjectOfficerDep,
    attendance_date: date | None = Query(None),
) -> ExaminerAttendanceListResponse:
    examination_ids, by_exam = await _subject_officer_scan_scope(session, user)
    items = await list_examiner_attendances_all(
        session,
        examination_ids=examination_ids,
        officer_subject_ids_by_exam=by_exam,
        attendance_date=attendance_date,
    )
    return ExaminerAttendanceListResponse(
        items=[ExaminerAttendanceRow(**item) for item in items],
        total=len(items),
    )


@router.post(
    "/subject-officer/examiner-attendance/mark-scan",
    response_model=ExaminerAttendanceMarkResponse,
)
async def post_examiner_attendance_mark_scan(
    body: ExaminerAttendanceMarkRequest,
    session: DBSessionDep,
    user: SubjectOfficerDep,
) -> ExaminerAttendanceMarkResponse:
    examination_ids, by_exam = await _subject_officer_scan_scope(session, user)
    result = await mark_examiner_attendance_scan(
        session,
        examination_ids=examination_ids,
        officer_subject_ids_by_exam=by_exam,
        reference_code=body.reference_code,
        marked_by_user_id=user.id,
    )
    if result.get("recorded"):
        await session.commit()
    return ExaminerAttendanceMarkResponse(**result)


@router.get(
    "/examinations/{examination_id}/subject-officer/examiner-attendance",
    response_model=ExaminerAttendanceListResponse,
)
async def get_examiner_attendance(
    examination_id: int,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    attendance_date: date | None = Query(None),
) -> ExaminerAttendanceListResponse:
    officer_subject_ids = await assert_subject_officer_examination_access(session, user, examination_id)
    items = await list_examiner_attendances(
        session,
        examination_id=examination_id,
        officer_subject_ids=officer_subject_ids,
        attendance_date=attendance_date,
    )
    return ExaminerAttendanceListResponse(
        items=[ExaminerAttendanceRow(**item) for item in items],
        total=len(items),
    )


@router.post(
    "/examinations/{examination_id}/subject-officer/examiner-attendance/mark",
    response_model=ExaminerAttendanceMarkResponse,
)
async def post_examiner_attendance_mark(
    examination_id: int,
    body: ExaminerAttendanceMarkRequest,
    session: DBSessionDep,
    user: SubjectOfficerDep,
) -> ExaminerAttendanceMarkResponse:
    officer_subject_ids = await assert_subject_officer_examination_access(session, user, examination_id)
    result = await mark_examiner_attendance(
        session,
        examination_id=examination_id,
        officer_subject_ids=officer_subject_ids,
        reference_code=body.reference_code,
        marked_by_user_id=user.id,
    )
    if result.get("recorded"):
        await session.commit()
    return ExaminerAttendanceMarkResponse(**result)
