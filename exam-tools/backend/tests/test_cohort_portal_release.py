"""Tests for per-cohort appointment letter and bank details release."""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import AppointmentLettersReleaseMode
from app.services.cohort_portal_release import (
    is_cohort_appointment_letter_released,
    is_cohort_bank_details_editable,
    resolve_effective_cohorts,
)


def _group(
    *,
    release_enabled: bool = False,
    release_mode: str = AppointmentLettersReleaseMode.SCHEDULED_DATE.value,
    release_at: datetime | None = None,
    bank_editable: bool = False,
    is_default: bool = False,
    name: str = "Cohort",
) -> MagicMock:
    group = MagicMock()
    group.appointment_letters_release_enabled = release_enabled
    group.appointment_letters_release_mode = release_mode
    group.appointment_letters_release_at = release_at
    group.examiner_bank_details_editable_by_examiners = bank_editable
    group.is_default = is_default
    group.name = name
    return group


def test_is_cohort_appointment_letter_released_disabled() -> None:
    group = _group(release_enabled=False)
    assert is_cohort_appointment_letter_released(group) is False


def test_is_cohort_appointment_letter_released_on_acceptance() -> None:
    group = _group(
        release_enabled=True,
        release_mode=AppointmentLettersReleaseMode.ON_ACCEPTANCE.value,
    )
    assert is_cohort_appointment_letter_released(group, examiner_accepted=True) is True
    assert is_cohort_appointment_letter_released(group, examiner_accepted=False) is False


def test_is_cohort_appointment_letter_released_scheduled_future() -> None:
    future = datetime.utcnow() + timedelta(days=1)
    group = _group(
        release_enabled=True,
        release_at=future,
    )
    assert is_cohort_appointment_letter_released(group) is False


def test_is_cohort_appointment_letter_released_scheduled_past() -> None:
    past = datetime.utcnow() - timedelta(minutes=1)
    group = _group(
        release_enabled=True,
        release_at=past,
    )
    assert is_cohort_appointment_letter_released(group) is True


def test_is_cohort_appointment_letter_released_scheduled_without_date() -> None:
    group = _group(release_enabled=True, release_at=None)
    assert is_cohort_appointment_letter_released(group) is False


def test_is_cohort_bank_details_editable() -> None:
    assert is_cohort_bank_details_editable(_group(bank_editable=False)) is False
    assert is_cohort_bank_details_editable(_group(bank_editable=True)) is True


@pytest.mark.asyncio
async def test_resolve_effective_cohorts_uses_memberships(monkeypatch) -> None:
    session = AsyncMock()
    explicit = [_group(name="A")]
    default = _group(name="Default", is_default=True)

    async def fake_memberships(*_args, **_kwargs):
        return explicit

    async def fake_default(*_args, **_kwargs):
        return default

    monkeypatch.setattr(
        "app.services.cohort_portal_release._examiner_cohort_memberships",
        fake_memberships,
    )
    monkeypatch.setattr(
        "app.services.cohort_portal_release._default_cohort",
        fake_default,
    )

    groups = await resolve_effective_cohorts(
        session,
        examination_id=1,
        subject_id=2,
        examiner_id=uuid4(),
    )
    assert groups == explicit


@pytest.mark.asyncio
async def test_resolve_effective_cohorts_falls_back_to_default(monkeypatch) -> None:
    session = AsyncMock()
    default = _group(name="Default", is_default=True)

    async def fake_memberships(*_args, **_kwargs):
        return []

    async def fake_default(*_args, **_kwargs):
        return default

    monkeypatch.setattr(
        "app.services.cohort_portal_release._examiner_cohort_memberships",
        fake_memberships,
    )
    monkeypatch.setattr(
        "app.services.cohort_portal_release._default_cohort",
        fake_default,
    )

    groups = await resolve_effective_cohorts(
        session,
        examination_id=1,
        subject_id=2,
        examiner_id=uuid4(),
    )
    assert groups == [default]


@pytest.mark.asyncio
async def test_is_appointment_letter_available_any_released_cohort(monkeypatch) -> None:
    from app.services.cohort_portal_release import is_appointment_letter_available_for_examiner

    session = AsyncMock()
    released = _group(release_enabled=True, release_at=datetime.utcnow() - timedelta(hours=1))
    unreleased = _group(release_enabled=False, name="B")

    async def fake_resolve(*_args, **_kwargs):
        return [unreleased, released]

    monkeypatch.setattr(
        "app.services.cohort_portal_release.resolve_effective_cohorts",
        fake_resolve,
    )

    assert await is_appointment_letter_available_for_examiner(
        session,
        examination_id=1,
        subject_id=2,
        examiner_id=uuid4(),
    )


@pytest.mark.asyncio
async def test_is_bank_details_editable_any_cohort(monkeypatch) -> None:
    from app.services.cohort_portal_release import is_bank_details_editable_for_examiner

    session = AsyncMock()
    editable = _group(bank_editable=True)
    locked = _group(bank_editable=False, name="B")

    async def fake_resolve(*_args, **_kwargs):
        return [locked, editable]

    monkeypatch.setattr(
        "app.services.cohort_portal_release.resolve_effective_cohorts",
        fake_resolve,
    )

    assert await is_bank_details_editable_for_examiner(
        session,
        examination_id=1,
        subject_id=2,
        examiner_id=uuid4(),
    )
