"""Subject officer login credential SMS."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from app.config import settings
from app.services.sms.factory import get_sms_provider
from app.services.sms.inspector_credentials import resolve_send_sms
from app.services.sms.phone import normalize_msisdn
from app.services.sms.types import SmsDeliveryResult

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_SUBJECT_OFFICER_CREDENTIALS_TEMPLATE = (
    "Dear Subject Officer, your CTVET Exam Tools login details. "
    "URL: {portal_url} Email: {email} Password: {password}"
)


def build_subject_officer_credentials_message(email: str, password: str) -> str:
    portal_url = settings.examiner_invitation_base_url.rstrip("/") + "/login/admin"
    return _SUBJECT_OFFICER_CREDENTIALS_TEMPLATE.format(
        portal_url=portal_url,
        email=email.strip(),
        password=password,
    )


async def send_subject_officer_credentials(
    phone: str,
    email: str,
    password: str,
) -> SmsDeliveryResult:
    if not settings.sms_enabled or not settings.nalo_sms_key.strip():
        return SmsDeliveryResult(sent=False, error="SMS is not configured")

    try:
        msisdn = normalize_msisdn(phone)
        message = build_subject_officer_credentials_message(email, password)
    except ValueError as exc:
        return SmsDeliveryResult(sent=False, error=str(exc))

    provider = get_sms_provider()
    result = await provider.send_sms(msisdn, message)
    if result.sent:
        masked = msisdn[:5] + "…" + msisdn[-3:] if len(msisdn) > 8 else "…"
        logger.info("Subject officer credentials SMS sent to %s", masked)
    else:
        logger.warning("Subject officer credentials SMS failed: %s", result.error)
    return result


async def maybe_send_subject_officer_credentials(
    phone: str | None,
    email: str,
    password: str,
    send_sms: bool | None,
    *,
    bulk: bool = False,
    session: AsyncSession | None = None,
    user_id: UUID | None = None,
    trigger: str = "create",
    triggered_by_user_id: UUID | None = None,
) -> tuple[bool | None, str | None, UUID | None]:
    if not resolve_send_sms(send_sms, bulk=bulk):
        return None, None, None
    if not phone or not phone.strip():
        return False, "Phone number required to send credentials SMS", None

    result = await send_subject_officer_credentials(phone.strip(), email, password)
    if result.sent:
        return True, None, None
    return False, result.error, None
