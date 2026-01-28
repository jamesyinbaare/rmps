"""Service for examiner acceptance workflow."""
import logging
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AcceptanceStatus,
    AllocationStatus,
    AllocationAuditLog,
    ExaminerAcceptance,
    ExaminerAllocation,
)
from app.services.allocation_service import promote_from_waitlist

logger = logging.getLogger(__name__)


async def accept_allocation(
    session: AsyncSession,
    acceptance_id: UUID,
) -> ExaminerAcceptance:
    """
    Accept an allocation.

    Args:
        session: Database session
        acceptance_id: ExaminerAcceptance UUID

    Returns:
        Updated ExaminerAcceptance
    """
    stmt = select(ExaminerAcceptance).where(ExaminerAcceptance.id == acceptance_id)
    result = await session.execute(stmt)
    acceptance = result.scalar_one_or_none()

    if not acceptance:
        raise ValueError(f"Acceptance {acceptance_id} not found")

    if acceptance.status != AcceptanceStatus.PENDING:
        raise ValueError(f"Acceptance must be PENDING, current status: {acceptance.status}")

    # Check if deadline has passed
    if acceptance.response_deadline < datetime.utcnow():
        raise ValueError("Acceptance deadline has passed")

    acceptance.status = AcceptanceStatus.ACCEPTED
    acceptance.responded_at = datetime.utcnow()

    await session.commit()
    await session.refresh(acceptance)

    return acceptance


async def decline_allocation(
    session: AsyncSession,
    acceptance_id: UUID,
) -> ExaminerAcceptance:
    """
    Decline an allocation and release slot.

    Args:
        session: Database session
        acceptance_id: ExaminerAcceptance UUID

    Returns:
        Updated ExaminerAcceptance
    """
    stmt = select(ExaminerAcceptance).where(ExaminerAcceptance.id == acceptance_id)
    result = await session.execute(stmt)
    acceptance = result.scalar_one_or_none()

    if not acceptance:
        raise ValueError(f"Acceptance {acceptance_id} not found")

    if acceptance.status != AcceptanceStatus.PENDING:
        raise ValueError(f"Acceptance must be PENDING, current status: {acceptance.status}")

    acceptance.status = AcceptanceStatus.DECLINED
    acceptance.responded_at = datetime.utcnow()

    # Release slot - update allocation status to waitlisted
    allocation_stmt = select(ExaminerAllocation).where(ExaminerAllocation.id == acceptance.allocation_id)
    allocation_result = await session.execute(allocation_stmt)
    allocation = allocation_result.scalar_one_or_none()

    if allocation:
        allocation.allocation_status = AllocationStatus.WAITLISTED

        # Try to promote from waitlist
        try:
            await promote_from_waitlist(
                session,
                acceptance.cycle_id,
                acceptance.subject_id,
                1,  # Promote one to fill the slot
                UUID("00000000-0000-0000-0000-000000000000"),  # System user
            )
        except Exception as e:
            logger.warning(f"Failed to promote from waitlist after decline: {e}")

    await session.commit()
    await session.refresh(acceptance)

    return acceptance


async def process_expired_acceptances(
    session: AsyncSession,
    cycle_id: UUID,
) -> dict[str, any]:
    """
    Process expired acceptances (auto-decline).

    Args:
        session: Database session
        cycle_id: Marking cycle UUID

    Returns:
        Dictionary with processing results
    """
    # Find pending acceptances past deadline
    now = datetime.utcnow()
    expired_stmt = select(ExaminerAcceptance).where(
        ExaminerAcceptance.cycle_id == cycle_id,
        ExaminerAcceptance.status == AcceptanceStatus.PENDING,
        ExaminerAcceptance.response_deadline < now,
    )
    expired_result = await session.execute(expired_stmt)
    expired_acceptances = expired_result.scalars().all()

    expired_count = 0
    for acceptance in expired_acceptances:
        acceptance.status = AcceptanceStatus.EXPIRED
        acceptance.responded_at = now

        # Release slot
        allocation_stmt = select(ExaminerAllocation).where(ExaminerAllocation.id == acceptance.allocation_id)
        allocation_result = await session.execute(allocation_stmt)
        allocation = allocation_result.scalar_one_or_none()

        if allocation:
            allocation.allocation_status = AllocationStatus.WAITLISTED

        expired_count += 1

    # Try to promote from waitlist for each expired acceptance
    for acceptance in expired_acceptances:
        try:
            await promote_from_waitlist(
                session,
                acceptance.cycle_id,
                acceptance.subject_id,
                1,
                UUID("00000000-0000-0000-0000-000000000000"),  # System user
            )
        except Exception as e:
            logger.warning(f"Failed to promote from waitlist after expiration: {e}")

    await session.commit()

    return {
        "expired": expired_count,
        "message": f"Processed {expired_count} expired acceptance(s)",
    }
