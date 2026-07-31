"""Tests for workforce exercise cohort portal release gating."""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import MagicMock

from app.models import AppointmentLettersReleaseMode
from app.services.workforce_portal_release import is_cohort_appointment_letter_released


def _group(
    *,
    enabled: bool = True,
    mode: str = "scheduled_date",
    release_at: datetime | None = None,
) -> MagicMock:
    group = MagicMock()
    group.appointment_letters_release_enabled = enabled
    group.appointment_letters_release_mode = mode
    group.appointment_letters_release_at = release_at
    return group


def test_letter_not_released_when_disabled() -> None:
    assert (
        is_cohort_appointment_letter_released(
            _group(enabled=False),
            person_accepted=True,
        )
        is False
    )


def test_on_acceptance_requires_confirmation() -> None:
    group = _group(enabled=True, mode=AppointmentLettersReleaseMode.ON_ACCEPTANCE.value)
    assert is_cohort_appointment_letter_released(group, person_accepted=False) is False
    assert is_cohort_appointment_letter_released(group, person_accepted=True) is True


def test_scheduled_date_release() -> None:
    past = datetime.utcnow() - timedelta(hours=1)
    future = datetime.utcnow() + timedelta(hours=1)
    assert (
        is_cohort_appointment_letter_released(
            _group(enabled=True, mode="scheduled_date", release_at=past),
            person_accepted=True,
        )
        is True
    )
    assert (
        is_cohort_appointment_letter_released(
            _group(enabled=True, mode="scheduled_date", release_at=future),
            person_accepted=True,
        )
        is False
    )
    assert (
        is_cohort_appointment_letter_released(
            _group(enabled=True, mode="scheduled_date", release_at=None),
            person_accepted=True,
        )
        is False
    )
