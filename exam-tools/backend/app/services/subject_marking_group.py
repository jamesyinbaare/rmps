"""Subject-scoped cohorts for subject officers."""

from __future__ import annotations

from datetime import datetime, time, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Examiner,
    ExaminerSubject,
    ExaminerType,
    Region,
    SubjectMarkingGroup,
    SubjectMarkingGroupMember,
    SubjectMarkingGroupSourceRegion,
    SubjectMarkingGroupSourceRole,
)
from app.services.coordination_schedule import validate_coordination_range
from app.services.examiner_roster import parse_region
from app.services.scripts_allocation_release import is_cohort_scripts_allocation_released


def _as_naive_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _parse_source_regions(raw_regions: list[str]) -> list[Region]:
    regions: list[Region] = []
    seen: set[str] = set()
    for raw in raw_regions:
        key = str(raw).strip()
        if not key:
            continue
        if key.lower() in seen:
            continue
        seen.add(key.lower())
        regions.append(parse_region(key))
    return regions


def _parse_source_roles(raw_roles: list[str]) -> list[ExaminerType]:
    roles: list[ExaminerType] = []
    seen: set[str] = set()
    for raw in raw_roles:
        key = str(raw).strip()
        if not key:
            continue
        if key.lower() in seen:
            continue
        seen.add(key.lower())
        matched: ExaminerType | None = None
        for role in ExaminerType:
            if role.value.lower() == key.lower():
                matched = role
                break
        if matched is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown role: {key}",
            )
        roles.append(matched)
    return roles


DEFAULT_COHORT_NAME = "All examiners"


def group_response(group: SubjectMarkingGroup) -> dict:
    member_regions: list[str] = []
    seen_regions: set[str] = set()
    for member in group.members:
        examiner = getattr(member, "examiner", None)
        if examiner is None or examiner.region is None:
            continue
        region_value = examiner.region.value
        if region_value in seen_regions:
            continue
        seen_regions.add(region_value)
        member_regions.append(region_value)
    member_regions.sort()

    return {
        "id": group.id,
        "examination_id": int(group.examination_id),
        "subject_id": int(group.subject_id),
        "name": group.name,
        "is_default": bool(group.is_default),
        "examiner_ids": [m.examiner_id for m in group.members],
        "member_regions": member_regions,
        "source_regions": [r.region.value for r in group.source_regions],
        "source_roles": [r.examiner_type.value for r in group.source_roles],
        "coordination_start_date": group.coordination_start_date,
        "coordination_start_time": group.coordination_start_time,
        "coordination_end_date": group.coordination_end_date,
        "coordination_end_time": group.coordination_end_time,
        "coordination_venue": group.coordination_venue,
        "marking_start_date": group.marking_start_date,
        "marking_end_date": group.marking_end_date,
        "marked_script_submission_deadline": group.marked_script_submission_deadline,
        "scripts_allocation_release_enabled": bool(group.scripts_allocation_release_enabled),
        "scripts_allocation_release_at": group.scripts_allocation_release_at,
        "created_at": group.created_at,
        "updated_at": group.updated_at,
    }


def _group_load_options() -> list:
    return [
        selectinload(SubjectMarkingGroup.members).selectinload(SubjectMarkingGroupMember.examiner),
        selectinload(SubjectMarkingGroup.source_regions),
        selectinload(SubjectMarkingGroup.source_roles),
    ]


