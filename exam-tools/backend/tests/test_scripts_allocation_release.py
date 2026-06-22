"""Tests for per-cohort scripts allocation release."""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import SubjectMarkingGroup
from app.services.scripts_allocation_release import (
    is_cohort_scripts_allocation_released,
    is_scripts_allocation_visible_for_examiner,
    scripts_allocation_pending_message,
)


def _group(*, enabled: bool, release_at: datetime | None) -> MagicMock:
    group = MagicMock(spec=SubjectMarkingGroup)
    group.scripts_allocation_release_enabled = enabled
    group.scripts_allocation_release_at = release_at
    group.name = "North"
    return group


def test_is_cohort_scripts_allocation_released_when_disabled() -> None:
    assert is_cohort_scripts_allocation_released(_group(enabled=False, release_at=None)) is False


def test_is_cohort_scripts_allocation_released_immediate_when_enabled() -> None:
    assert is_cohort_scripts_allocation_released(_group(enabled=True, release_at=None)) is True


def test_is_cohort_scripts_allocation_released_scheduled_before_time() -> None:
    future = datetime.utcnow() + timedelta(days=1)
    assert is_cohort_scripts_allocation_released(_group(enabled=True, release_at=future)) is False


def test_is_cohort_scripts_allocation_released_scheduled_after_time() -> None:
    past = datetime.utcnow() - timedelta(minutes=1)
    assert is_cohort_scripts_allocation_released(_group(enabled=True, release_at=past)) is True


@pytest.mark.asyncio
async def test_is_scripts_allocation_visible_when_any_cohort_released() -> None:
    released = _group(enabled=True, release_at=None)
    unreleased = _group(enabled=False, release_at=None)
    session = AsyncMock()
    with patch(
        "app.services.scripts_allocation_release._examiner_cohort_memberships",
        new_callable=AsyncMock,
        return_value=[unreleased, released],
    ):
        visible = await is_scripts_allocation_visible_for_examiner(
            session,
            examination_id=1,
            subject_id=10,
            examiner_id=uuid4(),
        )
    assert visible is True


@pytest.mark.asyncio
async def test_scripts_allocation_pending_message_none_when_visible() -> None:
    session = AsyncMock()
    with patch(
        "app.services.scripts_allocation_release.is_scripts_allocation_visible_for_examiner",
        new_callable=AsyncMock,
        return_value=True,
    ):
        msg = await scripts_allocation_pending_message(
            session,
            examination_id=1,
            subject_id=10,
            examiner_id=uuid4(),
        )
    assert msg is None


@pytest.mark.asyncio
async def test_scripts_allocation_pending_message_scheduled() -> None:
    future = datetime.utcnow() + timedelta(days=2)
    scheduled = _group(enabled=True, release_at=future)
    session = AsyncMock()
    with (
        patch(
            "app.services.scripts_allocation_release.is_scripts_allocation_visible_for_examiner",
            new_callable=AsyncMock,
            return_value=False,
        ),
        patch(
            "app.services.scripts_allocation_release._examiner_cohort_memberships",
            new_callable=AsyncMock,
            return_value=[scheduled],
        ),
    ):
        msg = await scripts_allocation_pending_message(
            session,
            examination_id=1,
            subject_id=10,
            examiner_id=uuid4(),
        )
    assert msg is not None
    assert "Your script allocations will be available on" in msg
    assert future.strftime("%d %b %Y") in msg
