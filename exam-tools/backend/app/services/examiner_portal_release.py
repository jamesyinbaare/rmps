"""Appointment letter and bank upload release after coordination ends."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Examiner, ExaminerInvitation, ExaminationExaminerPortalSettings
from app.services.coordination_schedule import coordination_end_at
from app.services.examiner_invitation import invitation_public_url
from app.services.subject_marking_group import get_examiner_marking_groups


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
        updated_at=datetime.utcnow(),
    )
    session.add(row)
    await session.flush()
    return row


async def is_release_enabled(session: AsyncSession, examination_id: int) -> bool:
    row = await get_or_create_portal_settings(session, examination_id)
    return bool(row.appointment_letters_release_enabled)


def _max_end_at(candidates: list[datetime | None]) -> datetime | None:
    vals = [c for c in candidates if c is not None]
    return max(vals) if vals else None


async def resolve_coordination_end_at(session: AsyncSession, examiner: Examiner) -> datetime | None:
    subject_id = examiner.subjects[0].subject_id if examiner.subjects else None
    ends: list[datetime | None] = []

    if subject_id is not None:
        groups = await get_examiner_marking_groups(
            session,
            examination_id=int(examiner.examination_id),
            subject_id=int(subject_id),
            examiner_id=examiner.id,
        )
        for group in groups:
            if group.get("is_default"):
                continue
            ends.append(
                coordination_end_at(
                    group.get("coordination_end_date"),
                    group.get("coordination_end_time"),
                )
            )
        if not ends:
            for group in groups:
                ends.append(
                    coordination_end_at(
                        group.get("coordination_end_date"),
                        group.get("coordination_end_time"),
                    )
                )

    stmt = select(ExaminerInvitation).where(ExaminerInvitation.examiner_id == examiner.id)
    inv = (await session.execute(stmt)).scalar_one_or_none()
    if inv is not None:
        ends.append(
            coordination_end_at(
                inv.coordination_end_date,
                inv.coordination_end_time,
            )
        )

    return _max_end_at(ends)


async def is_appointment_letter_available(
    session: AsyncSession,
    examiner: Examiner,
) -> bool:
    if not await is_release_enabled(session, int(examiner.examination_id)):
        return False
    end_at = await resolve_coordination_end_at(session, examiner)
    if end_at is None:
        return False
    return datetime.utcnow() >= end_at


def appointment_letter_pending_message(end_at: datetime | None, *, release_enabled: bool) -> str | None:
    if not release_enabled:
        return (
            "Your appointment letter and bank details will be available after your coordination "
            "period ends, once released by the examination office."
        )
    if end_at is None:
        return (
            "Your appointment letter will be available after your coordination period ends, "
            "once it is scheduled."
        )
    if datetime.utcnow() >= end_at:
        return None
    return (
        f"Your appointment letter and bank details will be available after your coordination "
        f"ends ({end_at.strftime('%d %b %Y')}). You will receive an SMS when they are ready."
    )


async def assert_may_access_letter_and_bank(session: AsyncSession, examiner: Examiner) -> None:
    if not await is_appointment_letter_available(session, examiner):
        end_at = await resolve_coordination_end_at(session, examiner)
        enabled = await is_release_enabled(session, int(examiner.examination_id))
        msg = appointment_letter_pending_message(end_at, release_enabled=enabled)
        raise ValueError(msg or "Appointment letter is not yet available.")


async def load_examiner_for_portal(session: AsyncSession, examiner_id: UUID) -> Examiner | None:
    stmt = (
        select(Examiner)
        .where(Examiner.id == examiner_id)
        .options(selectinload(Examiner.subjects))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def examiner_portal_link(examiner: Examiner) -> str:
    return invitation_public_url(examiner.portal_token)
