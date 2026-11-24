"""Tests for invite-based private registration and username/email login."""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.config import settings
from app.core.rate_limit import _buckets
from app.models import PasswordSetupPurpose, PortalUser, Role
from app.routers.auth import login, register
from app.schemas.auth import PublicUserCreate, UserLogin
from app.utils.username import resolve_username, validate_private_username


def _clear_rate_limits() -> None:
    _buckets.clear()


def _request(ip: str = "127.0.0.1") -> MagicMock:
    request = MagicMock()
    request.headers = {}
    request.client = MagicMock()
    request.client.host = ip
    return request


def test_resolve_username_defaults_to_email():
    assert resolve_username("Admin@Example.com") == "admin@example.com"
    assert resolve_username("Admin@Example.com", "  ") == "admin@example.com"
    assert resolve_username("Admin@Example.com", "Coord_1") == "coord_1"


def test_validate_private_username_ok():
    assert validate_private_username("Jane_Doe1") == "jane_doe1"


def test_validate_private_username_rejects_invalid():
    with pytest.raises(ValueError):
        validate_private_username("ab")
    with pytest.raises(ValueError):
        validate_private_username("bad-name")
    with pytest.raises(ValidationError):
        PublicUserCreate(email="a@b.com", username="bad-name")


@pytest.mark.asyncio
async def test_register_sends_invite_and_uses_unusable_password(monkeypatch):
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
        patch(
            "app.routers.auth.generate_unusable_password_hash",
            return_value="unusable-hash",
        ),
        patch(
            "app.routers.auth.issue_and_send_password_setup",
            new_callable=AsyncMock,
            return_value=True,
        ) as issue,
        patch("app.routers.auth.set_cached_user"),
    ):
        result = await register(
            PublicUserCreate(email="Candidate@Example.com", username="cand_one"),
            _request(),
            session,
        )

    assert result is None
    issue.assert_awaited_once()
    assert issue.await_args.kwargs["purpose"] == PasswordSetupPurpose.INVITE
    added_users = [
        call.args[0]
        for call in session.add.call_args_list
        if isinstance(call.args[0], PortalUser)
    ]
    assert len(added_users) == 1
    added = added_users[0]
    assert added.email == "candidate@example.com"
    assert added.username == "cand_one"
    assert added.hashed_password == "unusable-hash"
    assert added.role == Role.PublicUser


@pytest.mark.asyncio
async def test_register_duplicate_email_is_silent(monkeypatch):
    _clear_rate_limits()
    monkeypatch.setattr(settings, "register_rate_limit_per_minute", 30)
    session = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[
            MagicMock(
                scalar_one_or_none=MagicMock(
                    return_value=PortalUser(
                        id=uuid4(),
                        email="candidate@example.com",
                        username="other",
                        hashed_password="x",
                        full_name="x",
                        role=Role.PublicUser,
                        is_active=True,
                    )
                )
            ),
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
        ]
    )
    session.add = MagicMock()

    result = await register(
        PublicUserCreate(email="candidate@example.com", username="cand_one"),
        _request(),
        session,
    )
    assert result is None
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_register_duplicate_username_is_silent(monkeypatch):
    _clear_rate_limits()
    monkeypatch.setattr(settings, "register_rate_limit_per_minute", 30)
    session = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
            MagicMock(
                scalar_one_or_none=MagicMock(
                    return_value=PortalUser(
                        id=uuid4(),
                        email="someone@example.com",
                        username="cand_one",
                        hashed_password="x",
                        full_name="x",
                        role=Role.PublicUser,
                        is_active=True,
                    )
                )
            ),
        ]
    )
    session.add = MagicMock()

    result = await register(
        PublicUserCreate(email="new@example.com", username="cand_one"),
        _request(),
        session,
    )
    assert result is None
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_login_by_username(monkeypatch):
    _clear_rate_limits()
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 30)
    user = PortalUser(
        id=uuid4(),
        email="user@example.com",
        username="cool_user",
        hashed_password="hashed",
        full_name="cool_user",
        role=Role.PublicUser,
        is_active=True,
    )
    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=user))
    )
    session.commit = AsyncMock()
    session.flush = AsyncMock()
    session.add = MagicMock()

    with (
        patch("app.routers.auth.verify_password", return_value=True),
        patch("app.routers.auth.create_access_token", return_value="access"),
        patch(
            "app.services.refresh_token_service.store_refresh_token",
            new_callable=AsyncMock,
            return_value="refresh",
        ),
        patch("app.routers.auth.set_cached_user"),
    ):
        token = await login(
            UserLogin(email="Cool_User", password="secret"),
            _request(),
            session,
        )

    assert token.access_token == "access"
    assert token.refresh_token == "refresh"


@pytest.mark.asyncio
async def test_login_by_email(monkeypatch):
    _clear_rate_limits()
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 30)
    user = PortalUser(
        id=uuid4(),
        email="user@example.com",
        username="cool_user",
        hashed_password="hashed",
        full_name="cool_user",
        role=Role.PublicUser,
        is_active=True,
    )
    session = AsyncMock()
    session.commit = AsyncMock()
    session.flush = AsyncMock()
    session.add = MagicMock()

    with (
        patch("app.routers.auth.get_cached_user_by_email", return_value=user),
        patch("app.routers.auth.verify_password", return_value=True),
        patch("app.routers.auth.create_access_token", return_value="access"),
        patch(
            "app.services.refresh_token_service.store_refresh_token",
            new_callable=AsyncMock,
            return_value="refresh",
        ),
        patch("app.routers.auth.set_cached_user"),
    ):
        token = await login(
            UserLogin(email="user@example.com", password="secret"),
            _request(),
            session,
        )

    assert token.access_token == "access"


def test_school_admin_username_defaults_to_email():
    assert resolve_username("Coord@School.edu", None) == "coord@school.edu"
    assert resolve_username("Coord@School.edu", "custom_coord") == "custom_coord"
