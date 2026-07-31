"""SMS when workforce (script checker / data entry clerk) appointment letters become available."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Union
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import DataEntryClerk, ScriptChecker, WorkforceKind
from app.services.sms.delivery_log import record_workforce_appointment_letter_released_sms
from app.services.sms.examiner_appointment_letter_release import build_appointment_letter_released_message
from app.services.sms.types import SmsDeliveryResult
from app.services.workforce_exercise_group import list_group_member_persons
from app.services.workforce_portal import data_entry_clerk_portal_url, script_checker_portal_url
from app.services.workforce_portal_release import is_appointment_letter_available_for_person

logger = logging.getLogger(__name__)

WorkforcePerson = Union[ScriptChecker, DataEntryClerk]


def _portal_link(person: WorkforcePerson) -> str:
    if isinstance(person, ScriptChecker):
        return script_checker_portal_url(person.portal_token)
    return data_entry_clerk_portal_url(person.portal_token)


async def maybe_send_workforce_appointment_letter_released_sms(
    session: AsyncSession,
    person: WorkforcePerson,
    *,
    trigger: str,
    triggered_by_user_id: UUID | None = None,
) -> SmsDeliveryResult:
    if person.appointment_letter_notified_at is not None:
        return SmsDeliveryResult(sent=False, error="Already notified")
    if not person.phone_number:
        return SmsDeliveryResult(sent=False, error="No phone number")

    link = _portal_link(person)
    message = build_appointment_letter_released_message(person.name, link)
    if isinstance(person, ScriptChecker):
        return await record_workforce_appointment_letter_released_sms(
            session,
            script_checker=person,
            message=message,
            trigger=trigger,
            triggered_by_user_id=triggered_by_user_id,
        )
    return await record_workforce_appointment_letter_released_sms(
        session,
        data_entry_clerk=person,
        message=message,
        trigger=trigger,
        triggered_by_user_id=triggered_by_user_id,
    )


async def maybe_notify_on_portal_visit(
    session: AsyncSession,
    person: WorkforcePerson,
    *,
    examination_id: int,
    kind: WorkforceKind,
    person_accepted: bool = True,
) -> None:
    if person.appointment_letter_notified_at is not None:
        return
    eligible = await is_appointment_letter_available_for_person(
        session,
        examination_id=examination_id,
        kind=kind,
        person_id=person.id,
        person_accepted=person_accepted,
    )
    if not eligible:
        return
    result = await maybe_send_workforce_appointment_letter_released_sms(
        session,
        person,
        trigger="portal_visit",
    )
    if result.sent:
        person.appointment_letter_notified_at = datetime.utcnow()
        await session.flush()


async def notify_eligible_members_in_group(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    group_id: UUID,
    triggered_by_user_id: UUID | None,
    trigger: str,
) -> dict:
    if not settings.sms_enabled or not settings.nalo_sms_key.strip():
        return {"sms_sent_count": 0, "sms_failed_count": 0, "skipped_count": 0}

    persons = await list_group_member_persons(
        session,
        examination_id=examination_id,
        kind=kind,
        group_id=group_id,
    )
    sent = 0
    failed = 0
    skipped = 0
    for person in persons:
        eligible = await is_appointment_letter_available_for_person(
            session,
            examination_id=examination_id,
            kind=kind,
            person_id=person.id,
        )
        if not eligible or person.appointment_letter_notified_at is not None:
            skipped += 1
            continue
        result = await maybe_send_workforce_appointment_letter_released_sms(
            session,
            person,
            trigger=trigger,
            triggered_by_user_id=triggered_by_user_id,
        )
        if result.sent:
            person.appointment_letter_notified_at = datetime.utcnow()
            sent += 1
        else:
            failed += 1
    return {"sms_sent_count": sent, "sms_failed_count": failed, "skipped_count": skipped}
