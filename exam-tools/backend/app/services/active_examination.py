"""Resolve the active examination for staff (supervisor, inspector, depot keeper) flows."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Examination, SystemSettings


async def resolve_active_examination_id(session: AsyncSession) -> int:
    """Pick the examination id staff dashboards and inspector sign-in should use.

    Order of precedence:

    1. Admin-selected examination in ``system_settings`` (row ``id`` = 1).
    2. Environment ``ACTIVE_INSPECTOR_EXAMINATION_ID`` (deployment override).
    3. The most recently created examination (``created_at`` desc, then ``id`` desc).

    Raises ``HTTPException`` 503 when no examination can be resolved.
    """
    row = await session.get(SystemSettings, 1)
    if row is not None and row.active_examination_id is not None:
        ex = await session.get(Examination, row.active_examination_id)
        if ex is not None:
            return int(row.active_examination_id)

    if settings.active_inspector_examination_id is not None:
        eid = settings.active_inspector_examination_id
        ex = await session.get(Examination, eid)
        if ex is not None:
            return int(eid)

    stmt = select(Examination).order_by(Examination.created_at.desc(), Examination.id.desc()).limit(1)
    result = await session.execute(stmt)
    latest = result.scalar_one_or_none()
    if latest is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No examinations in the database; cannot pick an active examination",
        )
    return int(latest.id)


async def require_active_inspector_examination_id(session: AsyncSession) -> int:
    """Alias for :func:`resolve_active_examination_id` (inspector auth and legacy call sites)."""
    return await resolve_active_examination_id(session)
