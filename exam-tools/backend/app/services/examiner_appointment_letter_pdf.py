"""PDF generation for examiner appointment letters (HTML + WeasyPrint)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path

from app.models import ExaminerInvitation
from app.services.examiner_invitation import _examiner_type_label, subject_display_code
from app.services.pdf_generator import PdfGenerator, render_html
from app.services.script_allocation_form_pdf import examination_label

TEMPLATE_REL = "examiner-invitation/appointment-letter.html"


def _format_coordination_date(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.strftime("%A, %d %B %Y")


def _render_appointment_letter_pdf_sync(
    *,
    examination_label_str: str,
    invitee_name: str,
    phone_number: str,
    examiner_type_label: str,
    subject_label: str,
    region: str,
    coordination_date: str | None,
) -> bytes:
    templates_dir = Path(__file__).parent.parent / "templates"
    app_dir = Path(__file__).parent.parent.resolve()
    generated_at = datetime.now(timezone.utc).strftime("%d %B %Y")

    main_html = render_html(
        {
            "examination_label": examination_label_str,
            "invitee_name": invitee_name,
            "phone_number": phone_number,
            "examiner_type_label": examiner_type_label,
            "subject_label": subject_label,
            "region": region,
            "coordination_date": coordination_date,
            "generated_at": generated_at,
        },
        TEMPLATE_REL,
        templates_dir,
    )
    pdf_gen = PdfGenerator(
        main_html=main_html,
        header_html=None,
        footer_html=None,
        base_url=str(app_dir),
        side_margin=1.8,
        extra_vertical_margin=18,
    )
    return pdf_gen.render_pdf()


def _sanitize_filename_part(s: str) -> str:
    return "".join(c for c in s if c.isalnum() or c in ("_", "-"))


async def build_examiner_appointment_letter_pdf(inv: ExaminerInvitation) -> tuple[bytes, str]:
    """Build appointment letter PDF for an accepted invitation."""
    exam = inv.examination
    subject = inv.subject
    if exam is None:
        raise ValueError("Examination not found")
    if subject is None:
        raise ValueError("Subject not found")

    exam_label_str = examination_label(exam)
    subj_code = subject_display_code(subject)
    subject_label = f"{subject.name} ({subj_code})" if subj_code else subject.name
    coord = _format_coordination_date(inv.coordination_date)

    pdf_bytes = await asyncio.to_thread(
        _render_appointment_letter_pdf_sync,
        examination_label_str=exam_label_str,
        invitee_name=inv.name,
        phone_number=inv.phone_number,
        examiner_type_label=_examiner_type_label(inv.examiner_type),
        subject_label=subject_label,
        region=inv.region.value,
        coordination_date=coord,
    )
    fn = f"appointment_letter_{_sanitize_filename_part(inv.name)}.pdf"
    return pdf_bytes, fn
