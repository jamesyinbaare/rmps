"""School–programme association helpers."""

from __future__ import annotations

from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import school_programmes


async def ensure_school_programme(
    session: AsyncSession, school_id: int, programme_id: int
) -> None:
    """Quietly associate programme with school if not already linked. Caller commits."""
    result = await session.execute(
        select(school_programmes).where(
            school_programmes.c.school_id == school_id,
            school_programmes.c.programme_id == programme_id,
        )
    )
    if result.first() is not None:
        return

    await session.execute(
        insert(school_programmes).values(school_id=school_id, programme_id=programme_id)
    )
