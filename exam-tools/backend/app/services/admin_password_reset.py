"""Shared super-admin password reset for depot keepers and staff email roles."""

from __future__ import annotations

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.passwords import generate_inspector_password
from app.core.security import get_password_hash
from app.models import RefreshToken, User
from app.schemas.password_reset import AdminPasswordReset, AdminPasswordResetResponse


def resolve_password_from_reset(data: AdminPasswordReset) -> tuple[str, str | None]:
    """Return ``(plain_password, generated_password)``; ``generated_password`` set only for auto mode."""
    if data.mode == "auto":
        generated = generate_inspector_password(8)
        return generated, generated
    assert data.new_password is not None
    if len(data.new_password) < settings.password_min_length:
        raise ValueError(
            f"password must be at least {settings.password_min_length} characters",
        )
    return data.new_password, None


async def apply_admin_password_reset(
    session: AsyncSession,
    user: User,
    data: AdminPasswordReset,
) -> AdminPasswordResetResponse:
    new_password, generated_password = resolve_password_from_reset(data)
    user.hashed_password = get_password_hash(new_password)
    await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    await session.commit()
    return AdminPasswordResetResponse(generated_password=generated_password)
