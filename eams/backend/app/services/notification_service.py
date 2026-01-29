"""Service for sending notifications to examiners."""
import logging
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    AcceptanceStatus,
    AllocationStatus,
    ExaminerAcceptance,
    ExaminerAllocation,
    SubjectExaminer,
)

logger = logging.getLogger(__name__)


async def notify_approved_examiners(
    session: AsyncSession,
    subject_examiner_id: UUID,
) -> dict[str, any]:
    """
    Notify approved examiners and create acceptance records.

    Args:
        session: Database session
        subject_examiner_id: Subject examiner UUID

    Returns:
        Dictionary with notification results
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

    response_deadline = (
        (se.examination.acceptance_deadline if se.examination else None)
        or (datetime.utcnow() + timedelta(days=7))
    )

    approved_stmt = select(ExaminerAllocation).where(
        ExaminerAllocation.subject_examiner_id == subject_examiner_id,
        ExaminerAllocation.allocation_status == AllocationStatus.APPROVED,
    )
    approved_result = await session.execute(approved_stmt)
    approved_allocations = approved_result.scalars().all()

    subject_id = se.subject_id
    notified_count = 0
    for allocation in approved_allocations:
        existing_stmt = select(ExaminerAcceptance).where(
            ExaminerAcceptance.allocation_id == allocation.id,
        )
        existing_result = await session.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()

        if existing:
            continue

        acceptance = ExaminerAcceptance(
            examiner_id=allocation.examiner_id,
            subject_examiner_id=subject_examiner_id,
            subject_id=subject_id,
            allocation_id=allocation.id,
            status=AcceptanceStatus.PENDING,
            notified_at=datetime.utcnow(),
            response_deadline=response_deadline,
        )
        session.add(acceptance)
        notified_count += 1

        logger.info(
            "Allocation notification: examiner_id=%s allocation_id=%s subject_examiner_id=%s subject_id=%s. "
            "Examiner can log in and go to My allocations to accept or decline. "
            "When email is implemented, examiner can also click the link in the email.",
            allocation.examiner_id,
            allocation.id,
            subject_examiner_id,
            subject_id,
        )

        # TODO: Send email notification with link to dashboard to accept/decline
        # await send_acceptance_email(session, acceptance)

    await session.commit()

    return {
        "notified": notified_count,
        "message": f"Notified {notified_count} examiner(s)",
    }
