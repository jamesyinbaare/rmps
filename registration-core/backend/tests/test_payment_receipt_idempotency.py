"""Ensure payment receipts are only attempted on first success transition."""
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import Payment, PaymentStatus
from app.services.payment_service import process_webhook_event


@pytest.mark.asyncio
async def test_receipt_helpers_skipped_when_already_success():
    payment = Payment(
        id=1,
        amount=Decimal("100.00"),
        currency="GHS",
        status=PaymentStatus.SUCCESS,
        paystack_reference="ref-1",
        invoice_id=None,
    )

    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = payment
    session.execute = AsyncMock(return_value=result)
    session.flush = AsyncMock()

    with (
        patch("app.services.payment_service._send_private_payment_receipt") as send_private,
        patch(
            "app.services.payment_service._send_school_fee_payment_receipt",
            new_callable=AsyncMock,
        ) as send_school,
    ):
        await process_webhook_event(
            session,
            {
                "event": "charge.success",
                "data": {"reference": "ref-1", "paid_at": None, "metadata": {}},
            },
        )

    send_private.assert_not_called()
    send_school.assert_not_called()
    assert payment.status == PaymentStatus.SUCCESS


@pytest.mark.asyncio
async def test_private_receipt_helper_sends_when_email_present(monkeypatch):
    from app.models import RegistrationCandidate
    from app.services.payment_service import _send_private_payment_receipt

    candidate = RegistrationCandidate(
        id=1,
        firstname="Ada",
        lastname="Lovelace",
        contact_email="ada@example.com",
        registration_number="REG-1",
    )
    payment = Payment(
        id=2,
        amount=Decimal("50.00"),
        currency="GHS",
        status=PaymentStatus.SUCCESS,
        paystack_reference="ref-2",
    )

    with patch(
        "app.services.email_service.send_payment_receipt_email", return_value=True
    ) as send:
        _send_private_payment_receipt(candidate, payment)

    send.assert_called_once()
    assert send.call_args.kwargs["to"] == "ada@example.com"
