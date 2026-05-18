"""Inspector login credential SMS."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from app.config import settings
from app.services.sms.factory import get_sms_provider
from app.services.sms.phone import format_local_phone_username, normalize_msisdn
from app.services.sms.types import SmsDeliveryResult

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_INSPECTOR_CREDENTIALS_TEMPLATE = (
    "Dear Inspector, your CTVET Monitoring Portal login details. "
    "URL: {portal_url} Username: {username} Password: {password}"
)


def build_inspector_credentials_message(phone: str, password: str) -> str:
    username = format_local_phone_username(phone)
    return _INSPECTOR_CREDENTIALS_TEMPLATE.format(
        portal_url=settings.inspector_portal_url,
        username=username,
        password=password,
    )


def resolve_send_sms(send_sms: bool | None, *, bulk: bool = False) -> bool:
    if send_sms is not None:
        return send_sms
    if bulk:
        return False
    return settings.sms_enabled


async def send_inspector_credentials(phone: str, password: str) -> SmsDeliveryResult:
    if not settings.sms_enabled or not settings.nalo_sms_key.strip():
        return SmsDeliveryResult(sent=False, error="SMS is not configured")

    try:
        msisdn = normalize_msisdn(phone)
        message = build_inspector_credentials_message(phone, password)
    except ValueError as exc:
        return SmsDeliveryResult(sent=False, error=str(exc))

    provider = get_sms_provider()
    result = await provider.send_sms(msisdn, message)
    if result.sent:
        masked = msisdn[:5] + "…" + msisdn[-3:] if len(msisdn) > 8 else "…"
        logger.info("Inspector credentials SMS sent to %s", masked)
    else:
        logger.warning("Inspector credentials SMS failed: %s", result.error)
    return result


async def maybe_send_inspector_credentials(
    phone: str,
    password: str,
    send_sms: bool | None,
    *,
    bulk: bool = False,
    session: AsyncSession | None = None,
    user_id: UUID | None = None,
    trigger: str = "create",
    triggered_by_user_id: UUID | None = None,
    retried_from_id: UUID | None = None,
) -> tuple[bool | None, str | None, UUID | None]:
    """Return (sms_sent, sms_error, delivery_id). sms_sent is None when SMS was skipped."""
    if not resolve_send_sms(send_sms, bulk=bulk):
        return None, None, None

    if session is not None and user_id is not None:
        from app.services.sms.delivery_log import record_inspector_credentials_sms

        result, delivery_id = await record_inspector_credentials_sms(
            session,
            user_id=user_id,
            phone=phone,
            password=password,
            trigger=trigger,
            triggered_by_user_id=triggered_by_user_id,
            retried_from_id=retried_from_id,
        )
        if result.sent:
            return True, None, delivery_id
        return False, result.error, delivery_id

    result = await send_inspector_credentials(phone, password)
    if result.sent:
        return True, None, None
    return False, result.error, None
