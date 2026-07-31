"""PDF generation for script checker and data entry clerk appointment letters."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    DataEntryClerk,
    Examination,
    ExaminationDataEntryClerkRate,
    ExaminationScriptCheckerRate,
    Region,
    ScriptChecker,
    WorkforceAvailabilityStatus,
    WorkforceExerciseGroup,
    WorkforceKind,
)
from app.services.certificate_confirmation_response_pdf import render_certificate_style_letter_pdf
from app.services.coordination_schedule import format_appointment_letter_date, format_appointment_letter_time
from app.services.exam_official_export import examination_label
from app.services.pdf_generator import render_html
from app.services.workforce_appointment_letter_settings import (
    get_settings_row,
    require_letter_date_for_pdf,
    resolve_signatory_context,
)
from app.services.workforce_exercise_group import (
    ensure_default_group,
    get_person_exercise_group,
    is_workforce_appointment_letter_released,
)

TEMPLATE_BY_KIND: dict[WorkforceKind, str] = {
    WorkforceKind.SCRIPT_CHECKER: "workforce/appointment-letter-script-checker.html",
    WorkforceKind.DATA_ENTRY_CLERK: "workforce/appointment-letter-data-entry-clerk.html",
}
ROLE_LABEL_BY_KIND: dict[WorkforceKind, str] = {
    WorkforceKind.SCRIPT_CHECKER: "Script Checker",
    WorkforceKind.DATA_ENTRY_CLERK: "Data Entry Clerk",
}
DUMMY_LETTER_NAME = "Sir/Madam"
_MONEY_QUANTIZE = Decimal("0.01")


class WorkforceAppointmentLetterError(ValueError):
    """Raised when a workforce appointment letter cannot be generated yet."""


def _kind_enum(kind: WorkforceKind | str) -> WorkforceKind:
    if isinstance(kind, WorkforceKind):
        return kind
    return WorkforceKind(str(kind))


def _trim(value: str | None) -> str:
    return (value or "").strip()


def _format_ghs(value: Decimal | None) -> str | None:
    if value is None:
        return None
    try:
        amount = Decimal(value)
    except (TypeError, ValueError):
        return None
    if amount <= 0:
        return None
    return f"{amount.quantize(_MONEY_QUANTIZE)} GHS"


def _format_tax_percent(value: Decimal | None) -> str:
    if value is None:
        return "10"
    amount = Decimal(value).normalize()
    return f"{amount:f}" if amount != amount.to_integral() else str(int(amount))


def _region_value(region: Region | str | None) -> str:
    if region is None:
        return ""
    return region.value if isinstance(region, Region) else str(region)


def _sanitize_filename_part(s: str) -> str:
    return "".join(c for c in s if c.isalnum() or c in ("_", "-")) or "letter"


async def _load_rate_context(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
) -> dict[str, Any]:
    if kind == WorkforceKind.SCRIPT_CHECKER:
        row = await session.get(ExaminationScriptCheckerRate, examination_id)
        return {
            "is_script_checker": True,
            "objective_rate_display": _format_ghs(row.objective_rate_per_script_ghs) if row else None,
            "subjective_rate_display": _format_ghs(row.subjective_rate_per_script_ghs) if row else None,
            "rate_display": None,
            "commuting_display": _format_ghs(row.commuting_allowance_ghs) if row else None,
            "lunch_display": _format_ghs(row.lunch_allowance_ghs) if row else None,
            "tax_percent_display": _format_tax_percent(row.withholding_tax_percent if row else None),
        }
    row = await session.get(ExaminationDataEntryClerkRate, examination_id)
    return {
        "is_script_checker": False,
        "objective_rate_display": None,
        "subjective_rate_display": None,
        "rate_display": _format_ghs(row.rate_per_script_ghs) if row else None,
        "commuting_display": _format_ghs(row.commuting_allowance_ghs) if row else None,
        "lunch_display": _format_ghs(row.lunch_allowance_ghs) if row else None,
        "tax_percent_display": _format_tax_percent(row.withholding_tax_percent if row else None),
    }


def _schedule_context(group: WorkforceExerciseGroup | None) -> dict[str, Any]:
    if group is None:
        return {
            "venue": None,
            "commencement_date_display": None,
            "work_start_display": None,
            "work_end_display": None,
        }
    return {
        "venue": (group.venue or "").strip() or None,
        "commencement_date_display": format_appointment_letter_date(group.exercise_start_date),
        "work_start_display": format_appointment_letter_time(group.work_start_time),
        "work_end_display": format_appointment_letter_time(group.work_end_time),
    }


def _render_letter_body_html(context: dict[str, Any], kind: WorkforceKind) -> str:
    templates_dir = Path(__file__).parent.parent / "templates"
    return render_html(context, TEMPLATE_BY_KIND[kind], templates_dir)


def _render_letter_pdf_sync(
    *,
    context: dict[str, Any],
    kind: WorkforceKind,
    reference_number: str,
    letter_date: datetime,
) -> bytes:
    body_html = _render_letter_body_html(context, kind)
    return render_certificate_style_letter_pdf(
        letter_body_html=body_html,
        reference_number=reference_number,
        letter_date=letter_date,
    )


async def _base_context(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    invitee_name: str,
    region: str,
    group: WorkforceExerciseGroup | None,
    settings_row,
) -> dict[str, Any]:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")
    exam_label = examination_label(exam)
    role_label = ROLE_LABEL_BY_KIND[kind]
    context: dict[str, Any] = {
        "examination_label": exam_label,
        "examination_label_upper": exam_label.upper(),
        "role_label": role_label,
        "role_label_upper": role_label.upper(),
        "invitee_name": invitee_name,
        "region": region,
        **_schedule_context(group),
        **resolve_signatory_context(settings_row),
    }
    context.update(await _load_rate_context(session, examination_id=examination_id, kind=kind))
    return context


async def build_dummy_preview_pdf(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind | str,
) -> tuple[bytes, str]:
    """Build a preview appointment letter with a placeholder invitee name (admin settings preview)."""
    kind_enum = _kind_enum(kind)
    settings_row = await get_settings_row(session, examination_id, kind_enum)
    group = await ensure_default_group(session, examination_id=examination_id, kind=kind_enum)
    context = await _base_context(
        session,
        examination_id=examination_id,
        kind=kind_enum,
        invitee_name=DUMMY_LETTER_NAME,
        region=Region.GREATER_ACCRA.value,
        group=group,
        settings_row=settings_row,
    )
    reference_number = (_trim(settings_row.reference_number) if settings_row else "") or "DRAFT"
    letter_date = (
        require_letter_date_for_pdf(settings_row)
        if settings_row is not None and settings_row.letter_date is not None
        else datetime.now(timezone.utc)
    )
    pdf_bytes = await asyncio.to_thread(
        _render_letter_pdf_sync,
        context=context,
        kind=kind_enum,
        reference_number=reference_number,
        letter_date=letter_date,
    )
    role_part = _sanitize_filename_part(kind_enum.value)
    fn = f"appointment_letter_preview_{role_part}.pdf"
    return pdf_bytes, fn


async def build_workforce_appointment_letter_pdf(
    session: AsyncSession,
    person: ScriptChecker | DataEntryClerk,
    kind: WorkforceKind | str,
) -> tuple[bytes, str]:
    """Build the appointment letter PDF for a confirmed, letter-released roster person."""
    kind_enum = _kind_enum(kind)

    if person.availability_status != WorkforceAvailabilityStatus.CONFIRMED:
        raise WorkforceAppointmentLetterError(
            "Confirm your availability before accessing your appointment letter."
        )

    examination_id = int(person.examination_id)
    group = await get_person_exercise_group(
        session,
        examination_id=examination_id,
        kind=kind_enum,
        person_id=person.id,
    )
    if not is_workforce_appointment_letter_released(group, availability_confirmed=True):
        raise WorkforceAppointmentLetterError(
            "Your appointment letter will be available once released by the examination office."
        )

    settings_row = await get_settings_row(session, examination_id, kind_enum)
    letter_date = require_letter_date_for_pdf(settings_row)
    reference_number = _trim(settings_row.reference_number) if settings_row else ""
    if not reference_number:
        raise WorkforceAppointmentLetterError(
            "Configure a reference number for this appointment letter before it can be issued."
        )

    context = await _base_context(
        session,
        examination_id=examination_id,
        kind=kind_enum,
        invitee_name=person.name,
        region=_region_value(person.region),
        group=group,
        settings_row=settings_row,
    )
    pdf_bytes = await asyncio.to_thread(
        _render_letter_pdf_sync,
        context=context,
        kind=kind_enum,
        reference_number=reference_number,
        letter_date=letter_date,
    )
    fn = f"appointment_letter_{_sanitize_filename_part(person.name)}.pdf"
    return pdf_bytes, fn
