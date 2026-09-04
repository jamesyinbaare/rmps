"""Exam-scoped allowance groups that gate examiner compensation lines."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ExaminationAllowanceGroup,
    ExaminationAllowanceGroupEligibility,
    ExaminationAllowanceGroupMember,
    Examiner,
    RosterAllowanceKey,
)
from app.services.examiner_roster_allowance_eligibility import ALLOWANCE_KEY_LABELS

GENERAL_GROUP_NAME = "General"

GroupEligibilityMap = dict[UUID, dict[RosterAllowanceKey, bool]]
"""group_id -> allowance_key -> enabled"""

ExaminerGroupMembershipMap = dict[UUID, set[UUID]]
"""examiner_id -> set of group_ids"""

ExaminerEnabledKeysMap = dict[UUID, set[RosterAllowanceKey]]
"""examiner_id -> set of allowance keys enabled by OR across memberships"""


def default_group_eligibility_enabled(_key: RosterAllowanceKey) -> bool:
    """New groups (including General) enable all allowance keys by default."""
    return True


def eligibility_dict_for_group(
    group: ExaminationAllowanceGroup,
) -> dict[str, bool]:
    stored = {
        (row.allowance_key if isinstance(row.allowance_key, str) else str(row.allowance_key)): bool(row.enabled)
        for row in (group.eligibility or [])
    }
    return {
        key.value: stored.get(key.value, default_group_eligibility_enabled(key))
        for key in RosterAllowanceKey
    }


async def ensure_general_group(session: AsyncSession, examination_id: int) -> ExaminationAllowanceGroup:
    """Ensure the built-in General group exists with default eligibility."""
    stmt = (
        select(ExaminationAllowanceGroup)
        .where(
            ExaminationAllowanceGroup.examination_id == examination_id,
            ExaminationAllowanceGroup.is_general.is_(True),
        )
        .options(selectinload(ExaminationAllowanceGroup.eligibility))
    )
    group = (await session.execute(stmt)).scalar_one_or_none()
    now = datetime.utcnow()
    if group is None:
        group = ExaminationAllowanceGroup(
            id=uuid4(),
            examination_id=examination_id,
            name=GENERAL_GROUP_NAME,
            is_general=True,
            created_at=now,
            updated_at=now,
        )
        session.add(group)
        await session.flush()
        for key in RosterAllowanceKey:
            session.add(
                ExaminationAllowanceGroupEligibility(
                    id=uuid4(),
                    group_id=group.id,
                    allowance_key=key.value,
                    enabled=True,
                    created_at=now,
                    updated_at=now,
                )
            )
        await session.flush()
        await session.refresh(group, attribute_names=["eligibility"])
        return group

    existing_keys = {
        (row.allowance_key if isinstance(row.allowance_key, str) else str(row.allowance_key))
        for row in (group.eligibility or [])
    }
    for key in RosterAllowanceKey:
        if key.value not in existing_keys:
            session.add(
                ExaminationAllowanceGroupEligibility(
                    id=uuid4(),
                    group_id=group.id,
                    allowance_key=key.value,
                    enabled=True,
                    created_at=now,
                    updated_at=now,
                )
            )
    await session.flush()
    return group


async def ensure_general_membership(session: AsyncSession, examiner: Examiner) -> None:
    """Ensure examiner is a member of the exam General allowance group."""
    examination_id = int(examiner.examination_id)
    general = await ensure_general_group(session, examination_id)
    existing = (
        await session.execute(
            select(ExaminationAllowanceGroupMember).where(
                ExaminationAllowanceGroupMember.group_id == general.id,
                ExaminationAllowanceGroupMember.examiner_id == examiner.id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        session.add(
            ExaminationAllowanceGroupMember(
                group_id=general.id,
                examiner_id=examiner.id,
                created_at=datetime.utcnow(),
            )
        )
        await session.flush()


async def list_allowance_groups(
    session: AsyncSession,
    examination_id: int,
) -> list[ExaminationAllowanceGroup]:
    await ensure_general_group(session, examination_id)
    stmt = (
        select(ExaminationAllowanceGroup)
        .where(ExaminationAllowanceGroup.examination_id == examination_id)
        .options(
            selectinload(ExaminationAllowanceGroup.eligibility),
            selectinload(ExaminationAllowanceGroup.members),
        )
        .order_by(
            ExaminationAllowanceGroup.is_general.desc(),
            ExaminationAllowanceGroup.name,
        )
    )
    return list((await session.execute(stmt)).scalars().all())


async def get_allowance_group(
    session: AsyncSession,
    examination_id: int,
    group_id: UUID,
) -> ExaminationAllowanceGroup | None:
    stmt = (
        select(ExaminationAllowanceGroup)
        .where(
            ExaminationAllowanceGroup.id == group_id,
            ExaminationAllowanceGroup.examination_id == examination_id,
        )
        .options(
            selectinload(ExaminationAllowanceGroup.eligibility),
            selectinload(ExaminationAllowanceGroup.members),
        )
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def create_allowance_group(
    session: AsyncSession,
    examination_id: int,
    name: str,
) -> ExaminationAllowanceGroup:
    await ensure_general_group(session, examination_id)
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("Group name is required")
    if cleaned.casefold() == GENERAL_GROUP_NAME.casefold():
        raise ValueError("Name 'General' is reserved")
    existing = (
        await session.execute(
            select(ExaminationAllowanceGroup).where(
                ExaminationAllowanceGroup.examination_id == examination_id,
                ExaminationAllowanceGroup.name == cleaned,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ValueError(f"Allowance group '{cleaned}' already exists")
    now = datetime.utcnow()
    group = ExaminationAllowanceGroup(
        id=uuid4(),
        examination_id=examination_id,
        name=cleaned,
        is_general=False,
        created_at=now,
        updated_at=now,
    )
    session.add(group)
    await session.flush()
    for key in RosterAllowanceKey:
        session.add(
            ExaminationAllowanceGroupEligibility(
                id=uuid4(),
                group_id=group.id,
                allowance_key=key.value,
                enabled=True,
                created_at=now,
                updated_at=now,
            )
        )
    await session.flush()
    return await get_allowance_group(session, examination_id, group.id)  # type: ignore[return-value]


async def rename_allowance_group(
    session: AsyncSession,
    examination_id: int,
    group_id: UUID,
    name: str,
) -> ExaminationAllowanceGroup:
    group = await get_allowance_group(session, examination_id, group_id)
    if group is None:
        raise LookupError("Allowance group not found")
    if group.is_general:
        raise ValueError("Cannot rename the General group")
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("Group name is required")
    if cleaned.casefold() == GENERAL_GROUP_NAME.casefold():
        raise ValueError("Name 'General' is reserved")
    clash = (
        await session.execute(
            select(ExaminationAllowanceGroup).where(
                ExaminationAllowanceGroup.examination_id == examination_id,
                ExaminationAllowanceGroup.name == cleaned,
                ExaminationAllowanceGroup.id != group_id,
            )
        )
    ).scalar_one_or_none()
    if clash is not None:
        raise ValueError(f"Allowance group '{cleaned}' already exists")
    group.name = cleaned
    group.updated_at = datetime.utcnow()
    await session.flush()
    return group


async def delete_allowance_group(
    session: AsyncSession,
    examination_id: int,
    group_id: UUID,
) -> None:
    group = await get_allowance_group(session, examination_id, group_id)
    if group is None:
        raise LookupError("Allowance group not found")
    if group.is_general:
        raise ValueError("Cannot delete the General group")
    await session.delete(group)
    await session.flush()


async def replace_group_eligibility(
    session: AsyncSession,
    examination_id: int,
    group_id: UUID,
    cells: list[tuple[RosterAllowanceKey, bool]],
) -> ExaminationAllowanceGroup:
    group = await get_allowance_group(session, examination_id, group_id)
    if group is None:
        raise LookupError("Allowance group not found")
    now = datetime.utcnow()
    by_key = {key: enabled for key, enabled in cells}
    existing = {row.allowance_key: row for row in (group.eligibility or [])}
    for key in RosterAllowanceKey:
        enabled = by_key.get(key, default_group_eligibility_enabled(key))
        row = existing.get(key.value)
        if row is None:
            session.add(
                ExaminationAllowanceGroupEligibility(
                    id=uuid4(),
                    group_id=group.id,
                    allowance_key=key.value,
                    enabled=enabled,
                    created_at=now,
                    updated_at=now,
                )
            )
        else:
            row.enabled = enabled
            row.updated_at = now
    group.updated_at = now
    await session.flush()
    return await get_allowance_group(session, examination_id, group_id)  # type: ignore[return-value]


async def set_group_members(
    session: AsyncSession,
    examination_id: int,
    group_id: UUID,
    examiner_ids: list[UUID],
) -> ExaminationAllowanceGroup:
    group = await get_allowance_group(session, examination_id, group_id)
    if group is None:
        raise LookupError("Allowance group not found")
    if group.is_general:
        raise ValueError("General group membership is automatic and cannot be edited")
    unique_ids = list(dict.fromkeys(examiner_ids))
    if unique_ids:
        found = (
            await session.execute(
                select(Examiner.id).where(
                    Examiner.examination_id == examination_id,
                    Examiner.id.in_(unique_ids),
                )
            )
        ).scalars().all()
        found_set = set(found)
        missing = [str(eid) for eid in unique_ids if eid not in found_set]
        if missing:
            raise ValueError(f"Unknown examiner id(s) for this examination: {', '.join(missing)}")
    await session.execute(
        delete(ExaminationAllowanceGroupMember).where(
            ExaminationAllowanceGroupMember.group_id == group_id,
        )
    )
    now = datetime.utcnow()
    for eid in unique_ids:
        session.add(
            ExaminationAllowanceGroupMember(
                group_id=group_id,
                examiner_id=eid,
                created_at=now,
            )
        )
    group.updated_at = now
    await session.flush()
    # Bulk delete/add does not sync the in-memory relationship; expire so reload is fresh.
    session.expire(group, ["members"])
    return await get_allowance_group(session, examination_id, group_id)  # type: ignore[return-value]


async def load_group_member_summaries(
    session: AsyncSession,
    examination_id: int,
    examiner_ids: list[UUID],
) -> list[Examiner]:
    """Load examiners for member summary rows, ordered by name."""
    if not examiner_ids:
        return []
    rows = (
        await session.execute(
            select(Examiner)
            .where(
                Examiner.examination_id == examination_id,
                Examiner.id.in_(examiner_ids),
            )
            .order_by(Examiner.name)
        )
    ).scalars().all()
    return list(rows)


async def set_examiner_custom_groups(
    session: AsyncSession,
    examination_id: int,
    examiner_id: UUID,
    group_ids: list[UUID],
) -> list[UUID]:
    """Replace an examiner's custom (non-General) allowance group memberships."""
    examiner = (
        await session.execute(
            select(Examiner).where(
                Examiner.id == examiner_id,
                Examiner.examination_id == examination_id,
            )
        )
    ).scalar_one_or_none()
    if examiner is None:
        raise LookupError("Examiner not found")
    await ensure_general_membership(session, examiner)

    groups = await list_allowance_groups(session, examination_id)
    custom_by_id = {g.id: g for g in groups if not g.is_general}
    unique_ids = list(dict.fromkeys(group_ids))
    for gid in unique_ids:
        if gid not in custom_by_id:
            raise ValueError(f"Unknown or non-custom allowance group: {gid}")

    custom_group_ids = list(custom_by_id.keys())
    if custom_group_ids:
        await session.execute(
            delete(ExaminationAllowanceGroupMember).where(
                ExaminationAllowanceGroupMember.examiner_id == examiner_id,
                ExaminationAllowanceGroupMember.group_id.in_(custom_group_ids),
            )
        )
    now = datetime.utcnow()
    for gid in unique_ids:
        session.add(
            ExaminationAllowanceGroupMember(
                group_id=gid,
                examiner_id=examiner_id,
                created_at=now,
            )
        )
    await session.flush()
    return unique_ids


