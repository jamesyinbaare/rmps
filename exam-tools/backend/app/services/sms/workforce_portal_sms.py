"""SMS portal invites for script checkers and data entry clerks."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from app.config import settings
from app.models import DataEntryClerk, ScriptChecker
from app.services.exam_official_export import examination_label_sms
from app.services.sms.factory import get_sms_provider
from app.services.sms.phone import normalize_msisdn
from app.services.sms.types import SmsDeliveryResult
from app.services.workforce_portal import data_entry_clerk_portal_url, script_checker_portal_url

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

SMS_SINGLE_SEGMENT_MAX_LEN = 160


def _log_sms_length(message: str, *, context: str) -> None:
    if len(message) > SMS_SINGLE_SEGMENT_MAX_LEN:
        logger.warning(
            "%s SMS is %s chars (>%s); link may be truncated on some handsets",
            context,
            len(message),
            SMS_SINGLE_SEGMENT_MAX_LEN,
        )


def build_script_checker_invite_message(checker: ScriptChecker) -> str:
    exam = checker.examination
    exam_name = examination_label_sms(exam) if exam is not None else "the exam"
    link = script_checker_portal_url(checker.portal_token)
    message = f"{checker.name}, script checker for {exam_name}. Confirm: {link}"
    _log_sms_length(message, context="Script checker invite")
    return message


def build_data_entry_clerk_invite_message(clerk: DataEntryClerk) -> str:
    exam = clerk.examination
    exam_name = examination_label_sms(exam) if exam is not None else "the exam"
    link = data_entry_clerk_portal_url(clerk.portal_token)
    message = f"{clerk.name}, data entry for {exam_name}. Confirm: {link}"
    _log_sms_length(message, context="Data entry clerk invite")
    return message


async def send_script_checker_portal_invite_sms(checker: ScriptChecker) -> SmsDeliveryResult:
    return await send_script_checker_invite_sms(checker)


async def send_data_entry_clerk_portal_invite_sms(clerk: DataEntryClerk) -> SmsDeliveryResult:
    return await send_data_entry_clerk_invite_sms(clerk)


async def send_script_checker_invite_sms(checker: ScriptChecker) -> SmsDeliveryResult:
    if not settings.sms_enabled or not settings.nalo_sms_key.strip():
        return SmsDeliveryResult(sent=False, error="SMS is not configured")
    phone = checker.phone_number or ""
    if not phone.strip():
        return SmsDeliveryResult(sent=False, error="No phone number on roster")
    try:
        msisdn = normalize_msisdn(phone)
    except ValueError as exc:
        return SmsDeliveryResult(sent=False, error=str(exc))
    message = build_script_checker_invite_message(checker)
    return await get_sms_provider().send_sms(msisdn, message)


async def send_data_entry_clerk_invite_sms(clerk: DataEntryClerk) -> SmsDeliveryResult:
    if not settings.sms_enabled or not settings.nalo_sms_key.strip():
        return SmsDeliveryResult(sent=False, error="SMS is not configured")
    phone = clerk.phone_number or ""
    if not phone.strip():
        return SmsDeliveryResult(sent=False, error="No phone number on roster")
    try:
        msisdn = normalize_msisdn(phone)
    except ValueError as exc:
        return SmsDeliveryResult(sent=False, error=str(exc))
    message = build_data_entry_clerk_invite_message(clerk)
    return await get_sms_provider().send_sms(msisdn, message)


async def maybe_send_script_checker_invite_sms(
    session: AsyncSession,
    checker: ScriptChecker,
    *,
    trigger: str,
    triggered_by_user_id: UUID | None = None,
) -> tuple[SmsDeliveryResult, UUID | None]:
    from app.services.sms.delivery_log import record_workforce_portal_invite_sms

    return await record_workforce_portal_invite_sms(
        session,
        script_checker=checker,
        trigger=trigger,
        triggered_by_user_id=triggered_by_user_id,
    )


async def maybe_send_data_entry_clerk_invite_sms(
    session: AsyncSession,
    clerk: DataEntryClerk,
    *,
    trigger: str,
    triggered_by_user_id: UUID | None = None,
) -> tuple[SmsDeliveryResult, UUID | None]:
    from app.services.sms.delivery_log import record_workforce_portal_invite_sms

    return await record_workforce_portal_invite_sms(
        session,
        data_entry_clerk=clerk,
        trigger=trigger,
        triggered_by_user_id=triggered_by_user_id,
    )


def mark_script_checker_invite_sent(checker: ScriptChecker) -> None:
    checker.portal_invite_sms_sent_at = datetime.utcnow()


def mark_data_entry_clerk_invite_sent(clerk: DataEntryClerk) -> None:
    clerk.portal_invite_sms_sent_at = datetime.utcnow()
