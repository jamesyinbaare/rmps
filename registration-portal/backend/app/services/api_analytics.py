"""Service for API usage analytics and statistics."""
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApiUsage, ApiKey, ApiRequestType


async def get_user_usage_stats(
    session: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> dict:
    """
    Get usage statistics for a user.

    Args:
        session: Database session
        user_id: User ID
        start_date: Start date for filtering (optional)
        end_date: End date for filtering (optional)

    Returns:
        Dictionary with usage statistics
    """
    # Build base query
    base_conditions = [ApiUsage.user_id == user_id]

    if start_date:
        base_conditions.append(ApiUsage.request_timestamp >= start_date)
    if end_date:
        base_conditions.append(ApiUsage.request_timestamp <= end_date)

    # Total requests
    total_stmt = select(func.count(ApiUsage.id)).where(and_(*base_conditions))
    total_result = await session.execute(total_stmt)
    total_requests = total_result.scalar() or 0

    # Total verifications
    verification_stmt = select(func.sum(ApiUsage.verification_count)).where(and_(*base_conditions))
    verification_result = await session.execute(verification_stmt)
    total_verifications = verification_result.scalar() or 0

    # Successful requests (status 200)
    success_conditions = base_conditions + [ApiUsage.response_status == 200]
    success_stmt = select(func.count(ApiUsage.id)).where(and_(*success_conditions))
    success_result = await session.execute(success_stmt)
    successful_requests = success_result.scalar() or 0

    # Failed requests
    failed_requests = total_requests - successful_requests

    # Average duration
    avg_duration_stmt = select(func.avg(ApiUsage.duration_ms)).where(and_(*base_conditions))
    avg_duration_result = await session.execute(avg_duration_stmt)
    avg_duration = avg_duration_result.scalar()

    # Get date ranges for period stats
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Today's requests
    today_conditions = base_conditions + [ApiUsage.request_timestamp >= today_start]
    today_stmt = select(func.count(ApiUsage.id)).where(and_(*today_conditions))
    today_result = await session.execute(today_stmt)
    requests_today = today_result.scalar() or 0

    # This week's requests
    week_conditions = base_conditions + [ApiUsage.request_timestamp >= week_start]
    week_stmt = select(func.count(ApiUsage.id)).where(and_(*week_conditions))
    week_result = await session.execute(week_stmt)
    requests_this_week = week_result.scalar() or 0

    # This month's requests
    month_conditions = base_conditions + [ApiUsage.request_timestamp >= month_start]
    month_stmt = select(func.count(ApiUsage.id)).where(and_(*month_conditions))
    month_result = await session.execute(month_stmt)
    requests_this_month = month_result.scalar() or 0

    return {
        "total_requests": total_requests,
        "total_verifications": total_verifications or 0,
        "requests_today": requests_today,
        "requests_this_week": requests_this_week,
        "requests_this_month": requests_this_month,
        "successful_requests": successful_requests,
        "failed_requests": failed_requests,
        "average_duration_ms": float(avg_duration) if avg_duration else None,
    }


async def get_api_key_usage_stats(
    session: AsyncSession,
    api_key_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> dict:
    """
    Get usage statistics for an API key.

    Args:
        session: Database session
        api_key_id: API key ID
        start_date: Start date for filtering (optional)
        end_date: End date for filtering (optional)

    Returns:
        Dictionary with usage statistics
    """
    base_conditions = [ApiUsage.api_key_id == api_key_id]

    if start_date:
        base_conditions.append(ApiUsage.request_timestamp >= start_date)
    if end_date:
        base_conditions.append(ApiUsage.request_timestamp <= end_date)

    # Total requests
    total_stmt = select(func.count(ApiUsage.id)).where(and_(*base_conditions))
    total_result = await session.execute(total_stmt)
    total_requests = total_result.scalar() or 0

    # Total verifications
    verification_stmt = select(func.sum(ApiUsage.verification_count)).where(and_(*base_conditions))
    verification_result = await session.execute(verification_stmt)
    total_verifications = verification_result.scalar() or 0

    # Average duration
    avg_duration_stmt = select(func.avg(ApiUsage.duration_ms)).where(and_(*base_conditions))
    avg_duration_result = await session.execute(avg_duration_stmt)
    avg_duration = avg_duration_result.scalar()

    return {
        "total_requests": total_requests,
        "total_verifications": total_verifications or 0,
        "average_duration_ms": float(avg_duration) if avg_duration else None,
    }


async def get_usage_timeline(
    session: AsyncSession,
    user_id: UUID,
    period: str = "daily",  # daily, weekly, monthly
    days: int = 30,
) -> list[dict]:
    """
    Get usage over time.

    Args:
        session: Database session
        user_id: User ID
        period: Aggregation period (daily, weekly, monthly)
        days: Number of days to look back

    Returns:
        List of dictionaries with date and request count
    """
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)

    # Build query based on period
    if period == "daily":
        date_trunc = func.date_trunc("day", ApiUsage.request_timestamp)
    elif period == "weekly":
        date_trunc = func.date_trunc("week", ApiUsage.request_timestamp)
    elif period == "monthly":
        date_trunc = func.date_trunc("month", ApiUsage.request_timestamp)
    else:
        date_trunc = func.date_trunc("day", ApiUsage.request_timestamp)

    stmt = (
        select(
            date_trunc.label("period"),
            func.count(ApiUsage.id).label("request_count"),
            func.sum(ApiUsage.verification_count).label("verification_count"),
        )
        .where(
            and_(
                ApiUsage.user_id == user_id,
                ApiUsage.request_timestamp >= start_date,
                ApiUsage.request_timestamp <= end_date,
            )
        )
        .group_by(date_trunc)
        .order_by(date_trunc)
    )

    result = await session.execute(stmt)
    rows = result.all()

    return [
        {
            "date": row.period.isoformat() if hasattr(row.period, "isoformat") else str(row.period),
            "request_count": row.request_count or 0,
            "verification_count": row.verification_count or 0,
        }
        for row in rows
    ]


async def get_top_api_keys(
    session: AsyncSession,
    user_id: UUID,
    limit: int = 10,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> list[dict]:
    """
    Get most used API keys for a user.

    Args:
        session: Database session
        user_id: User ID
        limit: Number of top keys to return
        start_date: Start date for filtering (optional)
        end_date: End date for filtering (optional)

    Returns:
        List of dictionaries with API key info and usage stats
    """
    base_conditions = [
        ApiUsage.user_id == user_id,
        ApiUsage.api_key_id.isnot(None),
    ]

    if start_date:
        base_conditions.append(ApiUsage.request_timestamp >= start_date)
    if end_date:
        base_conditions.append(ApiUsage.request_timestamp <= end_date)

    stmt = (
        select(
            ApiKey.id,
            ApiKey.name,
            ApiKey.key_prefix,
            func.count(ApiUsage.id).label("request_count"),
            func.sum(ApiUsage.verification_count).label("verification_count"),
        )
        .join(ApiKey, ApiUsage.api_key_id == ApiKey.id)
        .where(and_(*base_conditions))
        .group_by(ApiKey.id, ApiKey.name, ApiKey.key_prefix)
        .order_by(func.count(ApiUsage.id).desc())
        .limit(limit)
    )

    result = await session.execute(stmt)
    rows = result.all()

    return [
        {
            "api_key_id": str(row.id),
            "name": row.name,
            "key_prefix": row.key_prefix,
            "request_count": row.request_count or 0,
            "verification_count": row.verification_count or 0,
        }
        for row in rows
    ]
