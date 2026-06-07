"""Custom SMS for confirmed examiner roster entries."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from app.config import settings
from app.services.examiner_invitation import invitation_public_url
from app.services.sms.factory import get_sms_provider
from app.services.sms.phone import normalize_msisdn
from app.services.sms.types import SmsDeliveryResult

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.models import Examiner

logger = logging.getLogger(__name__)

SMS_SINGLE_SEGMENT_MAX_LEN = 160

_EXAMINER_TYPE_ABBREVS = {
    "chief_examiner": "CE",
    "assistant_examiner": "AE",
    "team_leader": "TL",
}


def _format_response_deadline(dt) -> str:
    if dt is None:
        return ""
    return dt.strftime("%d %b %Y, %H:%M")


def _format_coordination_date(dt) -> str:
    if dt is None:
        return ""
    return dt.strftime("%d %b %Y")


def _subject_name(ex: Examiner) -> str:
    if not ex.subjects:
        return ""
    link = ex.subjects[0]
    subject = getattr(link, "subject", None)
    return subject.name if subject is not None else ""


def render_examiner_roster_custom_message(ex: Examiner, template: str) -> str:
    exam = ex.examination
    inv = ex.invitation
    exam_name = f"{exam.exam_type} {exam.year}" if exam else ""
    role = _EXAMINER_TYPE_ABBREVS.get(ex.examiner_type.value, ex.examiner_type.value)
    link = invitation_public_url(inv.token) if inv is not None else ""
    replacements = {
        "{name}": ex.name,
        "{link}": link,
        "{subject}": _subject_name(ex),
        "{exam}": exam_name,
        "{role}": role,
        "{region}": ex.region.value.replace("_", " ").title(),
        "{response_deadline}": _format_response_deadline(inv.response_deadline if inv else None),
        "{coordination_date}": _format_coordination_date(inv.coordination_date if inv else None),
    }
    message = template
    for key, value in replacements.items():
        message = message.replace(key, value)
    if len(message) > SMS_SINGLE_SEGMENT_MAX_LEN:
        logger.warning(
            "Custom examiner roster SMS is %s chars (>%s); may split into multiple segments",
            len(message),
            SMS_SINGLE_SEGMENT_MAX_LEN,
        )
    return message


async def send_custom_examiner_roster_sms(ex: Examiner, message: str) -> SmsDeliveryResult:
    if not settings.sms_enabled or not settings.nalo_sms_key.strip():
        return SmsDeliveryResult(sent=False, error="SMS is not configured")

    if not ex.phone_number or not str(ex.phone_number).strip():
        return SmsDeliveryResult(sent=False, error="No phone number on roster")

    try:
        msisdn = normalize_msisdn(ex.phone_number)
    except ValueError as exc:
        return SmsDeliveryResult(sent=False, error=str(exc))

    provider = get_sms_provider()
    result = await provider.send_sms(msisdn, message)
    if result.sent:
        masked = msisdn[:5] + "…" + msisdn[-3:] if len(msisdn) > 8 else "…"
        logger.info("Custom examiner roster SMS sent to %s", masked)
    else:
        logger.warning("Custom examiner roster SMS failed: %s", result.error)
    return result


async def maybe_send_custom_examiner_roster_sms(
    ex: Examiner,
    template: str,
    *,
    session: AsyncSession,
    triggered_by_user_id: UUID | None = None,
    trigger: str = "bulk_custom",
    retried_from_id: UUID | None = None,
) -> tuple[bool, str | None, UUID | None]:
    from app.services.sms.delivery_log import record_custom_examiner_roster_sms

    rendered = render_examiner_roster_custom_message(ex, template)
    result, delivery_id = await record_custom_examiner_roster_sms(
        session,
        examiner=ex,
        message=rendered,
        trigger=trigger,
        triggered_by_user_id=triggered_by_user_id,
        retried_from_id=retried_from_id,
    )
    if result.sent:
        return True, None, delivery_id
    return False, result.error, delivery_id
