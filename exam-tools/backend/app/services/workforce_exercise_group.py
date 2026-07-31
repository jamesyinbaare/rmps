"""Exercise cohorts for script checkers and data entry clerks (dates, venue, letter release)."""

from __future__ import annotations

from datetime import datetime, time, timezone
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    AppointmentLettersReleaseMode,
    DataEntryClerk,
    Examination,
    ScriptChecker,
    WorkforceExerciseGroup,
    WorkforceExerciseGroupMember,
    WorkforceKind,
)

DEFAULT_GROUP_NAMES: dict[WorkforceKind, str] = {
    WorkforceKind.SCRIPT_CHECKER: "All script checkers",
    WorkforceKind.DATA_ENTRY_CLERK: "All data entry clerks",
}


class WorkforceExerciseGroupNotFoundError(Exception):
    pass


def _as_naive_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _person_model(kind: WorkforceKind) -> type[ScriptChecker] | type[DataEntryClerk]:
    return ScriptChecker if kind == WorkforceKind.SCRIPT_CHECKER else DataEntryClerk


async def _load_examination(session: AsyncSession, examination_id: int) -> Examination:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")
    return exam


async def _validate_person(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    person_id: UUID,
) -> None:
    model = _person_model(kind)
    row = await session.get(model, person_id)
    if row is None or int(row.examination_id) != examination_id:
        raise ValueError("Person not found on this examination's roster.")


def group_response(group: WorkforceExerciseGroup) -> dict:
    return {
        "id": group.id,
        "examination_id": int(group.examination_id),
        "kind": group.kind.value if hasattr(group.kind, "value") else str(group.kind),
        "name": group.name,
        "is_default": bool(group.is_default),
        "member_person_ids": [m.person_id for m in group.members],
        "member_count": len(group.members),
        "exercise_start_date": group.exercise_start_date,
        "work_start_time": group.work_start_time,
        "work_end_time": group.work_end_time,
        "venue": group.venue,
        "appointment_letters_release_enabled": bool(group.appointment_letters_release_enabled),
        "appointment_letters_release_mode": group.appointment_letters_release_mode,
        "appointment_letters_release_at": group.appointment_letters_release_at,
        "bank_details_editable": bool(group.bank_details_editable),
        "created_at": group.created_at,
        "updated_at": group.updated_at,
    }


