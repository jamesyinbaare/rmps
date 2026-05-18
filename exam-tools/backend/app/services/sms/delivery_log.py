"""Persist SMS delivery attempts."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SmsDelivery
from app.services.sms.inspector_credentials import send_inspector_credentials
from app.services.sms.phone import normalize_msisdn
from app.services.sms.types import SmsDeliveryResult

if TYPE_CHECKING:
    pass

_MAX_ERROR_LEN = 2000
_MAX_PROVIDER_RESPONSE_LEN = 2000

MESSAGE_TYPE_INSPECTOR_CREDENTIALS = "inspector_credentials"


def _truncate(text: str | None, max_len: int) -> str | None:
    if text is None:
        return None
    s = text.strip()
    if not s:
        return None
    return s if len(s) <= max_len else s[: max_len - 3] + "..."


async def create_delivery_log(
    session: AsyncSession,
    *,
    user_id: UUID,
    phone_number: str,
    msisdn: str,
    message_type: str,
    trigger: str,
    status: str,
    triggered_by_user_id: UUID | None = None,
    retried_from_id: UUID | None = None,
    error_message: str | None = None,
    provider_response: str | None = None,
) -> SmsDelivery:
    row = SmsDelivery(
        user_id=user_id,
        phone_number=phone_number,
        msisdn=msisdn,
        message_type=message_type,
        trigger=trigger,
        status=status,
        error_message=_truncate(error_message, _MAX_ERROR_LEN),
        provider="nalo",
        provider_response=_truncate(provider_response, _MAX_PROVIDER_RESPONSE_LEN),
        retried_from_id=retried_from_id,
        triggered_by_user_id=triggered_by_user_id,
        sent_at=datetime.utcnow() if status == "sent" else None,
    )
    session.add(row)
    await session.flush()
    return row


async def mark_delivery_sent(
    session: AsyncSession,
    delivery_id: UUID,
    *,
    provider_response: str | None = None,
) -> None:
    row = await session.get(SmsDelivery, delivery_id)
    if row is None:
        return
    row.status = "sent"
    row.sent_at = datetime.utcnow()
    row.error_message = None
    if provider_response is not None:
        row.provider_response = _truncate(provider_response, _MAX_PROVIDER_RESPONSE_LEN)
    await session.flush()


async def mark_delivery_failed(
    session: AsyncSession,
    delivery_id: UUID,
    *,
    error: str,
    provider_response: str | None = None,
) -> None:
    row = await session.get(SmsDelivery, delivery_id)
    if row is None:
        return
    row.status = "failed"
    row.error_message = _truncate(error, _MAX_ERROR_LEN)
    if provider_response is not None:
        row.provider_response = _truncate(provider_response, _MAX_PROVIDER_RESPONSE_LEN)
    await session.flush()


async def record_inspector_credentials_sms(
    session: AsyncSession,
    *,
    user_id: UUID,
    phone: str,
    password: str,
    trigger: str,
    triggered_by_user_id: UUID | None = None,
    retried_from_id: UUID | None = None,
) -> tuple[SmsDeliveryResult, UUID | None]:
    """Send inspector credentials SMS and persist delivery log. Returns (result, delivery_id)."""
    try:
        msisdn = normalize_msisdn(phone)
    except ValueError as exc:
        row = await create_delivery_log(
            session,
            user_id=user_id,
            phone_number=phone,
            msisdn="",
            message_type=MESSAGE_TYPE_INSPECTOR_CREDENTIALS,
            trigger=trigger,
            status="failed",
            triggered_by_user_id=triggered_by_user_id,
            retried_from_id=retried_from_id,
            error_message=str(exc),
        )
        await session.commit()
        return SmsDeliveryResult(sent=False, error=str(exc)), row.id

    pending = await create_delivery_log(
        session,
        user_id=user_id,
        phone_number=phone,
        msisdn=msisdn,
        message_type=MESSAGE_TYPE_INSPECTOR_CREDENTIALS,
        trigger=trigger,
        status="pending",
        triggered_by_user_id=triggered_by_user_id,
        retried_from_id=retried_from_id,
    )
    await session.flush()

    result = await send_inspector_credentials(phone, password)
    if result.sent:
        await mark_delivery_sent(session, pending.id)
    else:
        await mark_delivery_failed(session, pending.id, error=result.error or "SMS failed")
    await session.commit()
    return result, pending.id
