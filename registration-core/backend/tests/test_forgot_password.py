"""Tests for self-service forgot-password endpoint."""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.config import settings
from app.core.rate_limit import _buckets
from app.models import PasswordSetupPurpose, PortalUser, Role
from app.routers.auth import forgot_password
from app.schemas.auth import ForgotPasswordRequest


def _clear_rate_limits() -> None:
    _buckets.clear()


def _request(ip: str = "127.0.0.1") -> MagicMock:
    request = MagicMock()
    request.headers = {}
    request.client = MagicMock()
    request.client.host = ip
    return request


def _user(*, active: bool = True, email: str = "user@example.com") -> PortalUser:
    return PortalUser(
        id=uuid4(),
        email=email,
        username=email,
        hashed_password="x",
        full_name="Test User",
        role=Role.SchoolAdmin,
        is_active=active,
    )


@pytest.mark.asyncio
async def test_forgot_password_always_204_when_user_missing(monkeypatch):
    _clear_rate_limits()
    monkeypatch.setattr(settings, "password_setup_rate_limit_per_minute", 30)

    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None))
    )
    session.commit = AsyncMock()

    with patch(
        "app.routers.auth.issue_and_send_password_setup",
        new_callable=AsyncMock,
    ) as issue:
        result = await forgot_password(
            ForgotPasswordRequest(email="missing@example.com"),
            _request(),
            session,
        )

    assert result is None
    issue.assert_not_called()
    session.commit.assert_not_called()


@pytest.mark.asyncio
async def test_forgot_password_sends_reset_for_active_user(monkeypatch):
    _clear_rate_limits()
    monkeypatch.setattr(settings, "password_setup_rate_limit_per_minute", 30)
    user = _user(active=True, email="active@example.com")

    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=user))
    )
    session.commit = AsyncMock()

    with patch(
        "app.routers.auth.issue_and_send_password_setup",
        new_callable=AsyncMock,
        return_value=True,
    ) as issue:
        result = await forgot_password(
            ForgotPasswordRequest(email="Active@Example.com"),
            _request(),
            session,
        )

    assert result is None
    issue.assert_awaited_once()
    assert issue.await_args.kwargs["purpose"] == PasswordSetupPurpose.RESET
    assert issue.await_args.args[1] is user
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_forgot_password_skips_inactive_user(monkeypatch):
    _clear_rate_limits()
    monkeypatch.setattr(settings, "password_setup_rate_limit_per_minute", 30)
    user = _user(active=False)

    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=user))
    )
    session.commit = AsyncMock()

    with patch(
        "app.routers.auth.issue_and_send_password_setup",
        new_callable=AsyncMock,
    ) as issue:
        await forgot_password(
            ForgotPasswordRequest(email=user.email),
            _request(),
            session,
        )

    issue.assert_not_called()
    session.commit.assert_not_called()


@pytest.mark.asyncio
async def test_forgot_password_rate_limited(monkeypatch):
    _clear_rate_limits()
    monkeypatch.setattr(settings, "password_setup_rate_limit_per_minute", 2)

    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None))
    )

    request = _request(ip="10.0.0.9")
    await forgot_password(ForgotPasswordRequest(email="a@x.com"), request, session)
    await forgot_password(ForgotPasswordRequest(email="b@x.com"), request, session)

    with pytest.raises(HTTPException) as exc_info:
        await forgot_password(ForgotPasswordRequest(email="c@x.com"), request, session)

    assert exc_info.value.status_code == 429