async def get_group(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    group_id: UUID,
) -> WorkforceExerciseGroup:
    stmt = (
        select(WorkforceExerciseGroup)
        .where(
            WorkforceExerciseGroup.id == group_id,
            WorkforceExerciseGroup.examination_id == examination_id,
            WorkforceExerciseGroup.kind == kind,
        )
        .options(selectinload(WorkforceExerciseGroup.members))
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise WorkforceExerciseGroupNotFoundError("Cohort not found")
    return row


async def list_groups(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
) -> list[dict]:
    await _load_examination(session, examination_id)
    stmt = (
        select(WorkforceExerciseGroup)
        .where(
            WorkforceExerciseGroup.examination_id == examination_id,
            WorkforceExerciseGroup.kind == kind,
        )
        .options(selectinload(WorkforceExerciseGroup.members))
        .order_by(WorkforceExerciseGroup.is_default.desc(), WorkforceExerciseGroup.name)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return [group_response(g) for g in rows]


async def ensure_default_group(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
) -> WorkforceExerciseGroup:
    stmt = select(WorkforceExerciseGroup).where(
        WorkforceExerciseGroup.examination_id == examination_id,
        WorkforceExerciseGroup.kind == kind,
        WorkforceExerciseGroup.is_default.is_(True),
    )
    group = (await session.execute(stmt)).scalar_one_or_none()
    if group is not None:
        return group

    group = WorkforceExerciseGroup(
        examination_id=examination_id,
        kind=kind,
        name=DEFAULT_GROUP_NAMES[kind],
        is_default=True,
    )
    session.add(group)
    await session.flush()
    await session.refresh(group, attribute_names=["members"])
    return group


async def create_group(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    name: str,
    exercise_start_date: datetime | None = None,
    work_start_time: time | None = None,
    work_end_time: time | None = None,
    venue: str | None = None,
) -> dict:
    await _load_examination(session, examination_id)
    clean_name = name.strip()
    if not clean_name:
        raise ValueError("Name is required")

    dup_stmt = select(WorkforceExerciseGroup.id).where(
        WorkforceExerciseGroup.examination_id == examination_id,
        WorkforceExerciseGroup.kind == kind,
        WorkforceExerciseGroup.name == clean_name,
    )
    if (await session.execute(dup_stmt)).scalar_one_or_none() is not None:
        raise ValueError(f"A cohort named '{clean_name}' already exists")

    group = WorkforceExerciseGroup(
        examination_id=examination_id,
        kind=kind,
        name=clean_name,
        is_default=False,
        exercise_start_date=_as_naive_utc(exercise_start_date),
        work_start_time=work_start_time,
        work_end_time=work_end_time,
        venue=(venue or "").strip() or None,
    )
    session.add(group)
    await session.flush()
    await session.refresh(group, attribute_names=["members"])
    return group_response(group)


async def update_group(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    group_id: UUID,
    name: str | None = None,
    exercise_start_date: datetime | None = None,
    work_start_time: time | None = None,
    work_end_time: time | None = None,
    venue: str | None = None,
    update_exercise_start_date: bool = False,
    update_work_start_time: bool = False,
    update_work_end_time: bool = False,
    update_venue: bool = False,
) -> dict:
    group = await get_group(session, examination_id=examination_id, kind=kind, group_id=group_id)

    if name is not None:
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Name is required")
        if clean_name != group.name:
            dup_stmt = select(WorkforceExerciseGroup.id).where(
                WorkforceExerciseGroup.examination_id == examination_id,
                WorkforceExerciseGroup.kind == kind,
                WorkforceExerciseGroup.name == clean_name,
                WorkforceExerciseGroup.id != group_id,
            )
            if (await session.execute(dup_stmt)).scalar_one_or_none() is not None:
                raise ValueError(f"A cohort named '{clean_name}' already exists")
        group.name = clean_name

    if update_exercise_start_date:
        group.exercise_start_date = _as_naive_utc(exercise_start_date)
    if update_work_start_time:
        group.work_start_time = work_start_time
    if update_work_end_time:
        group.work_end_time = work_end_time
    if update_venue:
        group.venue = (venue or "").strip() or None

    group.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(group, attribute_names=["members"])
    return group_response(group)


async def update_group_release(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    group_id: UUID,
    appointment_letters_release_enabled: bool,
    appointment_letters_release_mode: str,
    appointment_letters_release_at: datetime | None,
    bank_details_editable: bool,
) -> dict:
    group = await get_group(session, examination_id=examination_id, kind=kind, group_id=group_id)
    group.appointment_letters_release_enabled = appointment_letters_release_enabled
    group.appointment_letters_release_mode = appointment_letters_release_mode
    group.appointment_letters_release_at = _as_naive_utc(appointment_letters_release_at)
    group.bank_details_editable = bank_details_editable
    group.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(group, attribute_names=["members"])
    return group_response(group)


async def delete_group(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    group_id: UUID,
) -> None:
    group = await get_group(session, examination_id=examination_id, kind=kind, group_id=group_id)
    if group.is_default:
        raise ValueError("The default cohort cannot be deleted.")

    default_group = await ensure_default_group(session, examination_id=examination_id, kind=kind)
    member_ids = [m.person_id for m in group.members]
    await session.delete(group)
    await session.flush()
    for person_id in member_ids:
        existing = await session.get(WorkforceExerciseGroupMember, (default_group.id, person_id))
        if existing is None:
            session.add(
                WorkforceExerciseGroupMember(
                    group_id=default_group.id,
                    person_id=person_id,
                    examination_id=examination_id,
                    kind=kind,
                )
            )
    await session.flush()


async def add_member(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    group_id: UUID,
    person_id: UUID,
) -> dict:
    group = await get_group(session, examination_id=examination_id, kind=kind, group_id=group_id)
    await _validate_person(session, examination_id=examination_id, kind=kind, person_id=person_id)

    await session.execute(
        delete(WorkforceExerciseGroupMember).where(
            WorkforceExerciseGroupMember.examination_id == examination_id,
            WorkforceExerciseGroupMember.kind == kind,
            WorkforceExerciseGroupMember.person_id == person_id,
        )
    )
    session.add(
        WorkforceExerciseGroupMember(
            group_id=group_id,
            person_id=person_id,
            examination_id=examination_id,
            kind=kind,
        )
    )
    group.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(group, attribute_names=["members"])
    return group_response(group)


async def remove_member(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    group_id: UUID,
    person_id: UUID,
) -> dict:
    group = await get_group(session, examination_id=examination_id, kind=kind, group_id=group_id)

    await session.execute(
        delete(WorkforceExerciseGroupMember).where(
            WorkforceExerciseGroupMember.group_id == group_id,
            WorkforceExerciseGroupMember.person_id == person_id,
        )
    )
    await session.flush()

    if not group.is_default:
        default_group = await ensure_default_group(session, examination_id=examination_id, kind=kind)
        existing = await session.get(WorkforceExerciseGroupMember, (default_group.id, person_id))
        if existing is None:
            session.add(
                WorkforceExerciseGroupMember(
                    group_id=default_group.id,
                    person_id=person_id,
                    examination_id=examination_id,
                    kind=kind,
                )
            )
        await session.flush()

    group.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(group, attribute_names=["members"])
    return group_response(group)


async def set_members(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    group_id: UUID,
    person_ids: list[UUID],
) -> dict:
    group = await get_group(session, examination_id=examination_id, kind=kind, group_id=group_id)
    unique_ids = list(dict.fromkeys(person_ids))
    for person_id in unique_ids:
        await _validate_person(session, examination_id=examination_id, kind=kind, person_id=person_id)

    current_ids = {m.person_id for m in group.members}
    target_ids = set(unique_ids)

    for person_id in current_ids - target_ids:
        await remove_member(
            session,
            examination_id=examination_id,
            kind=kind,
            group_id=group_id,
            person_id=person_id,
        )
    for person_id in target_ids - current_ids:
        await add_member(
            session,
            examination_id=examination_id,
            kind=kind,
            group_id=group_id,
            person_id=person_id,
        )

    refreshed = await get_group(session, examination_id=examination_id, kind=kind, group_id=group_id)
    return group_response(refreshed)


async def assign_person_to_cohort_by_name(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    person_id: UUID,
    cohort_name: str | None,
) -> dict:
    """Assign a person to a named cohort (created if needed), or to the default cohort when None."""
    await _validate_person(session, examination_id=examination_id, kind=kind, person_id=person_id)

    clean_name = (cohort_name or "").strip()
    if not clean_name:
        default_group = await ensure_default_group(session, examination_id=examination_id, kind=kind)
        return await add_member(
            session,
            examination_id=examination_id,
            kind=kind,
            group_id=default_group.id,
            person_id=person_id,
        )

    stmt = select(WorkforceExerciseGroup).where(
        WorkforceExerciseGroup.examination_id == examination_id,
        WorkforceExerciseGroup.kind == kind,
        WorkforceExerciseGroup.name == clean_name,
    )
    group = (await session.execute(stmt)).scalar_one_or_none()
    if group is None:
        group = WorkforceExerciseGroup(
            examination_id=examination_id,
            kind=kind,
            name=clean_name,
            is_default=False,
        )
        session.add(group)
        await session.flush()

    return await add_member(
        session,
        examination_id=examination_id,
        kind=kind,
        group_id=group.id,
        person_id=person_id,
    )


async def get_or_create_named_group(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    name: str,
) -> WorkforceExerciseGroup:
    """Get-or-create a named (non-default) cohort by name, returning the ORM entity."""
    trimmed = name.strip()
    if not trimmed:
        raise ValueError("Cohort name is required")
    if trimmed.lower() == DEFAULT_GROUP_NAMES[kind].lower():
        return await ensure_default_group(session, examination_id=examination_id, kind=kind)

    stmt = select(WorkforceExerciseGroup).where(
        WorkforceExerciseGroup.examination_id == examination_id,
        WorkforceExerciseGroup.kind == kind,
        WorkforceExerciseGroup.name == trimmed,
    )
    group = (await session.execute(stmt)).scalar_one_or_none()
    if group is not None:
        return group

    group = WorkforceExerciseGroup(
        examination_id=examination_id,
        kind=kind,
        name=trimmed,
        is_default=False,
    )
    session.add(group)
    await session.flush()
    return group


async def assign_person_to_group(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    person_id: UUID,
    group: WorkforceExerciseGroup,
) -> None:
    """Move a person's cohort membership to an already-resolved group entity."""
    await add_member(
        session,
        examination_id=examination_id,
        kind=kind,
        group_id=group.id,
        person_id=person_id,
    )


def _parse_release_mode(raw: str | AppointmentLettersReleaseMode) -> AppointmentLettersReleaseMode:
    if isinstance(raw, AppointmentLettersReleaseMode):
        return raw
    try:
        return AppointmentLettersReleaseMode(str(raw))
    except ValueError:
        return AppointmentLettersReleaseMode.SCHEDULED_DATE


def is_workforce_appointment_letter_released(
    group: WorkforceExerciseGroup | None,
    *,
    availability_confirmed: bool,
    now: datetime | None = None,
) -> bool:
    """Pure release-policy check on a resolved group (mirrors workforce_portal_release)."""
    if group is None or not group.appointment_letters_release_enabled:
        return False
    mode = _parse_release_mode(group.appointment_letters_release_mode)
    if mode == AppointmentLettersReleaseMode.ON_ACCEPTANCE:
        return availability_confirmed
    release_at = group.appointment_letters_release_at
    if release_at is None:
        return False
    current = now or datetime.utcnow()
    return current >= release_at


async def list_group_member_persons(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    group_id: UUID,
) -> list[ScriptChecker] | list[DataEntryClerk]:
    """Load the actual roster rows (script checkers / data entry clerks) in a group."""
    model = _person_model(kind)
    stmt = (
        select(model)
        .join(WorkforceExerciseGroupMember, WorkforceExerciseGroupMember.person_id == model.id)
        .where(
            WorkforceExerciseGroupMember.group_id == group_id,
            WorkforceExerciseGroupMember.examination_id == examination_id,
            WorkforceExerciseGroupMember.kind == kind,
        )
    )
    return list((await session.execute(stmt)).scalars().unique().all())


async def _default_group_row(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
) -> WorkforceExerciseGroup | None:
    stmt = select(WorkforceExerciseGroup).where(
        WorkforceExerciseGroup.examination_id == examination_id,
        WorkforceExerciseGroup.kind == kind,
        WorkforceExerciseGroup.is_default.is_(True),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_person_exercise_group(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    person_id: UUID,
) -> WorkforceExerciseGroup | None:
    """Resolve the effective exercise group for a person: their non-default membership, else default."""
    stmt = (
        select(WorkforceExerciseGroup)
        .join(
            WorkforceExerciseGroupMember,
            WorkforceExerciseGroupMember.group_id == WorkforceExerciseGroup.id,
        )
        .where(
            WorkforceExerciseGroup.examination_id == examination_id,
            WorkforceExerciseGroup.kind == kind,
            WorkforceExerciseGroupMember.person_id == person_id,
        )
    )
    groups = list((await session.execute(stmt)).scalars().unique().all())
    if groups:
        non_default = next((g for g in groups if not g.is_default), None)
        return non_default or groups[0]
    return await _default_group_row(session, examination_id=examination_id, kind=kind)
