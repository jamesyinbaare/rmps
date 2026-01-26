"""Service for examiner allocation logic."""
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AllocationAuditLog,
    AllocationStatus,
    Examiner,
    ExaminerAllocation,
    ExaminerStatus,
    ExaminerSubjectEligibility,
    MarkingCycle,
    MarkingCycleStatus,
)
from app.services.allocation_scoring import calculate_examiner_score
from app.services.quota_validator import validate_quota_compliance

logger = logging.getLogger(__name__)


async def create_eligibility_pool(
    session: AsyncSession,
    cycle_id: UUID,
    subject_id: UUID,
) -> list[Examiner]:
    """
    Create eligibility pool for allocation.

    Gathers all eligible examiners per subject:
    - ExaminerSubjectEligibility.eligible = True
    - Excludes suspended/inactive examiners
    - Includes both existing and new applicants

    Args:
        session: Database session
        cycle_id: Marking cycle UUID
        subject_id: Subject UUID

    Returns:
        List of Examiner records
    """
    # Get cycle to determine year
    cycle_stmt = select(MarkingCycle).where(MarkingCycle.id == cycle_id)
    cycle_result = await session.execute(cycle_stmt)
    cycle = cycle_result.scalar_one_or_none()

    if not cycle:
        raise ValueError(f"Marking cycle {cycle_id} not found")

    # Get all eligible examiners for this subject
    eligibility_stmt = (
        select(Examiner)
        .join(ExaminerSubjectEligibility, Examiner.id == ExaminerSubjectEligibility.examiner_id)
        .where(
            ExaminerSubjectEligibility.subject_id == subject_id,
            ExaminerSubjectEligibility.eligible == True,  # noqa: E712
            Examiner.status == ExaminerStatus.ACTIVE,
        )
    )
    result = await session.execute(eligibility_stmt)
    examiners = result.scalars().all()

    return list(examiners)


async def run_allocation(
    session: AsyncSession,
    cycle_id: UUID,
    subject_id: UUID,
    allocated_by_user_id: UUID,
) -> dict[str, any]:
    """
    Run allocation process for a marking cycle and subject.

    Process:
    1. Get eligibility pool
    2. Score and rank all examiners
    3. Determine capacity and experience ratio
    4. Iterate ranked list:
       - Apply experience ratio (70% experienced, 30% new)
       - Validate quota constraints before approval
       - Allocate as approved/waitlisted/rejected
    5. Create ExaminerAllocation records
    6. Log allocation actions

    Args:
        session: Database session
        cycle_id: Marking cycle UUID
        subject_id: Subject UUID
        allocated_by_user_id: User UUID who is running allocation

    Returns:
        Dictionary with allocation results
    """
    # Get cycle
    cycle_stmt = select(MarkingCycle).where(MarkingCycle.id == cycle_id)
    cycle_result = await session.execute(cycle_stmt)
    cycle = cycle_result.scalar_one_or_none()

    if not cycle:
        raise ValueError(f"Marking cycle {cycle_id} not found")

    if cycle.status != MarkingCycleStatus.OPEN:
        raise ValueError(f"Marking cycle must be OPEN, current status: {cycle.status}")

    # Get eligibility pool
    examiners = await create_eligibility_pool(session, cycle_id, subject_id)

    if not examiners:
        return {
            "approved": 0,
            "waitlisted": 0,
            "rejected": 0,
            "message": "No eligible examiners found",
        }

    # Score and rank all examiners
    examiner_scores = []
    for examiner in examiners:
        score = await calculate_examiner_score(session, examiner.id, subject_id, cycle.year)
        examiner_scores.append((examiner, score))

    # Sort by score (descending)
    examiner_scores.sort(key=lambda x: x[1], reverse=True)

    # Determine capacity and experience ratio
    total_required = cycle.total_required
    experience_ratio = cycle.experience_ratio
    experienced_count = int(total_required * experience_ratio)
    new_count = total_required - experienced_count

    # Separate experienced and new examiners
    # Experienced = have history for this subject
    from app.models import ExaminerSubjectHistory

    experienced_examiners = []
    new_examiners = []

    for examiner, score in examiner_scores:
        history_stmt = select(ExaminerSubjectHistory).where(
            ExaminerSubjectHistory.examiner_id == examiner.id,
            ExaminerSubjectHistory.subject_id == subject_id,
            ExaminerSubjectHistory.times_marked > 0,
        )
        history_result = await session.execute(history_stmt)
        history = history_result.scalar_one_or_none()

        if history:
            experienced_examiners.append((examiner, score))
        else:
            new_examiners.append((examiner, score))

    # Allocate examiners
    approved_allocations = []
    waitlisted_allocations = []
    rejected_allocations = []

    # First, allocate experienced examiners
    experienced_allocated = 0
    for examiner, score in experienced_examiners:
        if experienced_allocated >= experienced_count:
            break

        # Check quota compliance
        proposed_ids = [a.examiner_id for a in approved_allocations] + [examiner.id]
        is_valid, violations = await validate_quota_compliance(session, cycle_id, subject_id, proposed_ids)

        if is_valid:
            allocation = ExaminerAllocation(
                examiner_id=examiner.id,
                cycle_id=cycle_id,
                subject_id=subject_id,
                score=score,
                rank=experienced_allocated + 1,
                allocation_status=AllocationStatus.APPROVED,
                allocated_by_user_id=allocated_by_user_id,
            )
            approved_allocations.append(allocation)
            experienced_allocated += 1
        else:
            # Quota violation, waitlist
            allocation = ExaminerAllocation(
                examiner_id=examiner.id,
                cycle_id=cycle_id,
                subject_id=subject_id,
                score=score,
                rank=len(approved_allocations) + len(waitlisted_allocations) + 1,
                allocation_status=AllocationStatus.WAITLISTED,
                allocated_by_user_id=allocated_by_user_id,
            )
            waitlisted_allocations.append(allocation)

    # Then, allocate new examiners
    new_allocated = 0
    for examiner, score in new_examiners:
        if new_allocated >= new_count:
            break

        # Check quota compliance
        proposed_ids = [a.examiner_id for a in approved_allocations] + [examiner.id]
        is_valid, violations = await validate_quota_compliance(session, cycle_id, subject_id, proposed_ids)

        if is_valid:
            allocation = ExaminerAllocation(
                examiner_id=examiner.id,
                cycle_id=cycle_id,
                subject_id=subject_id,
                score=score,
                rank=len(approved_allocations) + new_allocated + 1,
                allocation_status=AllocationStatus.APPROVED,
                allocated_by_user_id=allocated_by_user_id,
            )
            approved_allocations.append(allocation)
            new_allocated += 1
        else:
            # Quota violation, waitlist
            allocation = ExaminerAllocation(
                examiner_id=examiner.id,
                cycle_id=cycle_id,
                subject_id=subject_id,
                score=score,
                rank=len(approved_allocations) + len(waitlisted_allocations) + 1,
                allocation_status=AllocationStatus.WAITLISTED,
                allocated_by_user_id=allocated_by_user_id,
            )
            waitlisted_allocations.append(allocation)

    # Remaining examiners go to waitlist
    remaining_examiners = (
        experienced_examiners[experienced_allocated:] + new_examiners[new_allocated:]
    )
    for examiner, score in remaining_examiners:
        allocation = ExaminerAllocation(
            examiner_id=examiner.id,
            cycle_id=cycle_id,
            subject_id=subject_id,
            score=score,
            rank=len(approved_allocations) + len(waitlisted_allocations) + 1,
            allocation_status=AllocationStatus.WAITLISTED,
            allocated_by_user_id=allocated_by_user_id,
        )
        waitlisted_allocations.append(allocation)

    # Save all allocations
    for allocation in approved_allocations + waitlisted_allocations:
        session.add(allocation)

    # Update cycle status
    cycle.status = MarkingCycleStatus.ALLOCATED

    # Log allocation action
    audit_log = AllocationAuditLog(
        action_type="ALLOCATION_RUN",
        performed_by_user_id=allocated_by_user_id,
        cycle_id=cycle_id,
        subject_id=subject_id,
        details={
            "approved_count": len(approved_allocations),
            "waitlisted_count": len(waitlisted_allocations),
            "rejected_count": 0,
        },
    )
    session.add(audit_log)

    await session.commit()

    return {
        "approved": len(approved_allocations),
        "waitlisted": len(waitlisted_allocations),
        "rejected": 0,
        "message": f"Allocation completed: {len(approved_allocations)} approved, {len(waitlisted_allocations)} waitlisted",
    }


