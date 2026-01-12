"""API key authentication dependencies."""
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_key_generator import hash_api_key
from app.core.security import verify_refresh_token_hash
from app.dependencies.database import DBSessionDep
from app.models import ApiKey, PortalUser

# HTTP Bearer token security scheme for API keys
api_key_security = HTTPBearer(auto_error=False)


async def get_api_key_user(
    session: DBSessionDep,
    credentials: HTTPAuthorizationCredentials | None = Depends(api_key_security),
    x_api_key: str | None = None,
) -> tuple[PortalUser, ApiKey]:
    """
    Extract and validate API key, then return the user and API key.

    Supports both:
    - X-API-Key header
    - Authorization: Bearer <api-key> header

    Args:
        session: Database session
        credentials: HTTP Bearer credentials (optional)
        x_api_key: X-API-Key header value (optional)

    Returns:
        Tuple of (PortalUser, ApiKey)

    Raises:
        HTTPException: If API key is invalid or inactive
    """
    # Get API key from header
    api_key = None
    if x_api_key:
        api_key = x_api_key
    elif credentials:
        api_key = credentials.credentials

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required. Provide via X-API-Key header or Authorization: Bearer <key>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Validate format
    if not api_key.startswith("ctvet_"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key format",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Hash the provided key
    key_hash = hash_api_key(api_key)

    # Find API key in database
    stmt = select(ApiKey).where(ApiKey.key_hash == key_hash)
    result = await session.execute(stmt)
    api_key_obj = result.scalar_one_or_none()

    if not api_key_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if active
    if not api_key_obj.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key is inactive",
        )

    # Get user
    stmt = select(PortalUser).where(PortalUser.id == api_key_obj.user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    # Update last_used_at
    from datetime import datetime
    api_key_obj.last_used_at = datetime.utcnow()
    await session.commit()

    return user, api_key_obj
