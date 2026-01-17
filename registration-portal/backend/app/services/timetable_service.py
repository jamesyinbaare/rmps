"""Service for generating timetable PDFs."""
from collections import defaultdict
from datetime import date, datetime, timedelta, time
from pathlib import Path
from typing import Any

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ExaminationSchedule,
    Programme,
    RegistrationExam,
    School,
    Subject,
    SubjectType,
    programme_subjects,
    school_programmes,
)
from app.schemas.timetable import TimetableDownloadFilter
from app.services.pdf_generator import PdfGenerator, render_html


def parse_schedule_date(date_str: str) -> date:
    """
    Parse a date string that may be in ISO datetime format.

    Handles both date-only strings ('2026-01-15') and ISO datetime strings ('2026-01-15T00:00:00').

    Args:
        date_str: Date string that may include time component

    Returns:
        Parsed date object

    Raises:
        ValueError: If the date string cannot be parsed
    """
    # Extract just the date part before 'T' if present
    date_part = date_str.split('T')[0] if 'T' in date_str else date_str
    return date.fromisoformat(date_part)


def format_duration_hours(start_time: time, end_time: time | None, duration_minutes: int | None = None) -> str | None:
    """Format duration in human-readable hours format like '[2 HOURS]' or '[1 1/2 HOURS]'.

    Args:
        start_time: Start time
        end_time: End time (if provided)
        duration_minutes: Duration in minutes (used if end_time is not provided)

    Returns:
        Formatted duration string or None if cannot calculate
    """
    # Calculate end_time if not provided but duration_minutes is available
    if not end_time and duration_minutes:
        start_dt = datetime.combine(date.today(), start_time)
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        end_time = end_dt.time()

    # Only calculate if end_time is available
    if not end_time:
        return None

    # Calculate duration in minutes
    start_dt = datetime.combine(date.today(), start_time)
    end_dt = datetime.combine(date.today(), end_time)
    duration_delta = end_dt - start_dt
    total_minutes = int(duration_delta.total_seconds() / 60)

    if total_minutes <= 0:
        return None

    # Convert to hours and format
    hours = total_minutes / 60

    # Check if it's a whole number of hours
    if hours == int(hours):
        return f"[{int(hours)} HOURS]"

    # Check if it's a half hour (e.g., 1.5 hours = 1 1/2 hours)
    if hours == int(hours) + 0.5:
        whole_hours = int(hours)
        if whole_hours == 0:
            return "[1/2 HOUR]"
        return f"[{whole_hours} 1/2 HOURS]"

    # For other cases, show as decimal hours (e.g., 2.25 hours = 2 1/4 hours)
    # Or we can show as hours and minutes
    whole_hours = int(hours)
    remaining_minutes = total_minutes % 60

    if whole_hours == 0:
        return f"[{remaining_minutes} MINUTES]"
    elif remaining_minutes == 0:
        return f"[{whole_hours} HOURS]"
    else:
        # Convert remaining minutes to fraction of hour
        if remaining_minutes == 30:
            return f"[{whole_hours} 1/2 HOURS]"
        elif remaining_minutes == 15:
            return f"[{whole_hours} 1/4 HOURS]"
        elif remaining_minutes == 45:
            return f"[{whole_hours} 3/4 HOURS]"
        else:
            # Show as hours and minutes
            return f"[{whole_hours} H {remaining_minutes}M]"


async def get_school_subject_codes(session: AsyncSession, school_id: int) -> tuple[set[str], dict[str, str]]:
    """
    Get all subject codes offered by a school through its programmes.
    Returns both codes (for filtering) and a map from code to original_code (for display).

    Args:
        session: Database session
        school_id: School ID

    Returns:
        Tuple of (set of subject codes for filtering, dict mapping code to original_code)
    """
    # Query subjects through school_programmes -> programme_subjects
    subject_stmt = (
        select(Subject.code, Subject.original_code)
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .join(school_programmes, programme_subjects.c.programme_id == school_programmes.c.programme_id)
        .where(school_programmes.c.school_id == school_id)
        .distinct()
    )
    subject_result = await session.execute(subject_stmt)
    subject_codes = set()
    code_to_original_code: dict[str, str] = {}
    for code, original_code in subject_result.all():
        subject_codes.add(code)
        if original_code:
            code_to_original_code[code] = original_code
    return subject_codes, code_to_original_code


