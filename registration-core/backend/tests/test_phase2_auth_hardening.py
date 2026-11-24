"""Phase 2 auth hardening unit tests."""
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.config import settings
from app.core.rate_limit import _buckets, check_rate_limit
from app.core.security import (
    DEFAULT_SECRET_KEY,
    assert_secret_key_safe_for_boot,
    refresh_token_lookup_hash,
    system_admin_provisioning_allowed,
)
from app.models import PortalUser, RefreshToken, Role
from app.services.password_policy import validate_password_policy
from app.services.refresh_token_service import find_refresh_token, handle_refresh_reuse


def test_password_policy_min_length(monkeypatch):
    monkeypatch.setattr(settings, "password_min_length", 12)
    monkeypatch.setattr(settings, "password_breach_check_enabled", False)
    with pytest.raises(ValueError, match="at least 12"):
        validate_password_policy("short")
    validate_password_policy("long-enough-pw")


def test_password_policy_rejects_email_and_username(monkeypatch):
    monkeypatch.setattr(settings, "password_min_length", 8)
    monkeypatch.setattr(settings, "password_breach_check_enabled", False)
    with pytest.raises(ValueError, match="email"):
        validate_password_policy("User@Example.com", email="user@example.com")
    with pytest.raises(ValueError, match="username"):
        validate_password_policy("Cool_User", username="cool_user")


def test_secret_key_boot_check_rejects_default_in_production(monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "secret_key", DEFAULT_SECRET_KEY)
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        assert_secret_key_safe_for_boot()


def test_secret_key_boot_check_allows_dev_default(monkeypatch):
    monkeypatch.setattr(settings, "environment", "development")
    monkeypatch.setattr(settings, "secret_key", DEFAULT_SECRET_KEY)
    assert_secret_key_safe_for_boot()


def test_system_admin_provisioning_flag(monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "allow_system_admin_provisioning", None)
    assert system_admin_provisioning_allowed() is False
    monkeypatch.setattr(settings, "allow_system_admin_provisioning", True)
    assert system_admin_provisioning_allowed() is True
    monkeypatch.setattr(settings, "environment", "development")
    monkeypatch.setattr(settings, "allow_system_admin_provisioning", None)
    assert system_admin_provisioning_allowed() is True


def test_rate_limit_in_process_fallback():
    _buckets.clear()
    key = f"test-{uuid4()}"
    assert check_rate_limit(key, limit=2) is True
    assert check_rate_limit(key, limit=2) is True
    assert check_rate_limit(key, limit=2) is False


@pytest.mark.asyncio
async def test_refresh_reuse_revokes_all_sessions():
    user_id = uuid4()
    plain = "reuse-token-plain"
    lookup = refresh_token_lookup_hash(plain)
    revoked = RefreshToken(
        id=uuid4(),
        user_id=user_id,
        token="bcrypt-hash",
        token_lookup=lookup,
        expires_at=datetime.utcnow() + timedelta(days=1),
        revoked_at=datetime.utcnow(),
    )
    session = AsyncMock()
    session.commit = AsyncMock()

    with (
        patch(
            "app.services.refresh_token_service.find_refresh_token",
            new_callable=AsyncMock,
            return_value=revoked,
        ),
        patch(
            "app.services.refresh_token_service.revoke_user_refresh_tokens",
            new_callable=AsyncMock,
        ) as revoke,
    ):
        result = await handle_refresh_reuse(session, plain)

    assert result is revoked
    revoke.assert_awaited_once_with(session, user_id)


@pytest.mark.asyncio
async def test_find_refresh_token_verifies_lookup():
    plain = "plain-refresh"
    lookup = refresh_token_lookup_hash(plain)
    row = RefreshToken(
        id=uuid4(),
        user_id=uuid4(),
        token="hashed",
        token_lookup=lookup,
        expires_at=datetime.utcnow() + timedelta(days=1),
        revoked_at=None,
    )
    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=row))
    )

    with patch(
        "app.services.refresh_token_service.verify_refresh_token_hash",
        return_value=True,
    ):
        found = await find_refresh_token(session, plain)

    assert found is row


@pytest.mark.asyncio
async def test_record_account_event():
    from app.services.account_audit import USER_CREATED, record_account_event

    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    target = uuid4()
    event = await record_account_event(
        session,
        action=USER_CREATED,
        target_user_id=target,
        metadata={"role": "PublicUser"},
    )
    assert event.action == USER_CREATED
    assert event.target_user_id == target
    session.add.assert_called_once()


@pytest.mark.asyncio
async def test_create_admin_user_blocks_system_admin(monkeypatch):
    from app.routers.admin_registration import create_admin_user
    from app.schemas.user import AdminUserCreate

    monkeypatch.setattr(settings, "allow_system_admin_provisioning", False)
    monkeypatch.setattr(settings, "environment", "production")

    session = AsyncMock()
    actor = PortalUser(
        id=uuid4(),
        email="admin@x.com",
        username="admin@x.com",
        hashed_password="x",
        full_name="Admin",
        role=Role.SystemAdmin,
        is_active=True,
    )
    with pytest.raises(HTTPException) as exc:
        await create_admin_user(
            AdminUserCreate(
                email="peer@x.com",
                full_name="Peer",
                role=Role.SystemAdmin,
            ),
            session,
            actor,
        )
    assert exc.value.status_code == 403
