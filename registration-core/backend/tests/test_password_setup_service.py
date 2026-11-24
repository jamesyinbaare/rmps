"""Tests for password setup token lifecycle."""
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.config import settings
from app.models import PasswordSetupPurpose, PasswordSetupToken, PortalUser, Role
from app.services import password_setup_service as svc


def _user() -> PortalUser:
    return PortalUser(
        id=uuid4(),
        email="coord@school.edu",
        username="coord@school.edu",
        hashed_password="x",
        full_name="Coord User",
        role=Role.SchoolAdmin,
        is_active=True,
    )


@pytest.mark.asyncio
async def test_create_token_invalidates_prior(monkeypatch):
    monkeypatch.setattr(settings, "password_setup_token_expiry_hours", 48)
    user = _user()
    prior = PasswordSetupToken(
        id=uuid4(),
        user_id=user.id,
        token_hash="old",
        purpose=PasswordSetupPurpose.INVITE,
        expires_at=datetime.utcnow() + timedelta(hours=10),
        used_at=None,
    )

    session = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = [prior]
    session.execute = AsyncMock(return_value=result)
    session.add = MagicMock()
    session.flush = AsyncMock()

    raw = await svc.create_password_setup_token(
        session, user, purpose=PasswordSetupPurpose.INVITE
    )

    assert raw
    assert prior.used_at is not None
    session.add.assert_called_once()
    added = session.add.call_args[0][0]
    assert isinstance(added, PasswordSetupToken)
    assert added.token_hash == svc.hash_password_setup_token(raw)


@pytest.mark.asyncio
async def test_consume_rejects_expired():
    user = _user()
    raw = "test-token-value"
    record = PasswordSetupToken(
        id=uuid4(),
        user_id=user.id,
        token_hash=svc.hash_password_setup_token(raw),
        purpose=PasswordSetupPurpose.INVITE,
        expires_at=datetime.utcnow() - timedelta(hours=1),
        used_at=None,
    )
    record.user = user

    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = record
    session.execute = AsyncMock(return_value=result)

    out = await svc.consume_password_setup_token(session, raw, "newpassword1")
    assert out is None


@pytest.mark.asyncio
async def test_consume_success_sets_password_and_revokes(monkeypatch):
    monkeypatch.setattr(settings, "password_min_length", 8)
    user = _user()
    raw = "good-token"
    record = PasswordSetupToken(
        id=uuid4(),
        user_id=user.id,
        token_hash=svc.hash_password_setup_token(raw),
        purpose=PasswordSetupPurpose.RESET,
        expires_at=datetime.utcnow() + timedelta(hours=1),
        used_at=None,
    )
    record.user = user

    session = AsyncMock()

    async def execute_side_effect(stmt):
        result = MagicMock()
        # First call: load token; later calls: other tokens / revoke
        if not hasattr(execute_side_effect, "n"):
            execute_side_effect.n = 0
        execute_side_effect.n += 1
        if execute_side_effect.n == 1:
            result.scalar_one_or_none.return_value = record
        else:
            result.scalars.return_value.all.return_value = []
            result.scalar_one_or_none.return_value = None
        return result

    session.execute = AsyncMock(side_effect=execute_side_effect)
    session.flush = AsyncMock()

    with patch.object(svc, "invalidate_user_cache"):
        with patch.object(svc, "get_password_hash", return_value="hashed-new"):
            out = await svc.consume_password_setup_token(session, raw, "newpassword1")

    assert out is user
    assert user.hashed_password == "hashed-new"
    assert record.used_at is not None
