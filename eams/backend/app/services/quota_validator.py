"""Service for validating quota compliance and quota constraints vs total_required."""
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


def validate_quotas_against_required(
    total_required: int,
    region_quotas: list[dict],
    gender_quotas: list[dict],
) -> tuple[bool, list[str]]:
    """
    Validate that min/max counts in region and gender quotas are consistent with total_required.

    Rules:
    - Each quota's min_count and max_count (if set) must be <= total_required.
    - Sum of min_count across region quotas <= total_required (cannot require more minimums than total slots).
    - Sum of min_count across gender quotas <= total_required.
    - Sum of max_count across region quotas >= total_required (treat None as total_required: no cap = can take up to total).
    - Sum of max_count across gender quotas >= total_required.

    Returns:
        (is_valid, list of violation messages)
    """
    violations: list[str] = []

    def check_group(label: str, items: list[dict]) -> None:
        sum_min = 0
        sum_max = 0
        for item in items:
            min_c = item.get("min_count")
            max_c = item.get("max_count")
            key = item.get("quota_key", "?")

            if min_c is not None:
                if min_c > total_required:
                    violations.append(
                        f"{label} '{key}': min_count {min_c} cannot exceed total required ({total_required})"
                    )
                sum_min += min_c
            if max_c is not None:
                if max_c > total_required:
                    violations.append(
                        f"{label} '{key}': max_count {max_c} cannot exceed total required ({total_required})"
                    )
                sum_max += max_c
            else:
                # No cap: treat as able to take up to total_required for capacity check
                sum_max += total_required

        if sum_min > total_required:
            violations.append(
                f"{label} quotas: sum of min_count ({sum_min}) exceeds total required ({total_required})"
            )
        if items and sum_max < total_required:
            violations.append(
                f"{label} quotas: sum of max_count ({sum_max}) is less than total required ({total_required})"
            )

    check_group("Region", region_quotas)
    check_group("Gender", gender_quotas)

    return len(violations) == 0, violations


async def validate_quota_compliance(
    session: AsyncSession,
    subject_examiner_id: UUID,
    subject_id: UUID,
    proposed_examiner_ids: list[UUID],
) -> tuple[bool, list[str]]:
    """
    Validate quota compliance for proposed allocations.

    Args:
        session: Database session
        subject_examiner_id: Subject examiner UUID
        subject_id: Subject UUID
        proposed_examiner_ids: List of examiner UUIDs to check

    Returns:
        Tuple of (is_valid, list_of_violations)
    """
    violations = []

    quota_stmt = select(SubjectQuota).where(
        SubjectQuota.subject_examiner_id == subject_examiner_id,
        SubjectQuota.subject_id == subject_id,
    )
    quota_result = await session.execute(quota_stmt)
    quotas = quota_result.scalars().all()

    if not quotas:
        return True, []

    examiner_stmt = select(Examiner).where(Examiner.id.in_(proposed_examiner_ids))
    examiner_result = await session.execute(examiner_stmt)
    examiners = {ex.id: ex for ex in examiner_result.scalars().all()}

    existing_stmt = select(ExaminerAllocation).where(
        ExaminerAllocation.subject_examiner_id == subject_examiner_id,
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
