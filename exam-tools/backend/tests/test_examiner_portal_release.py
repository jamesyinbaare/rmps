"""Tests for appointment letter release after coordination ends."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.coordination_schedule import coordination_end_at, validate_coordination_range
from app.services.examiner_portal_release import (
    appointment_letter_pending_message,
    is_appointment_letter_available,
    resolve_coordination_end_at,
)


def test_validate_coordination_range_rejects_end_before_start() -> None:
    with pytest.raises(ValueError, match="Coordination end must be on or after"):
        validate_coordination_range(
            datetime(2026, 6, 15),
            time(10, 0),
            datetime(2026, 6, 14),
            time(12, 0),
        )


def test_coordination_end_at_uses_end_of_day_when_time_missing() -> None:
    end = coordination_end_at(datetime(2026, 6, 20), None)
    assert end == datetime(2026, 6, 20, 23, 59, 59)


@pytest.mark.asyncio
async def test_resolve_coordination_end_at_uses_latest_cohort_end() -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.id = uuid4()
    examiner.examination_id = 1
    link = MagicMock()
    link.subject_id = 10
    examiner.subjects = [link]

    early_end = datetime(2026, 6, 10, 17, 0)
    late_end = datetime(2026, 6, 14, 17, 0)

    with (
        patch(
            "app.services.examiner_portal_release.get_examiner_marking_groups",
            new_callable=AsyncMock,
            return_value=[
                {
                    "is_default": False,
                    "coordination_end_date": datetime(2026, 6, 10),
                    "coordination_end_time": time(17, 0),
                },
                {
                    "is_default": False,
                    "coordination_end_date": datetime(2026, 6, 14),
                    "coordination_end_time": time(17, 0),
                },
            ],
        ),
        patch(
            "app.services.examiner_portal_release.select",
        ),
    ):
        session.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=lambda: None))
        result = await resolve_coordination_end_at(session, examiner)

    assert result == late_end
    assert result != early_end


@pytest.mark.asyncio
async def test_resolve_coordination_end_at_falls_back_to_invitation() -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.id = uuid4()
    examiner.examination_id = 1
    examiner.subjects = []

    inv = MagicMock()
    inv.coordination_end_date = datetime(2026, 6, 18)
    inv.coordination_end_time = time(9, 0)

    with patch(
        "app.services.examiner_portal_release.get_examiner_marking_groups",
        new_callable=AsyncMock,
        return_value=[],
    ):
        session.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=lambda: inv))
        result = await resolve_coordination_end_at(session, examiner)

    assert result == datetime(2026, 6, 18, 9, 0)


@pytest.mark.asyncio
async def test_appointment_letter_blocked_before_end_even_when_enabled() -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1
    future_end = datetime.utcnow() + timedelta(days=2)

    with (
        patch(
            "app.services.examiner_portal_release.is_release_enabled",
            new_callable=AsyncMock,
            return_value=True,
        ),
        patch(
            "app.services.examiner_portal_release.resolve_coordination_end_at",
            new_callable=AsyncMock,
            return_value=future_end,
        ),
    ):
        assert await is_appointment_letter_available(session, examiner) is False


@pytest.mark.asyncio
async def test_appointment_letter_available_after_coordination_end() -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1
    past_end = datetime.utcnow() - timedelta(hours=1)

    with (
        patch(
            "app.services.examiner_portal_release.is_release_enabled",
            new_callable=AsyncMock,
            return_value=True,
        ),
        patch(
            "app.services.examiner_portal_release.resolve_coordination_end_at",
            new_callable=AsyncMock,
            return_value=past_end,
        ),
    ):
        assert await is_appointment_letter_available(session, examiner) is True


def test_appointment_letter_pending_message_when_not_scheduled() -> None:
    msg = appointment_letter_pending_message(None, release_enabled=True)
    assert msg is not None
    assert "once it is scheduled" in msg
