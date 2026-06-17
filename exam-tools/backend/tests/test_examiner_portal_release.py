"""Tests for appointment letter release policy."""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models import AppointmentLettersReleaseMode, ExaminationExaminerPortalSettings
from app.services.examiner_portal_release import (
    appointment_letter_pending_message,
    is_appointment_letter_available,
)


def _portal_row(
    *,
    enabled: bool = True,
    mode: str = AppointmentLettersReleaseMode.ON_ACCEPTANCE.value,
    release_at: datetime | None = None,
) -> ExaminationExaminerPortalSettings:
    return ExaminationExaminerPortalSettings(
        examination_id=1,
        appointment_letters_release_enabled=enabled,
        appointment_letters_release_mode=mode,
        appointment_letters_release_at=release_at,
        updated_at=datetime.utcnow(),
    )


@pytest.mark.asyncio
async def test_appointment_letter_unavailable_when_release_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1

    monkeypatch.setattr(
        "app.services.examiner_portal_release.get_or_create_portal_settings",
        AsyncMock(return_value=_portal_row(enabled=False)),
    )
    assert await is_appointment_letter_available(session, examiner) is False


@pytest.mark.asyncio
async def test_appointment_letter_available_on_acceptance_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1

    monkeypatch.setattr(
        "app.services.examiner_portal_release.get_or_create_portal_settings",
        AsyncMock(return_value=_portal_row(mode=AppointmentLettersReleaseMode.ON_ACCEPTANCE.value)),
    )
    assert await is_appointment_letter_available(session, examiner) is True


@pytest.mark.asyncio
async def test_appointment_letter_scheduled_before_release_at(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1
    future = datetime.utcnow() + timedelta(days=1)

    monkeypatch.setattr(
        "app.services.examiner_portal_release.get_or_create_portal_settings",
        AsyncMock(
            return_value=_portal_row(
                mode=AppointmentLettersReleaseMode.SCHEDULED_DATE.value,
                release_at=future,
            )
        ),
    )
    assert await is_appointment_letter_available(session, examiner) is False


@pytest.mark.asyncio
async def test_appointment_letter_scheduled_after_release_at(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1
    past = datetime.utcnow() - timedelta(hours=1)

    monkeypatch.setattr(
        "app.services.examiner_portal_release.get_or_create_portal_settings",
        AsyncMock(
            return_value=_portal_row(
                mode=AppointmentLettersReleaseMode.SCHEDULED_DATE.value,
                release_at=past,
            )
        ),
    )
    assert await is_appointment_letter_available(session, examiner) is True


@pytest.mark.asyncio
async def test_appointment_letter_scheduled_without_date_not_available(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1

    monkeypatch.setattr(
        "app.services.examiner_portal_release.get_or_create_portal_settings",
        AsyncMock(
            return_value=_portal_row(
                mode=AppointmentLettersReleaseMode.SCHEDULED_DATE.value,
                release_at=None,
            )
        ),
    )
    assert await is_appointment_letter_available(session, examiner) is False


def test_appointment_letter_pending_message_release_disabled() -> None:
    msg = appointment_letter_pending_message(
        release_enabled=False,
        release_mode=AppointmentLettersReleaseMode.ON_ACCEPTANCE,
        release_at=None,
        examiner_accepted=False,
    )
    assert msg is not None
    assert "released by the examination office" in msg


def test_appointment_letter_pending_message_on_acceptance_not_accepted() -> None:
    msg = appointment_letter_pending_message(
        release_enabled=True,
        release_mode=AppointmentLettersReleaseMode.ON_ACCEPTANCE,
        release_at=None,
        examiner_accepted=False,
    )
    assert msg is not None
    assert "Confirm your availability" in msg


def test_appointment_letter_pending_message_on_acceptance_accepted() -> None:
    msg = appointment_letter_pending_message(
        release_enabled=True,
        release_mode=AppointmentLettersReleaseMode.ON_ACCEPTANCE,
        release_at=None,
        examiner_accepted=True,
    )
    assert msg is None


def test_appointment_letter_pending_message_scheduled_without_date() -> None:
    msg = appointment_letter_pending_message(
        release_enabled=True,
        release_mode=AppointmentLettersReleaseMode.SCHEDULED_DATE,
        release_at=None,
        examiner_accepted=True,
    )
    assert msg is not None
    assert "sets a release date" in msg


def test_appointment_letter_pending_message_scheduled_future_date() -> None:
    future = datetime.utcnow() + timedelta(days=3)
    msg = appointment_letter_pending_message(
        release_enabled=True,
        release_mode=AppointmentLettersReleaseMode.SCHEDULED_DATE,
        release_at=future,
        examiner_accepted=True,
    )
    assert msg is not None
    assert "will be available on" in msg
