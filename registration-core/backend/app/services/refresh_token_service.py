"""Refresh token create / lookup / rotation helpers."""
from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import (
    create_refresh_token,
    hash_refresh_token,
    refresh_token_lookup_hash,
    verify_refresh_token_hash,
)
from app.models import RefreshToken
from app.services.password_setup_service import revoke_user_refresh_tokens


async def store_refresh_token(session: AsyncSession, user_id: UUID) -> str:
    """Create and persist a refresh token; enforce max concurrent sessions. Returns raw token."""
    plain = create_refresh_token()
    lookup = refresh_token_lookup_hash(plain)
    row = RefreshToken(
        user_id=user_id,
        token=hash_refresh_token(plain),
        token_lookup=lookup,
        expires_at=datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days),
    )
    session.add(row)
    await session.flush()
    await _enforce_session_cap(session, user_id)
    return plain


async def _enforce_session_cap(session: AsyncSession, user_id: UUID) -> None:
    limit = settings.max_refresh_sessions_per_user
    if limit <= 0:
        return
    result = await session.execute(
        select(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > datetime.utcnow(),
        )
        .order_by(RefreshToken.created_at.desc())
    )
    active = list(result.scalars().all())
    if len(active) <= limit:
        return
    for stale in active[limit:]:
        stale.revoked_at = datetime.utcnow()


async def find_refresh_token(
    session: AsyncSession, plain_token: str, *, include_revoked: bool = False
) -> RefreshToken | None:
    lookup = refresh_token_lookup_hash(plain_token)
    stmt = select(RefreshToken).where(RefreshToken.token_lookup == lookup)
    if not include_revoked:
        stmt = stmt.where(RefreshToken.revoked_at.is_(None))
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    if row is not None:
        if verify_refresh_token_hash(plain_token, row.token):
            return row
        return None

    # Legacy rows without token_lookup: scan non-revoked (or all if include_revoked)
    stmt = select(RefreshToken)
    if not include_revoked:
        stmt = stmt.where(RefreshToken.revoked_at.is_(None))
    result = await session.execute(stmt)
    for token in result.scalars().all():
        if token.token_lookup:
            continue
        if verify_refresh_token_hash(plain_token, token.token):
            # Backfill lookup for next time
            token.token_lookup = lookup
            return token
    return None


async def rotate_refresh_token(
    session: AsyncSession, old: RefreshToken, user_id: UUID
) -> str:
    old.revoked_at = datetime.utcnow()
    old.last_used_at = datetime.utcnow()
    return await store_refresh_token(session, user_id)


async def handle_refresh_reuse(
    session: AsyncSession, plain_token: str
) -> RefreshToken | None:
    """If a revoked token is presented again, revoke all sessions for that user."""
    row = await find_refresh_token(session, plain_token, include_revoked=True)
    if row is None:
        return None
    if row.revoked_at is not None:
        await revoke_user_refresh_tokens(session, row.user_id)
        await session.commit()
        return row
    return row
