"""Service for generating examination timetable PDFs (HTML + WeasyPrint)."""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, time
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Examination,
    ExaminationSchedule,
    Programme,
    School,
    Subject,
    SubjectType,
    programme_subjects,
    school_programmes,
)
from app.schemas.timetable import TimetableDownloadFilter
from app.services.pdf_generator import PdfGenerator, render_html

logger = logging.getLogger(__name__)


def parse_schedule_date(date_str: str | Any) -> date:
    s = str(date_str)
    date_part = s.split("T")[0] if "T" in s else s
    return date.fromisoformat(date_part)


def format_duration_hours(start_time: time, end_time: time | None, duration_minutes: int | None = None) -> str | None:
    if not end_time and duration_minutes:
        start_dt = datetime.combine(date.today(), start_time)
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        end_time = end_dt.time()

    if not end_time:
        return None

    start_dt = datetime.combine(date.today(), start_time)
    end_dt = datetime.combine(date.today(), end_time)
    duration_delta = end_dt - start_dt
    total_minutes = int(duration_delta.total_seconds() / 60)

    if total_minutes <= 0:
        return None

    hours = total_minutes / 60

    if hours == int(hours):
        return f"[{int(hours)} HOURS]"

    if hours == int(hours) + 0.5:
        whole_hours = int(hours)
        if whole_hours == 0:
            return "[1/2 HOUR]"
        return f"[{whole_hours} 1/2 HOURS]"

    whole_hours = int(hours)
    remaining_minutes = total_minutes % 60

    if whole_hours == 0:
        return f"[{remaining_minutes} MINUTES]"
    elif remaining_minutes == 0:
        return f"[{whole_hours} HOURS]"
    else:
        if remaining_minutes == 30:
            return f"[{whole_hours} 1/2 HOURS]"
        elif remaining_minutes == 15:
            return f"[{whole_hours} 1/4 HOURS]"
        elif remaining_minutes == 45:
            return f"[{whole_hours} 3/4 HOURS]"
        else:
            return f"[{whole_hours} H {remaining_minutes}M]"


async def get_school_subject_schedule_codes(session: AsyncSession, school_id: UUID) -> set[str]:
    subject_stmt = (
        select(Subject.code, Subject.original_code)
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .join(school_programmes, programme_subjects.c.programme_id == school_programmes.c.programme_id)
        .where(school_programmes.c.school_id == school_id)
        .distinct()
    )
    subject_result = await session.execute(subject_stmt)
    schedule_codes: set[str] = set()
    for code, original_code in subject_result.all():
        schedule_codes.add(original_code if original_code else code)
    return schedule_codes


async def get_programme_subject_schedule_codes(session: AsyncSession, programme_id: int) -> set[str]:
    subject_stmt = (
        select(Subject.code, Subject.original_code)
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .where(programme_subjects.c.programme_id == programme_id)
        .distinct()
    )
    subject_result = await session.execute(subject_stmt)
    schedule_codes: set[str] = set()
    for code, original_code in subject_result.all():
        schedule_codes.add(original_code if original_code else code)
    return schedule_codes


async def filter_schedule_codes_by_subject_type(
    session: AsyncSession,
    schedule_codes: set[str],
    subject_filter: TimetableDownloadFilter,
) -> set[str]:
    if subject_filter == TimetableDownloadFilter.ALL:
        return schedule_codes
    if not schedule_codes:
        return set()

    subject_stmt = select(Subject.code, Subject.original_code, Subject.subject_type).where(
        or_(Subject.original_code.in_(schedule_codes), Subject.code.in_(schedule_codes))
    )
    subject_result = await session.execute(subject_stmt)
    code_to_type: dict[str, SubjectType] = {}
    for code, original_code, subject_type in subject_result.all():
        schedule_code = original_code if original_code else code
        if schedule_code in schedule_codes:
            code_to_type[schedule_code] = subject_type

    if subject_filter == TimetableDownloadFilter.CORE_ONLY:
        return {c for c, st in code_to_type.items() if st == SubjectType.CORE}
    if subject_filter == TimetableDownloadFilter.ELECTIVE_ONLY:
        return {c for c, st in code_to_type.items() if st == SubjectType.ELECTIVE}
    return schedule_codes