async def get_programme_subject_codes(session: AsyncSession, programme_id: int) -> tuple[set[str], dict[str, str]]:
    """
    Get all subject codes for a programme.
    Returns both codes (for filtering) and a map from code to original_code (for display).

    Args:
        session: Database session
        programme_id: Programme ID

    Returns:
        Tuple of (set of subject codes for filtering, dict mapping code to original_code)
    """
    # Query subjects from programme_subjects
    subject_stmt = (
        select(Subject.code, Subject.original_code)
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .where(programme_subjects.c.programme_id == programme_id)
        .distinct()
    )
    subject_result = await session.execute(subject_stmt)
    subject_codes = set()
    code_to_original_code: dict[str, str] = {}
    for code, original_code in subject_result.all():
        subject_codes.add(code)
        if original_code:
            code_to_original_code[code] = original_code
    return subject_codes, code_to_original_code


async def get_school_subject_schedule_codes(session: AsyncSession, school_id: int) -> set[str]:
    """
    Get all subject codes that could be stored in schedules for a school.
    Schedules store original_code if available, otherwise code.
    This returns the set of codes that schedules would use.

    Args:
        session: Database session
        school_id: School ID

    Returns:
        Set of codes (original_code if available, otherwise code) for subjects in the school
    """
    # Query subjects through school_programmes -> programme_subjects
    subject_stmt = (
        select(Subject.code, Subject.original_code)
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .join(school_programmes, programme_subjects.c.programme_id == school_programmes.c.programme_id)
        .where(school_programmes.c.school_id == school_id)
        .distinct()
    )
    subject_result = await session.execute(subject_stmt)
    schedule_codes = set()
    for code, original_code in subject_result.all():
        # Schedules store original_code if available, otherwise code
        schedule_codes.add(original_code if original_code else code)
    return schedule_codes


async def get_programme_subject_schedule_codes(session: AsyncSession, programme_id: int) -> set[str]:
    """
    Get all subject codes that could be stored in schedules for a programme.
    Schedules store original_code if available, otherwise code.
    This returns the set of codes that schedules would use.

    Args:
        session: Database session
        programme_id: Programme ID

    Returns:
        Set of codes (original_code if available, otherwise code) for subjects in the programme
    """
    # Query subjects from programme_subjects
    subject_stmt = (
        select(Subject.code, Subject.original_code)
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .where(programme_subjects.c.programme_id == programme_id)
        .distinct()
    )
    subject_result = await session.execute(subject_stmt)
    schedule_codes = set()
    for code, original_code in subject_result.all():
        # Schedules store original_code if available, otherwise code
        schedule_codes.add(original_code if original_code else code)
    return schedule_codes


async def filter_schedules_by_subject_type(
    session: AsyncSession, schedule_codes: set[str], subject_filter: TimetableDownloadFilter
) -> set[str]:
    """
    Filter schedule codes by subject type (CORE or ELECTIVE).
    Schedules store original_code if available, otherwise code.

    Args:
        session: Database session
        schedule_codes: Set of schedule codes (original_code or code) to filter
        subject_filter: Filter type (ALL, CORE_ONLY, ELECTIVE_ONLY)

    Returns:
        Filtered set of schedule codes
    """
    if subject_filter == TimetableDownloadFilter.ALL:
        return schedule_codes

    # Handle empty set
    if not schedule_codes:
        return set()

    # Get subject types - need to match by both original_code and code
    # since schedule_codes can contain either
    subject_stmt = select(Subject.code, Subject.original_code, Subject.subject_type).where(
        or_(
            Subject.original_code.in_(schedule_codes),
            Subject.code.in_(schedule_codes)
        )
    )
    subject_result = await session.execute(subject_stmt)

    # Build a map from schedule code to subject type
    # Schedule code is original_code if available, otherwise code
    code_to_type: dict[str, SubjectType] = {}
    for code, original_code, subject_type in subject_result.all():
        # The schedule would store original_code if available, otherwise code
        schedule_code = original_code if original_code else code
        if schedule_code in schedule_codes:
            code_to_type[schedule_code] = subject_type

    if subject_filter == TimetableDownloadFilter.CORE_ONLY:
        return {code for code, stype in code_to_type.items() if stype == SubjectType.CORE}
    elif subject_filter == TimetableDownloadFilter.ELECTIVE_ONLY:
        return {code for code, stype in code_to_type.items() if stype == SubjectType.ELECTIVE}
    else:
        return schedule_codes


