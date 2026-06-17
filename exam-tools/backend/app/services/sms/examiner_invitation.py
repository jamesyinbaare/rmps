"""Examiner invitation SMS."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from app.config import settings
from app.services.coordination_schedule import format_coordination_range
from app.services.examiner_invitation import invitation_public_url
from app.services.sms.factory import get_sms_provider
from app.services.sms.phone import normalize_msisdn
from app.services.sms.types import SmsDeliveryResult

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.models import ExaminerInvitation

logger = logging.getLogger(__name__)

SMS_SINGLE_SEGMENT_MAX_LEN = 160

_EXAMINER_TYPE_ABBREVS = {
    "chief_examiner": "CE",
    "assistant_chief_examiner": "ACE",
    "assistant_examiner": "AE",
    "team_leader": "TL",
}

_CUSTOM_PLACEHOLDERS = (
    "{name}",
    "{link}",
    "{subject}",
    "{exam}",
    "{role}",
    "{region}",
    "{response_deadline}",
    "{coordination_date}",
    "{coordination_start}",
    "{coordination_end}",
)


def is_coordination_sms_template(template: str) -> bool:
    """True when the message uses coordination date (coordination notices only)."""
    return "{coordination_date}" in template


def can_receive_coordination_sms(inv: ExaminerInvitation) -> bool:
    """Only invitees who accepted the invitation (responded yes) may receive coordination SMS."""
    from app.models import ExaminerInvitationStatus

    return inv.status == ExaminerInvitationStatus.ACCEPTED


def coordination_sms_recipient_error(inv: ExaminerInvitation, template: str) -> str | None:
    """Return an error message when this invitation must not receive the SMS; None if send is allowed."""
    if not is_coordination_sms_template(template):
        return None
    if can_receive_coordination_sms(inv):
        return None
    return "This person hasn't accepted their invitation yet."


def coordination_sms_bulk_selection_error(
    invitations: list[ExaminerInvitation],
    template: str,
) -> str | None:
    """Block the entire bulk send when any selected invitee has not accepted."""
    if not is_coordination_sms_template(template):
        return None
    blocked_count = sum(1 for inv in invitations if not can_receive_coordination_sms(inv))
    if blocked_count == 0:
        return None
    if blocked_count == len(invitations):
        return (
            "None of the people you selected have accepted their invitation yet. "
            "You can send a coordination message once they accept."
        )
    if blocked_count == 1:
        return (
            "1 person in your selection hasn't accepted their invitation yet. "
            "Deselect them first, or wait until they accept."
        )
    return (
        f"{blocked_count} people in your selection haven't accepted their invitation yet. "
        "Deselect them first, or wait until they accept."
    )


def _format_response_deadline(dt) -> str:
    if dt is None:
        return ""
    return dt.strftime("%d %b %Y, %H:%M")


def _format_response_deadline_sms(dt) -> str:
    if dt is None:
        return ""
    return dt.strftime("%d %b %Y")


def _exam_full_label(exam) -> str:
    if exam is None:
        return "the examination"
    year = getattr(exam, "year", None)
    exam_type = getattr(exam, "exam_type", None)
    if year is None or exam_type is None:
        return "the examination"
    exam_series = getattr(exam, "exam_series", None)
    if exam_series is not None and not isinstance(exam_series, str):
        exam_series = None
    parts = [str(year)]
    if exam_series and str(exam_series).strip():
        parts.append(str(exam_series).strip())
    parts.append(str(exam_type).strip())
    return " ".join(parts)


def _exam_label_for_sms(exam) -> str:
    if exam is None:
        return "the examination"
    year = getattr(exam, "year", None)
    exam_type = getattr(exam, "exam_type", None)
    if year is None or exam_type is None:
        return "the examination"
    exam_series = getattr(exam, "exam_series", None)
    if exam_series is not None and not isinstance(exam_series, str):
        exam_series = None
    from app.services.exam_official_export import (
        _abbreviate_exam_series_for_sms,
        _abbreviate_exam_type_for_sms,
    )

    parts = [str(year)]
    series = _abbreviate_exam_series_for_sms(exam_series)
    type_abbr = _abbreviate_exam_type_for_sms(str(exam_type).strip())
    if series:
        parts.append(series)
    if type_abbr and type_abbr not in parts:
        parts.append(type_abbr)
    return " ".join(parts)


def _first_name(name: str) -> str:
    parts = name.strip().split()
    return parts[0] if parts else name.strip()


def _build_examiner_invitation_message_candidates(
    *,
    name: str,
    role: str,
    subject_name: str,
    exam_full_label: str,
    exam_compact_label: str,
    link: str,
    deadline_text: str,
) -> list[str]:
    first = _first_name(name)

    def with_dear(addressee: str, exam_label: str) -> str:
        if deadline_text:
            return (
                f"Dear {addressee}, you are invited as {role} for {subject_name}, {exam_label}. "
                f"Please accept or decline by {deadline_text}: {link}"
            )
        return (
            f"Dear {addressee}, you are invited as {role} for {subject_name}, {exam_label}. "
            f"Please accept or decline: {link}"
        )

    def without_dear(exam_label: str) -> str:
        if deadline_text:
            return (
                f"You are invited as {role} for {subject_name}, {exam_label}. "
                f"Please accept or decline by {deadline_text}: {link}"
            )
        return (
            f"You are invited as {role} for {subject_name}, {exam_label}. "
            f"Please accept or decline: {link}"
        )

    return [
        with_dear(name, exam_full_label),
        with_dear(first, exam_full_label),
        without_dear(exam_full_label),
        without_dear(exam_compact_label),
    ]


def _pick_sms_message(candidates: list[str]) -> str:
    """Prefer a single-segment message; always keep the full invitation URL."""
    for message in candidates:
        if len(message) <= SMS_SINGLE_SEGMENT_MAX_LEN:
            return message
    message = candidates[-1]
    logger.warning(
        "Examiner invitation SMS is %s chars (>%s); full URL kept — message may use multiple segments",
        len(message),
        SMS_SINGLE_SEGMENT_MAX_LEN,
    )
    return message


def _coordination_range_for_inv(inv: ExaminerInvitation) -> str:
    return format_coordination_range(
        inv.coordination_start_date,
        inv.coordination_start_time,
        inv.coordination_end_date,
        inv.coordination_end_time,
    ) or ""


def render_examiner_invitation_custom_message(inv: ExaminerInvitation, template: str) -> str:
    subject = inv.subject
    exam = inv.examination
    subject_name = subject.name if subject else ""
    exam_name = _exam_full_label(exam) if exam else ""
    role = _EXAMINER_TYPE_ABBREVS.get(inv.examiner_type.value, inv.examiner_type.value)
    link = invitation_public_url(inv.token)
    replacements = {
        "{name}": inv.name,
        "{link}": link,
        "{subject}": subject_name,
        "{exam}": exam_name,
        "{role}": role,
        "{region}": inv.region.value.replace("_", " ").title(),
        "{response_deadline}": _format_response_deadline(inv.response_deadline),
        "{coordination_date}": _coordination_range_for_inv(inv),
        "{coordination_start}": format_coordination_range(
            inv.coordination_start_date,
            inv.coordination_start_time,
            inv.coordination_start_date,
            inv.coordination_start_time,
        )
        or "",
        "{coordination_end}": format_coordination_range(
            inv.coordination_end_date,
            None,
            inv.coordination_end_date,
            inv.coordination_end_time,
        )
        or "",
    }
    message = template
    for key, value in replacements.items():
        message = message.replace(key, value)
    if len(message) > SMS_SINGLE_SEGMENT_MAX_LEN:
        logger.warning(
            "Custom examiner invitation SMS is %s chars (>%s); may split into multiple segments",
            len(message),
            SMS_SINGLE_SEGMENT_MAX_LEN,
        )
    return message


def build_quota_waitlist_sms(
    *,
    name: str,
    subject_name: str,
    region_group_name: str,
) -> str:
    first = name.split()[0] if name.strip() else "there"
    message = (
        f"Hi {first}, thanks for confirming. The {region_group_name} quota for "
        f"{subject_name} is full right now. A slot may open later — check your invitation link again."
    )
    if len(message) > SMS_SINGLE_SEGMENT_MAX_LEN:
        message = (
            f"Hi {first}, the {region_group_name} quota for {subject_name} is full. "
            f"Check your invitation link again if a slot opens."
        )
    return message


async def send_quota_waitlist_sms(
    inv: ExaminerInvitation,
    *,
    region_group_name: str,
) -> SmsDeliveryResult:
    if not settings.sms_enabled or not settings.nalo_sms_key.strip():
        return SmsDeliveryResult(sent=False, error="SMS is not configured")

    try:
        msisdn = normalize_msisdn(inv.phone_number)
    except ValueError as exc:
        return SmsDeliveryResult(sent=False, error=str(exc))

    subject = inv.subject
    subject_name = subject.name if subject else "your subject"
    message = build_quota_waitlist_sms(
        name=inv.name,
        subject_name=subject_name,
        region_group_name=region_group_name,
    )
    provider = get_sms_provider()
    result = await provider.send_sms(msisdn, message)
    if result.sent:
        masked = msisdn[:5] + "…" + msisdn[-3:] if len(msisdn) > 8 else "…"
        logger.info("Quota waitlist SMS sent to %s", masked)
    else:
        logger.warning("Quota waitlist SMS failed: %s", result.error)
    return result


def build_examiner_invitation_message(inv: ExaminerInvitation) -> str:
    subject = inv.subject
    exam = inv.examination
    subject_name = subject.name if subject else "your subject"
    exam_full_label = _exam_full_label(exam)
    exam_compact_label = _exam_label_for_sms(exam)
    role = _EXAMINER_TYPE_ABBREVS.get(inv.examiner_type.value, inv.examiner_type.value)
    link = invitation_public_url(inv.token)
    deadline = getattr(inv, "response_deadline", None)
    deadline_text = _format_response_deadline_sms(deadline) if isinstance(deadline, datetime) else ""
    return _pick_sms_message(
        _build_examiner_invitation_message_candidates(
            name=inv.name,
            role=role,
            subject_name=subject_name,
            exam_full_label=exam_full_label,
            exam_compact_label=exam_compact_label,
            link=link,
            deadline_text=deadline_text,
        )
    )


async def send_examiner_invitation_sms(inv: ExaminerInvitation) -> SmsDeliveryResult:
    if not settings.sms_enabled or not settings.nalo_sms_key.strip():
        return SmsDeliveryResult(sent=False, error="SMS is not configured")

    try:
        msisdn = normalize_msisdn(inv.phone_number)
        message = build_examiner_invitation_message(inv)
    except ValueError as exc:
        return SmsDeliveryResult(sent=False, error=str(exc))

    provider = get_sms_provider()
    result = await provider.send_sms(msisdn, message)
    if result.sent:
        masked = msisdn[:5] + "…" + msisdn[-3:] if len(msisdn) > 8 else "…"
        logger.info("Examiner invitation SMS sent to %s", masked)
    else:
        logger.warning("Examiner invitation SMS failed: %s", result.error)
    return result


async def maybe_send_examiner_invitation_sms(
    inv: ExaminerInvitation,
    send_sms: bool | None,
    *,
    session: AsyncSession | None = None,
    triggered_by_user_id: UUID | None = None,
    trigger: str = "create",
    retried_from_id: UUID | None = None,
    bulk: bool = False,
) -> tuple[bool | None, str | None, UUID | None]:
    from app.services.sms.inspector_credentials import resolve_send_sms

    if not resolve_send_sms(send_sms, bulk=bulk):
        return None, None, None

    if session is not None:
        from app.services.sms.delivery_log import record_examiner_invitation_sms

        result, delivery_id = await record_examiner_invitation_sms(
            session,
            invitation=inv,
            trigger=trigger,
            triggered_by_user_id=triggered_by_user_id,
            retried_from_id=retried_from_id,
        )
        if result.sent:
            return True, None, delivery_id
        return False, result.error, delivery_id

    result = await send_examiner_invitation_sms(inv)
    if result.sent:
        return True, None, None
    return False, result.error, None


async def send_custom_examiner_invitation_sms(inv: ExaminerInvitation, message: str) -> SmsDeliveryResult:
    if not settings.sms_enabled or not settings.nalo_sms_key.strip():
        return SmsDeliveryResult(sent=False, error="SMS is not configured")

    try:
        msisdn = normalize_msisdn(inv.phone_number)
    except ValueError as exc:
        return SmsDeliveryResult(sent=False, error=str(exc))

    provider = get_sms_provider()
    result = await provider.send_sms(msisdn, message)
    if result.sent:
        masked = msisdn[:5] + "…" + msisdn[-3:] if len(msisdn) > 8 else "…"
        logger.info("Custom examiner invitation SMS sent to %s", masked)
    else:
        logger.warning("Custom examiner invitation SMS failed: %s", result.error)
    return result


async def maybe_send_custom_examiner_invitation_sms(
    inv: ExaminerInvitation,
    template: str,
    *,
    session: AsyncSession,
    triggered_by_user_id: UUID | None = None,
    trigger: str = "bulk_custom",
    retried_from_id: UUID | None = None,
) -> tuple[bool, str | None, UUID | None]:
    from app.services.sms.delivery_log import record_custom_examiner_invitation_sms

    skip_reason = coordination_sms_recipient_error(inv, template)
    if skip_reason is not None:
        return False, skip_reason, None

    rendered = render_examiner_invitation_custom_message(inv, template)
    result, delivery_id = await record_custom_examiner_invitation_sms(
        session,
        invitation=inv,
        message=rendered,
        trigger=trigger,
        triggered_by_user_id=triggered_by_user_id,
        retried_from_id=retried_from_id,
    )
    if result.sent:
        return True, None, delivery_id
    return False, result.error, delivery_id
