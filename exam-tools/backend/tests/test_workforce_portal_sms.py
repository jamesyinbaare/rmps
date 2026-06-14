"""Workforce portal invite SMS message formatting."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.models import Examination
from app.services.exam_official_export import examination_label_sms
from app.services.sms.workforce_portal_sms import (
    SMS_SINGLE_SEGMENT_MAX_LEN,
    build_data_entry_clerk_invite_message,
    build_script_checker_invite_message,
)


def _exam(**kwargs: object) -> Examination:
    defaults = {
        "id": 1,
        "year": 2026,
        "exam_series": "MAY/JUNE",
        "exam_type": "Certificate II",
    }
    defaults.update(kwargs)
    return Examination(**defaults)


def test_examination_label_sms_abbreviates_series_and_type() -> None:
    assert examination_label_sms(_exam()) == "2026 MJ Cert 2"


def test_examination_label_sms_november_december() -> None:
    assert examination_label_sms(_exam(exam_series="November/December")) == "2026 ND Cert 2"
    assert examination_label_sms(_exam(exam_series=None, exam_type="Nov/Dec")) == "2026 ND"


def test_examination_label_sms_keeps_unknown_values() -> None:
    assert examination_label_sms(_exam(exam_series=None, exam_type="BECE")) == "2026 BECE"


@patch("app.services.sms.workforce_portal_sms.script_checker_portal_url", return_value="https://x.test/sc/tok")
def test_build_script_checker_invite_message_uses_compact_label(mock_url: MagicMock) -> None:
    checker = MagicMock()
    checker.name = "Ada Lovelace"
    checker.portal_token = "tok"
    checker.examination = _exam()

    message = build_script_checker_invite_message(checker)

    mock_url.assert_called_once_with("tok")
    assert message == "Ada Lovelace, script checker for 2026 MJ Cert 2. Confirm: https://x.test/sc/tok"
    assert len(message) <= SMS_SINGLE_SEGMENT_MAX_LEN


@patch("app.services.sms.workforce_portal_sms.data_entry_clerk_portal_url", return_value="https://x.test/de/tok")
def test_build_data_entry_clerk_invite_message_uses_compact_label(mock_url: MagicMock) -> None:
    clerk = MagicMock()
    clerk.name = "Grace Mensah"
    clerk.portal_token = "tok"
    clerk.examination = _exam(exam_series="Nov/Dec")

    message = build_data_entry_clerk_invite_message(clerk)

    mock_url.assert_called_once_with("tok")
    assert message == "Grace Mensah, data entry for 2026 ND Cert 2. Confirm: https://x.test/de/tok"
    assert len(message) <= SMS_SINGLE_SEGMENT_MAX_LEN
