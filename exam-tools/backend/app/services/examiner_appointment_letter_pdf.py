"""PDF generation for examiner appointment letters (official CTVET letter layout)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ExaminerAllowanceType,
    ExaminerInvitation,
    ExaminerType,
    Examination,
    Region,
    Subject,
    SubjectMarkingGroup,
)
from app.services.certificate_confirmation_response_pdf import render_certificate_style_letter_pdf
from app.services.examiner_appointment_letter_reference import resolve_appointment_letter_reference_number
from app.services.examiner_appointment_letter_settings import (
    get_settings_row,
    require_letter_date_for_pdf,
    resolve_signatory_context,
)
from app.services.examiner_compensation import (
    MarkingRateMap,
    RoleAllowanceMap,
    TravelRateMap,
    TravelRoleFactorMap,
    TravelZoneMap,
    TravelZoneNameMap,
    compute_travel_compensation,
    format_ghs_amount,
    load_marking_rates_map,
    load_role_allowance_rates_map,
    load_travel_rates_map,
    load_travel_role_factors_map,
    load_travel_zones_map,
    parse_region_stored,
)
from app.services.coordination_schedule import (
    format_appointment_letter_coordination_dates,
    format_appointment_letter_date,
    format_appointment_letter_time,
)
from app.services.exam_official_export import examination_label
from app.services.examiner_invitation import _examiner_type_label, subject_display_code
from app.services.pdf_generator import render_html
from app.services.subject_marking_group import get_examiner_marking_group

APPOINTMENT_CONTENT_TEMPLATE = "examiner-invitation/appointment-letter-examiner.html"
DEFAULT_COORDINATION_VENUE = "Conference Room of the Ghana TVET Service Headquarters, East Legon"
DUMMY_APPOINTMENT_LETTEE_NAME = "___________"

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


def _build_coordination_letter_context(
    *,
    start_date: datetime | None,
    start_time,
    end_date: datetime | None,
    end_time,
    venue: str | None,
    marking_start_date: datetime | None = None,
    marking_end_date: datetime | None = None,
) -> dict[str, str | None]:
    venue_trimmed = (venue or "").strip() or None
    return {
        "coordination_date": format_appointment_letter_coordination_dates(start_date, end_date),
        "coordination_start_time": format_appointment_letter_time(start_time),
        "coordination_end_time": format_appointment_letter_time(end_time),
        "coordination_venue": venue_trimmed or DEFAULT_COORDINATION_VENUE,
        "marking_start_date": format_appointment_letter_date(marking_start_date),
        "marking_end_date": format_appointment_letter_date(marking_end_date),
    }


def _empty_coordination_letter_context() -> dict[str, str | None]:
    return {
        "coordination_date": None,
        "coordination_start_time": None,
        "coordination_end_time": None,
        "coordination_venue": DEFAULT_COORDINATION_VENUE,
        "marking_start_date": None,
        "marking_end_date": None,
    }


async def _load_cohort_coordination_for_letter(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID | None = None,
) -> dict[str, str | None]:
    if examiner_id is not None:
        group = await get_examiner_marking_group(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
            examiner_id=examiner_id,
        )
        if group is not None:
            return _build_coordination_letter_context(
                start_date=group.get("coordination_start_date"),
                start_time=group.get("coordination_start_time"),
                end_date=group.get("coordination_end_date"),
                end_time=group.get("coordination_end_time"),
                venue=group.get("coordination_venue"),
                marking_start_date=group.get("marking_start_date"),
                marking_end_date=group.get("marking_end_date"),
            )

    default_group = await _load_default_marking_group(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
    )
    if default_group is not None:
        return _build_coordination_letter_context(
            start_date=default_group.coordination_start_date,
            start_time=default_group.coordination_start_time,
            end_date=default_group.coordination_end_date,
            end_time=default_group.coordination_end_time,
            venue=default_group.coordination_venue,
            marking_start_date=default_group.marking_start_date,
            marking_end_date=default_group.marking_end_date,
        )
    return _empty_coordination_letter_context()


def _normalize_coordination_venue(venue: str | None) -> str:
    trimmed = (venue or "").strip()
    return trimmed or DEFAULT_COORDINATION_VENUE


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
    return format_ghs_amount(value)


def _build_appointment_fee_context_from_rates(
    *,
    role_rates: RoleAllowanceMap,
    marking_rates: MarkingRateMap,
    travel_rates: TravelRateMap,
    travel_zones: TravelZoneMap,
    travel_zone_names: TravelZoneNameMap,
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
    travel_comp = compute_travel_compensation(
        region=region,
        examiner_type=examiner_type,
        travel_rates=travel_rates,
        travel_zones=travel_zones,
        travel_zone_names=travel_zone_names,
        travel_role_factors=travel_role_factors,
    )
    travel_and_transport_amount = _format_ghs_display(
        travel_comp.payable_ghs if travel_comp.base_ghs > 0 else None
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
    travel_zones, travel_zone_names = await load_travel_zones_map(session, examination_id)
    travel_role_factors = await load_travel_role_factors_map(session, examination_id)

    return _build_appointment_fee_context_from_rates(
        role_rates=role_rates,
        marking_rates=marking_rates,
        travel_rates=travel_rates,
        travel_zones=travel_zones,
        travel_zone_names=travel_zone_names,
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
    letter_date: datetime,
) -> bytes:
    body_html = _render_appointment_letter_body_html(context=context)
    return render_certificate_style_letter_pdf(
        letter_body_html=body_html,
        reference_number=reference_number,
        letter_date=letter_date,
    )


def _sanitize_filename_part(s: str) -> str:
    return "".join(c for c in s if c.isalnum() or c in ("_", "-"))


async def _load_signatory_context(session: AsyncSession, examination_id: int) -> dict[str, object]:
    row = await get_settings_row(session, examination_id)
    return resolve_signatory_context(row)


async def _load_letter_date(session: AsyncSession, examination_id: int) -> datetime:
    row = await get_settings_row(session, examination_id)
    return require_letter_date_for_pdf(row)


def _base_appointment_context(
    *,
    examination_label_str: str,
    invitee_name: str,
    phone_number: str,
    examiner_type: ExaminerType,
    examiner_type_label: str,
    subject: Subject,
    region: str,
    coordination_context: dict[str, str | None],
    signatory_context: dict[str, object] | None = None,
) -> dict[str, object]:
    subj_code = subject_display_code(subject)
    subject_label = f"{subject.name} ({subj_code})" if subj_code else subject.name
    resolved_signatory = signatory_context or resolve_signatory_context(None)
    return {
        "examination_label": examination_label_str,
        "examination_label_upper": examination_label_str.upper(),
        "invitee_name": invitee_name,
        "phone_number": phone_number,
        "examiner_type_label": examiner_type_label,
        "subject_label": subject_label,
        "subject_name": subject.name,
        "region": region,
        **coordination_context,
        "examiner_type": examiner_type.value,
        **resolved_signatory,
        **_appointment_role_context(examiner_type),
    }


async def _load_default_marking_group(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> SubjectMarkingGroup | None:
    return (
        await session.execute(
            select(SubjectMarkingGroup).where(
                SubjectMarkingGroup.examination_id == examination_id,
                SubjectMarkingGroup.subject_id == subject_id,
                SubjectMarkingGroup.is_default.is_(True),
            )
        )
    ).scalar_one_or_none()


async def build_dummy_appointment_letter_preview_pdf(
    session: AsyncSession,
    *,
    examination_id: int,
    subject: Subject,
    examiner_type: ExaminerType,
    reference_number: str,
) -> tuple[bytes, str]:
    """Build a preview appointment letter with placeholder invitee name."""
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")

    coordination_context = await _load_cohort_coordination_for_letter(
        session,
        examination_id=examination_id,
        subject_id=int(subject.id),
    )

    exam_label_str = examination_label(exam)
    signatory_context = await _load_signatory_context(session, examination_id)
    context = _base_appointment_context(
        examination_label_str=exam_label_str,
        invitee_name=DUMMY_APPOINTMENT_LETTEE_NAME,
        phone_number="",
        examiner_type=examiner_type,
        examiner_type_label=_examiner_type_label(examiner_type),
        subject=subject,
        region=Region.GREATER_ACCRA.value,
        coordination_context=coordination_context,
        signatory_context=signatory_context,
    )
    context.update(
        await _build_appointment_fee_context(
            session,
            examination_id=examination_id,
            examiner_type=examiner_type,
            region=Region.GREATER_ACCRA,
            subject_id=int(subject.id),
        )
    )

    pdf_bytes = await asyncio.to_thread(
        _render_appointment_letter_pdf_sync,
        context=context,
        reference_number=reference_number,
        letter_date=await _load_letter_date(session, examination_id),
    )
    subj_code = subject_display_code(subject) or subject.code or "subject"
    role_part = _sanitize_filename_part(examiner_type.value)
    fn = f"appointment_letter_preview_{_sanitize_filename_part(subj_code)}_{role_part}.pdf"
    return pdf_bytes, fn


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
    if session is not None:
        coordination_context = await _load_cohort_coordination_for_letter(
            session,
            examination_id=int(exam.id),
            subject_id=int(subject.id),
            examiner_id=inv.examiner_id,
        )
    else:
        coordination_context = _build_coordination_letter_context(
            start_date=inv.coordination_start_date,
            start_time=inv.coordination_start_time,
            end_date=inv.coordination_end_date,
            end_time=inv.coordination_end_time,
            venue=inv.coordination_venue,
        )
    examiner_type = inv.examiner_type
    if not isinstance(examiner_type, ExaminerType):
        examiner_type = ExaminerType(str(examiner_type))

    if session is not None:
        reference_number = await resolve_appointment_letter_reference_number(
            session,
            examination_id=int(exam.id),
            subject_id=int(subject.id),
            examiner_type=examiner_type,
            subject_code=subject_display_code(subject) or subject.code or "",
            entity_id=inv.id,
        )
    else:
        from app.services.examiner_appointment_letter_reference import appointment_reference_number_fallback

        reference_number = appointment_reference_number_fallback(
            examination_id=int(exam.id),
            subject_code=subject_display_code(subject) or subject.code or "",
            entity_id=inv.id,
        )

    context = _base_appointment_context(
        examination_label_str=exam_label_str,
        invitee_name=inv.name,
        phone_number=inv.phone_number,
        examiner_type=examiner_type,
        examiner_type_label=_examiner_type_label(examiner_type),
        subject=subject,
        region=inv.region.value,
        coordination_context=coordination_context,
        signatory_context=await _load_signatory_context(session, int(exam.id)) if session is not None else None,
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

    letter_date = (
        await _load_letter_date(session, int(exam.id))
        if session is not None
        else datetime.now(timezone.utc)
    )

    pdf_bytes = await asyncio.to_thread(
        _render_appointment_letter_pdf_sync,
        context=context,
        reference_number=reference_number,
        letter_date=letter_date,
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
    examiner_type = examiner.examiner_type
    if not isinstance(examiner_type, ExaminerType):
        examiner_type = ExaminerType(str(examiner_type))

    if session is not None:
        reference_number = await resolve_appointment_letter_reference_number(
            session,
            examination_id=int(exam.id),
            subject_id=int(subject.id),
            examiner_type=examiner_type,
            subject_code=subject_display_code(subject) or subject.code or "",
            entity_id=examiner.id,
        )
    else:
        from app.services.examiner_appointment_letter_reference import appointment_reference_number_fallback

        reference_number = appointment_reference_number_fallback(
            examination_id=int(exam.id),
            subject_code=subject_display_code(subject) or subject.code or "",
            entity_id=examiner.id,
        )

    coordination_context = (
        await _load_cohort_coordination_for_letter(
            session,
            examination_id=int(exam.id),
            subject_id=int(subject.id),
            examiner_id=examiner.id,
        )
        if session is not None
        else _empty_coordination_letter_context()
    )

    context = _base_appointment_context(
        examination_label_str=exam_label_str,
        invitee_name=examiner.name,
        phone_number=examiner.phone_number or "",
        examiner_type=examiner_type,
        examiner_type_label=_examiner_type_label(examiner_type),
        subject=subject,
        region=examiner.region.value if isinstance(examiner.region, Region) else str(examiner.region),
        coordination_context=coordination_context,
        signatory_context=await _load_signatory_context(session, int(exam.id)) if session is not None else None,
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

    letter_date = (
        await _load_letter_date(session, int(exam.id))
        if session is not None
        else datetime.now(timezone.utc)
    )

    pdf_bytes = await asyncio.to_thread(
        _render_appointment_letter_pdf_sync,
        context=context,
        reference_number=reference_number,
        letter_date=letter_date,
    )
    fn = f"appointment_letter_{_sanitize_filename_part(examiner.name)}.pdf"
    return pdf_bytes, fn
