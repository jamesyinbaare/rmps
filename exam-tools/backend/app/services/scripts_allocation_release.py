"""Per-cohort scripts allocation release policy for the examiner portal."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SubjectMarkingGroup, SubjectMarkingGroupMember


def is_cohort_scripts_allocation_released(
    group: SubjectMarkingGroup,
    *,
    now: datetime | None = None,
) -> bool:
    if not group.scripts_allocation_release_enabled:
        return False
    release_at = group.scripts_allocation_release_at
    if release_at is None:
        return True
    current = now or datetime.utcnow()
    return current >= release_at


async def _examiner_cohort_memberships(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
) -> list[SubjectMarkingGroup]:
    stmt = (
        select(SubjectMarkingGroup)
        .join(SubjectMarkingGroupMember, SubjectMarkingGroupMember.group_id == SubjectMarkingGroup.id)
        .where(
            SubjectMarkingGroup.examination_id == examination_id,
            SubjectMarkingGroup.subject_id == subject_id,
            SubjectMarkingGroupMember.examiner_id == examiner_id,
        )
        .order_by(SubjectMarkingGroup.is_default.desc(), SubjectMarkingGroup.name)
    )
    return list((await session.execute(stmt)).scalars().unique().all())


async def is_scripts_allocation_visible_for_examiner(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
) -> bool:
    groups = await _examiner_cohort_memberships(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )
    if not groups:
        return False
    return any(is_cohort_scripts_allocation_released(group) for group in groups)


async def scripts_allocation_pending_message(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
) -> str | None:
    if await is_scripts_allocation_visible_for_examiner(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    ):
        return None

    groups = await _examiner_cohort_memberships(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )
    if not groups:
        return (
            "Your script allocations will be available once released "
            "by the examination office."
        )

    enabled_groups = [group for group in groups if group.scripts_allocation_release_enabled]
    if not enabled_groups:
        return (
            "Your script allocations will be available once released "
            "by the examination office."
        )

    now = datetime.utcnow()
    future_scheduled = [
        group
        for group in enabled_groups
        if group.scripts_allocation_release_at is not None and now < group.scripts_allocation_release_at
    ]
    if future_scheduled:
        earliest = min(future_scheduled, key=lambda group: group.scripts_allocation_release_at)
        release_at = earliest.scripts_allocation_release_at
        assert release_at is not None
        return (
            f"Your script allocations will be available on "
            f"{release_at.strftime('%d %b %Y at %H:%M')} UTC."
        )

    return (
        "Your script allocations will be available once released "
        "by the examination office."
    )
