"""Clerk daily resolve quota helpers."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ClerkDailyQuotaOverride,
    ClerkQuotaSettings,
    SubjectScoreValidationIssue,
    ValidationIssueStatus,
)

DEFAULT_DAILY_QUOTA = 200


def utc_today() -> date:
    return datetime.utcnow().date()


async def get_base_quota(session: AsyncSession, user_id: UUID) -> int:
    row = (
        await session.execute(
            select(ClerkQuotaSettings).where(ClerkQuotaSettings.user_id == user_id)
        )
    ).scalar_one_or_none()
    if row is None:
        return DEFAULT_DAILY_QUOTA
    return row.daily_resolve_quota


async def get_today_override(
    session: AsyncSession, user_id: UUID, quota_date: date | None = None
) -> ClerkDailyQuotaOverride | None:
    day = quota_date or utc_today()
    return (
        await session.execute(
            select(ClerkDailyQuotaOverride).where(
                ClerkDailyQuotaOverride.user_id == user_id,
                ClerkDailyQuotaOverride.quota_date == day,
            )
        )
    ).scalar_one_or_none()


async def get_effective_quota(session: AsyncSession, user_id: UUID) -> tuple[int, bool]:
    """Return (effective_limit, is_overridden)."""
    override = await get_today_override(session, user_id)
    if override is not None:
        return override.override_quota, True
    return await get_base_quota(session, user_id), False


async def count_resolved_today(session: AsyncSession, user_id: UUID) -> int:
    day_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    result = await session.execute(
        select(func.count())
        .select_from(SubjectScoreValidationIssue)
        .where(
            SubjectScoreValidationIssue.status == ValidationIssueStatus.RESOLVED,
            SubjectScoreValidationIssue.resolved_by_user_id == user_id,
            SubjectScoreValidationIssue.resolved_at >= day_start,
        )
    )
    return result.scalar() or 0
