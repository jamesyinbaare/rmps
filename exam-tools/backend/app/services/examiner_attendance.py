"""Examiner attendance marking by reference code (QR scan)."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from collections.abc import Sequence

from app.models import Examiner, ExaminerAttendance, ExaminerSubject, Examination, User
from app.services.exam_official_export import examination_label
from app.services.examiner_invitation import _examiner_type_label
from app.services.examiner_qr_payload import parse_examiner_qr_scan
from app.services.lunch_coupon_verify import (
    _load_examiner_for_code,
    _subject_codes_for_overlap,
    resolve_examiner_for_scan_payload,
)


async def _load_existing_attendance(
    session: AsyncSession,
    *,
    examination_id: int,
    examiner_id: UUID,
    attendance_date: date,
) -> ExaminerAttendance | None:
    stmt = select(ExaminerAttendance).where(
        ExaminerAttendance.examination_id == examination_id,
        ExaminerAttendance.examiner_id == examiner_id,
        ExaminerAttendance.attendance_date == attendance_date,
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def _examiner_payload(
    examiner: Examiner,
    overlap: set[int],
    *,
    examination_id: int | None = None,
    examination_name: str | None = None,
) -> dict:
    payload = {
        "valid": True,
        "reference_code": examiner.reference_code,
        "name": examiner.name,
        "examiner_type": examiner.examiner_type.value,
        "examiner_type_label": _examiner_type_label(examiner.examiner_type),
        "region": examiner.region.value,
        "subject_codes": _subject_codes_for_overlap(examiner, overlap),
        "examiner_id": examiner.id,
    }
    if examination_id is not None:
        payload["examination_id"] = examination_id
    if examination_name is not None:
        payload["examination_name"] = examination_name
    return payload


async def verify_examiner_for_attendance(
    session: AsyncSession,
    *,
    examination_id: int,
    officer_subject_ids: set[int] | None,
    reference_code: str,
) -> dict:
    examiner = await _load_examiner_for_code(
        session,
        examination_id=examination_id,
        reference_code=reference_code,
    )
    if examiner is None:
        return {
            "valid": False,
            "message": "No examiner with this code on this examination.",
        }

    examiner_subject_ids = {int(es.subject_id) for es in examiner.subjects}
    if officer_subject_ids is not None:
        overlap = examiner_subject_ids & officer_subject_ids
        if not overlap:
            return {"valid": False, "message": "Examiner is not on your subject roster."}
    else:
        overlap = examiner_subject_ids

    exam = await session.get(Examination, examination_id)
    exam_name = examination_label(exam) if exam is not None else None
    return _examiner_payload(
        examiner,
        overlap,
        examination_id=examination_id,
        examination_name=exam_name,
    )


async def mark_examiner_attendance_scan(
    session: AsyncSession,
    *,
    examination_ids: Sequence[int],
    officer_subject_ids_by_exam: dict[int, set[int]] | None,
    reference_code: str,
    marked_by_user_id: UUID,
) -> dict:
    _, parsed_code = parse_examiner_qr_scan(reference_code)
    if not parsed_code:
        return {"valid": False, "message": "Reference code is required.", "recorded": False, "already_marked": False}

    resolved = await resolve_examiner_for_scan_payload(
        session,
        reference_code,
        examination_ids=examination_ids,
        officer_subject_ids_by_exam=officer_subject_ids_by_exam,
    )
    if resolved is None:
        return {
            "valid": False,
            "message": "No examiner with this code on your roster.",
            "recorded": False,
            "already_marked": False,
        }

    examiner, examination_id, subject_id = resolved
    officer_subject_ids = (
        officer_subject_ids_by_exam.get(examination_id, set())
        if officer_subject_ids_by_exam is not None
        else {subject_id}
    )
    return await mark_examiner_attendance(
        session,
        examination_id=examination_id,
        officer_subject_ids=officer_subject_ids,
        reference_code=parsed_code,
        marked_by_user_id=marked_by_user_id,
    )


async def mark_examiner_attendance(
    session: AsyncSession,
    *,
    examination_id: int,
    officer_subject_ids: set[int] | None,
    reference_code: str,
    marked_by_user_id: UUID,
) -> dict:
    mark_date = date.today()
    result = await verify_examiner_for_attendance(
        session,
        examination_id=examination_id,
        officer_subject_ids=officer_subject_ids,
        reference_code=reference_code,
    )
    if not result.get("valid"):
        return {**result, "recorded": False, "already_marked": False}

    examiner_id = result["examiner_id"]
    existing = await _load_existing_attendance(
        session,
        examination_id=examination_id,
        examiner_id=examiner_id,
        attendance_date=mark_date,
    )
    if existing is not None:
        return {
            **result,
            "valid": True,
            "recorded": False,
            "already_marked": True,
            "attendance_date": mark_date,
            "message": "Already present today.",
        }

    now = datetime.utcnow()
    session.add(
        ExaminerAttendance(
            examination_id=examination_id,
            examiner_id=examiner_id,
            attendance_date=mark_date,
            reference_code=result["reference_code"],
            marked_by_user_id=marked_by_user_id,
        )
    )
    await session.flush()

    return {
        **result,
        "recorded": True,
        "already_marked": False,
        "attendance_date": mark_date,
        "message": "Present.",
    }


async def list_examiner_attendances(
    session: AsyncSession,
    *,
    examination_id: int,
    officer_subject_ids: set[int] | None = None,
    attendance_date: date | None = None,
    all_dates: bool = False,
) -> list[dict]:
    stmt = (
        select(ExaminerAttendance)
        .join(Examiner, ExaminerAttendance.examiner_id == Examiner.id)
        .where(ExaminerAttendance.examination_id == examination_id)
        .options(
            selectinload(ExaminerAttendance.examiner).selectinload(Examiner.subjects).selectinload(
                ExaminerSubject.subject
            ),
            selectinload(ExaminerAttendance.marked_by),
        )
        .order_by(ExaminerAttendance.marked_at.desc())
    )
    if all_dates:
        if attendance_date is not None:
            stmt = stmt.where(ExaminerAttendance.attendance_date == attendance_date)
    else:
        list_date = attendance_date if attendance_date is not None else date.today()
        stmt = stmt.where(ExaminerAttendance.attendance_date == list_date)
    if officer_subject_ids is not None:
        stmt = stmt.join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id).where(
            ExaminerSubject.subject_id.in_(officer_subject_ids)
        )

    rows = (await session.execute(stmt)).unique().scalars().all()
    items: list[dict] = []
    seen: set[UUID] = set()
    for row in rows:
        if row.id in seen:
            continue
        seen.add(row.id)
        examiner = row.examiner
        if examiner is None:
            continue
        subject_ids = {int(es.subject_id) for es in examiner.subjects}
        if officer_subject_ids is not None:
            overlap = subject_ids & officer_subject_ids
            if not overlap:
                continue
        else:
            overlap = subject_ids
        marked_by: User | None = row.marked_by
        items.append(
            {
                "id": row.id,
                "examination_id": row.examination_id,
                "examiner_id": examiner.id,
                "reference_code": row.reference_code,
                "attendance_date": row.attendance_date,
                "examiner_name": examiner.name,
                "examiner_type": examiner.examiner_type.value,
                "examiner_type_label": _examiner_type_label(examiner.examiner_type),
                "region": examiner.region.value,
                "subject_codes": _subject_codes_for_overlap(examiner, overlap),
                "marked_at": row.marked_at,
                "marked_by_name": marked_by.full_name if marked_by else None,
            }
        )
    return items


async def list_examiner_attendances_all(
    session: AsyncSession,
    *,
    examination_ids: Sequence[int],
    officer_subject_ids_by_exam: dict[int, set[int]] | None = None,
    attendance_date: date | None = None,
    all_dates: bool = False,
) -> list[dict]:
    items: list[dict] = []
    for examination_id in examination_ids:
        officer_subject_ids = (
            officer_subject_ids_by_exam.get(int(examination_id), set())
            if officer_subject_ids_by_exam is not None
            else None
        )
        if officer_subject_ids_by_exam is not None and not officer_subject_ids:
            continue
        exam = await session.get(Examination, examination_id)
        exam_name = examination_label(exam) if exam is not None else f"Examination {examination_id}"
        rows = await list_examiner_attendances(
            session,
            examination_id=int(examination_id),
            officer_subject_ids=officer_subject_ids,
            attendance_date=attendance_date,
            all_dates=all_dates,
        )
        for row in rows:
            items.append({**row, "examination_name": exam_name})
    items.sort(key=lambda row: row["marked_at"], reverse=True)
    return items
