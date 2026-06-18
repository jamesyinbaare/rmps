"""Tests for appointment letter release policy."""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models import AppointmentLettersReleaseMode, ExaminationExaminerPortalSettings
from app.services.examiner_portal_release import (
    appointment_letter_pending_message,
    assert_may_access_appointment_letter,
    assert_may_access_bank_details,
    bank_details_pending_message,
    bank_fields_from_settings,
    is_appointment_letter_available,
    is_bank_details_editable,
)


def _portal_row(
    *,
    enabled: bool = True,
    mode: str = AppointmentLettersReleaseMode.ON_ACCEPTANCE.value,
    release_at: datetime | None = None,
    bank_details_editable: bool = False,
) -> ExaminationExaminerPortalSettings:
    return ExaminationExaminerPortalSettings(
        examination_id=1,
        appointment_letters_release_enabled=enabled,
        appointment_letters_release_mode=mode,
        appointment_letters_release_at=release_at,
        examiner_bank_details_editable_by_examiners=bank_details_editable,
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


@pytest.mark.asyncio
async def test_bank_details_editable_when_toggle_on(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1

    monkeypatch.setattr(
        "app.services.examiner_portal_release.get_or_create_portal_settings",
        AsyncMock(return_value=_portal_row(enabled=False, bank_details_editable=True)),
    )
    assert await is_bank_details_editable(session, examiner) is True


@pytest.mark.asyncio
async def test_bank_details_not_editable_when_toggle_off(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1

    monkeypatch.setattr(
        "app.services.examiner_portal_release.get_or_create_portal_settings",
        AsyncMock(return_value=_portal_row(enabled=True, bank_details_editable=False)),
    )
    assert await is_bank_details_editable(session, examiner) is False


@pytest.mark.asyncio
async def test_bank_editable_independent_of_letter_release(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1
    future = datetime.utcnow() + timedelta(days=1)

    monkeypatch.setattr(
        "app.services.examiner_portal_release.get_or_create_portal_settings",
        AsyncMock(
            return_value=_portal_row(
                enabled=True,
                mode=AppointmentLettersReleaseMode.SCHEDULED_DATE.value,
                release_at=future,
                bank_details_editable=True,
            )
        ),
    )
    assert await is_appointment_letter_available(session, examiner) is False
    assert await is_bank_details_editable(session, examiner) is True


@pytest.mark.asyncio
async def test_letter_unavailable_even_when_bank_toggle_on(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1

    monkeypatch.setattr(
        "app.services.examiner_portal_release.get_or_create_portal_settings",
        AsyncMock(return_value=_portal_row(enabled=False, bank_details_editable=True)),
    )
    assert await is_appointment_letter_available(session, examiner) is False
    assert await is_bank_details_editable(session, examiner) is True


@pytest.mark.asyncio
async def test_assert_may_access_bank_details_raises_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1

    monkeypatch.setattr(
        "app.services.examiner_portal_release.get_or_create_portal_settings",
        AsyncMock(return_value=_portal_row(bank_details_editable=False)),
    )
    with pytest.raises(ValueError, match="disabled by the examination office"):
        await assert_may_access_bank_details(session, examiner)


@pytest.mark.asyncio
async def test_assert_may_access_bank_details_passes_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1

    monkeypatch.setattr(
        "app.services.examiner_portal_release.get_or_create_portal_settings",
        AsyncMock(return_value=_portal_row(bank_details_editable=True)),
    )
    await assert_may_access_bank_details(session, examiner)


@pytest.mark.asyncio
async def test_assert_may_access_appointment_letter_raises_when_release_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 1

    monkeypatch.setattr(
        "app.services.examiner_portal_release.get_or_create_portal_settings",
        AsyncMock(return_value=_portal_row(enabled=False, bank_details_editable=True)),
    )
    with pytest.raises(ValueError, match="released by the examination office"):
        await assert_may_access_appointment_letter(session, examiner)


def test_bank_details_pending_message_when_editable() -> None:
    assert bank_details_pending_message(editable=True) is None


def test_bank_details_pending_message_when_not_editable() -> None:
    msg = bank_details_pending_message(editable=False)
    assert msg is not None
    assert "disabled by the examination office" in msg


def test_bank_fields_from_settings() -> None:
    row = _portal_row(bank_details_editable=True)
    fields = bank_fields_from_settings(row)
    assert fields["bank_details_editable_by_examiners"] is True
    assert fields["bank_details_available"] is True
    assert fields["bank_details_pending_message"] is None

    row_off = _portal_row(bank_details_editable=False)
    fields_off = bank_fields_from_settings(row_off)
    assert fields_off["bank_details_editable_by_examiners"] is False
    assert fields_off["bank_details_available"] is False
    assert fields_off["bank_details_pending_message"] is not None


def test_appointment_letter_pending_message_does_not_mention_bank_details() -> None:
    msg = appointment_letter_pending_message(
        release_enabled=False,
        release_mode=AppointmentLettersReleaseMode.ON_ACCEPTANCE,
        release_at=None,
        examiner_accepted=False,
    )
    assert msg is not None
    assert "bank" not in msg.lower()
