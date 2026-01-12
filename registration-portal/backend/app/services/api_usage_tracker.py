"""Service for tracking API usage and billing."""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    ApiKey,
    ApiUsage,
    ApiRequestSource,
    ApiRequestType,
    PortalUser,
)
from app.services.credit_service import check_credit_balance, deduct_credit


async def check_and_deduct_credit(
    session: AsyncSession,
    user_id: UUID,
) -> None:
    """
    Check credit balance and deduct if sufficient.

    Args:
        session: Database session
        user_id: User ID

    Raises:
        HTTPException: If insufficient credit
    """
    cost = Decimal(str(settings.credit_cost_per_verification))

    # Check balance
    has_credit = await check_credit_balance(session, user_id, cost)
    if not has_credit:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient credit. Required: {cost} credit(s) per verification request.",
        )

    # Deduct credit (will be done after successful verification)


async def record_api_usage(
    session: AsyncSession,
    user_id: UUID,
    api_key_id: Optional[UUID],
    request_source: ApiRequestSource,
    request_type: ApiRequestType,
    verification_count: int,
    response_status: int,
    duration_ms: int,
    start_time: datetime,
) -> ApiUsage:
    """
    Record API usage and deduct credit.

    Args:
        session: Database session
        user_id: User ID
        api_key_id: API key ID (None for dashboard requests)
        request_source: Source of request (API_KEY or DASHBOARD)
        request_type: Type of request (SINGLE or BULK)
        verification_count: Number of candidates verified
        response_status: HTTP response status code
        duration_ms: Request duration in milliseconds
        start_time: When the request started

    Returns:
        Created ApiUsage record
    """
    cost = Decimal(str(settings.credit_cost_per_verification))

    # Deduct credit after successful verification (status 200)
    if response_status == 200:
        await deduct_credit(
            session,
            user_id,
            cost,
            description=f"Credit used for {request_source.value} {request_type.value} verification",
        )

    # Update API key stats if applicable
    if api_key_id:
        stmt = select(ApiKey).where(ApiKey.id == api_key_id)
        result = await session.execute(stmt)
        api_key = result.scalar_one_or_none()

        if api_key:
            api_key.total_requests += 1
            api_key.total_verifications += verification_count
            api_key.last_used_at = datetime.utcnow()

    # Create usage record
    usage = ApiUsage(
        api_key_id=api_key_id,
        user_id=user_id,
        request_source=request_source,
        request_type=request_type,
        verification_count=verification_count,
        request_timestamp=start_time,
        response_status=response_status,
        duration_ms=duration_ms,
    )
    session.add(usage)
    await session.commit()
    await session.refresh(usage)

    return usage
