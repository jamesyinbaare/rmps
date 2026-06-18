"""Appointment letter and bank upload release policy."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    AppointmentLettersReleaseMode,
    Examiner,
    ExaminationExaminerPortalSettings,
)
from app.services.examiner_invitation import invitation_public_url


async def get_or_create_portal_settings(
    session: AsyncSession,
    examination_id: int,
) -> ExaminationExaminerPortalSettings:
    row = await session.get(ExaminationExaminerPortalSettings, examination_id)
    if row is not None:
        return row
    row = ExaminationExaminerPortalSettings(
        examination_id=examination_id,
        appointment_letters_release_enabled=False,
        appointment_letters_release_mode=AppointmentLettersReleaseMode.SCHEDULED_DATE.value,
        appointment_letters_release_at=None,
        examiner_bank_details_editable_by_examiners=False,
        updated_at=datetime.utcnow(),
    )
    session.add(row)
    await session.flush()
    return row


def _release_mode(row: ExaminationExaminerPortalSettings) -> AppointmentLettersReleaseMode:
    raw = row.appointment_letters_release_mode
    if isinstance(raw, AppointmentLettersReleaseMode):
        return raw
    try:
        return AppointmentLettersReleaseMode(str(raw))
    except ValueError:
        return AppointmentLettersReleaseMode.SCHEDULED_DATE


async def is_release_enabled(session: AsyncSession, examination_id: int) -> bool:
    row = await get_or_create_portal_settings(session, examination_id)
    return bool(row.appointment_letters_release_enabled)


async def is_appointment_letter_available(
    session: AsyncSession,
    examiner: Examiner,
) -> bool:
    row = await get_or_create_portal_settings(session, int(examiner.examination_id))
    if not row.appointment_letters_release_enabled:
        return False

    mode = _release_mode(row)
    if mode == AppointmentLettersReleaseMode.ON_ACCEPTANCE:
        return True

    release_at = row.appointment_letters_release_at
    if release_at is None:
        return False
    return datetime.utcnow() >= release_at


async def is_bank_details_editable(
    session: AsyncSession,
    examiner: Examiner,
) -> bool:
    row = await get_or_create_portal_settings(session, int(examiner.examination_id))
    return bool(row.examiner_bank_details_editable_by_examiners)


def bank_details_pending_message(*, editable: bool) -> str | None:
    if editable:
        return None
    return "Bank details entry has been disabled by the examination office."


def bank_fields_from_settings(row: ExaminationExaminerPortalSettings) -> dict:
    editable = bool(row.examiner_bank_details_editable_by_examiners)
    return {
        "bank_details_editable_by_examiners": editable,
        "bank_details_available": editable,
        "bank_details_pending_message": bank_details_pending_message(editable=editable),
    }


def appointment_letter_pending_message(
    *,
    release_enabled: bool,
    release_mode: AppointmentLettersReleaseMode,
    release_at: datetime | None,
    examiner_accepted: bool,
) -> str | None:
    if not release_enabled:
        return (
            "Your appointment letter will be available once released "
            "by the examination office."
        )

    if release_mode == AppointmentLettersReleaseMode.ON_ACCEPTANCE:
        if not examiner_accepted:
            return (
                "Confirm your availability first. Your appointment letter "
                "will be available on your profile after you accept."
            )
        return None

    if release_at is None:
        return (
            "Your appointment letter will be available once the examination "
            "office sets a release date."
        )
    if datetime.utcnow() >= release_at:
        return None
    return (
        f"Your appointment letter will be available on "
        f"{release_at.strftime('%d %b %Y at %H:%M')} UTC. You will receive an SMS when it is ready."
    )


async def assert_may_access_appointment_letter(session: AsyncSession, examiner: Examiner) -> None:
    if not await is_appointment_letter_available(session, examiner):
        row = await get_or_create_portal_settings(session, int(examiner.examination_id))
        msg = appointment_letter_pending_message(
            release_enabled=bool(row.appointment_letters_release_enabled),
            release_mode=_release_mode(row),
            release_at=row.appointment_letters_release_at,
            examiner_accepted=True,
        )
        raise ValueError(msg or "Appointment letter is not yet available.")


async def assert_may_access_bank_details(session: AsyncSession, examiner: Examiner) -> None:
    if not await is_bank_details_editable(session, examiner):
        row = await get_or_create_portal_settings(session, int(examiner.examination_id))
        msg = bank_details_pending_message(
            editable=bool(row.examiner_bank_details_editable_by_examiners),
        )
        raise ValueError(msg or "Bank details entry is not available.")


async def load_examiner_for_portal(session: AsyncSession, examiner_id: UUID) -> Examiner | None:
    stmt = (
        select(Examiner)
        .where(Examiner.id == examiner_id)
        .options(selectinload(Examiner.subjects))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def examiner_portal_link(examiner: Examiner) -> str:
    return invitation_public_url(examiner.portal_token)
