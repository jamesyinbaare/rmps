"""Tests for workforce availability confirmation."""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import WorkforceAvailabilityStatus
from app.services.workforce_availability import (
    can_respond_to_workforce_availability,
    confirm_workforce_availability,
    decline_workforce_availability,
    ensure_workforce_invite_deadline,
    require_workforce_portal_access,
)
from app.services.workforce_portal import (
    data_entry_clerk_portal_url,
    script_checker_portal_url,
)


def _checker(**overrides):
    row = MagicMock()
    row.availability_status = WorkforceAvailabilityStatus.PENDING
    row.availability_deadline = None
    row.availability_responded_at = None
    defaults = {
        "id": uuid4(),
        "name": "Ada Lovelace",
        "portal_token": "tok123",
    }
    defaults.update(overrides)
    for key, value in defaults.items():
        setattr(row, key, value)
    return row


def test_script_checker_portal_url_uses_sc_path() -> None:
    url = script_checker_portal_url("abc123")
    assert "/sc/abc123" in url


def test_data_entry_clerk_portal_url_uses_de_path() -> None:
    url = data_entry_clerk_portal_url("xyz789")
    assert "/de/xyz789" in url


def test_can_respond_when_pending_without_deadline() -> None:
    assert can_respond_to_workforce_availability(_checker()) is True


def test_can_respond_false_when_confirmed() -> None:
    checker = _checker(availability_status=WorkforceAvailabilityStatus.CONFIRMED)
    assert can_respond_to_workforce_availability(checker) is False


def test_can_respond_false_after_deadline() -> None:
    checker = _checker(
        availability_deadline=datetime.utcnow() - timedelta(hours=1),
    )
    assert can_respond_to_workforce_availability(checker) is False


def test_ensure_workforce_invite_deadline_sets_deadline_for_pending() -> None:
    checker = _checker()
    ensure_workforce_invite_deadline(checker)
    assert checker.availability_deadline is not None


def test_ensure_workforce_invite_deadline_skips_confirmed() -> None:
    checker = _checker(availability_status=WorkforceAvailabilityStatus.CONFIRMED)
    ensure_workforce_invite_deadline(checker)
    assert checker.availability_deadline is None


@pytest.mark.asyncio
async def test_confirm_workforce_availability_sets_confirmed() -> None:
    session = AsyncMock()
    checker = _checker()
    await confirm_workforce_availability(session, checker)
    assert checker.availability_status == WorkforceAvailabilityStatus.CONFIRMED
    assert checker.availability_responded_at is not None
    session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_confirm_workforce_availability_rejects_declined() -> None:
    session = AsyncMock()
    checker = _checker(availability_status=WorkforceAvailabilityStatus.DECLINED)
    with pytest.raises(ValueError, match="declined"):
        await confirm_workforce_availability(session, checker)


@pytest.mark.asyncio
async def test_decline_workforce_availability_sets_declined() -> None:
    session = AsyncMock()
    checker = _checker()
    await decline_workforce_availability(session, checker)
    assert checker.availability_status == WorkforceAvailabilityStatus.DECLINED
    assert checker.availability_responded_at is not None
    session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_decline_workforce_availability_rejects_confirmed() -> None:
    session = AsyncMock()
    checker = _checker(availability_status=WorkforceAvailabilityStatus.CONFIRMED)
    with pytest.raises(ValueError, match="already confirmed"):
        await decline_workforce_availability(session, checker)


def test_require_workforce_portal_access_accepts_confirmed() -> None:
    checker = _checker(availability_status=WorkforceAvailabilityStatus.CONFIRMED)
    require_workforce_portal_access(checker)


def test_require_workforce_portal_access_rejects_pending() -> None:
    checker = _checker()
    with pytest.raises(ValueError, match="confirm your availability"):
        require_workforce_portal_access(checker)