async def promote_from_waitlist(
    session: AsyncSession,
    cycle_id: UUID,
    subject_id: UUID,
    slot_count: int,
    promoted_by_user_id: UUID,
) -> dict[str, any]:
    """
    Promote examiners from waitlist to approved.

    Args:
        session: Database session
        cycle_id: Marking cycle UUID
        subject_id: Subject UUID
        slot_count: Number of slots to fill
        promoted_by_user_id: User UUID who is promoting

    Returns:
        Dictionary with promotion results
    """
    # Get waitlisted allocations, ordered by rank
    waitlist_stmt = (
        select(ExaminerAllocation)
        .where(
            ExaminerAllocation.cycle_id == cycle_id,
            ExaminerAllocation.subject_id == subject_id,
            ExaminerAllocation.allocation_status == AllocationStatus.WAITLISTED,
        )
        .order_by(ExaminerAllocation.rank)
        .limit(slot_count)
    )
    waitlist_result = await session.execute(waitlist_stmt)
    waitlisted = waitlist_result.scalars().all()

    promoted_count = 0
    for allocation in waitlisted:
        # Revalidate quota compliance
        # Get current approved allocations
        approved_stmt = select(ExaminerAllocation).where(
            ExaminerAllocation.cycle_id == cycle_id,
            ExaminerAllocation.subject_id == subject_id,
            ExaminerAllocation.allocation_status == AllocationStatus.APPROVED,
        )
        approved_result = await session.execute(approved_stmt)
        approved_allocations = approved_result.scalars().all()
        approved_ids = [a.examiner_id for a in approved_allocations]

        # Check if adding this examiner would violate quotas
        proposed_ids = approved_ids + [allocation.examiner_id]
        is_valid, violations = await validate_quota_compliance(session, cycle_id, subject_id, proposed_ids)

        if is_valid:
            allocation.allocation_status = AllocationStatus.APPROVED
            promoted_count += 1

            # Log promotion
            audit_log = AllocationAuditLog(
                action_type="WAITLIST_PROMOTION",
                performed_by_user_id=promoted_by_user_id,
                cycle_id=cycle_id,
                subject_id=subject_id,
                examiner_id=allocation.examiner_id,
                allocation_id=allocation.id,
                details={"previous_status": "WAITLISTED", "new_status": "APPROVED"},
            )
            session.add(audit_log)

    await session.commit()

    return {
        "promoted": promoted_count,
        "message": f"Promoted {promoted_count} examiner(s) from waitlist",
    }
