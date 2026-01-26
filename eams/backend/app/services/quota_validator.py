"""Service for validating quota compliance."""
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AllocationStatus,
    Examiner,
    ExaminerAllocation,
    QuotaType,
    SubjectQuota,
)


async def validate_quota_compliance(
    session: AsyncSession,
    cycle_id: UUID,
    subject_id: UUID,
    proposed_examiner_ids: list[UUID],
) -> tuple[bool, list[str]]:
    """
    Validate quota compliance for proposed allocations.

    Args:
        session: Database session
        cycle_id: Marking cycle UUID
        subject_id: Subject UUID
        proposed_examiner_ids: List of examiner UUIDs to check

    Returns:
        Tuple of (is_valid, list_of_violations)
    """
    violations = []

    # Get all quotas for this cycle and subject
    quota_stmt = select(SubjectQuota).where(
        SubjectQuota.cycle_id == cycle_id,
        SubjectQuota.subject_id == subject_id,
    )
    quota_result = await session.execute(quota_stmt)
    quotas = quota_result.scalars().all()

    if not quotas:
        # No quotas defined, so always valid
        return True, []

    # Get examiner details for proposed allocations
    examiner_stmt = select(Examiner).where(Examiner.id.in_(proposed_examiner_ids))
    examiner_result = await session.execute(examiner_stmt)
    examiners = {ex.id: ex for ex in examiner_result.scalars().all()}

    # Get existing approved allocations for this cycle/subject
    existing_stmt = select(ExaminerAllocation).where(
        ExaminerAllocation.cycle_id == cycle_id,
        ExaminerAllocation.subject_id == subject_id,
        ExaminerAllocation.allocation_status == AllocationStatus.APPROVED,
    )
    existing_result = await session.execute(existing_stmt)
    existing_allocations = existing_result.scalars().all()
    existing_examiner_ids = {alloc.examiner_id for alloc in existing_allocations}

    # Combine existing and proposed
    all_examiner_ids = existing_examiner_ids | set(proposed_examiner_ids)
    total_count = len(all_examiner_ids)

    # Check each quota
    for quota in quotas:
        if quota.quota_type == QuotaType.REGION:
            # Count examiners matching this region
            matching_count = sum(
                1
                for exam_id in all_examiner_ids
                if exam_id in examiners and examiners[exam_id].region == quota.quota_key
            )

            # Check min_count
            if quota.min_count is not None and matching_count < quota.min_count:
                violations.append(
                    f"Region '{quota.quota_key}': {matching_count} examiners, minimum required: {quota.min_count}"
                )

            # Check max_count
            if quota.max_count is not None and matching_count > quota.max_count:
                violations.append(
                    f"Region '{quota.quota_key}': {matching_count} examiners, maximum allowed: {quota.max_count}"
                )

            # Check percentage
            if quota.percentage is not None and total_count > 0:
                actual_percentage = (matching_count / total_count) * 100
                if actual_percentage < quota.percentage:
                    violations.append(
                        f"Region '{quota.quota_key}': {actual_percentage:.1f}%, minimum required: {quota.percentage}%"
                    )

        elif quota.quota_type == QuotaType.GENDER:
            # Count examiners matching this gender
            matching_count = sum(
                1
                for exam_id in all_examiner_ids
                if exam_id in examiners and examiners[exam_id].gender == quota.quota_key
            )

            # Check min_count
            if quota.min_count is not None and matching_count < quota.min_count:
                violations.append(
                    f"Gender '{quota.quota_key}': {matching_count} examiners, minimum required: {quota.min_count}"
                )

            # Check max_count
            if quota.max_count is not None and matching_count > quota.max_count:
                violations.append(
                    f"Gender '{quota.quota_key}': {matching_count} examiners, maximum allowed: {quota.max_count}"
                )

            # Check percentage
            if quota.percentage is not None and total_count > 0:
                actual_percentage = (matching_count / total_count) * 100
                if actual_percentage < quota.percentage:
                    violations.append(
                        f"Gender '{quota.quota_key}': {actual_percentage:.1f}%, minimum required: {quota.percentage}%"
                    )

    return len(violations) == 0, violations