async def resolve_custom_groups_by_names(
    session: AsyncSession,
    examination_id: int,
    names: list[str],
) -> list[UUID]:
    """Resolve comma-separated upload names to custom group ids (case-insensitive)."""
    cleaned = [n.strip() for n in names if n and str(n).strip()]
    if not cleaned:
        return []
    groups = await list_allowance_groups(session, examination_id)
    by_name = {g.name.casefold(): g for g in groups if not g.is_general}
    resolved: list[UUID] = []
    missing: list[str] = []
    for name in cleaned:
        if name.casefold() == GENERAL_GROUP_NAME.casefold():
            continue
        group = by_name.get(name.casefold())
        if group is None:
            missing.append(name)
        else:
            resolved.append(group.id)
    if missing:
        raise ValueError(
            "Unknown allowance group(s): "
            + ", ".join(missing)
            + ". Create them under Examiner rates → Allowance groups first."
        )
    return list(dict.fromkeys(resolved))


def parse_allowance_groups_cell(raw: object | None) -> list[str]:
    if raw is None:
        return []
    text = str(raw).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return []
    return [part.strip() for part in text.split(",") if part.strip()]


async def load_group_eligibility_maps(
    session: AsyncSession,
    examination_id: int,
) -> tuple[GroupEligibilityMap, ExaminerGroupMembershipMap, ExaminerEnabledKeysMap]:
    """Load group eligibility and membership; ensure General exists."""
    await ensure_general_group(session, examination_id)
    groups = await list_allowance_groups(session, examination_id)
    group_eligibility: GroupEligibilityMap = {}
    for group in groups:
        group_eligibility[group.id] = {
            key: eligibility_dict_for_group(group).get(key.value, True)
            for key in RosterAllowanceKey
        }

    membership: ExaminerGroupMembershipMap = {}
    if groups:
        group_ids = [g.id for g in groups]
        rows = (
            await session.execute(
                select(ExaminationAllowanceGroupMember).where(
                    ExaminationAllowanceGroupMember.group_id.in_(group_ids),
                )
            )
        ).scalars().all()
        for row in rows:
            membership.setdefault(row.examiner_id, set()).add(row.group_id)

    enabled_by_examiner: ExaminerEnabledKeysMap = {}
    for examiner_id, group_ids in membership.items():
        keys: set[RosterAllowanceKey] = set()
        for gid in group_ids:
            for key, enabled in group_eligibility.get(gid, {}).items():
                if enabled:
                    keys.add(key)
        enabled_by_examiner[examiner_id] = keys
    return group_eligibility, membership, enabled_by_examiner


def is_group_allowance_enabled(
    enabled_by_examiner: ExaminerEnabledKeysMap | None,
    examiner_id: UUID,
    allowance_key: RosterAllowanceKey,
) -> bool:
    """OR across the examiner's group memberships. None map => all enabled (legacy)."""
    if enabled_by_examiner is None:
        return True
    keys = enabled_by_examiner.get(examiner_id)
    if keys is None:
        # Examiner with no membership rows yet: treat as General-default-all until backfilled.
        return True
    return allowance_key in keys


def examiner_custom_group_ids(
    membership: ExaminerGroupMembershipMap,
    groups: list[ExaminationAllowanceGroup],
    examiner_id: UUID,
) -> list[UUID]:
    custom_ids = {g.id for g in groups if not g.is_general}
    return sorted(membership.get(examiner_id, set()) & custom_ids, key=str)


def allowance_key_labels() -> dict[str, str]:
    return {k.value: v for k, v in ALLOWANCE_KEY_LABELS.items()}
