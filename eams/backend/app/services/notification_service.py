"""Service for sending notifications to examiners."""
import logging
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AcceptanceStatus,
    AllocationStatus,
    ExaminerAcceptance,
    ExaminerAllocation,
    MarkingCycle,
)

logger = logging.getLogger(__name__)


async def notify_approved_examiners(
    session: AsyncSession,
    cycle_id: UUID,
    subject_id: UUID,
) -> dict[str, any]:
    """
    Notify approved examiners and create acceptance records.

    Args:
        session: Database session
        cycle_id: Marking cycle UUID
        subject_id: Subject UUID

    Returns:
        Dictionary with notification results
    """
    # Get cycle to determine deadline
    cycle_stmt = select(MarkingCycle).where(MarkingCycle.id == cycle_id)
    cycle_result = await session.execute(cycle_stmt)
    cycle = cycle_result.scalar_one_or_none()

    if not cycle:
        raise ValueError(f"Marking cycle {cycle_id} not found")

    # Calculate response deadline (default: 7 days from now)
    response_deadline = cycle.acceptance_deadline or (datetime.utcnow() + timedelta(days=7))

    # Get all approved allocations for cycle/subject
    approved_stmt = select(ExaminerAllocation).where(
        ExaminerAllocation.cycle_id == cycle_id,
        ExaminerAllocation.subject_id == subject_id,
        ExaminerAllocation.allocation_status == AllocationStatus.APPROVED,
    )
    approved_result = await session.execute(approved_stmt)
    approved_allocations = approved_result.scalars().all()

    notified_count = 0
    for allocation in approved_allocations:
        # Check if acceptance record already exists
        existing_stmt = select(ExaminerAcceptance).where(
            ExaminerAcceptance.allocation_id == allocation.id,
        )
        existing_result = await session.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()

        if existing:
            continue  # Already notified

        # Create acceptance record
        acceptance = ExaminerAcceptance(
            examiner_id=allocation.examiner_id,
            cycle_id=cycle_id,
            subject_id=subject_id,
            allocation_id=allocation.id,
            status=AcceptanceStatus.PENDING,
            notified_at=datetime.utcnow(),
            response_deadline=response_deadline,
        )
        session.add(acceptance)
        notified_count += 1

        # TODO: Send email notification
        # await send_acceptance_email(session, acceptance)

    await session.commit()

    return {
        "notified": notified_count,
        "message": f"Notified {notified_count} examiner(s)",
    }
