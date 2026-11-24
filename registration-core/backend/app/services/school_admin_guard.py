"""Enforce at most one active SchoolAdmin (coordinator) per school."""
from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PortalUser, Role

ACTIVE_SCHOOL_ADMIN_EXISTS_MSG = (
    "This school already has an active coordinator. "
    "Deactivate them or use Replace coordinator."
)

UQ_ONE_ACTIVE_SCHOOL_ADMIN = "uq_one_active_school_admin"


async def count_active_school_admins(
    session: AsyncSession,
    school_id: int,
    *,
    exclude_user_id: UUID | None = None,
) -> int:
    stmt = (
        select(func.count())
        .select_from(PortalUser)
        .where(
            PortalUser.school_id == school_id,
            PortalUser.role == Role.SchoolAdmin,
            PortalUser.is_active.is_(True),
        )
    )
    if exclude_user_id is not None:
        stmt = stmt.where(PortalUser.id != exclude_user_id)
    result = await session.execute(stmt)
    return int(result.scalar_one())


async def assert_school_has_no_active_admin(
    session: AsyncSession,
    school_id: int,
    *,
    exclude_user_id: UUID | None = None,
) -> None:
    """Raise 400 if the school already has an active SchoolAdmin."""
    count = await count_active_school_admins(
        session, school_id, exclude_user_id=exclude_user_id
    )
    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ACTIVE_SCHOOL_ADMIN_EXISTS_MSG,
        )


def is_one_active_school_admin_violation(exc: BaseException) -> bool:
    """True when a DB unique violation is from the one-active-admin partial index."""
    msg = str(getattr(exc, "orig", None) or exc).lower()
    return UQ_ONE_ACTIVE_SCHOOL_ADMIN.lower() in msg