async def generate_timetable_pdf(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
    programme_id: int | None = None,
    subject_filter: TimetableDownloadFilter = TimetableDownloadFilter.ALL,
    merge_by_date: bool = False,
    orientation: str = "portrait",
) -> bytes:
    """
    Generate timetable PDF with filtering options.

    Args:
        session: Database session
        exam_id: Registration exam ID
        school_id: Optional school ID to filter to school's subjects
        programme_id: Optional programme ID to filter to programme's subjects
        subject_filter: Filter by subject type (ALL, CORE_ONLY, ELECTIVE_ONLY)

    Returns:
        PDF file as bytes
    """
    # Query exam
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError("Registration exam not found")

    # Get school if provided
    school = None
    if school_id:
        school_stmt = select(School).where(School.id == school_id)
        school_result = await session.execute(school_stmt)
        school = school_result.scalar_one_or_none()
        if not school:
            raise ValueError("School not found")

    # Get programme if provided
    programme = None
    if programme_id:
        programme_stmt = select(Programme).where(Programme.id == programme_id)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if not programme:
            raise ValueError("Programme not found")

    # Get all schedules for the exam
    schedules_stmt = select(ExaminationSchedule).where(
        ExaminationSchedule.registration_exam_id == exam_id
    )
    schedules_result = await session.execute(schedules_stmt)
    all_schedules = schedules_result.scalars().all()

    # Get all schedule codes (schedules store original_code if available, otherwise code)
    schedule_codes = {schedule.subject_code for schedule in all_schedules}

    # Apply filters - get schedule codes for school/programme subjects
    filtered_schedule_codes: set[str] | None = None

    if programme_id:
        # Filter to programme's subjects - get codes that schedules would use
        programme_schedule_codes = await get_programme_subject_schedule_codes(session, programme_id)
        # Match schedules: a schedule matches if its subject_code is in programme_schedule_codes
        # This handles both original_code and code cases
        filtered_schedule_codes = programme_schedule_codes & schedule_codes
        # If intersection is empty, it means no schedules match the programme's subjects
    elif school_id:
        # Filter to school's subjects - get codes that schedules would use
        school_schedule_codes = await get_school_subject_schedule_codes(session, school_id)
        # Match schedules: a schedule matches if its subject_code is in school_schedule_codes
        # This handles both original_code and code cases
        filtered_schedule_codes = school_schedule_codes & schedule_codes
        # If intersection is empty, it means no schedules match the school's subjects

    # Apply subject type filter if needed
    if filtered_schedule_codes is not None:
        # Filter by subject type using schedule codes
        filtered_schedule_codes = await filter_schedules_by_subject_type(
            session, filtered_schedule_codes, subject_filter
        )
    elif subject_filter != TimetableDownloadFilter.ALL:
        # No school/programme filter, but need to filter by subject type
        # Filter schedule codes by subject type
        filtered_schedule_codes = await filter_schedules_by_subject_type(
            session, schedule_codes, subject_filter
        )
    else:
        # No filtering - we'll show all schedules
        filtered_schedule_codes = None

    # Filter schedules by schedule codes
    # schedule.subject_code contains original_code (if available) or code
    if filtered_schedule_codes is not None:
        # We have filters (school/programme/subject type)
        # Match schedules directly by their subject_code
        schedules = [s for s in all_schedules if s.subject_code in filtered_schedule_codes]
    else:
        # No filters at all - show all schedules
        # This happens when school_id=None, programme_id=None, and subject_filter=ALL
        schedules = list(all_schedules)

    # Log warning if filtering resulted in empty schedules when schedules exist
    if not schedules and all_schedules:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(
            f"Filtered all {len(all_schedules)} schedules to zero for exam_id={exam_id}, "
            f"school_id={school_id}, programme_id={programme_id}, subject_filter={subject_filter}"
        )

    # Expand schedules into paper entries (one entry per paper with its date/time)
    paper_entries: list[dict[str, Any]] = []
    for schedule in schedules:
        papers_list = schedule.papers if schedule.papers else []
        # schedule.subject_code is now original_code, use it directly for display
        display_subject_code = schedule.subject_code

        for paper_info in papers_list:
            paper_num = paper_info.get("paper", 1)
            paper_date_str = paper_info.get("date")
            paper_start_time_str = paper_info.get("start_time")
            paper_end_time_str = paper_info.get("end_time")

            if not paper_date_str or not paper_start_time_str:
                continue  # Skip invalid papers (shouldn't happen after validation)

            # Parse date and time
            try:
                paper_date = parse_schedule_date(paper_date_str)
                paper_start_time = time.fromisoformat(paper_start_time_str)
                paper_end_time = None
                if paper_end_time_str:
                    paper_end_time = time.fromisoformat(paper_end_time_str)
            except (ValueError, TypeError) as e:
                # Log the error for debugging
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to parse paper date/time: date={paper_date_str}, start_time={paper_start_time_str}, error={e}")
                continue  # Skip invalid entries

            paper_entries.append({
                "schedule": schedule,
                "display_subject_code": display_subject_code,
                "paper": paper_num,
                "date": paper_date,
                "start_time": paper_start_time,
                "end_time": paper_end_time,
            })

    # Group papers by subject, date, and start_time to combine papers written together
    # Key: (subject_code, date, start_time) -> list of paper entries
    grouped_papers: dict[tuple[str, date, time], list[dict[str, Any]]] = defaultdict(list)
    for entry in paper_entries:
        key = (entry["schedule"].subject_code, entry["date"], entry["start_time"])
        grouped_papers[key].append(entry)

    # Create combined entries: if same subject/date/time, combine papers; otherwise separate
    combined_entries: list[dict[str, Any]] = []
    for key, entries in grouped_papers.items():
        schedule = entries[0]["schedule"]
        display_subject_code = entries[0]["display_subject_code"]

        # Get all paper numbers for this group
        paper_nums = sorted([e["paper"] for e in entries])

        # Determine paper display text
        if len(paper_nums) > 1:
            paper_display = f"Paper {' & '.join(map(str, paper_nums))}"
        else:
            paper_display = f"Paper {paper_nums[0]}"

        # Use the first entry's date/time (all should be same)
        entry_date = entries[0]["date"]
        entry_start_time = entries[0]["start_time"]
        entry_end_time = entries[0]["end_time"]

        # If multiple entries, use the latest end_time
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

    # Sort combined entries by date, then by time
    combined_entries.sort(key=lambda e: (e["date"], e["start_time"]))

    # Prepare schedule entries with SN (sequential number)
    # If merge_by_date is True, group subjects by date and assign same SN
    schedule_entries: list[dict[str, Any]] = []

    if merge_by_date:
        # Group combined entries by date
        entries_by_date: dict[date, list[dict[str, Any]]] = defaultdict(list)
        for entry in combined_entries:
            entries_by_date[entry["date"]].append(entry)

        # Sort dates chronologically
        sorted_dates = sorted(entries_by_date.keys())

        # Create merged entries (one row per date, with multiple subjects)
        sn = 1
        for date_obj in sorted_dates:
            day_entries = entries_by_date[date_obj]
            # Format day of week
            day_of_week = date_obj.strftime("%A").upper()  # e.g., "MONDAY"
            # Format date as "JANUARY 15, 2026"
            date_display = date_obj.strftime("%B %d, %Y").upper()  # e.g., "JANUARY 15, 2026"

            # Prepare stacked content for codes, names, paper displays, and times
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

                # Determine the actual end_time (either from entry or calculated from duration_minutes)
                actual_end_time = entry["end_time"]
                if not actual_end_time and schedule.duration_minutes:
                    start_dt = datetime.combine(entry["date"], entry["start_time"])
                    end_dt = start_dt + timedelta(minutes=schedule.duration_minutes)
                    actual_end_time = end_dt.time()

                # Format time range: start_time - end_time
                if actual_end_time:
                    end_time_str = actual_end_time.strftime("%I:%M %p")
                    time_range = f"{time_str} - {end_time_str}"
                else:
                    time_range = time_str

                # Calculate duration display (only if end_time is provided or can be calculated)
                duration_display = format_duration_hours(
                    entry["start_time"],
                    actual_end_time,
                    schedule.duration_minutes
                )

                # Truncate subject name to 25 characters (keep separate from paper display)
                truncated_subject_name = schedule.subject_name[:25] if len(schedule.subject_name) > 25 else schedule.subject_name

                subject_codes.append(display_subject_code)  # Keep subject code clean, no paper numbers
                subject_names.append(truncated_subject_name)  # Subject name without paper
                paper_displays.append(f"({paper_display})")  # Paper display in parentheses
                time_ranges.append(time_range)
                duration_displays.append(duration_display)

            schedule_entries.append({
                "sn": sn,
                "subject_code": subject_codes,  # List of codes (no time stacking)
                "subject_name": subject_names,  # List of names for stacking
                "paper_display": paper_displays,  # List of paper displays for stacking below names
                "time_range": time_ranges,  # List of time ranges (start - end) for stacking
                "duration_display": duration_displays,  # List of duration displays for stacking below time ranges
                "examination_date": date_obj,
                "day_of_week": day_of_week,
                "date_display": date_display,
                "rowspan": len(day_entries),  # Number of rows to span
                "is_merged": True,
            })
            sn += 1
    else:
        # Individual entries (one row per combined entry)
        for sn, entry in enumerate(combined_entries, start=1):
            schedule = entry["schedule"]
            date_obj = entry["date"]
            # Format day of week
            day_of_week = date_obj.strftime("%A").upper()  # e.g., "MONDAY"
            # Format date as "JANUARY 15, 2026"
            date_display = date_obj.strftime("%B %d, %Y").upper()  # e.g., "JANUARY 15, 2026"

            # Use original_code if available, otherwise use code
            display_subject_code = entry["display_subject_code"]
            paper_display = entry["paper_display"]
            time_str = entry["start_time"].strftime("%I:%M %p")

            # Determine the actual end_time (either from entry or calculated from duration_minutes)
            actual_end_time = entry["end_time"]
            if not actual_end_time and schedule.duration_minutes:
                start_dt = datetime.combine(entry["date"], entry["start_time"])
                end_dt = start_dt + timedelta(minutes=schedule.duration_minutes)
                actual_end_time = end_dt.time()

            # Format time range: start_time - end_time
            if actual_end_time:
                end_time_str = actual_end_time.strftime("%I:%M %p")
                time_range = f"{time_str} - {end_time_str}"
            else:
                time_range = time_str

            # Calculate duration display (only if end_time is provided or can be calculated)
            duration_display = format_duration_hours(
                entry["start_time"],
                actual_end_time,
                schedule.duration_minutes
            )

            # Truncate subject name to 25 characters (keep separate from paper display)
            truncated_subject_name = schedule.subject_name[:25] if len(schedule.subject_name) > 25 else schedule.subject_name

            schedule_entries.append({
                "sn": sn,
                "subject_code": display_subject_code,  # Keep subject code clean, no paper numbers
                "subject_name": truncated_subject_name,  # Subject name without paper
                "paper_display": f"({paper_display})",  # Paper display in parentheses
                "time_range": time_range,  # Single time range (start - end)
                "duration_display": duration_display,  # Duration display for stacking below time range
                "examination_date": date_obj,
                "day_of_week": day_of_week,
                "date_display": date_display,
                "rowspan": 1,
                "is_merged": False,
            })

    # Prepare template context
    context = {
        "exam": exam,
        "school": school,
        "programme": programme,
        "subject_filter": subject_filter.value,
        "schedule_entries": schedule_entries,
        "total_entries": len(combined_entries),  # Total number of combined entries
        "merge_by_date": merge_by_date,
        "orientation": orientation,
        "generated_at": datetime.utcnow(),
    }

    # Render the HTML template
    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "timetables/timetable.html", templates_dir)

    # Get absolute path to app directory for base_url
    app_dir = Path(__file__).parent.parent.resolve()
    base_url = str(app_dir)

    # Generate PDF using PdfGenerator
    pdf_gen = PdfGenerator(
        main_html=main_html,
        header_html=None,
        footer_html=None,
        base_url=base_url,
        side_margin=1.5,
        extra_vertical_margin=20,
    )

    pdf_bytes = pdf_gen.render_pdf()
    return pdf_bytes
