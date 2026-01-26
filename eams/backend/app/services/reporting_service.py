"""Service for generating reports."""
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AcceptanceStatus,
    AllocationStatus,
    ExaminerAcceptance,
    ExaminerAllocation,
    MarkingCycle,
)


async def generate_allocation_report(
    session: AsyncSession,
    cycle_id: UUID,
    subject_id: UUID,
) -> dict:
    """
    Generate allocation report for a cycle and subject.

    Args:
        session: Database session
        cycle_id: Marking cycle UUID
        subject_id: Subject UUID

    Returns:
        Dictionary with allocation summary and details
    """
    # Get cycle
    cycle_stmt = select(MarkingCycle).where(MarkingCycle.id == cycle_id)
    cycle_result = await session.execute(cycle_stmt)
    cycle = cycle_result.scalar_one_or_none()

    if not cycle:
        raise ValueError(f"Marking cycle {cycle_id} not found")

    # Get allocations
    allocation_stmt = select(ExaminerAllocation).where(
        ExaminerAllocation.cycle_id == cycle_id,
        ExaminerAllocation.subject_id == subject_id,
    )
    allocation_result = await session.execute(allocation_stmt)
    allocations = allocation_result.scalars().all()

    # Count by status
    approved_count = sum(1 for a in allocations if a.allocation_status == AllocationStatus.APPROVED)
    waitlisted_count = sum(1 for a in allocations if a.allocation_status == AllocationStatus.WAITLISTED)
    rejected_count = sum(1 for a in allocations if a.allocation_status == AllocationStatus.REJECTED)

    # Get quota compliance
    approved_ids = [a.examiner_id for a in allocations if a.allocation_status == AllocationStatus.APPROVED]
    from app.services.quota_validator import validate_quota_compliance

    is_compliant, violations = await validate_quota_compliance(session, cycle_id, subject_id, approved_ids)

    # Build examiner list with scores and ranks
    examiner_list = []
    for allocation in sorted(allocations, key=lambda x: x.rank or 0):
        examiner_list.append({
            "examiner_id": str(allocation.examiner_id),
            "score": allocation.score,
            "rank": allocation.rank,
            "status": allocation.allocation_status.value,
        })

    return {
        "cycle_id": str(cycle_id),
        "subject_id": str(subject_id),
        "year": cycle.year,
        "total_required": cycle.total_required,
        "summary": {
            "approved": approved_count,
            "waitlisted": waitlisted_count,
            "rejected": rejected_count,
            "total": len(allocations),
        },
        "quota_compliance": {
            "compliant": is_compliant,
            "violations": violations,
        },
        "examiners": examiner_list,
    }


async def generate_examiner_history_report(
    session: AsyncSession,
    examiner_id: UUID,
) -> dict:
    """
    Generate examiner history report.

    Args:
        session: Database session
        examiner_id: Examiner UUID

    Returns:
        Dictionary with examiner history
    """
    from app.models import Examiner, ExaminerSubjectEligibility, ExaminerSubjectHistory

    # Get examiner
    examiner_stmt = select(Examiner).where(Examiner.id == examiner_id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        raise ValueError(f"Examiner {examiner_id} not found")

    # Get subject eligibility history
    eligibility_stmt = select(ExaminerSubjectEligibility).where(
        ExaminerSubjectEligibility.examiner_id == examiner_id
    )
    eligibility_result = await session.execute(eligibility_stmt)
    eligibilities = eligibility_result.scalars().all()

    # Get subject history
    history_stmt = select(ExaminerSubjectHistory).where(
        ExaminerSubjectHistory.examiner_id == examiner_id
    )
    history_result = await session.execute(history_stmt)
    histories = history_result.scalars().all()

    # Get allocation history
    allocation_stmt = select(ExaminerAllocation).where(
        ExaminerAllocation.examiner_id == examiner_id
    ).order_by(ExaminerAllocation.allocated_at.desc())
    allocation_result = await session.execute(allocation_stmt)
    allocations = allocation_result.scalars().all()

    # Get acceptance history
    acceptance_stmt = select(ExaminerAcceptance).where(
        ExaminerAcceptance.examiner_id == examiner_id
    ).order_by(ExaminerAcceptance.notified_at.desc())
    acceptance_result = await session.execute(acceptance_stmt)
    acceptances = acceptance_result.scalars().all()

    return {
        "examiner_id": str(examiner_id),
        "examiner_name": examiner.full_name,
        "subject_eligibilities": [
            {
                "subject_id": str(elig.subject_id),
                "eligible": elig.eligible,
                "date_added": elig.date_added.isoformat() if elig.date_added else None,
            }
            for elig in eligibilities
        ],
        "subject_history": [
            {
                "subject_id": str(hist.subject_id),
                "times_marked": hist.times_marked,
                "last_marked_year": hist.last_marked_year,
            }
            for hist in histories
        ],
        "allocation_history": [
            {
                "cycle_id": str(alloc.cycle_id),
                "subject_id": str(alloc.subject_id),
                "year": None,  # Would need to join with cycle
                "status": alloc.allocation_status.value,
                "score": alloc.score,
                "rank": alloc.rank,
                "allocated_at": alloc.allocated_at.isoformat() if alloc.allocated_at else None,
            }
            for alloc in allocations
        ],
        "acceptance_history": [
            {
                "cycle_id": str(acc.cycle_id),
                "subject_id": str(acc.subject_id),
                "status": acc.status.value,
                "notified_at": acc.notified_at.isoformat() if acc.notified_at else None,
                "responded_at": acc.responded_at.isoformat() if acc.responded_at else None,
            }
            for acc in acceptances
        ],
    }