async def load_group(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID,
) -> SubjectMarkingGroup | None:
    stmt = (
        select(SubjectMarkingGroup)
        .where(
            SubjectMarkingGroup.id == group_id,
            SubjectMarkingGroup.examination_id == examination_id,
            SubjectMarkingGroup.subject_id == subject_id,
        )
        .options(*_group_load_options())
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_groups(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> list[dict]:
    stmt = (
        select(SubjectMarkingGroup)
        .where(
            SubjectMarkingGroup.examination_id == examination_id,
            SubjectMarkingGroup.subject_id == subject_id,
        )
        .options(*_group_load_options())
        .order_by(SubjectMarkingGroup.name)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return [group_response(g) for g in rows]


async def create_group(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    name: str,
    coordination_start_date: datetime | None,
    coordination_start_time: time | None,
    coordination_end_date: datetime | None,
    coordination_end_time: time | None,
    coordination_venue: str | None = None,
    marking_start_date: datetime | None,
    marking_end_date: datetime | None,
    marked_script_submission_deadline: datetime | None,
) -> dict:
    validate_coordination_range(
        coordination_start_date,
        coordination_start_time,
        coordination_end_date,
        coordination_end_time,
    )
    group = SubjectMarkingGroup(
        examination_id=examination_id,
        subject_id=subject_id,
        name=name.strip(),
        coordination_start_date=_as_naive_utc(coordination_start_date),
        coordination_start_time=coordination_start_time,
        coordination_end_date=_as_naive_utc(coordination_end_date),
        coordination_end_time=coordination_end_time,
        coordination_venue=(coordination_venue or "").strip() or None,
        marking_start_date=_as_naive_utc(marking_start_date),
        marking_end_date=_as_naive_utc(marking_end_date),
        marked_script_submission_deadline=_as_naive_utc(marked_script_submission_deadline),
    )
    session.add(group)
    await session.commit()
    await session.refresh(group, attribute_names=["members", "source_regions", "source_roles"])
    return group_response(group)


async def update_group(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID,
    name: str | None,
    coordination_start_date: datetime | None,
    coordination_start_time: time | None,
    coordination_end_date: datetime | None,
    coordination_end_time: time | None,
    coordination_venue: str | None,
    marking_start_date: datetime | None,
    marking_end_date: datetime | None,
    marked_script_submission_deadline: datetime | None,
    update_coordination_start_date: bool,
    update_coordination_start_time: bool,
    update_coordination_end_date: bool,
    update_coordination_end_time: bool,
    update_coordination_venue: bool,
    update_marking_start_date: bool,
    update_marking_end_date: bool,
    update_submission_deadline: bool,
    scripts_allocation_release_enabled: bool | None = None,
    scripts_allocation_release_at: datetime | None = None,
    update_scripts_allocation_release_enabled: bool = False,
    update_scripts_allocation_release_at: bool = False,
) -> dict:
    group = await load_group(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cohort not found")

    if name is not None:
        group.name = name.strip()
    if update_coordination_start_date:
        group.coordination_start_date = _as_naive_utc(coordination_start_date)
    if update_coordination_start_time:
        group.coordination_start_time = coordination_start_time
    if update_coordination_end_date:
        group.coordination_end_date = _as_naive_utc(coordination_end_date)
    if update_coordination_end_time:
        group.coordination_end_time = coordination_end_time
    if update_coordination_venue:
        group.coordination_venue = (coordination_venue or "").strip() or None
    validate_coordination_range(
        group.coordination_start_date,
        group.coordination_start_time,
        group.coordination_end_date,
        group.coordination_end_time,
    )
    if update_marking_start_date:
        group.marking_start_date = _as_naive_utc(marking_start_date)
    if update_marking_end_date:
        group.marking_end_date = _as_naive_utc(marking_end_date)
    if update_submission_deadline:
        group.marked_script_submission_deadline = _as_naive_utc(marked_script_submission_deadline)
    if update_scripts_allocation_release_enabled:
        group.scripts_allocation_release_enabled = bool(scripts_allocation_release_enabled)
    if update_scripts_allocation_release_at:
        group.scripts_allocation_release_at = _as_naive_utc(scripts_allocation_release_at)
    group.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(group, attribute_names=["members", "source_regions", "source_roles"])
    return group_response(group)


async def delete_group(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID,
) -> None:
    group = await load_group(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cohort not found")
    if group.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The default cohort cannot be deleted.",
        )
    await session.delete(group)
    await session.commit()


async def ensure_default_cohort(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> SubjectMarkingGroup:
    stmt = select(SubjectMarkingGroup).where(
        SubjectMarkingGroup.examination_id == examination_id,
        SubjectMarkingGroup.subject_id == subject_id,
        SubjectMarkingGroup.is_default.is_(True),
    )
    group = (await session.execute(stmt)).scalar_one_or_none()
    if group is not None:
        return group

    group = SubjectMarkingGroup(
        examination_id=examination_id,
        subject_id=subject_id,
        name=DEFAULT_COHORT_NAME,
        is_default=True,
    )
    session.add(group)
    await session.flush()
    return group


async def sync_default_cohort_members(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> None:
    group = await ensure_default_cohort(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
    )
    stmt = (
        select(Examiner.id)
        .join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id)
        .where(
            Examiner.examination_id == examination_id,
            ExaminerSubject.subject_id == subject_id,
        )
    )
    examiner_ids = list(dict.fromkeys((await session.execute(stmt)).scalars().all()))

    await session.execute(
        delete(SubjectMarkingGroupMember).where(SubjectMarkingGroupMember.group_id == group.id)
    )
    for eid in examiner_ids:
        session.add(
            SubjectMarkingGroupMember(
                group_id=group.id,
                examiner_id=eid,
                examination_id=examination_id,
                subject_id=subject_id,
            )
        )
    group.updated_at = datetime.utcnow()
    await session.flush()


async def _validate_examiners_on_subject(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_ids: list[UUID],
) -> None:
    if not examiner_ids:
        return
    unique_ids = list(dict.fromkeys(examiner_ids))
    stmt = (
        select(Examiner.id)
        .join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id)
        .where(
            Examiner.examination_id == examination_id,
            ExaminerSubject.subject_id == subject_id,
            Examiner.id.in_(unique_ids),
        )
    )
    found = set((await session.execute(stmt)).scalars().all())
    missing = [str(eid) for eid in unique_ids if eid not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Examiners not on subject: {', '.join(missing[:3])}"
            + ("…" if len(missing) > 3 else ""),
        )


async def _examiner_ids_for_regions(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    regions: list[Region],
) -> list[UUID]:
    if not regions:
        return []
    region_set = set(regions)
    stmt = (
        select(Examiner.id)
        .join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id)
        .where(
            Examiner.examination_id == examination_id,
            ExaminerSubject.subject_id == subject_id,
            Examiner.region.in_(region_set),
        )
    )
    return list(dict.fromkeys((await session.execute(stmt)).scalars().all()))


async def _examiner_ids_for_roles(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    roles: list[ExaminerType],
) -> list[UUID]:
    if not roles:
        return []
    role_set = set(roles)
    stmt = (
        select(Examiner.id)
        .join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id)
        .where(
            Examiner.examination_id == examination_id,
            ExaminerSubject.subject_id == subject_id,
            Examiner.examiner_type.in_(role_set),
        )
    )
    return list(dict.fromkeys((await session.execute(stmt)).scalars().all()))


async def _subject_examiner_ids(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> set[UUID]:
    stmt = (
        select(Examiner.id)
        .join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id)
        .where(
            Examiner.examination_id == examination_id,
            ExaminerSubject.subject_id == subject_id,
        )
    )
    return set((await session.execute(stmt)).scalars().all())


async def _rule_matched_member_ids(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    regions: list[Region],
    roles: list[ExaminerType],
) -> set[UUID]:
    region_ids: set[UUID] | None = None
    role_ids: set[UUID] | None = None
    if regions:
        region_ids = set(
            await _examiner_ids_for_regions(
                session,
                examination_id=examination_id,
                subject_id=subject_id,
                regions=regions,
            )
        )
    if roles:
        role_ids = set(
            await _examiner_ids_for_roles(
                session,
                examination_id=examination_id,
                subject_id=subject_id,
                roles=roles,
            )
        )
    if region_ids is not None and role_ids is not None:
        return region_ids & role_ids
    if region_ids is not None:
        return region_ids
    if role_ids is not None:
        return role_ids
    return set()


def _compute_cohort_member_ids(
    group: SubjectMarkingGroup,
    *,
    subject_examiner_ids: set[UUID],
    rule_matched_ids: set[UUID],
) -> list[UUID]:
    """Resolve member IDs for one non-default cohort during auto-sync."""
    has_rules = bool(group.source_regions or group.source_roles)
    if has_rules:
        rule_matched = rule_matched_ids & subject_examiner_ids
        current_member_ids = {m.examiner_id for m in group.members}
        manual_preserved = (current_member_ids & subject_examiner_ids) - rule_matched
        final_ids = rule_matched | manual_preserved
    else:
        current_member_ids = {m.examiner_id for m in group.members}
        final_ids = current_member_ids & subject_examiner_ids
    return list(dict.fromkeys(final_ids))


async def _rewrite_group_members(
    session: AsyncSession,
    *,
    group_id: UUID,
    examination_id: int,
    subject_id: int,
    member_ids: list[UUID],
) -> None:
    await session.execute(
        delete(SubjectMarkingGroupMember).where(SubjectMarkingGroupMember.group_id == group_id)
    )
    for eid in member_ids:
        session.add(
            SubjectMarkingGroupMember(
                group_id=group_id,
                examiner_id=eid,
                examination_id=examination_id,
                subject_id=subject_id,
            )
        )


async def sync_rule_based_cohort_members(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> None:
    stmt = (
        select(SubjectMarkingGroup)
        .where(
            SubjectMarkingGroup.examination_id == examination_id,
            SubjectMarkingGroup.subject_id == subject_id,
            SubjectMarkingGroup.is_default.is_(False),
        )
        .options(*_group_load_options())
    )
    groups = list((await session.execute(stmt)).scalars().all())
    if not groups:
        return

    subject_examiner_ids = await _subject_examiner_ids(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
    )

    for group in groups:
        regions = [r.region for r in group.source_regions]
        roles = [r.examiner_type for r in group.source_roles]
        rule_matched_ids: set[UUID] = set()
        if regions or roles:
            rule_matched_ids = await _rule_matched_member_ids(
                session,
                examination_id=examination_id,
                subject_id=subject_id,
                regions=regions,
                roles=roles,
            )
        member_ids = _compute_cohort_member_ids(
            group,
            subject_examiner_ids=subject_examiner_ids,
            rule_matched_ids=rule_matched_ids,
        )
        await _rewrite_group_members(
            session,
            group_id=group.id,
            examination_id=examination_id,
            subject_id=subject_id,
            member_ids=member_ids,
        )
        group.updated_at = datetime.utcnow()

    await session.flush()


async def sync_subject_cohort_memberships(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> None:
    await sync_default_cohort_members(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
    )
    await sync_rule_based_cohort_members(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
    )


async def replace_group_members(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID,
    source_regions: list[str],
    source_roles: list[str],
    examiner_ids: list[UUID],
) -> dict:
    group = await load_group(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cohort not found")

    if group.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Default cohort membership is managed automatically for all subject examiners.",
        )

    regions = _parse_source_regions(source_regions)
    roles = _parse_source_roles(source_roles)
    rule_ids = await _rule_matched_member_ids(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        regions=regions,
        roles=roles,
    )
    if regions or roles:
        manual_ids = set(examiner_ids) - rule_ids
        unique_ids = list(dict.fromkeys([*rule_ids, *manual_ids]))
    else:
        unique_ids = list(dict.fromkeys(examiner_ids))
    await _validate_examiners_on_subject(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_ids=unique_ids,
    )

    await session.execute(
        delete(SubjectMarkingGroupSourceRegion).where(
            SubjectMarkingGroupSourceRegion.group_id == group_id
        )
    )
    for region in regions:
        session.add(
            SubjectMarkingGroupSourceRegion(
                group_id=group_id,
                examination_id=examination_id,
                subject_id=subject_id,
                region=region,
            )
        )

    await session.execute(
        delete(SubjectMarkingGroupSourceRole).where(SubjectMarkingGroupSourceRole.group_id == group_id)
    )
    for role in roles:
        session.add(
            SubjectMarkingGroupSourceRole(
                group_id=group_id,
                examination_id=examination_id,
                subject_id=subject_id,
                examiner_type=role,
            )
        )

    await _rewrite_group_members(
        session,
        group_id=group_id,
        examination_id=examination_id,
        subject_id=subject_id,
        member_ids=unique_ids,
    )

    group.updated_at = datetime.utcnow()
    await session.commit()

    refreshed = await load_group(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )
    assert refreshed is not None
    return group_response(refreshed)


async def get_examiner_marking_groups(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
) -> list[dict]:
    stmt = (
        select(SubjectMarkingGroup)
        .join(SubjectMarkingGroupMember, SubjectMarkingGroupMember.group_id == SubjectMarkingGroup.id)
        .where(
            SubjectMarkingGroup.examination_id == examination_id,
            SubjectMarkingGroup.subject_id == subject_id,
            SubjectMarkingGroupMember.examiner_id == examiner_id,
        )
        .options(*_group_load_options())
        .order_by(SubjectMarkingGroup.is_default.desc(), SubjectMarkingGroup.name)
    )
    groups = list((await session.execute(stmt)).scalars().unique().all())
    return [
        {
            "id": group.id,
            "name": group.name,
            "is_default": bool(group.is_default),
            "coordination_start_date": group.coordination_start_date,
            "coordination_start_time": group.coordination_start_time,
            "coordination_end_date": group.coordination_end_date,
            "coordination_end_time": group.coordination_end_time,
            "coordination_venue": group.coordination_venue,
            "marking_start_date": group.marking_start_date,
            "marking_end_date": group.marking_end_date,
            "marked_script_submission_deadline": group.marked_script_submission_deadline,
            "scripts_allocation_released": is_cohort_scripts_allocation_released(group),
        }
        for group in groups
    ]


async def get_examiner_marking_group(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
) -> dict | None:
    groups = await get_examiner_marking_groups(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )
    if not groups:
        return None
    chosen = next((g for g in groups if not g["is_default"]), groups[0])
    return {
        "marking_group_id": chosen["id"],
        "marking_group_name": chosen["name"],
        "coordination_start_date": chosen["coordination_start_date"],
        "coordination_start_time": chosen["coordination_start_time"],
        "coordination_end_date": chosen["coordination_end_date"],
        "coordination_end_time": chosen["coordination_end_time"],
        "coordination_venue": chosen["coordination_venue"],
        "marking_start_date": chosen["marking_start_date"],
        "marking_end_date": chosen["marking_end_date"],
        "marked_script_submission_deadline": chosen["marked_script_submission_deadline"],
    }
