"""Depot keeper scope: schools in depot and examination centre hosts reachable from them."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import School, User, UserRole
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
    """Distinct examination centre host school ids for all schools in the depot."""
    stmt = select(School).where(School.depot_id == depot_id)
    result = await session.execute(stmt)
    schools = list(result.scalars().all())
    hosts: set[UUID] = set()
    for sch in schools:
        host = await resolve_center_host_school(session, sch)
        hosts.add(host.id)
    return hosts


async def script_scope_for_school(session: AsyncSession, school: School) -> set[UUID]:
    """Centre scope (host + satellites) used for script packing rows for this school."""
    host = await resolve_center_host_school(session, school)
    return await center_scope_school_ids(session, host)


async def assert_school_in_depot(school_id: UUID, depot_school_ids_set: set[UUID]) -> None:
    if school_id not in depot_school_ids_set:
        raise ValueError("School is not in your depot")


async def assert_center_in_depot(center_id: UUID, depot_center_ids: set[UUID]) -> None:
    if center_id not in depot_center_ids:
        raise ValueError("Examination centre is not in your depot")
