"""Question paper stock: centre-wide subject/paper grid from candidates + timetable."""
from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExaminationSchedule, Subject
from app.services.exam_timetable_pdf import load_examination_or_raise, load_schedules_for_exam
from app.services.script_control import (
    _paper_examination_dates_from_schedule,
    _paper_numbers_from_schedule,
    _subject_by_schedule_codes,
    subject_series_count_map,
)
from app.services.timetable_service import get_candidate_schedule_codes_for_exam


async def load_subject_paper_rows_for_exam_and_center(
    session: AsyncSession,
    exam_id: int,
    scope_school_ids: set[UUID],
) -> list[tuple[Subject, dict[int, date | None]]]:
    """
    Union of subject codes from registered candidates at any school in the centre scope,
    intersected with the examination timetable (paper numbers and optional dates).
    """
    await load_examination_or_raise(session, exam_id)
    allowed_codes = await get_candidate_schedule_codes_for_exam(
        session,
        exam_id,
        scope_school_ids,
    )
    schedules = await load_schedules_for_exam(session, exam_id)
    code_to_papers: dict[str, set[int]] = {}
    code_to_schedule: dict[str, ExaminationSchedule] = {}
    for sch in schedules:
        if sch.subject_code not in allowed_codes:
            continue
        if sch.subject_code not in code_to_papers:
            code_to_papers[sch.subject_code] = set()
        code_to_papers[sch.subject_code].update(_paper_numbers_from_schedule(sch))
        code_to_schedule[sch.subject_code] = sch

    if not code_to_papers:
        return []

    codes = list(code_to_papers.keys())
    sub_stmt = select(Subject).where(or_(Subject.code.in_(codes), Subject.original_code.in_(codes)))
    sub_result = await session.execute(sub_stmt)
    subjects = list(sub_result.scalars().all())
    by_code = _subject_by_schedule_codes(subjects)

    rows: list[tuple[Subject, dict[int, date | None]]] = []
    for code in sorted(code_to_papers.keys()):
        sub = by_code.get(code)
        if sub is None:
            continue
        sch = code_to_schedule.get(code)
        date_map = _paper_examination_dates_from_schedule(sch) if sch else {}
        paper_nums = sorted(code_to_papers[code])
        paper_dates = {pn: date_map.get(pn) for pn in paper_nums}
        if paper_dates:
            rows.append((sub, paper_dates))
    return rows


async def valid_question_paper_triples(
    session: AsyncSession,
    exam_id: int,
    scope_school_ids: set[UUID],
) -> set[tuple[int, int, int]]:
    """Set of (subject_id, paper_number, series_number) allowed for question paper control."""
    rows = await load_subject_paper_rows_for_exam_and_center(session, exam_id, scope_school_ids)
    counts = await subject_series_count_map(session, exam_id)
    out: set[tuple[int, int, int]] = set()
    for sub, paper_dates in rows:
        n = counts.get(sub.id, 1)
        for pn in paper_dates:
            for sn in range(1, n + 1):
                out.add((sub.id, pn, sn))
    return out
