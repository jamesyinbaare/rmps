"""Persist SMS delivery attempts."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import SmsDelivery
from app.services.sms.inspector_credentials import send_inspector_credentials
from app.services.sms.phone import normalize_msisdn
from app.services.sms.types import SmsDeliveryResult

if TYPE_CHECKING:
    from app.models import DataEntryClerk, Examiner, ExaminerInvitation, ScriptChecker

_MAX_ERROR_LEN = 2000
_MAX_PROVIDER_RESPONSE_LEN = 2000

MESSAGE_TYPE_INSPECTOR_CREDENTIALS = "inspector_credentials"
MESSAGE_TYPE_EXAMINER_INVITATION = "examiner_invitation"
MESSAGE_TYPE_EXAMINER_INVITATION_CUSTOM = "examiner_invitation_custom"
MESSAGE_TYPE_EXAMINER_ROSTER_CUSTOM = "examiner_roster_custom"
MESSAGE_TYPE_EXAMINER_APPOINTMENT_LETTER_RELEASED = "examiner_appointment_letter_released"
MESSAGE_TYPE_WORKFORCE_PORTAL_INVITE = "workforce_portal_invite"


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
    user_id: UUID | None = None,
    examiner_invitation_id: UUID | None = None,
    examiner_id: UUID | None = None,
    script_checker_id: UUID | None = None,
    data_entry_clerk_id: UUID | None = None,
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
        examiner_invitation_id=examiner_invitation_id,
        examiner_id=examiner_id,
        script_checker_id=script_checker_id,
        data_entry_clerk_id=data_entry_clerk_id,
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


async def record_examiner_invitation_sms(
    session: AsyncSession,
    *,
    invitation: ExaminerInvitation,
    trigger: str,
    triggered_by_user_id: UUID | None = None,
    retried_from_id: UUID | None = None,
) -> tuple[SmsDeliveryResult, UUID | None]:
    from app.models import ExaminerInvitation as ExaminerInvitationModel
    from app.services.sms.examiner_invitation import send_examiner_invitation_sms

    inv = invitation
    if inv.examination is None or inv.subject is None:
        from sqlalchemy import select

        stmt = (
            select(ExaminerInvitationModel)
            .where(ExaminerInvitationModel.id == invitation.id)
            .options(
                selectinload(ExaminerInvitationModel.examination),
                selectinload(ExaminerInvitationModel.subject),
            )
        )
        inv = (await session.execute(stmt)).scalar_one_or_none()
        if inv is None:
            return SmsDeliveryResult(sent=False, error="Invitation not found"), None

    try:
        msisdn = normalize_msisdn(inv.phone_number)
    except ValueError as exc:
        row = await create_delivery_log(
            session,
            examiner_invitation_id=inv.id,
            phone_number=inv.phone_number,
            msisdn="",
            message_type=MESSAGE_TYPE_EXAMINER_INVITATION,
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
        examiner_invitation_id=inv.id,
        phone_number=inv.phone_number,
        msisdn=msisdn,
        message_type=MESSAGE_TYPE_EXAMINER_INVITATION,
        trigger=trigger,
        status="pending",
        triggered_by_user_id=triggered_by_user_id,
        retried_from_id=retried_from_id,
    )
    await session.flush()

    result = await send_examiner_invitation_sms(inv)
    if result.sent:
        await mark_delivery_sent(session, pending.id)
        inv.notified_at = datetime.utcnow()
    else:
        await mark_delivery_failed(session, pending.id, error=result.error or "SMS failed")
    await session.commit()
    return result, pending.id


async def record_custom_examiner_invitation_sms(
    session: AsyncSession,
    *,
    invitation: ExaminerInvitation,
    message: str,
    trigger: str,
    triggered_by_user_id: UUID | None = None,
    retried_from_id: UUID | None = None,
) -> tuple[SmsDeliveryResult, UUID | None]:
    from app.models import ExaminerInvitation as ExaminerInvitationModel
    from app.services.sms.examiner_invitation import send_custom_examiner_invitation_sms

    inv = invitation
    if inv.examination is None or inv.subject is None:
        from sqlalchemy import select

        stmt = (
            select(ExaminerInvitationModel)
            .where(ExaminerInvitationModel.id == invitation.id)
            .options(
                selectinload(ExaminerInvitationModel.examination),
                selectinload(ExaminerInvitationModel.subject),
            )
        )
        inv = (await session.execute(stmt)).scalar_one_or_none()
        if inv is None:
            return SmsDeliveryResult(sent=False, error="Invitation not found"), None

    try:
        msisdn = normalize_msisdn(inv.phone_number)
    except ValueError as exc:
        row = await create_delivery_log(
            session,
            examiner_invitation_id=inv.id,
            phone_number=inv.phone_number,
            msisdn="",
            message_type=MESSAGE_TYPE_EXAMINER_INVITATION_CUSTOM,
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
        examiner_invitation_id=inv.id,
        phone_number=inv.phone_number,
        msisdn=msisdn,
        message_type=MESSAGE_TYPE_EXAMINER_INVITATION_CUSTOM,
        trigger=trigger,
        status="pending",
        triggered_by_user_id=triggered_by_user_id,
        retried_from_id=retried_from_id,
    )
    await session.flush()

    result = await send_custom_examiner_invitation_sms(inv, message)
    if result.sent:
        await mark_delivery_sent(session, pending.id)
        inv.notified_at = datetime.utcnow()
    else:
        await mark_delivery_failed(session, pending.id, error=result.error or "SMS failed")
    await session.commit()
    return result, pending.id


async def record_custom_examiner_roster_sms(
    session: AsyncSession,
    *,
    examiner: Examiner,
    message: str,
    trigger: str,
    triggered_by_user_id: UUID | None = None,
    retried_from_id: UUID | None = None,
) -> tuple[SmsDeliveryResult, UUID | None]:
    from app.models import Examiner as ExaminerModel
    from app.models import ExaminerSubject
    from app.services.sms.examiner_roster import send_custom_examiner_roster_sms

    ex = examiner
    if ex.examination is None or not ex.subjects:
        from sqlalchemy import select

        stmt = (
            select(ExaminerModel)
            .where(ExaminerModel.id == examiner.id)
            .options(
                selectinload(ExaminerModel.examination),
                selectinload(ExaminerModel.subjects).selectinload(ExaminerSubject.subject),
                selectinload(ExaminerModel.invitation),
            )
        )
        ex = (await session.execute(stmt)).scalar_one_or_none()
        if ex is None:
            return SmsDeliveryResult(sent=False, error="Examiner not found"), None

    phone = ex.phone_number or ""
    try:
        msisdn = normalize_msisdn(phone) if phone.strip() else ""
    except ValueError as exc:
        row = await create_delivery_log(
            session,
            examiner_id=ex.id,
            phone_number=phone,
            msisdn="",
            message_type=MESSAGE_TYPE_EXAMINER_ROSTER_CUSTOM,
            trigger=trigger,
            status="failed",
            triggered_by_user_id=triggered_by_user_id,
            retried_from_id=retried_from_id,
            error_message=str(exc),
        )
        await session.commit()
        return SmsDeliveryResult(sent=False, error=str(exc)), row.id

    if not msisdn:
        row = await create_delivery_log(
            session,
            examiner_id=ex.id,
            phone_number=phone,
            msisdn="",
            message_type=MESSAGE_TYPE_EXAMINER_ROSTER_CUSTOM,
            trigger=trigger,
            status="failed",
            triggered_by_user_id=triggered_by_user_id,
            retried_from_id=retried_from_id,
            error_message="No phone number on roster",
        )
        await session.commit()
        return SmsDeliveryResult(sent=False, error="No phone number on roster"), row.id

    pending = await create_delivery_log(
        session,
        examiner_id=ex.id,
        phone_number=phone,
        msisdn=msisdn,
        message_type=MESSAGE_TYPE_EXAMINER_ROSTER_CUSTOM,
        trigger=trigger,
        status="pending",
        triggered_by_user_id=triggered_by_user_id,
        retried_from_id=retried_from_id,
    )
    await session.flush()

    result = await send_custom_examiner_roster_sms(ex, message)
    if result.sent:
        await mark_delivery_sent(session, pending.id)
    else:
        await mark_delivery_failed(session, pending.id, error=result.error or "SMS failed")
    await session.commit()
    return result, pending.id


async def record_examiner_appointment_letter_released_sms(
    session: AsyncSession,
    *,
    examiner: Examiner,
    message: str,
    trigger: str,
    triggered_by_user_id: UUID | None = None,
) -> SmsDeliveryResult:
    from app.config import settings
    from app.services.sms.factory import get_sms_provider

    phone = examiner.phone_number or ""
    if not settings.sms_enabled or not settings.nalo_sms_key.strip():
        return SmsDeliveryResult(sent=False, error="SMS is not configured")

    try:
        msisdn = normalize_msisdn(phone)
    except ValueError as exc:
        await create_delivery_log(
            session,
            examiner_id=examiner.id,
            phone_number=phone,
            msisdn="",
            message_type=MESSAGE_TYPE_EXAMINER_APPOINTMENT_LETTER_RELEASED,
            trigger=trigger,
            status="failed",
            triggered_by_user_id=triggered_by_user_id,
            error_message=str(exc),
        )
        return SmsDeliveryResult(sent=False, error=str(exc))

    pending = await create_delivery_log(
        session,
        examiner_id=examiner.id,
        phone_number=phone,
        msisdn=msisdn,
        message_type=MESSAGE_TYPE_EXAMINER_APPOINTMENT_LETTER_RELEASED,
        trigger=trigger,
        status="pending",
        triggered_by_user_id=triggered_by_user_id,
    )
    await session.flush()

    result = await get_sms_provider().send_sms(msisdn, message)
    if result.sent:
        await mark_delivery_sent(session, pending.id)
    else:
        await mark_delivery_failed(
            session,
            pending.id,
            error=result.error or "SMS failed",
        )
    return result


async def record_workforce_portal_invite_sms(
    session: AsyncSession,
    *,
    script_checker: ScriptChecker | None = None,
    data_entry_clerk: DataEntryClerk | None = None,
    trigger: str,
    triggered_by_user_id: UUID | None = None,
    retried_from_id: UUID | None = None,
) -> tuple[SmsDeliveryResult, UUID | None]:
    from sqlalchemy import select

    from app.models import DataEntryClerk as DataEntryClerkModel
    from app.models import ScriptChecker as ScriptCheckerModel
    from app.services.sms.workforce_portal_sms import (
        send_data_entry_clerk_portal_invite_sms,
        send_script_checker_portal_invite_sms,
    )

    if (script_checker is None) == (data_entry_clerk is None):
        return SmsDeliveryResult(sent=False, error="Exactly one workforce member is required"), None

    if script_checker is not None:
        stmt = (
            select(ScriptCheckerModel)
            .where(ScriptCheckerModel.id == script_checker.id)
            .options(selectinload(ScriptCheckerModel.examination))
        )
        person = (await session.execute(stmt)).scalar_one_or_none()
        if person is None:
            return SmsDeliveryResult(sent=False, error="Script checker not found"), None
        phone = person.phone_number or ""
        script_checker_id = person.id
        data_entry_clerk_id = None
        send_fn = send_script_checker_portal_invite_sms
    else:
        assert data_entry_clerk is not None
        stmt = (
            select(DataEntryClerkModel)
            .where(DataEntryClerkModel.id == data_entry_clerk.id)
            .options(selectinload(DataEntryClerkModel.examination))
        )
        person = (await session.execute(stmt)).scalar_one_or_none()
        if person is None:
            return SmsDeliveryResult(sent=False, error="Data entry clerk not found"), None
        phone = person.phone_number or ""
        script_checker_id = None
        data_entry_clerk_id = person.id
        send_fn = send_data_entry_clerk_portal_invite_sms

    if not str(phone).strip():
        row = await create_delivery_log(
            session,
            script_checker_id=script_checker_id,
            data_entry_clerk_id=data_entry_clerk_id,
            phone_number=phone,
            msisdn="",
            message_type=MESSAGE_TYPE_WORKFORCE_PORTAL_INVITE,
            trigger=trigger,
            status="failed",
            triggered_by_user_id=triggered_by_user_id,
            retried_from_id=retried_from_id,
            error_message="No phone number on roster",
        )
        await session.commit()
        return SmsDeliveryResult(sent=False, error="No phone number on roster"), row.id

    try:
        msisdn = normalize_msisdn(phone)
    except ValueError as exc:
        row = await create_delivery_log(
            session,
            script_checker_id=script_checker_id,
            data_entry_clerk_id=data_entry_clerk_id,
            phone_number=phone,
            msisdn="",
            message_type=MESSAGE_TYPE_WORKFORCE_PORTAL_INVITE,
            trigger=trigger,
            status="failed",
            triggered_by_user_id=triggered_by_user_id,
            retried_from_id=retried_from_id,
            error_message=str(exc),
        )
        await session.commit()
        return SmsDeliveryResult(sent=False, error=str(exc)), row.id

    from app.services.workforce_availability import ensure_workforce_invite_deadline

    ensure_workforce_invite_deadline(person)

    pending = await create_delivery_log(
        session,
        script_checker_id=script_checker_id,
        data_entry_clerk_id=data_entry_clerk_id,
        phone_number=phone,
        msisdn=msisdn,
        message_type=MESSAGE_TYPE_WORKFORCE_PORTAL_INVITE,
        trigger=trigger,
        status="pending",
        triggered_by_user_id=triggered_by_user_id,
        retried_from_id=retried_from_id,
    )
    await session.flush()

    result = await send_fn(person)
    if result.sent:
        await mark_delivery_sent(session, pending.id)
        person.portal_invite_sms_sent_at = datetime.utcnow()
    else:
        await mark_delivery_failed(
            session,
            pending.id,
            error=result.error or "SMS failed",
        )
    await session.commit()
    return result, pending.id
