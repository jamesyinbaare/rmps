"""API key management endpoints."""
from datetime import datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_key_generator import generate_api_key, hash_api_key
from app.dependencies.auth import get_current_active_user
from app.dependencies.database import DBSessionDep
from app.models import ApiKey, PortalUser, Role
from app.schemas.api_key import (
    ApiKeyCreate,
    ApiKeyCreateResponse,
    ApiKeyResponse,
    ApiKeyUpdate,
    ApiKeyUsageStats,
)

router = APIRouter(prefix="/api/v1/api-keys", tags=["api-keys"])


# APIUSER role checker
async def api_user_or_above(
    current_user: Annotated[PortalUser, Depends(get_current_active_user)],
) -> PortalUser:
    """Require APIUSER role or above."""
    if current_user.role > Role.APIUSER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="APIUSER role or above required",
        )
    return current_user


@router.post("", response_model=ApiKeyCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    key_data: ApiKeyCreate,
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(api_user_or_above)],
) -> ApiKeyCreateResponse:
    """Create a new API key."""
    # Generate API key
    full_key, key_prefix = generate_api_key()
    key_hash = hash_api_key(full_key)

    # Create API key record
    api_key = ApiKey(
        user_id=current_user.id,
        key_hash=key_hash,
        key_prefix=key_prefix,
        name=key_data.name,
        rate_limit_per_minute=key_data.rate_limit_per_minute or 60,
    )
    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)

    return ApiKeyCreateResponse(
        id=api_key.id,
        name=api_key.name,
        api_key=full_key,  # Show full key only once
        key_prefix=api_key.key_prefix,
        is_active=api_key.is_active,
        created_at=api_key.created_at,
        rate_limit_per_minute=api_key.rate_limit_per_minute,
    )


@router.get("", response_model=list[ApiKeyResponse])
async def list_api_keys(
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(get_current_active_user)],
) -> list[ApiKeyResponse]:
    """List all API keys for the current user."""
    stmt = select(ApiKey).where(ApiKey.user_id == current_user.id).order_by(ApiKey.created_at.desc())
    result = await session.execute(stmt)
    api_keys = result.scalars().all()

    return [ApiKeyResponse.model_validate(key) for key in api_keys]


@router.get("/{key_id}", response_model=ApiKeyResponse)
async def get_api_key(
    key_id: UUID,
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(get_current_active_user)],
) -> ApiKeyResponse:
    """Get API key details."""
    stmt = select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    result = await session.execute(stmt)
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    return ApiKeyResponse.model_validate(api_key)


@router.get("/{key_id}/usage", response_model=ApiKeyUsageStats)
async def get_api_key_usage(
    key_id: UUID,
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(get_current_active_user)],
) -> ApiKeyUsageStats:
    """Get usage statistics for an API key."""
    # Verify ownership
    stmt = select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    result = await session.execute(stmt)
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    # Get usage stats
    from app.models import ApiUsage

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Today's requests
    stmt_today = select(func.count(ApiUsage.id)).where(
        ApiUsage.api_key_id == key_id,
        ApiUsage.request_timestamp >= today_start,
    )
    result_today = await session.execute(stmt_today)
    requests_today = result_today.scalar() or 0

    # This month's requests
    stmt_month = select(func.count(ApiUsage.id)).where(
        ApiUsage.api_key_id == key_id,
        ApiUsage.request_timestamp >= month_start,
    )
    result_month = await session.execute(stmt_month)
    requests_this_month = result_month.scalar() or 0

    # Average duration
    stmt_avg = select(func.avg(ApiUsage.duration_ms)).where(ApiUsage.api_key_id == key_id)
    result_avg = await session.execute(stmt_avg)
    avg_duration = result_avg.scalar()

    return ApiKeyUsageStats(
        total_requests=api_key.total_requests,
        total_verifications=api_key.total_verifications,
        requests_today=requests_today,
        requests_this_month=requests_this_month,
        average_duration_ms=float(avg_duration) if avg_duration else None,
        last_used_at=api_key.last_used_at,
    )


@router.patch("/{key_id}", response_model=ApiKeyResponse)
async def update_api_key(
    key_id: UUID,
    update_data: ApiKeyUpdate,
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(get_current_active_user)],
) -> ApiKeyResponse:
    """Update API key (name, rate limit, or active status)."""
    stmt = select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    result = await session.execute(stmt)
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    if update_data.name is not None:
        api_key.name = update_data.name
    if update_data.rate_limit_per_minute is not None:
        from app.config import settings
        if update_data.rate_limit_per_minute > settings.api_key_max_rate_limit_per_minute:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Rate limit cannot exceed {settings.api_key_max_rate_limit_per_minute}",
            )
        api_key.rate_limit_per_minute = update_data.rate_limit_per_minute
    if update_data.is_active is not None:
        api_key.is_active = update_data.is_active

    await session.commit()
    await session.refresh(api_key)

    return ApiKeyResponse.model_validate(api_key)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    key_id: UUID,
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(get_current_active_user)],
) -> None:
    """Delete (revoke) an API key."""
    stmt = select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    result = await session.execute(stmt)
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    await session.delete(api_key)
    await session.commit()
