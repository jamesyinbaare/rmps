"""Service for generating timetable PDFs."""
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select
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


async def filter_schedules_by_subject_type(
    session: AsyncSession, subject_codes: set[str], subject_filter: TimetableDownloadFilter
) -> set[str]:
    """
    Filter subject codes by subject type (CORE or ELECTIVE).

    Args:
        session: Database session
        subject_codes: Set of subject codes to filter
        subject_filter: Filter type (ALL, CORE_ONLY, ELECTIVE_ONLY)

    Returns:
        Filtered set of subject codes
    """
    if subject_filter == TimetableDownloadFilter.ALL:
        return subject_codes

    # Handle empty set
    if not subject_codes:
        return set()

    # Get subject types for the codes
    subject_stmt = select(Subject.code, Subject.subject_type).where(Subject.code.in_(subject_codes))
    subject_result = await session.execute(subject_stmt)
    subjects = {row[0]: row[1] for row in subject_result.all()}

    if subject_filter == TimetableDownloadFilter.CORE_ONLY:
        return {code for code, stype in subjects.items() if stype == SubjectType.CORE}
    elif subject_filter == TimetableDownloadFilter.ELECTIVE_ONLY:
        return {code for code, stype in subjects.items() if stype == SubjectType.ELECTIVE}
    else:
        return subject_codes


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
    ).order_by(ExaminationSchedule.examination_date, ExaminationSchedule.examination_time)
    schedules_result = await session.execute(schedules_stmt)
    all_schedules = schedules_result.scalars().all()

    # Build a map from schedule subject_code to Subject to get original_code for display
    schedule_subject_codes = {schedule.subject_code for schedule in all_schedules}
    subject_stmt = select(Subject.code, Subject.original_code).where(Subject.code.in_(schedule_subject_codes))
    subject_result = await session.execute(subject_stmt)
    code_to_original_code: dict[str, str] = {}
    for code, original_code in subject_result.all():
        if original_code:
            code_to_original_code[code] = original_code

    # Apply filters
    filtered_subject_codes: set[str] | None = None
    filtered_code_to_original_code: dict[str, str] = {}

    if programme_id:
        # Filter to programme's subjects
        filtered_subject_codes, filtered_code_to_original_code = await get_programme_subject_codes(session, programme_id)
    elif school_id:
        # Filter to school's subjects
        filtered_subject_codes, filtered_code_to_original_code = await get_school_subject_codes(session, school_id)

    # Apply subject type filter if needed
    if filtered_subject_codes is not None:
        filtered_subject_codes = await filter_schedules_by_subject_type(
            session, filtered_subject_codes, subject_filter
        )
        # Update the code_to_original_code map to only include filtered subjects
        filtered_code_to_original_code = {
            code: original_code for code, original_code in filtered_code_to_original_code.items()
            if code in filtered_subject_codes
        }
        # Also merge with code_to_original_code for any schedules that match
        for code, original_code in code_to_original_code.items():
            if code in filtered_subject_codes and code not in filtered_code_to_original_code:
                filtered_code_to_original_code[code] = original_code
    elif subject_filter != TimetableDownloadFilter.ALL:
        # No school/programme filter, but need to filter by subject type
        all_subject_codes = {schedule.subject_code for schedule in all_schedules}
        filtered_subject_codes = await filter_schedules_by_subject_type(
            session, all_subject_codes, subject_filter
        )
        # Update the code_to_original_code map to only include filtered subjects
        filtered_code_to_original_code = {
            code: original_code for code, original_code in code_to_original_code.items()
            if code in filtered_subject_codes
        }
    else:
        # No filtering, use all subjects
        filtered_code_to_original_code = code_to_original_code

    # Filter schedules by subject codes
    if filtered_subject_codes is not None:
        schedules = [s for s in all_schedules if s.subject_code in filtered_subject_codes]
    else:
        schedules = list(all_schedules)

    # Sort schedules by date, then by time
    schedules.sort(key=lambda s: (s.examination_date, s.examination_time))

    # Prepare schedule entries with SN (sequential number)
    # If merge_by_date is True, group subjects by date and assign same SN
    schedule_entries: list[dict[str, Any]] = []

    if merge_by_date:
        # Group schedules by date
        schedules_by_date: dict[date, list[Any]] = defaultdict(list)
        for schedule in schedules:
            schedules_by_date[schedule.examination_date].append(schedule)

        # Sort dates chronologically
        sorted_dates = sorted(schedules_by_date.keys())

        # Create merged entries (one row per date, with multiple subjects)
        sn = 1
        for date_obj in sorted_dates:
            day_schedules = schedules_by_date[date_obj]
            # Format day of week
            day_of_week = date_obj.strftime("%A").upper()  # e.g., "MONDAY"
            # Format date as "JANUARY 15, 2026"
            date_display = date_obj.strftime("%B %d, %Y").upper()  # e.g., "JANUARY 15, 2026"

            # Prepare stacked content for codes, names, and times
            subject_codes: list[str] = []
            subject_names: list[str] = []
            times: list[str] = []
            time_ranges: list[str] = []

            for schedule in day_schedules:
                # Use original_code if available, otherwise use code
                display_subject_code = filtered_code_to_original_code.get(schedule.subject_code, schedule.subject_code)
                time_str = schedule.examination_time.strftime("%I:%M %p")

                # Format time range: start_time - end_time
                if schedule.examination_end_time:
                    end_time_str = schedule.examination_end_time.strftime("%I:%M %p")
                    time_range = f"{time_str} - {end_time_str}"
                else:
                    # If no end_time, calculate from duration or use start_time only
                    if schedule.duration_minutes:
                        start_dt = datetime.combine(schedule.examination_date, schedule.examination_time)
                        end_dt = start_dt + timedelta(minutes=schedule.duration_minutes)
                        end_time_str = end_dt.time().strftime("%I:%M %p")
                        time_range = f"{time_str} - {end_time_str}"
                    else:
                        time_range = time_str

                # Truncate subject name to 25 characters
                truncated_subject_name = schedule.subject_name[:25] if len(schedule.subject_name) > 25 else schedule.subject_name

                subject_codes.append(display_subject_code)
                subject_names.append(truncated_subject_name)
                times.append(time_str)
                time_ranges.append(time_range)

            schedule_entries.append({
                "sn": sn,
                "subject_code": subject_codes,  # List of codes for stacking
                "subject_name": subject_names,  # List of names for stacking
                "time": times,  # List of start times for stacking
                "time_range": time_ranges,  # List of time ranges (start - end) for stacking
                "examination_date": date_obj,
                "day_of_week": day_of_week,
                "date_display": date_display,
                "rowspan": len(day_schedules),  # Number of rows to span
                "is_merged": True,
            })
            sn += 1
    else:
        # Individual entries (one row per schedule)
        for sn, schedule in enumerate(schedules, start=1):
            date_obj = schedule.examination_date
            # Format day of week
            day_of_week = date_obj.strftime("%A").upper()  # e.g., "MONDAY"
            # Format date as "JANUARY 15, 2026"
            date_display = date_obj.strftime("%B %d, %Y").upper()  # e.g., "JANUARY 15, 2026"

            # Use original_code if available, otherwise use code
            display_subject_code = filtered_code_to_original_code.get(schedule.subject_code, schedule.subject_code)
            time_str = schedule.examination_time.strftime("%I:%M %p")

            # Format time range: start_time - end_time
            if schedule.examination_end_time:
                end_time_str = schedule.examination_end_time.strftime("%I:%M %p")
                time_range = f"{time_str} - {end_time_str}"
            else:
                # If no end_time, calculate from duration or use start_time only
                if schedule.duration_minutes:
                    start_dt = datetime.combine(schedule.examination_date, schedule.examination_time)
                    end_dt = start_dt + timedelta(minutes=schedule.duration_minutes)
                    end_time_str = end_dt.time().strftime("%I:%M %p")
                    time_range = f"{time_str} - {end_time_str}"
                else:
                    time_range = time_str

            # Truncate subject name to 25 characters
            truncated_subject_name = schedule.subject_name[:25] if len(schedule.subject_name) > 25 else schedule.subject_name

            schedule_entries.append({
                "sn": sn,
                "subject_code": display_subject_code,  # Single code
                "subject_name": truncated_subject_name,  # Single name (truncated to 25 chars)
                "time": time_str,  # Single start time
                "time_range": time_range,  # Single time range (start - end)
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
        "total_entries": len(schedules),  # Total number of individual schedule entries
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
