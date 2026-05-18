from unittest.mock import AsyncMock, patch

import pytest

from app.services.sms.inspector_credentials import (
    build_inspector_credentials_message,
    maybe_send_inspector_credentials,
    send_inspector_credentials,
)
from app.services.sms.types import SmsDeliveryResult


def test_build_inspector_credentials_message() -> None:
    msg = build_inspector_credentials_message("0551234567", "secret12")
    assert "Dear Inspector, your CTVET Monitoring Portal login details." in msg
    assert "URL: monitoring.ctvet.gov.gh" in msg
    assert "Username: 0551234567" in msg
    assert "Password: secret12" in msg


@pytest.mark.asyncio
async def test_send_inspector_credentials_success() -> None:
    mock_provider = AsyncMock()
    mock_provider.send_sms.return_value = SmsDeliveryResult(sent=True)

    with (
        patch("app.services.sms.inspector_credentials.settings") as mock_settings,
        patch(
            "app.services.sms.inspector_credentials.get_sms_provider",
            return_value=mock_provider,
        ),
    ):
        mock_settings.sms_enabled = True
        mock_settings.nalo_sms_key = "test-key"
        mock_settings.inspector_portal_url = "monitoring.ctvet.gov.gh"

        result = await send_inspector_credentials("0551234567", "password1")

    assert result.sent is True
    mock_provider.send_sms.assert_awaited_once()
    msisdn, message = mock_provider.send_sms.await_args.args
    assert msisdn == "233551234567"
    assert "Username: 0551234567" in message
    assert "Password: password1" in message


@pytest.mark.asyncio
async def test_maybe_send_skipped_when_disabled() -> None:
    with patch("app.services.sms.inspector_credentials.settings") as mock_settings:
        mock_settings.sms_enabled = False
        sms_sent, sms_error, delivery_id = await maybe_send_inspector_credentials(
            "0551234567",
            "password1",
            None,
        )
    assert sms_sent is None
    assert sms_error is None
    assert delivery_id is None


@pytest.mark.asyncio
async def test_maybe_send_bulk_default_skipped() -> None:
    with patch("app.services.sms.inspector_credentials.settings") as mock_settings:
        mock_settings.sms_enabled = True
        sms_sent, sms_error, delivery_id = await maybe_send_inspector_credentials(
            "0551234567",
            "password1",
            None,
            bulk=True,
        )
    assert sms_sent is None
    assert sms_error is None
    assert delivery_id is None


@pytest.mark.asyncio
async def test_maybe_send_fail_open_on_provider_error() -> None:
    mock_provider = AsyncMock()
    mock_provider.send_sms.return_value = SmsDeliveryResult(sent=False, error="HTTP 500")

    with (
        patch("app.services.sms.inspector_credentials.settings") as mock_settings,
        patch(
            "app.services.sms.inspector_credentials.get_sms_provider",
            return_value=mock_provider,
        ),
    ):
        mock_settings.sms_enabled = True
        mock_settings.nalo_sms_key = "test-key"
        mock_settings.inspector_portal_url = "monitoring.ctvet.gov.gh"

        sms_sent, sms_error, delivery_id = await maybe_send_inspector_credentials(
            "0551234567",
            "password1",
            True,
        )

    assert sms_sent is False
    assert sms_error == "HTTP 500"
    assert delivery_id is None