async def generate_timetable_pdf(
    session: AsyncSession,
    exam_id: int,
    school_id: UUID | None = None,
    programme_id: int | None = None,
    subject_filter: TimetableDownloadFilter = TimetableDownloadFilter.ALL,
    merge_by_date: bool = False,
    orientation: str = "portrait",
) -> bytes:
    exam_stmt = select(Examination).where(Examination.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError("Examination not found")

    school = None
    if school_id is not None:
        school_stmt = select(School).where(School.id == school_id)
        school_result = await session.execute(school_stmt)
        school = school_result.scalar_one_or_none()
        if not school:
            raise ValueError("School not found")

    programme = None
    if programme_id is not None:
        programme_stmt = select(Programme).where(Programme.id == programme_id)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if not programme:
            raise ValueError("Programme not found")

    schedules_stmt = select(ExaminationSchedule).where(ExaminationSchedule.examination_id == exam_id)
    schedules_result = await session.execute(schedules_stmt)
    all_schedules = schedules_result.scalars().all()

    schedule_codes = {schedule.subject_code for schedule in all_schedules}

    filtered_schedule_codes: set[str] | None = None

    if programme_id is not None:
        programme_schedule_codes = await get_programme_subject_schedule_codes(session, programme_id)
        filtered_schedule_codes = programme_schedule_codes & schedule_codes
    elif school_id is not None:
        school_schedule_codes = await get_school_subject_schedule_codes(session, school_id)
        filtered_schedule_codes = school_schedule_codes & schedule_codes

    if filtered_schedule_codes is not None:
        filtered_schedule_codes = await filter_schedule_codes_by_subject_type(
            session, filtered_schedule_codes, subject_filter
        )
    elif subject_filter != TimetableDownloadFilter.ALL:
        filtered_schedule_codes = await filter_schedule_codes_by_subject_type(
            session, schedule_codes, subject_filter
        )
    else:
        filtered_schedule_codes = None

    if filtered_schedule_codes is not None:
        schedules = [s for s in all_schedules if s.subject_code in filtered_schedule_codes]
    else:
        schedules = list(all_schedules)

    if not schedules and all_schedules:
        logger.warning(
            "Filtered all %s schedules to zero for exam_id=%s, school_id=%s, programme_id=%s, subject_filter=%s",
            len(all_schedules),
            exam_id,
            school_id,
            programme_id,
            subject_filter,
        )

    paper_entries: list[dict[str, Any]] = []
    for schedule in schedules:
        papers_list = schedule.papers if schedule.papers else []
        display_subject_code = schedule.subject_code

        for paper_info in papers_list:
            if not isinstance(paper_info, dict):
                continue
            paper_num = paper_info.get("paper", 1)
            paper_date_str = paper_info.get("date")
            paper_start_time_str = paper_info.get("start_time")
            paper_end_time_str = paper_info.get("end_time")

            if not paper_date_str or not paper_start_time_str:
                continue

            try:
                paper_date = parse_schedule_date(paper_date_str)
                paper_start_time = time.fromisoformat(str(paper_start_time_str))
                paper_end_time = None
                if paper_end_time_str:
                    paper_end_time = time.fromisoformat(str(paper_end_time_str))
            except (ValueError, TypeError) as e:
                logger.warning(
                    "Failed to parse paper date/time: date=%s, start_time=%s, error=%s",
                    paper_date_str,
                    paper_start_time_str,
                    e,
                )
                continue

            paper_entries.append({
                "schedule": schedule,
                "display_subject_code": display_subject_code,
                "paper": paper_num,
                "date": paper_date,
                "start_time": paper_start_time,
                "end_time": paper_end_time,
            })

    grouped_papers: dict[tuple[str, date, time], list[dict[str, Any]]] = defaultdict(list)
    for entry in paper_entries:
        key = (entry["schedule"].subject_code, entry["date"], entry["start_time"])
        grouped_papers[key].append(entry)

    combined_entries: list[dict[str, Any]] = []
    for _key, entries in grouped_papers.items():
        schedule = entries[0]["schedule"]
        display_subject_code = entries[0]["display_subject_code"]

        paper_nums = sorted([e["paper"] for e in entries])

        if len(paper_nums) > 1:
            paper_display = f"Paper {' & '.join(map(str, paper_nums))}"
        else:
            paper_display = f"Paper {paper_nums[0]}"

        entry_date = entries[0]["date"]
        entry_start_time = entries[0]["start_time"]
        entry_end_time = entries[0]["end_time"]

        if len(entries) > 1:
            for e in entries:
                if e["end_time"] and (not entry_end_time or e["end_time"] > entry_end_time):
                    entry_end_time = e["end_time"]

        combined_entries.append({
            "schedule": schedule,
            "display_subject_code": display_subject_code,
            "paper_display": paper_display,
            "paper_nums": paper_nums,
            "date": entry_date,
            "start_time": entry_start_time,
            "end_time": entry_end_time,
        })

    combined_entries.sort(key=lambda e: (e["date"], e["start_time"]))

    schedule_entries: list[dict[str, Any]] = []

    if merge_by_date:
        entries_by_date: dict[date, list[dict[str, Any]]] = defaultdict(list)
        for entry in combined_entries:
            entries_by_date[entry["date"]].append(entry)

        sorted_dates = sorted(entries_by_date.keys())

        sn = 1
        for date_obj in sorted_dates:
            day_entries = entries_by_date[date_obj]
            day_of_week = date_obj.strftime("%A").upper()
            date_display = date_obj.strftime("%B %d, %Y").upper()

            subject_codes: list[str] = []
            subject_names: list[str] = []
            paper_displays: list[str] = []
            time_ranges: list[str] = []
            duration_displays: list[str | None] = []

            for entry in day_entries:
                schedule = entry["schedule"]
                display_subject_code = entry["display_subject_code"]
                paper_display = entry["paper_display"]
                time_str = entry["start_time"].strftime("%I:%M %p")

                actual_end_time = entry["end_time"]
                if not actual_end_time and schedule.duration_minutes:
                    start_dt = datetime.combine(entry["date"], entry["start_time"])
                    end_dt = start_dt + timedelta(minutes=schedule.duration_minutes)
                    actual_end_time = end_dt.time()

                if actual_end_time:
                    end_time_str = actual_end_time.strftime("%I:%M %p")
                    time_range = f"{time_str} - {end_time_str}"
                else:
                    time_range = time_str

                duration_display = format_duration_hours(
                    entry["start_time"],
                    actual_end_time,
                    schedule.duration_minutes,
                )

                truncated_subject_name = schedule.subject_name[:25] if len(schedule.subject_name) > 25 else schedule.subject_name

                subject_codes.append(display_subject_code)
                subject_names.append(truncated_subject_name)
                paper_displays.append(f"({paper_display})")
                time_ranges.append(time_range)
                duration_displays.append(duration_display)

            schedule_entries.append({
                "sn": sn,
                "subject_code": subject_codes,
                "subject_name": subject_names,
                "paper_display": paper_displays,
                "time_range": time_ranges,
                "duration_display": duration_displays,
                "examination_date": date_obj,
                "day_of_week": day_of_week,
                "date_display": date_display,
                "rowspan": len(day_entries),
                "is_merged": True,
            })
            sn += 1
    else:
        for sn, entry in enumerate(combined_entries, start=1):
            schedule = entry["schedule"]
            date_obj = entry["date"]
            day_of_week = date_obj.strftime("%A").upper()
            date_display = date_obj.strftime("%B %d, %Y").upper()

            display_subject_code = entry["display_subject_code"]
            paper_display = entry["paper_display"]
            time_str = entry["start_time"].strftime("%I:%M %p")

            actual_end_time = entry["end_time"]
            if not actual_end_time and schedule.duration_minutes:
                start_dt = datetime.combine(entry["date"], entry["start_time"])
                end_dt = start_dt + timedelta(minutes=schedule.duration_minutes)
                actual_end_time = end_dt.time()

            if actual_end_time:
                end_time_str = actual_end_time.strftime("%I:%M %p")
                time_range = f"{time_str} - {end_time_str}"
            else:
                time_range = time_str

            duration_display = format_duration_hours(
                entry["start_time"],
                actual_end_time,
                schedule.duration_minutes,
            )

            truncated_subject_name = schedule.subject_name[:25] if len(schedule.subject_name) > 25 else schedule.subject_name

            schedule_entries.append({
                "sn": sn,
                "subject_code": display_subject_code,
                "subject_name": truncated_subject_name,
                "paper_display": f"({paper_display})",
                "time_range": time_range,
                "duration_display": duration_display,
                "examination_date": date_obj,
                "day_of_week": day_of_week,
                "date_display": date_display,
                "rowspan": 1,
                "is_merged": False,
            })

    context = {
        "exam": exam,
        "school": school,
        "programme": programme,
        "subject_filter": subject_filter.value,
        "schedule_entries": schedule_entries,
        "total_entries": len(combined_entries),
        "merge_by_date": merge_by_date,
        "orientation": orientation,
        "generated_at": datetime.utcnow(),
    }

    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "timetables/timetable.html", templates_dir)

    app_dir = Path(__file__).parent.parent.resolve()
    base_url = str(app_dir)

    pdf_gen = PdfGenerator(
        main_html=main_html,
        header_html=None,
        footer_html=None,
        base_url=base_url,
        side_margin=1.5,
        extra_vertical_margin=20,
    )

    # WeasyPrint is CPU-heavy and synchronous; run off the asyncio event loop so other
    # requests keep working and clients/proxies do not time out waiting for a response.
    return await asyncio.to_thread(pdf_gen.render_pdf)
