"""List and load staff email-login user accounts for super-admin management."""

from __future__ import annotations

from typing import cast
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import asc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, UserRole
from app.schemas.password_reset import StaffEmailUserListResponse, StaffEmailUserRow


async def load_staff_email_user(
    session: AsyncSession,
    user_id: UUID,
    role: UserRole,
    *,
    not_found_detail: str,
) -> User:
    stmt = select(User).where(User.id == user_id, User.role == role)
    user = (await session.execute(stmt)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found_detail)
    return user


async def list_staff_email_users(
    session: AsyncSession,
    role: UserRole,
    *,
    skip: int,
    limit: int,
) -> StaffEmailUserListResponse:
    filters = [User.role == role]
    total = int(
        await session.scalar(select(func.count()).select_from(User).where(*filters)) or 0,
    )
    stmt = (
        select(User)
        .where(*filters)
        .order_by(asc(User.full_name), asc(User.id))
        .offset(skip)
        .limit(limit)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    items = [
        StaffEmailUserRow(
            id=row.id,
            full_name=cast(str, row.full_name),
            email=cast(str, row.email),
            is_active=bool(row.is_active),
            created_at=row.created_at,
        )
        for row in rows
    ]
    return StaffEmailUserListResponse(items=items, total=total)
