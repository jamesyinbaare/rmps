"""Sum allocated booklet counts per examiner, subject, and paper from optimal allocation runs."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Allocation, AllocationAssignment, AllocationRun, AllocationRunStatus

AllocatedBookletsMap = dict[tuple[UUID, int, int], int]


async def load_allocated_booklets_map(
    session: AsyncSession,
    examination_id: int,
) -> AllocatedBookletsMap:
    """Aggregate booklet counts from the latest optimal run per allocation campaign."""
    alloc_stmt = select(Allocation).where(Allocation.examination_id == examination_id)
    allocations = list((await session.execute(alloc_stmt)).scalars().all())

    out: AllocatedBookletsMap = {}
    for allocation in allocations:
        subject_id = int(allocation.subject_id)
        paper_number = int(allocation.paper_number)
        run_stmt = (
            select(AllocationRun)
            .where(
                AllocationRun.allocation_id == allocation.id,
                AllocationRun.status == AllocationRunStatus.OPTIMAL,
            )
            .order_by(AllocationRun.created_at.desc())
            .limit(1)
        )
        run = (await session.execute(run_stmt)).scalar_one_or_none()
        if run is None:
            continue

        assign_stmt = select(AllocationAssignment).where(AllocationAssignment.allocation_run_id == run.id)
        for assignment in (await session.execute(assign_stmt)).scalars().all():
            key = (assignment.examiner_id, subject_id, paper_number)
            out[key] = out.get(key, 0) + int(assignment.booklet_count)
    return out
