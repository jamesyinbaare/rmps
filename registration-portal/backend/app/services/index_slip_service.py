"""Service for generating Index Slip PDFs."""
import base64
import io
from datetime import datetime, date, time
from pathlib import Path
from typing import Any

import qrcode
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import (
    RegistrationCandidate,
    RegistrationCandidatePhoto,
    ExaminationSchedule,
    RegistrationSubjectSelection,
    School,
    RegistrationExam,
    Subject,
)
from app.services.pdf_generator import PdfGenerator, render_html
from app.services.photo_storage import PhotoStorageService
from app.services.timetable_service import parse_schedule_date


def generate_qr_code(url: str) -> str:
    """
    Generate a QR code image as base64 string.

    Args:
        url: URL to encode in QR code

    Returns:
        Base64-encoded PNG image string
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img_buffer = io.BytesIO()
    img.save(img_buffer, format="PNG")
    img_buffer.seek(0)

    img_base64 = base64.b64encode(img_buffer.read()).decode("utf-8")
    return img_base64


async def generate_index_slip_pdf(
    candidate: RegistrationCandidate,
    session: AsyncSession,
    photo_data: bytes | None = None,
) -> bytes:
    """
    Generate Index Slip PDF document for a candidate.

    Args:
        candidate: RegistrationCandidate model instance
        session: Database session
        photo_data: Optional candidate photo file content as bytes

    Returns:
        PDF file as bytes
    """
    # Ensure index number exists
    if not candidate.index_number:
        raise ValueError("Index number must be generated before creating Index Slip")

    # Load candidate relationships explicitly (refresh doesn't work well with relationships in async)
    # Query subject selections
    subject_selections_stmt = select(RegistrationSubjectSelection).where(
        RegistrationSubjectSelection.registration_candidate_id == candidate.id
    )
    subject_selections_result = await session.execute(subject_selections_stmt)
    subject_selections = subject_selections_result.scalars().all()

    # Query school if school_id is present
    school = None
    if candidate.school_id:
        school_stmt = select(School).where(School.id == candidate.school_id)
        school_result = await session.execute(school_stmt)
        school = school_result.scalar_one_or_none()

    # Query exam
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == candidate.registration_exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError("Registration exam not found")

    # Load photo if not provided
    if photo_data is None:
        photo_stmt = select(RegistrationCandidatePhoto).where(
            RegistrationCandidatePhoto.registration_candidate_id == candidate.id
        )
        photo_result = await session.execute(photo_stmt)
        photo = photo_result.scalar_one_or_none()
        if photo:
            photo_service = PhotoStorageService()
            try:
                photo_data = await photo_service.retrieve(photo.file_path)
            except Exception:
                photo_data = None

    # Get examination schedules for registered subjects
    subject_codes = [sel.subject_code for sel in subject_selections]

    schedules_stmt = (
        select(ExaminationSchedule)
        .where(
            ExaminationSchedule.registration_exam_id == candidate.registration_exam_id,
            ExaminationSchedule.subject_code.in_(subject_codes),
        )
    )
    schedules_result = await session.execute(schedules_stmt)
    schedules = schedules_result.scalars().all()

    # schedule.subject_code now contains original_code
    # We need to look up subjects by original_code to get the internal code for matching with subject_selections
    unique_original_codes = list(set([schedule.subject_code for schedule in schedules]))
    subjects_stmt = select(Subject).where(Subject.original_code.in_(unique_original_codes))
    subjects_result = await session.execute(subjects_stmt)
    subjects = subjects_result.scalars().all()

    # Create a mapping of original_code -> internal code (for matching with subject_selections)
    original_code_to_internal_code: dict[str, str] = {}
    for subject in subjects:
        if subject.original_code:
            original_code_to_internal_code[subject.original_code] = subject.code

    # Build schedule entries with papers
    schedule_entries = []
    for schedule in schedules:
        # Find matching subject selection
        # subject_selections use internal code, so we need to convert schedule.subject_code (original_code) to internal code
        internal_code = original_code_to_internal_code.get(schedule.subject_code, schedule.subject_code)
        subject_selection = next(
            (sel for sel in subject_selections if sel.subject_code == internal_code),
            None,
        )
        if subject_selection:
            papers_list = schedule.papers if schedule.papers else []
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
                except (ValueError, TypeError):
                    continue  # Skip invalid entries

                # schedule.subject_code is now original_code, use it directly for display
                display_subject_code = schedule.subject_code

                schedule_entries.append({
                    "subject_code": display_subject_code,  # Display code (original_code or code)
                    "schedule_subject_code": schedule.subject_code,  # Keep original for grouping
                    "subject_name": schedule.subject_name,
                    "paper": paper_num,
                    "date": paper_date,
                    "start_time": paper_start_time,
                    "end_time": paper_end_time,
                    "venue": schedule.venue,
                })

    # Sort by date and time
    schedule_entries.sort(key=lambda x: (x["date"], x["start_time"]))

    # Combine papers that start at the same time (same subject, date, and start_time)
    combined_entries = []
    i = 0
    while i < len(schedule_entries):
        current = schedule_entries[i]
        papers_to_combine = [current["paper"]]
        end_time = current["end_time"]

        # Look ahead to find papers with the same subject, date, and start_time
        # Use schedule_subject_code for grouping to ensure correct combination
        j = i + 1
        while j < len(schedule_entries):
            next_entry = schedule_entries[j]
            if (next_entry["schedule_subject_code"] == current["schedule_subject_code"] and
                next_entry["date"] == current["date"] and
                next_entry["start_time"] == current["start_time"]):
                papers_to_combine.append(next_entry["paper"])
                # Use the latest end_time
                if next_entry["end_time"] and (not end_time or next_entry["end_time"] > end_time):
                    end_time = next_entry["end_time"]
                j += 1
            else:
                break

        # Create combined entry
        papers_to_combine.sort()
        if len(papers_to_combine) > 1:
            paper_display = f"Paper {' & '.join(str(p) for p in papers_to_combine)}"
        else:
            paper_display = f"Paper {papers_to_combine[0]}"

        # Add paper display to subject name: "Subject Name (Paper 1 & 2)" or "Subject Name (Paper 1)"
        subject_name_with_paper = f"{current['subject_name']} ({paper_display})"

        combined_entries.append({
            "subject_code": current["subject_code"],
            "subject_name": subject_name_with_paper,  # Subject name with paper display
            "paper": paper_display,  # Keep for template compatibility (may not be used)
            "date": current["date"],
            "start_time": current["start_time"],
            "end_time": end_time,
            "venue": current["venue"],
        })

        i = j  # Skip the combined entries

    schedule_entries = combined_entries

    # Generate QR code
    frontend_url = settings.frontend_base_url.rstrip("/")
    qr_code_url = f"{frontend_url}/candidate/{candidate.index_number}"
    qr_code_base64 = generate_qr_code(qr_code_url)

    # Convert photo to base64
    photo_base64 = None
    if photo_data:
        try:
            photo_base64 = base64.b64encode(photo_data).decode("utf-8")
            # Add data URI prefix based on common image formats
            # Try to detect format, default to JPEG
            if photo_data[:2] == b'\xff\xd8':
                photo_base64 = f"data:image/jpeg;base64,{photo_base64}"
            elif photo_data[:8] == b'\x89PNG\r\n\x1a\n':
                photo_base64 = f"data:image/png;base64,{photo_base64}"
            else:
                photo_base64 = f"data:image/jpeg;base64,{photo_base64}"
        except Exception:
            photo_base64 = None

    # Get examination center info
    center_name = "N/A"
    center_code = "N/A"
    if school:
        center_name = school.name
        center_code = school.code

    # Prepare template context
    context = {
        "candidate": candidate,
        "center_name": center_name,
        "center_code": center_code,
        "photo_base64": photo_base64,
        "schedule_entries": schedule_entries,
        "qr_code_base64": qr_code_base64,
        "qr_code_url": qr_code_url,
        "exam": exam,
        "now": datetime.utcnow(),
    }

    # Render the HTML template
    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "index-slip/index-slip.html", templates_dir)

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
