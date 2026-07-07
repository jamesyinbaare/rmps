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
from app.services.cohort_portal_release import (
    appointment_letter_pending_message,
    appointment_letter_pending_message_for_examiner,
    bank_details_pending_message,
    bank_details_pending_message_for_examiner,
    cohort_release_summary_fields,
    is_appointment_letter_available_for_examiner,
    is_bank_details_editable_for_examiner,
    release_display_fields_for_examiner,
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


async def is_appointment_letter_available(
    session: AsyncSession,
    examiner: Examiner,
    *,
    subject_id: int,
    examiner_accepted: bool = True,
) -> bool:
    return await is_appointment_letter_available_for_examiner(
        session,
        examination_id=int(examiner.examination_id),
        subject_id=subject_id,
        examiner_id=examiner.id,
        examiner_accepted=examiner_accepted,
    )


async def is_bank_details_editable(
    session: AsyncSession,
    examiner: Examiner,
    *,
    subject_id: int,
) -> bool:
    return await is_bank_details_editable_for_examiner(
        session,
        examination_id=int(examiner.examination_id),
        subject_id=subject_id,
        examiner_id=examiner.id,
    )


async def bank_fields_for_examiner(
    session: AsyncSession,
    examiner: Examiner,
    *,
    subject_id: int,
) -> dict:
    editable = await is_bank_details_editable(session, examiner, subject_id=subject_id)
    pending = await bank_details_pending_message_for_examiner(
        session,
        examination_id=int(examiner.examination_id),
        subject_id=subject_id,
        examiner_id=examiner.id,
    )
    return {
        "bank_details_editable_by_examiners": editable,
        "bank_details_available": editable,
        "bank_details_pending_message": pending,
    }


async def release_fields_for_examiner(
    session: AsyncSession,
    examiner: Examiner,
    *,
    subject_id: int,
    examiner_accepted: bool = True,
) -> dict:
    return await release_display_fields_for_examiner(
        session,
        examination_id=int(examiner.examination_id),
        subject_id=subject_id,
        examiner_id=examiner.id,
        examiner_accepted=examiner_accepted,
    )


async def assert_may_access_appointment_letter(
    session: AsyncSession,
    examiner: Examiner,
    *,
    subject_id: int,
) -> None:
    if not await is_appointment_letter_available(session, examiner, subject_id=subject_id):
        msg = await appointment_letter_pending_message_for_examiner(
            session,
            examination_id=int(examiner.examination_id),
            subject_id=subject_id,
            examiner_id=examiner.id,
        )
        raise ValueError(msg or "Appointment letter is not yet available.")


async def assert_may_access_bank_details(
    session: AsyncSession,
    examiner: Examiner,
    *,
    subject_id: int,
) -> None:
    if not await is_bank_details_editable(session, examiner, subject_id=subject_id):
        msg = await bank_details_pending_message_for_examiner(
            session,
            examination_id=int(examiner.examination_id),
            subject_id=subject_id,
            examiner_id=examiner.id,
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


def cohort_portal_release_response_fields(group) -> dict:
    return cohort_release_summary_fields(group)
