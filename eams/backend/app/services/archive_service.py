"""Service for archiving subject examiners."""
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ExaminerAllocation,
    ExaminerSubjectHistory,
    MarkingCycleStatus,
    SubjectExaminer,
)

logger = logging.getLogger(__name__)


async def archive_subject_examiner(
    session: AsyncSession,
    subject_examiner_id: UUID,
) -> dict:
    """
    Archive a completed subject examiner.

    Process:
    1. Get accepted allocations for this subject examiner
    2. Update ExaminerSubjectHistory (increment times_marked, update last_marked_year from examination.year)

    Args:
        session: Database session
        subject_examiner_id: Subject examiner UUID

    Returns:
        Dictionary with archiving results
    """
    se_stmt = (
        select(SubjectExaminer)
        .where(SubjectExaminer.id == subject_examiner_id)
        .options(selectinload(SubjectExaminer.examination))
    )
    se_result = await session.execute(se_stmt)
    se = se_result.scalar_one_or_none()

    if not se:
        raise ValueError(f"Subject examiner {subject_examiner_id} not found")

    if se.status != MarkingCycleStatus.CLOSED:
        raise ValueError(
            f"Subject examiner must be CLOSED before archiving, current status: {se.status}"
        )

    from app.models import AllocationStatus

    accepted_stmt = select(ExaminerAllocation).where(
        ExaminerAllocation.subject_examiner_id == subject_examiner_id,
        ExaminerAllocation.allocation_status == AllocationStatus.APPROVED,
    )
    accepted_result = await session.execute(accepted_stmt)
    accepted_allocations = accepted_result.scalars().all()

    if not se.examination:
        raise ValueError("Subject examiner has no examination (year)")
    examination_year = se.examination.year

    updated_count = 0
    for allocation in accepted_allocations:
        history_stmt = select(ExaminerSubjectHistory).where(
            ExaminerSubjectHistory.examiner_id == allocation.examiner_id,
            ExaminerSubjectHistory.subject_id == allocation.subject_id,
        )
        history_result = await session.execute(history_stmt)
        history = history_result.scalar_one_or_none()

        if history:
            history.times_marked += 1
            history.last_marked_year = examination_year
        else:
            history = ExaminerSubjectHistory(
                examiner_id=allocation.examiner_id,
                subject_id=allocation.subject_id,
                times_marked=1,
                last_marked_year=examination_year,
            )
            session.add(history)

        updated_count += 1

    await session.commit()

    return {
        "archived": True,
        "subject_examiner_id": str(subject_examiner_id),
        "year": examination_year,
        "updated_history_count": updated_count,
        "message": f"Archived subject examiner (year {examination_year}) and updated {updated_count} examiner history records",
    }
