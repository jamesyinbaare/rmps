"""Helpers for the singleton AppSettings row."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSettings

SINGLETON_ID = 1


async def get_or_create_app_settings(session: AsyncSession) -> AppSettings:
    result = await session.execute(select(AppSettings).where(AppSettings.id == SINGLETON_ID))
    row = result.scalar_one_or_none()
    if row is not None:
        return row
    row = AppSettings(
        id=SINGLETON_ID,
        clerk_digital_entry_enabled=False,
        updated_at=datetime.utcnow(),
    )
    session.add(row)
    await session.flush()
    return row


async def is_clerk_digital_entry_enabled(session: AsyncSession) -> bool:
    settings = await get_or_create_app_settings(session)
    return bool(settings.clerk_digital_entry_enabled)


async def set_clerk_digital_entry_enabled(
    session: AsyncSession,
    enabled: bool,
    updated_by_user_id: UUID | None = None,
) -> AppSettings:
    settings = await get_or_create_app_settings(session)
    settings.clerk_digital_entry_enabled = enabled
    settings.updated_at = datetime.utcnow()
    settings.updated_by_user_id = updated_by_user_id
    await session.flush()
    return settings
