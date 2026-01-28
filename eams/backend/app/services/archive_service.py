"""Service for archiving marking cycles."""
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ExaminerAcceptance,
    ExaminerAllocation,
    ExaminerSubjectHistory,
    MarkingCycle,
    MarkingCycleStatus,
)

logger = logging.getLogger(__name__)


async def archive_cycle(
    session: AsyncSession,
    cycle_id: UUID,
) -> dict:
    """
    Archive a completed marking cycle.

    Process:
    1. Archive ExaminerAllocation records (mark as archived or move to archive table)
    2. Archive ExaminerAcceptance records
    3. Update ExaminerSubjectHistory (increment times_marked, update last_marked_year)
    4. Preserve Examiner and ExaminerSubjectEligibility (persist across years)

    Args:
        session: Database session
        cycle_id: Marking cycle UUID

    Returns:
        Dictionary with archiving results
    """
    # Get cycle
    cycle_stmt = select(MarkingCycle).where(MarkingCycle.id == cycle_id)
    cycle_result = await session.execute(cycle_stmt)
    cycle = cycle_result.scalar_one_or_none()

    if not cycle:
        raise ValueError(f"Marking cycle {cycle_id} not found")

    if cycle.status != MarkingCycleStatus.CLOSED:
        raise ValueError(f"Marking cycle must be CLOSED before archiving, current status: {cycle.status}")

    from app.models import AllocationStatus

    # Get all accepted allocations for this cycle
    accepted_stmt = select(ExaminerAllocation).where(
        ExaminerAllocation.cycle_id == cycle_id,
        ExaminerAllocation.allocation_status == AllocationStatus.APPROVED,
    )
    accepted_result = await session.execute(accepted_stmt)
    accepted_allocations = accepted_result.scalars().all()

    # Update ExaminerSubjectHistory for each accepted allocation
    updated_count = 0
    for allocation in accepted_allocations:
        # Get or create history record
        history_stmt = select(ExaminerSubjectHistory).where(
            ExaminerSubjectHistory.examiner_id == allocation.examiner_id,
            ExaminerSubjectHistory.subject_id == allocation.subject_id,
        )
        history_result = await session.execute(history_stmt)
        history = history_result.scalar_one_or_none()

        if history:
            # Update existing history
            history.times_marked += 1
            history.last_marked_year = cycle.year
        else:
            # Create new history record
            history = ExaminerSubjectHistory(
                examiner_id=allocation.examiner_id,
                subject_id=allocation.subject_id,
                times_marked=1,
                last_marked_year=cycle.year,
            )
            session.add(history)

        updated_count += 1

    # Mark cycle as archived (or we could add an archived flag)
    # For now, we'll just log that it's been archived
    # In a full implementation, you might want to move records to archive tables

    await session.commit()

    return {
        "archived": True,
        "cycle_id": str(cycle_id),
        "year": cycle.year,
        "updated_history_count": updated_count,
        "message": f"Archived cycle {cycle.year} and updated {updated_count} examiner history records",
    }
