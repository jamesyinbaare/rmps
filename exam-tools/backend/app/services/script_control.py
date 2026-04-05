"""Helpers for script packing: school resolution and valid subject/paper pairs from schedules."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExaminationSchedule, School, Subject, User, UserRole
from app.services.exam_timetable_pdf import load_examination_or_raise, load_schedules_for_exam
from app.services.timetable_service import get_school_subject_schedule_codes


async def school_from_inspector_user(session: AsyncSession, user: User) -> School:
    if user.role != UserRole.INSPECTOR:
        raise PermissionError("Inspector access only")
    if not user.school_code or not user.school_code.strip():
        raise ValueError("School code not linked")
    code = user.school_code.strip()
    stmt = select(School).where(School.code == code)
    result = await session.execute(stmt)
    school = result.scalar_one_or_none()
    if school is None:
        raise ValueError("School not found for account")
    return school


def _paper_numbers_from_schedule(schedule: ExaminationSchedule) -> set[int]:
    out: set[int] = set()
    for p in schedule.papers or []:
        if not isinstance(p, dict):
            continue
        try:
            out.add(int(p.get("paper", 1)))
        except (TypeError, ValueError):
            continue
    return out


async def load_subject_paper_rows_for_school_exam(
    session: AsyncSession,
    exam_id: int,
    school_id: UUID,
) -> list[tuple[Subject, list[int]]]:
    """Subjects offered by the school that appear on this exam, with paper numbers from schedules."""
    await load_examination_or_raise(session, exam_id)
    allowed_codes = await get_school_subject_schedule_codes(session, school_id)
    schedules = await load_schedules_for_exam(session, exam_id)
    code_to_papers: dict[str, set[int]] = {}
    for sch in schedules:
        if sch.subject_code not in allowed_codes:
            continue
        if sch.subject_code not in code_to_papers:
            code_to_papers[sch.subject_code] = set()
        code_to_papers[sch.subject_code].update(_paper_numbers_from_schedule(sch))

    if not code_to_papers:
        return []

    codes = list(code_to_papers.keys())
    sub_stmt = select(Subject).where(Subject.code.in_(codes))
    sub_result = await session.execute(sub_stmt)
    subjects = list(sub_result.scalars().all())
    by_code = {s.code: s for s in subjects}

    rows: list[tuple[Subject, list[int]]] = []
    for code in sorted(code_to_papers.keys()):
        sub = by_code.get(code)
        if sub is None:
            continue
        papers = sorted(code_to_papers[code])
        if papers:
            rows.append((sub, papers))
    return rows


async def valid_subject_paper_set(
    session: AsyncSession,
    exam_id: int,
    school_id: UUID,
) -> set[tuple[int, int]]:
    """Set of (subject_id, paper_number) allowed for packing for this school and exam."""
    rows = await load_subject_paper_rows_for_school_exam(session, exam_id, school_id)
    return {(sub.id, pn) for sub, papers in rows for pn in papers}
