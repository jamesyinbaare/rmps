"""Depot keeper scope: schools in depot and examination centre hosts reachable from them."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import School, User, UserRole
from app.services.centre_resolution import resolve_centre_for_user_school
from app.services.timetable_service import center_scope_school_ids, resolve_center_host_school


async def require_depot_id_for_depot_keeper(_session: AsyncSession, user: User) -> UUID:
    if user.role != UserRole.DEPOT_KEEPER:
        raise PermissionError("Depot keeper access only")
    if user.depot_id is None:
        raise ValueError("Account is not linked to a depot")
    return user.depot_id


async def depot_school_ids(session: AsyncSession, depot_id: UUID) -> set[UUID]:
    stmt = select(School.id).where(School.depot_id == depot_id)
    result = await session.execute(stmt)
    return {row[0] for row in result.all()}


async def depot_center_host_ids(session: AsyncSession, depot_id: UUID) -> set[UUID]:
    """Deprecated: use ``depot_examination_centre_ids`` with an examination id."""
    stmt = select(School).where(School.depot_id == depot_id)
    result = await session.execute(stmt)
    schools = list(result.scalars().all())
    hosts: set[UUID] = set()
    for sch in schools:
        if sch.writes_at_center_id is None:
            hosts.add(sch.id)
        elif sch.writes_at_center_id is not None:
            hosts.add(sch.writes_at_center_id)
    return hosts


async def depot_examination_centre_ids(
    session: AsyncSession,
    depot_id: UUID,
    examination_id: int,
) -> set[UUID]:
    """Distinct examination centre ids for all schools in the depot for this examination."""
    stmt = select(School).where(School.depot_id == depot_id)
    result = await session.execute(stmt)
    schools = list(result.scalars().all())
    centres: set[UUID] = set()
    for sch in schools:
        try:
            centre = await resolve_centre_for_user_school(session, examination_id, sch)
            centres.add(centre.id)
        except Exception:
            continue
    return centres


async def script_scope_for_school(
    session: AsyncSession,
    school: School,
    examination_id: int,
) -> set[UUID]:
    """Centre scope used for script packing rows for this school."""
    host = await resolve_center_host_school(session, school, examination_id)
    return await center_scope_school_ids(session, host, examination_id)


async def assert_school_in_depot(school_id: UUID, depot_school_ids_set: set[UUID]) -> None:
    if school_id not in depot_school_ids_set:
        raise ValueError("School is not in your depot")


async def assert_center_in_depot(center_id: UUID, depot_center_ids: set[UUID]) -> None:
    if center_id not in depot_center_ids:
        raise ValueError("Examination centre is not in your depot")
