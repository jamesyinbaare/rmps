"""Tests for account management hardening (invite staff, login, sessions)."""
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.config import settings
from app.core.rate_limit import _buckets
from app.models import PasswordSetupPurpose, PortalUser, Role
from app.routers.auth import login, register
from app.schemas.auth import PublicUserCreate, UserLogin, UserPasswordChange
from app.schemas.user import SchoolUserCreate


def _clear_rate_limits() -> None:
    _buckets.clear()


def _request(ip: str = "127.0.0.1") -> MagicMock:
    request = MagicMock()
    request.headers = {}
    request.client = MagicMock()
    request.client.host = ip
    return request


def _user(**kwargs) -> PortalUser:
    defaults = dict(
        id=uuid4(),
        email="user@example.com",
        username="cool_user",
        hashed_password="hashed",
        full_name="cool_user",
        role=Role.PublicUser,
        is_active=True,
    )
    defaults.update(kwargs)
    return PortalUser(**defaults)


@pytest.mark.asyncio
async def test_register_always_204_on_collision(monkeypatch):
    _clear_rate_limits()
    monkeypatch.setattr(settings, "register_rate_limit_per_minute", 30)
    session = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[
            MagicMock(
                scalar_one_or_none=MagicMock(
                    return_value=_user(email="taken@example.com", username="other")
                )
            ),
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
        ]
    )

    result = await register(
        PublicUserCreate(email="taken@example.com", username="new_name"),
        _request(),
        session,
    )
    assert result is None
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_register_creates_and_invites(monkeypatch):
    _clear_rate_limits()
    monkeypatch.setattr(settings, "register_rate_limit_per_minute", 30)
    session = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
        ]
    )
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()

    with (
        patch("app.routers.auth.generate_unusable_password_hash", return_value="u"),
        patch(
            "app.routers.auth.issue_and_send_password_setup",
            new_callable=AsyncMock,
            return_value=True,
        ) as issue,
        patch("app.routers.auth.set_cached_user"),
    ):
        result = await register(
            PublicUserCreate(email="new@example.com", username="new_user"),
            _request(),
            session,
        )

    assert result is None
    issue.assert_awaited_once()
    assert issue.await_args.kwargs["purpose"] == PasswordSetupPurpose.INVITE


@pytest.mark.asyncio
async def test_login_rate_limited(monkeypatch):
    _clear_rate_limits()
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 2)
    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None))
    )

    with patch("app.routers.auth.verify_password", return_value=False):
        req = _request(ip="10.1.1.1")
        with pytest.raises(HTTPException) as first:
            await login(UserLogin(email="nobody", password="x"), req, session)
        assert first.value.status_code == 401
        with pytest.raises(HTTPException):
            await login(UserLogin(email="nobody", password="x"), req, session)
        with pytest.raises(HTTPException) as limited:
            await login(UserLogin(email="nobody", password="x"), req, session)
        assert limited.value.status_code == 429


@pytest.mark.asyncio
async def test_login_inactive_returns_401(monkeypatch):
    _clear_rate_limits()
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 30)
    user = _user(is_active=False)
    session = AsyncMock()

    with (
        patch("app.routers.auth.get_cached_user_by_email", return_value=user),
        patch("app.routers.auth.verify_password", return_value=True),
    ):
        with pytest.raises(HTTPException) as exc:
            await login(
                UserLogin(email="user@example.com", password="secret"),
                _request(),
                session,
            )
    assert exc.value.status_code == 401
    assert "Incorrect" in exc.value.detail


@pytest.mark.asyncio
async def test_change_password_revokes_refresh_tokens():
    from app.routers import auth as auth_router

    user = _user()
    session = AsyncMock()
    session.commit = AsyncMock()

    with (
        patch("app.routers.auth.verify_password", return_value=True),
        patch("app.routers.auth.get_password_hash", return_value="new-hash"),
        patch(
            "app.routers.auth.revoke_user_refresh_tokens",
            new_callable=AsyncMock,
        ) as revoke,
        patch("app.routers.auth.invalidate_user_cache"),
        patch(
            "app.services.account_audit.record_account_event",
            new_callable=AsyncMock,
        ),
    ):
        await auth_router.change_current_user_password(
            UserPasswordChange(current_password="old", new_password="newpassword12"),
            session,
            user,
        )

    revoke.assert_awaited_once()
    assert user.hashed_password == "new-hash"


def test_school_user_create_schema_has_no_password():
    schema = SchoolUserCreate(email="a@b.com", full_name="Staff")
    assert not hasattr(schema, "password") or "password" not in schema.model_fields
    assert "password" not in SchoolUserCreate.model_fields
