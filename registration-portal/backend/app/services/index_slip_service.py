"""Service for generating Index Slip PDFs."""
import base64
import io
from datetime import datetime
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
)
from app.services.pdf_generator import PdfGenerator, render_html
from app.services.photo_storage import PhotoStorageService


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
    # Load candidate relationships
    await session.refresh(
        candidate,
        [
            "school",
            "exam",
            "photo",
            "subject_selections",
        ],
    )

    # Ensure index number exists
    if not candidate.index_number:
        raise ValueError("Index number must be generated before creating Index Slip")

    # Load photo if not provided
    if photo_data is None and candidate.photo:
        photo_service = PhotoStorageService()
        try:
            photo_data = await photo_service.retrieve(candidate.photo.file_path)
        except Exception:
            photo_data = None

    # Get examination schedules for registered subjects
    subject_codes = [sel.subject_code for sel in candidate.subject_selections]

    schedules_stmt = (
        select(ExaminationSchedule)
        .where(
            ExaminationSchedule.registration_exam_id == candidate.registration_exam_id,
            ExaminationSchedule.subject_code.in_(subject_codes),
        )
        .order_by(ExaminationSchedule.examination_date, ExaminationSchedule.examination_time)
    )
    schedules_result = await session.execute(schedules_stmt)
    schedules = schedules_result.scalars().all()

    # Build schedule entries with papers
    schedule_entries = []
    for schedule in schedules:
        # Find matching subject selection
        subject_selection = next(
            (sel for sel in candidate.subject_selections if sel.subject_code == schedule.subject_code),
            None,
        )
        if subject_selection:
            papers_list = schedule.papers if schedule.papers else [{"paper": 1}]
            for paper_info in papers_list:
                paper_num = paper_info.get("paper", 1)
                paper_start_time = paper_info.get("start_time")
                paper_end_time = paper_info.get("end_time")

                schedule_entries.append({
                    "subject_code": schedule.subject_code,
                    "subject_name": schedule.subject_name,
                    "paper": paper_num,
                    "date": schedule.examination_date,
                    "start_time": paper_start_time or schedule.examination_time,
                    "end_time": paper_end_time or schedule.examination_end_time,
                    "venue": schedule.venue,
                })

    # Sort by date and time
    schedule_entries.sort(key=lambda x: (x["date"], x["start_time"]))

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
    if candidate.school:
        center_name = candidate.school.name
        center_code = candidate.school.code

    # Prepare template context
    context = {
        "candidate": candidate,
        "center_name": center_name,
        "center_code": center_code,
        "photo_base64": photo_base64,
        "schedule_entries": schedule_entries,
        "qr_code_base64": qr_code_base64,
        "qr_code_url": qr_code_url,
        "exam": candidate.exam,
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
