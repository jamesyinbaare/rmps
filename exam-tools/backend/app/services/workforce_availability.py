"""Availability confirmation for script checkers and data entry clerks."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    DataEntryClerk,
    ScriptChecker,
    WorkforceAvailabilityStatus,
)
from app.services.workforce_reference_code import ensure_workforce_reference_code


def workforce_availability_deadline_from_now() -> datetime:
    return datetime.utcnow() + timedelta(days=settings.examiner_invitation_response_deadline_days)


def can_respond_to_workforce_availability(
    person: ScriptChecker | DataEntryClerk,
    *,
    now: datetime | None = None,
) -> bool:
    if person.availability_status != WorkforceAvailabilityStatus.PENDING:
        return False
    if person.availability_deadline is None:
        return True
    check = now or datetime.utcnow()
    return person.availability_deadline >= check


def ensure_workforce_invite_deadline(person: ScriptChecker | DataEntryClerk) -> None:
    """Set respond-by deadline when an invite SMS is sent (if still pending)."""
    if person.availability_status != WorkforceAvailabilityStatus.PENDING:
        return
    if person.availability_deadline is None:
        person.availability_deadline = workforce_availability_deadline_from_now()


async def confirm_workforce_availability(
    session: AsyncSession,
    person: ScriptChecker | DataEntryClerk,
) -> None:
    if person.availability_status == WorkforceAvailabilityStatus.CONFIRMED:
        await ensure_workforce_reference_code(session, person)
        return
    if person.availability_status == WorkforceAvailabilityStatus.DECLINED:
        raise ValueError("You have already declined this assignment.")
    if not can_respond_to_workforce_availability(person):
        raise ValueError("The respond-by deadline for this invitation has passed.")
    now = datetime.utcnow()
    person.availability_status = WorkforceAvailabilityStatus.CONFIRMED
    person.availability_responded_at = now
    await ensure_workforce_reference_code(session, person)
    await session.flush()


async def decline_workforce_availability(
    session: AsyncSession,
    person: ScriptChecker | DataEntryClerk,
) -> None:
    if person.availability_status == WorkforceAvailabilityStatus.DECLINED:
        return
    if person.availability_status == WorkforceAvailabilityStatus.CONFIRMED:
        raise ValueError("You have already confirmed your availability.")
    if not can_respond_to_workforce_availability(person):
        raise ValueError("The respond-by deadline for this invitation has passed.")
    now = datetime.utcnow()
    person.availability_status = WorkforceAvailabilityStatus.DECLINED
    person.availability_responded_at = now
    await session.flush()


def require_workforce_portal_access(person: ScriptChecker | DataEntryClerk) -> None:
    if person.availability_status != WorkforceAvailabilityStatus.CONFIRMED:
        raise ValueError("Please confirm your availability before accessing the portal.")
