"""Timetable filtering helpers, preview entries, and PDF wrappers for examinations."""
from __future__ import annotations

from datetime import time
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Examination, ExaminationSchedule
from app.schemas.examination import TimetableEntry
from app.schemas.timetable import TimetableDownloadFilter
from app.services.timetable_service import (
    filter_schedule_codes_by_subject_type,
    generate_timetable_pdf,
    get_programme_subject_schedule_codes,
    get_school_subject_schedule_codes,
    parse_schedule_date,
)

def parse_schedule_time(t: str | Any) -> time:
    return time.fromisoformat(str(t))


def schedules_to_entries(schedules: list[ExaminationSchedule]) -> list[TimetableEntry]:
    entries: list[TimetableEntry] = []
    for sch in schedules:
        papers = sch.papers or []
        for paper_entry in papers:
            if not isinstance(paper_entry, dict):
                continue
            try:
                d = parse_schedule_date(paper_entry["date"])
                st = parse_schedule_time(paper_entry["start_time"])
            except (KeyError, ValueError, TypeError):
                continue
            et = None
            if paper_entry.get("end_time") is not None:
                try:
                    et = parse_schedule_time(paper_entry["end_time"])
                except (ValueError, TypeError):
                    et = None
            paper_num = int(paper_entry.get("paper", 1))
            entries.append(
                TimetableEntry(
                    subject_code=sch.subject_code,
                    subject_name=sch.subject_name,
                    paper=paper_num,
                    examination_date=d,
                    examination_time=st,
                    examination_end_time=et,
                    venue=sch.venue,
                    duration_minutes=sch.duration_minutes,
                    instructions=sch.instructions,
                )
            )

    def sort_key(e: TimetableEntry) -> tuple:
        return (e.examination_date, e.examination_time, e.subject_code, e.paper)

    entries.sort(key=sort_key)
    return entries


async def load_examination_or_raise(session: AsyncSession, exam_id: int) -> Examination:
    exam_stmt = select(Examination).where(Examination.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if exam is None:
        raise ValueError("Examination not found")
    return exam


async def load_schedules_for_exam(session: AsyncSession, exam_id: int) -> list[ExaminationSchedule]:
    stmt = select(ExaminationSchedule).where(ExaminationSchedule.examination_id == exam_id)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def build_school_timetable_pdf(
    session: AsyncSession,
    exam_id: int,
    school_id: UUID,
    *,
    programme_id: int | None = None,
    subject_filter: TimetableDownloadFilter = TimetableDownloadFilter.ALL,
    merge_by_date: bool = False,
    orientation: str = "portrait",
    explicit_schedule_codes: set[str] | None = None,
) -> bytes:
    await load_examination_or_raise(session, exam_id)
    return await generate_timetable_pdf(
        session,
        exam_id,
        school_id=school_id,
        programme_id=programme_id,
        subject_filter=subject_filter,
        merge_by_date=merge_by_date,
        orientation=orientation,
        explicit_schedule_codes=explicit_schedule_codes,
    )


async def build_full_exam_timetable_pdf(
    session: AsyncSession,
    exam_id: int,
    *,
    subject_filter: TimetableDownloadFilter = TimetableDownloadFilter.ALL,
    merge_by_date: bool = False,
    orientation: str = "portrait",
) -> tuple[bytes, Examination]:
    exam = await load_examination_or_raise(session, exam_id)
    pdf = await generate_timetable_pdf(
        session,
        exam_id,
        school_id=None,
        programme_id=None,
        subject_filter=subject_filter,
        merge_by_date=merge_by_date,
        orientation=orientation,
    )
    return pdf, exam
