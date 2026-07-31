"""Per-cohort appointment letter and bank details release policy for workforce exercise groups."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppointmentLettersReleaseMode, WorkforceExerciseGroup, WorkforceKind
from app.services.cohort_portal_release import (
    appointment_letter_pending_message,
    bank_details_pending_message,
)
from app.services.workforce_exercise_group import get_person_exercise_group

_DEFAULT_PENDING_MESSAGE = (
    "Your appointment letter will be available once released by the examination office."
)


def _parse_release_mode(raw: str | AppointmentLettersReleaseMode) -> AppointmentLettersReleaseMode:
    if isinstance(raw, AppointmentLettersReleaseMode):
        return raw
    try:
        return AppointmentLettersReleaseMode(str(raw))
    except ValueError:
        return AppointmentLettersReleaseMode.SCHEDULED_DATE


def is_cohort_appointment_letter_released(
    group: WorkforceExerciseGroup,
    *,
    now: datetime | None = None,
    person_accepted: bool = True,
) -> bool:
    if not group.appointment_letters_release_enabled:
        return False
    mode = _parse_release_mode(group.appointment_letters_release_mode)
    if mode == AppointmentLettersReleaseMode.ON_ACCEPTANCE:
        return person_accepted
    release_at = group.appointment_letters_release_at
    if release_at is None:
        return False
    current = now or datetime.utcnow()
    return current >= release_at


def is_cohort_bank_details_editable(group: WorkforceExerciseGroup) -> bool:
    return bool(group.bank_details_editable)


def _appointment_letter_pending_for_group(
    group: WorkforceExerciseGroup,
    *,
    person_accepted: bool,
) -> str | None:
    release_enabled = bool(group.appointment_letters_release_enabled)
    mode = _parse_release_mode(group.appointment_letters_release_mode)
    return appointment_letter_pending_message(
        release_enabled=release_enabled,
        release_mode=mode,
        release_at=group.appointment_letters_release_at,
        examiner_accepted=person_accepted,
    )


async def is_appointment_letter_available_for_person(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    person_id: UUID,
    person_accepted: bool = True,
) -> bool:
    group = await get_person_exercise_group(
        session,
        examination_id=examination_id,
        kind=kind,
        person_id=person_id,
    )
    if group is None:
        return False
    return is_cohort_appointment_letter_released(group, person_accepted=person_accepted)


async def is_bank_details_editable_for_person(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    person_id: UUID,
) -> bool:
    group = await get_person_exercise_group(
        session,
        examination_id=examination_id,
        kind=kind,
        person_id=person_id,
    )
    if group is None:
        return False
    return is_cohort_bank_details_editable(group)


async def appointment_letter_pending_message_for_person(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    person_id: UUID,
    person_accepted: bool = True,
) -> str | None:
    group = await get_person_exercise_group(
        session,
        examination_id=examination_id,
        kind=kind,
        person_id=person_id,
    )
    if group is None:
        return _DEFAULT_PENDING_MESSAGE
    if is_cohort_appointment_letter_released(group, person_accepted=person_accepted):
        return None
    return _appointment_letter_pending_for_group(group, person_accepted=person_accepted) or _DEFAULT_PENDING_MESSAGE


async def bank_details_pending_message_for_person(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    person_id: UUID,
) -> str | None:
    editable = await is_bank_details_editable_for_person(
        session,
        examination_id=examination_id,
        kind=kind,
        person_id=person_id,
    )
    return bank_details_pending_message(editable=editable)


def cohort_release_summary_fields(group: WorkforceExerciseGroup) -> dict:
    mode = _parse_release_mode(group.appointment_letters_release_mode)
    return {
        "appointment_letters_release_enabled": bool(group.appointment_letters_release_enabled),
        "appointment_letters_release_mode": mode.value,
        "appointment_letters_release_at": group.appointment_letters_release_at,
        "bank_details_editable": bool(group.bank_details_editable),
    }


def _format_time(value) -> str | None:
    if value is None:
        return None
    return value.strftime("%H:%M")


def _format_date(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.date().isoformat()


async def release_display_fields_for_person(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    person_id: UUID,
    person_accepted: bool = True,
) -> dict:
    group = await get_person_exercise_group(
        session,
        examination_id=examination_id,
        kind=kind,
        person_id=person_id,
    )
    if group is None:
        return {
            "appointment_letters_release_enabled": False,
            "appointment_letters_available": False,
            "appointment_letters_release_mode": AppointmentLettersReleaseMode.SCHEDULED_DATE.value,
            "appointment_letters_release_at": None,
            "appointment_letters_pending_message": _DEFAULT_PENDING_MESSAGE,
            "bank_details_editable": False,
            "bank_details_pending_message": bank_details_pending_message(editable=False),
            "exercise_start_date": None,
            "work_start_time": None,
            "work_end_time": None,
            "venue": None,
            "cohort_name": None,
        }

    summary = cohort_release_summary_fields(group)
    available = is_cohort_appointment_letter_released(group, person_accepted=person_accepted)
    pending = (
        None
        if available
        else (_appointment_letter_pending_for_group(group, person_accepted=person_accepted) or _DEFAULT_PENDING_MESSAGE)
    )
    bank_editable = is_cohort_bank_details_editable(group)
    return {
        **summary,
        "appointment_letters_available": available,
        "appointment_letters_pending_message": pending,
        "bank_details_pending_message": bank_details_pending_message(editable=bank_editable),
        "exercise_start_date": _format_date(group.exercise_start_date),
        "work_start_time": _format_time(group.work_start_time),
        "work_end_time": _format_time(group.work_end_time),
        "venue": group.venue,
        "cohort_name": group.name,
    }
