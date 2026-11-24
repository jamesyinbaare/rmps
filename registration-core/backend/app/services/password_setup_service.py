"""Invite / admin-reset password setup tokens."""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.cache import invalidate_user_cache
from app.core.security import get_password_hash
from app.models import PasswordSetupPurpose, PasswordSetupToken, PortalUser, RefreshToken
from app.services.email_service import send_password_setup_email

logger = logging.getLogger(__name__)


def hash_password_setup_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def build_password_setup_url(raw_token: str) -> str:
    base = (settings.frontend_base_url or "http://localhost:3002").rstrip("/")
    return f"{base}/set-password?token={raw_token}"


def generate_unusable_password_hash() -> str:
    return get_password_hash(secrets.token_urlsafe(32))


async def revoke_user_refresh_tokens(session: AsyncSession, user_id: UUID) -> None:
    await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.utcnow())
    )


async def create_password_setup_token(
    session: AsyncSession,
    user: PortalUser,
    *,
    purpose: PasswordSetupPurpose = PasswordSetupPurpose.INVITE,
) -> str:
    """Invalidate prior unused tokens and create a new one. Returns raw token."""
    now = datetime.utcnow()
    existing = (
        await session.execute(
            select(PasswordSetupToken).where(
                PasswordSetupToken.user_id == user.id,
                PasswordSetupToken.used_at.is_(None),
            )
        )
    ).scalars().all()
    for token in existing:
        token.used_at = now

    raw = secrets.token_urlsafe(32)
    record = PasswordSetupToken(
        user_id=user.id,
        token_hash=hash_password_setup_token(raw),
        purpose=purpose,
        expires_at=now + timedelta(hours=settings.password_setup_token_expiry_hours),
    )
    session.add(record)
    await session.flush()
    return raw


async def issue_and_send_password_setup(
    session: AsyncSession,
    user: PortalUser,
    *,
    purpose: PasswordSetupPurpose = PasswordSetupPurpose.INVITE,
) -> bool:
    """Create token, commit-safe flush, send email. Returns whether email send succeeded."""
    raw = await create_password_setup_token(session, user, purpose=purpose)
    await session.flush()
    url = build_password_setup_url(raw)
    sent = send_password_setup_email(
        to=user.email,
        full_name=user.full_name or user.email,
        setup_url=url,
        expiry_hours=settings.password_setup_token_expiry_hours,
        purpose=purpose.value,
    )
    if not sent:
        logger.warning(
            "Password setup email failed for user_id=%s purpose=%s",
            user.id,
            purpose.value,
        )
    return sent


def _token_is_usable(record: PasswordSetupToken | None) -> bool:
    if record is None:
        return False
    if record.used_at is not None:
        return False
    if record.expires_at <= datetime.utcnow():
        return False
    return True


async def validate_password_setup_token(session: AsyncSession, raw_token: str) -> bool:
    if not raw_token or not raw_token.strip():
        return False
    token_hash = hash_password_setup_token(raw_token.strip())
    record = (
        await session.execute(
            select(PasswordSetupToken).where(PasswordSetupToken.token_hash == token_hash)
        )
    ).scalar_one_or_none()
    return _token_is_usable(record)


async def consume_password_setup_token(
    session: AsyncSession,
    raw_token: str,
    new_password: str,
) -> PortalUser | None:
    """
    Consume a valid token and set the user's password.
    Returns the user on success, None for any invalid/expired/used token.
    """
    if not raw_token or not raw_token.strip():
        return None
    if not new_password.strip():
        raise ValueError("Password cannot be empty")

    token_hash = hash_password_setup_token(raw_token.strip())
    record = (
        await session.execute(
            select(PasswordSetupToken)
            .where(PasswordSetupToken.token_hash == token_hash)
            .options(selectinload(PasswordSetupToken.user))
        )
    ).scalar_one_or_none()

    if not _token_is_usable(record):
        return None

    user = record.user
    if user is None or not user.is_active:
        return None

    from app.services.password_policy import validate_password_policy

    validate_password_policy(
        new_password, email=user.email, username=getattr(user, "username", None)
    )

    user.hashed_password = get_password_hash(new_password)
    record.used_at = datetime.utcnow()

    # Invalidate any other unused tokens for this user
    others = (
        await session.execute(
            select(PasswordSetupToken).where(
                PasswordSetupToken.user_id == user.id,
                PasswordSetupToken.id != record.id,
                PasswordSetupToken.used_at.is_(None),
            )
        )
    ).scalars().all()
    for other in others:
        other.used_at = datetime.utcnow()

    await revoke_user_refresh_tokens(session, user.id)
    await session.flush()
    invalidate_user_cache(user_id=user.id, email=user.email)
    return user
