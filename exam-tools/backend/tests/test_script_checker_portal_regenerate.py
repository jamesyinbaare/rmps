"""Tests for script checker portal link regeneration."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import WorkforceAvailabilityStatus
from app.services.workforce_portal import regenerate_script_checker_portal_link


@pytest.mark.asyncio
async def test_regenerate_script_checker_portal_rotates_token_and_refreshes_pending_deadline() -> None:
    checker = MagicMock()
    checker.portal_token = "old-token"
    checker.availability_status = WorkforceAvailabilityStatus.PENDING
    checker.availability_deadline = datetime(2020, 1, 1)
    checker.updated_at = datetime(2020, 1, 1)

    session = AsyncMock()
    session.flush = AsyncMock()

    with (
        patch(
            "app.services.workforce_portal.generate_unique_workforce_portal_token",
            new=AsyncMock(return_value="new-token"),
        ),
        patch(
            "app.services.workforce_portal.script_checker_portal_url",
            return_value="https://example.test/sc/new-token",
        ),
        patch(
            "app.services.workforce_availability.workforce_availability_deadline_from_now",
            return_value=datetime(2026, 8, 20),
        ),
    ):
        url = await regenerate_script_checker_portal_link(session, checker)

    assert url == "https://example.test/sc/new-token"
    assert checker.portal_token == "new-token"
    assert checker.availability_deadline == datetime(2026, 8, 20)
    session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_regenerate_confirmed_checker_keeps_deadline() -> None:
    deadline = datetime(2026, 7, 1)
    checker = MagicMock()
    checker.portal_token = "old-token"
    checker.availability_status = WorkforceAvailabilityStatus.CONFIRMED
    checker.availability_deadline = deadline

    session = AsyncMock()
    session.flush = AsyncMock()

    with (
        patch(
            "app.services.workforce_portal.generate_unique_workforce_portal_token",
            new=AsyncMock(return_value="new-token"),
        ),
        patch(
            "app.services.workforce_portal.script_checker_portal_url",
            return_value="https://example.test/sc/new-token",
        ),
    ):
        await regenerate_script_checker_portal_link(session, checker)

    assert checker.portal_token == "new-token"
    assert checker.availability_deadline == deadline
