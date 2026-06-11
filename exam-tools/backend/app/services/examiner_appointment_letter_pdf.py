"""PDF generation for examiner appointment letters (official CTVET letter layout)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ExaminerAllowanceType,
    ExaminerInvitation,
    ExaminerType,
    Region,
    Subject,
)
from app.services.certificate_confirmation_response_pdf import render_certificate_style_letter_pdf
from app.services.examiner_compensation import (
    MarkingRateMap,
    RoleAllowanceMap,
    TravelRateMap,
    TravelRoleFactorMap,
    TravelZoneMap,
    format_ghs_amount,
    load_marking_rates_map,
    load_role_allowance_rates_map,
    load_travel_rates_map,
    load_travel_role_factors_map,
    load_travel_zones_map,
    parse_region_stored,
)
from app.services.examiner_invitation import _examiner_type_label, subject_display_code
from app.services.pdf_generator import render_html
from app.services.script_allocation_form_pdf import examination_label

APPOINTMENT_CONTENT_TEMPLATE = "examiner-invitation/appointment-letter-examiner.html"
SIGNATORY_SIGNATURE_REL_PATH = "img/examiner-appointment-signatory-signature.png"

_FORMAL_ROLE_TITLE: dict[ExaminerType, str] = {
    ExaminerType.CHIEF: "Chief Examiner",
    ExaminerType.ASSISTANT_CHIEF: "Assistant Chief Examiner",
    ExaminerType.ASSISTANT: "Assistant Examiner",
    ExaminerType.TEAM_LEADER: "Team Leader",
}

_FEES_SECTION_PLURAL: dict[ExaminerType, str] = {
    ExaminerType.CHIEF: "CHIEF EXAMINERS",
    ExaminerType.ASSISTANT_CHIEF: "ASSISTANT CHIEF EXAMINERS",
    ExaminerType.ASSISTANT: "ASSISTANT EXAMINERS",
    ExaminerType.TEAM_LEADER: "TEAM LEADERS",
}


def _format_coordination_date(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.strftime("%A, %d %B %Y")


def _appointment_reference_number(*, examination_id: int, subject_code: str, entity_id: UUID) -> str:
    code = (subject_code or "SUBJ").replace(" ", "").upper()
    short_id = str(entity_id).replace("-", "").upper()[:8]
    return f"CTVET/EXM/{examination_id}/{code}/{short_id}"


def _role_article(examiner_type: ExaminerType) -> str:
    if examiner_type in (ExaminerType.ASSISTANT, ExaminerType.ASSISTANT_CHIEF):
        return "an"
    return "a"


def _appointment_role_context(examiner_type: ExaminerType) -> dict[str, object]:
    title = _FORMAL_ROLE_TITLE[examiner_type]
    article = _role_article(examiner_type)
    return {
        "examiner_role_title": title,
        "examiner_role_article": article,
        "conditions_section_heading": f"CONDITIONS OF APPOINTMENT AS {article.upper()} {title.upper()}",
        "fees_section_heading": f"FEES FOR {_FEES_SECTION_PLURAL[examiner_type]}: PAPER 2 (ESSAY/WRITTEN TEST)",
        "show_red_marking_pen_instruction": examiner_type == ExaminerType.ASSISTANT,
        "show_green_vetting_pen_instruction": examiner_type
        in (ExaminerType.CHIEF, ExaminerType.ASSISTANT_CHIEF, ExaminerType.TEAM_LEADER),
    }


def _format_ghs_display(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return f"Ghs {format_ghs_amount(value)}"


def _compute_travel_payable(
    *,
    region: Region,
    examiner_type: ExaminerType,
    travel_rates: TravelRateMap,
    travel_zones: TravelZoneMap,
    travel_role_factors: TravelRoleFactorMap,
) -> Decimal | None:
    travel_base = travel_rates.get(region)
    if travel_base is None:
        return None
    zone_id = travel_zones.get(region)
    factor_raw = travel_role_factors.get((examiner_type, zone_id)) if zone_id is not None else None
    factor_value = Decimal("1") if factor_raw is None else factor_raw
    return travel_base * factor_value


def _build_appointment_fee_context_from_rates(
    *,
    role_rates: RoleAllowanceMap,
    marking_rates: MarkingRateMap,
    travel_rates: TravelRateMap,
    travel_zones: TravelZoneMap,
    travel_role_factors: TravelRoleFactorMap,
    examiner_type: ExaminerType,
    region: Region,
    subject_id: int,
) -> dict[str, object]:
    marking_fee_amount = _format_ghs_display(marking_rates.get((subject_id, 2)))
    responsibility_allowance = _format_ghs_display(
        role_rates.get((examiner_type, ExaminerAllowanceType.RESPONSIBILITY))
    )
    inconvenience_allowance = _format_ghs_display(
        role_rates.get((examiner_type, ExaminerAllowanceType.INCONVENIENCE))
    )
    chief_examiners_report_allowance = _format_ghs_display(
        role_rates.get((examiner_type, ExaminerAllowanceType.CHIEF_EXAMINERS_REPORT))
    )
    vetting_of_scripts_allowance = _format_ghs_display(
        role_rates.get((examiner_type, ExaminerAllowanceType.VETTING_OF_SCRIPTS))
    )
    internal_commuting = _format_ghs_display(
        role_rates.get((examiner_type, ExaminerAllowanceType.INTERNAL_COMMUTING))
    )
    travel_and_transport_amount = _format_ghs_display(
        _compute_travel_payable(
            region=region,
            examiner_type=examiner_type,
            travel_rates=travel_rates,
            travel_zones=travel_zones,
            travel_role_factors=travel_role_factors,
        )
    )

    return {
        "marking_fee_amount": marking_fee_amount,
        "responsibility_allowance": responsibility_allowance,
        "inconvenience_allowance": inconvenience_allowance,
        "chief_examiners_report_allowance": chief_examiners_report_allowance,
        "vetting_of_scripts_allowance": vetting_of_scripts_allowance,
        "internal_commuting": internal_commuting,
        "travel_and_transport_amount": travel_and_transport_amount,
    }


async def _build_appointment_fee_context(
    session: AsyncSession,
    *,
    examination_id: int,
    examiner_type: ExaminerType,
    region: Region | str,
    subject_id: int,
) -> dict[str, object]:
    parsed_region = parse_region_stored(region)
    role_rates = await load_role_allowance_rates_map(session, examination_id)
    marking_rates = await load_marking_rates_map(session, examination_id)
    travel_rates = await load_travel_rates_map(session, examination_id)
    travel_zones, _travel_zone_names = await load_travel_zones_map(session, examination_id)
    travel_role_factors = await load_travel_role_factors_map(session, examination_id)

    return _build_appointment_fee_context_from_rates(
        role_rates=role_rates,
        marking_rates=marking_rates,
        travel_rates=travel_rates,
        travel_zones=travel_zones,
        travel_role_factors=travel_role_factors,
        examiner_type=examiner_type,
        region=parsed_region,
        subject_id=subject_id,
    )


def _render_appointment_letter_body_html(
    *,
    context: dict[str, object],
) -> str:
    templates_dir = Path(__file__).parent.parent / "templates"
    return render_html(context, APPOINTMENT_CONTENT_TEMPLATE, templates_dir)


def _render_appointment_letter_pdf_sync(
    *,
    context: dict[str, object],
    reference_number: str,
) -> bytes:
    body_html = _render_appointment_letter_body_html(context=context)
    return render_certificate_style_letter_pdf(
        letter_body_html=body_html,
        reference_number=reference_number,
        letter_date=datetime.now(timezone.utc),
    )


def _sanitize_filename_part(s: str) -> str:
    return "".join(c for c in s if c.isalnum() or c in ("_", "-"))


def _signatory_signature_src() -> str | None:
    """Relative path for WeasyPrint when the signature image file is present under app/."""
    app_dir = Path(__file__).parent.parent
    if (app_dir / SIGNATORY_SIGNATURE_REL_PATH).is_file():
        return SIGNATORY_SIGNATURE_REL_PATH
    return None


def _base_appointment_context(
    *,
    examination_label_str: str,
    invitee_name: str,
    phone_number: str,
    examiner_type: ExaminerType,
    examiner_type_label: str,
    subject: Subject,
    region: str,
    coordination_date: str | None,
) -> dict[str, object]:
    subj_code = subject_display_code(subject)
    subject_label = f"{subject.name} ({subj_code})" if subj_code else subject.name
    return {
        "examination_label": examination_label_str,
        "examination_label_upper": examination_label_str.upper(),
        "invitee_name": invitee_name,
        "phone_number": phone_number,
        "examiner_type_label": examiner_type_label,
        "subject_label": subject_label,
        "subject_name": subject.name,
        "region": region,
        "coordination_date": coordination_date,
        "examiner_type": examiner_type.value,
        "signatory_signature_src": _signatory_signature_src(),
        **_appointment_role_context(examiner_type),
    }


async def build_examiner_appointment_letter_pdf(
    inv: ExaminerInvitation,
    session: AsyncSession | None = None,
) -> tuple[bytes, str]:
    """Build appointment letter PDF for an accepted invitation."""
    exam = inv.examination
    subject = inv.subject
    if exam is None:
        raise ValueError("Examination not found")
    if subject is None:
        raise ValueError("Subject not found")

    exam_label_str = examination_label(exam)
    coord = _format_coordination_date(inv.coordination_date)
    reference_number = _appointment_reference_number(
        examination_id=int(exam.id),
        subject_code=subject_display_code(subject) or subject.code or "",
        entity_id=inv.id,
    )
    examiner_type = inv.examiner_type
    if not isinstance(examiner_type, ExaminerType):
        examiner_type = ExaminerType(str(examiner_type))

    context = _base_appointment_context(
        examination_label_str=exam_label_str,
        invitee_name=inv.name,
        phone_number=inv.phone_number,
        examiner_type=examiner_type,
        examiner_type_label=_examiner_type_label(examiner_type),
        subject=subject,
        region=inv.region.value,
        coordination_date=coord,
    )
    if session is not None:
        context.update(
            await _build_appointment_fee_context(
                session,
                examination_id=int(exam.id),
                examiner_type=examiner_type,
                region=inv.region,
                subject_id=int(subject.id),
            )
        )

    pdf_bytes = await asyncio.to_thread(
        _render_appointment_letter_pdf_sync,
        context=context,
        reference_number=reference_number,
    )
    fn = f"appointment_letter_{_sanitize_filename_part(inv.name)}.pdf"
    return pdf_bytes, fn


async def build_examiner_appointment_letter_for_roster(
    resolved,
    session: AsyncSession | None = None,
) -> tuple[bytes, str]:
    """Build appointment letter PDF for a roster portal examiner."""
    from app.services.examiner_portal import ResolvedPortalExaminer

    if not isinstance(resolved, ResolvedPortalExaminer):
        raise ValueError("Invalid portal context")

    examiner = resolved.examiner
    exam = resolved.examination
    subject = resolved.subject
    exam_label_str = examination_label(exam)
    reference_number = _appointment_reference_number(
        examination_id=int(exam.id),
        subject_code=subject_display_code(subject) or subject.code or "",
        entity_id=examiner.id,
    )
    examiner_type = examiner.examiner_type
    if not isinstance(examiner_type, ExaminerType):
        examiner_type = ExaminerType(str(examiner_type))

    context = _base_appointment_context(
        examination_label_str=exam_label_str,
        invitee_name=examiner.name,
        phone_number=examiner.phone_number or "",
        examiner_type=examiner_type,
        examiner_type_label=_examiner_type_label(examiner_type),
        subject=subject,
        region=examiner.region.value if isinstance(examiner.region, Region) else str(examiner.region),
        coordination_date=None,
    )
    if session is not None:
        context.update(
            await _build_appointment_fee_context(
                session,
                examination_id=int(exam.id),
                examiner_type=examiner_type,
                region=examiner.region,
                subject_id=int(subject.id),
            )
        )

    pdf_bytes = await asyncio.to_thread(
        _render_appointment_letter_pdf_sync,
        context=context,
        reference_number=reference_number,
    )
    fn = f"appointment_letter_{_sanitize_filename_part(examiner.name)}.pdf"
    return pdf_bytes, fn
