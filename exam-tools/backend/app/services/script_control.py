"""Helpers for script packing: inspector centre scope, candidate-linked subjects, schedule papers."""
from __future__ import annotations

from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import ExaminationSchedule, ExaminationSubjectScriptSeries, School, Subject, User, UserRole
from app.services.exam_timetable_pdf import load_examination_or_raise, load_schedules_for_exam
from app.services.timetable_service import (
    center_scope_school_ids,
    get_candidate_schedule_codes_for_exam,
    get_school_subject_schedule_codes,
    parse_schedule_date,
    resolve_center_host_school,
)


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


async def inspector_center_scope_school_ids(session: AsyncSession, user: User) -> set[UUID]:
    """Centre host plus every school that writes there; for inspector script-control scope."""
    user_school = await school_from_inspector_user(session, user)
    center_host = await resolve_center_host_school(session, user_school)
    return await center_scope_school_ids(session, center_host)


def assert_packing_school_in_scope(packing_school_id: UUID, scope_ids: set[UUID]) -> None:
    if packing_school_id not in scope_ids:
        raise ValueError("School is not in your examination centre scope")


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


def _paper_examination_dates_from_schedule(schedule: ExaminationSchedule) -> dict[int, date | None]:
    """Paper number -> timetable calendar date; None if missing or unparseable."""
    out: dict[int, date | None] = {}
    for p in schedule.papers or []:
        if not isinstance(p, dict):
            continue
        try:
            pn = int(p.get("paper", 1))
        except (TypeError, ValueError):
            continue
        raw = p.get("date")
        if raw is None or raw == "":
            out[pn] = None
            continue
        try:
            out[pn] = parse_schedule_date(raw)
        except (TypeError, ValueError):
            out[pn] = None
    return out


def script_packing_today_in_configured_zone() -> date:
    tz = ZoneInfo(settings.script_packing_timezone)
    return datetime.now(tz).date()


def assert_script_packing_calendar_allowed(examination_date: date | None, today_local: date) -> None:
    if examination_date is None:
        return
    if today_local < examination_date:
        raise ValueError(
            "Packing for this paper is only allowed on or after the scheduled examination date."
        )


async def paper_examination_date_for_triple(
    session: AsyncSession,
    exam_id: int,
    subject_id: int,
    paper_number: int,
) -> date | None:
    sub = await session.get(Subject, subject_id)
    if sub is None:
        return None
    codes = {sub.code}
    if sub.original_code:
        codes.add(sub.original_code)
    schedules = await load_schedules_for_exam(session, exam_id)
    for sch in schedules:
        if sch.subject_code not in codes:
            continue
        dmap = _paper_examination_dates_from_schedule(sch)
        if paper_number in dmap:
            return dmap[paper_number]
    return None


def _subject_by_schedule_codes(subjects: list[Subject]) -> dict[str, Subject]:
    by: dict[str, Subject] = {}
    for s in subjects:
        by[s.code] = s
        if s.original_code:
            by[s.original_code] = s
    return by


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
    sub_stmt = select(Subject).where(or_(Subject.code.in_(codes), Subject.original_code.in_(codes)))
    sub_result = await session.execute(sub_stmt)
    subjects = list(sub_result.scalars().all())
    by_code = _subject_by_schedule_codes(subjects)

    rows: list[tuple[Subject, list[int]]] = []
    for code in sorted(code_to_papers.keys()):
        sub = by_code.get(code)
        if sub is None:
            continue
        papers = sorted(code_to_papers[code])
        if papers:
            rows.append((sub, papers))
    return rows


async def load_subject_paper_rows_for_exam_and_school(
    session: AsyncSession,
    exam_id: int,
    scope_school_ids: set[UUID],
    packing_school_id: UUID,
) -> list[tuple[Subject, dict[int, date | None]]]:
    """
    Subjects that registered candidates at ``packing_school_id`` entered for this exam,
    intersected with the examination timetable (paper numbers and optional dates from schedules).
    ``packing_school_id`` must be in ``scope_school_ids``.
    Returns per subject a map paper_number -> examination_date (None if unknown).
    """
    assert_packing_school_in_scope(packing_school_id, scope_school_ids)
    await load_examination_or_raise(session, exam_id)
    allowed_codes = await get_candidate_schedule_codes_for_exam(
        session,
        exam_id,
        scope_school_ids,
        filter_school_id=packing_school_id,
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


async def subject_series_count_map(session: AsyncSession, exam_id: int) -> dict[int, int]:
    """subject_id -> configured series count; subjects with no row default to 1."""
    stmt = select(ExaminationSubjectScriptSeries).where(
        ExaminationSubjectScriptSeries.examination_id == exam_id
    )
    res = await session.execute(stmt)
    return {int(r.subject_id): int(r.series_count) for r in res.scalars().all()}


async def ordered_subjects_on_examination_timetable(session: AsyncSession, exam_id: int) -> list[Subject]:
    """Subjects resolved from examination schedules, one entry per timetable row, ordered by schedule subject_code."""
    schedules = await load_schedules_for_exam(session, exam_id)
    if not schedules:
        return []
    schedules_sorted = sorted(schedules, key=lambda s: s.subject_code)
    codes = sorted({s.subject_code for s in schedules})
    sub_stmt = select(Subject).where(or_(Subject.code.in_(codes), Subject.original_code.in_(codes)))
    sub_result = await session.execute(sub_stmt)
    subjects = list(sub_result.scalars().all())
    by_code = _subject_by_schedule_codes(subjects)
    out: list[Subject] = []
    seen: set[int] = set()
    for sch in schedules_sorted:
        sub = by_code.get(sch.subject_code)
        if sub is None or sub.id in seen:
            continue
        seen.add(sub.id)
        out.append(sub)
    return out


async def valid_script_packing_triples(
    session: AsyncSession,
    exam_id: int,
    scope_school_ids: set[UUID],
    packing_school_id: UUID,
) -> set[tuple[int, int, int]]:
    """Set of (subject_id, paper_number, series_number) allowed for packing for this school and exam."""
    rows = await load_subject_paper_rows_for_exam_and_school(
        session, exam_id, scope_school_ids, packing_school_id
    )
    counts = await subject_series_count_map(session, exam_id)
    out: set[tuple[int, int, int]] = set()
    for sub, paper_dates in rows:
        n = counts.get(sub.id, 1)
        for pn in paper_dates:
            for sn in range(1, n + 1):
                out.add((sub.id, pn, sn))
    return out
