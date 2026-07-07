"""SMS when appointment letters become available."""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import Examiner, ExaminerSubject, SubjectMarkingGroupMember
from app.services.cohort_portal_release import is_appointment_letter_available_for_examiner
from app.services.examiner_portal_release import examiner_portal_link
from app.services.sms.delivery_log import record_examiner_appointment_letter_released_sms
from app.services.sms.factory import get_sms_provider
from app.services.sms.phone import normalize_msisdn
from app.services.sms.types import SmsDeliveryResult

logger = logging.getLogger(__name__)

SMS_SINGLE_SEGMENT_MAX_LEN = 160


def build_appointment_letter_released_message(name: str, link: str) -> str:
    first = name.split()[0] if name.strip() else "there"
    message = (
        f"{first}, your CTVET appointment letter is ready. "
        f"Open your portal to download it and submit bank details: {link}"
    )
    if len(message) > SMS_SINGLE_SEGMENT_MAX_LEN:
        message = f"{first}, your appointment letter is ready: {link}"
    return message


async def maybe_send_appointment_letter_released_sms(
    session: AsyncSession,
    examiner: Examiner,
    *,
    trigger: str,
    triggered_by_user_id: UUID | None = None,
) -> SmsDeliveryResult:
    if examiner.appointment_letter_notified_at is not None:
        return SmsDeliveryResult(sent=False, error="Already notified")
    if not examiner.phone_number:
        return SmsDeliveryResult(sent=False, error="No phone number")

    link = examiner_portal_link(examiner)
    message = build_appointment_letter_released_message(examiner.name, link)
    return await record_examiner_appointment_letter_released_sms(
        session,
        examiner=examiner,
        message=message,
        trigger=trigger,
        triggered_by_user_id=triggered_by_user_id,
    )


async def maybe_notify_on_portal_visit(
    session: AsyncSession,
    examiner: Examiner,
    *,
    subject_id: int | None = None,
) -> None:
    if subject_id is None:
        return
    eligible = await is_appointment_letter_available_for_examiner(
        session,
        examination_id=int(examiner.examination_id),
        subject_id=subject_id,
        examiner_id=examiner.id,
    )
    if not eligible:
        return
    if examiner.appointment_letter_notified_at is not None:
        return
    result = await maybe_send_appointment_letter_released_sms(
        session,
        examiner,
        trigger="portal_visit",
    )
    if result.sent:
        examiner.appointment_letter_notified_at = datetime.utcnow()
        await session.flush()


async def _cohort_member_examiners(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID,
) -> list[Examiner]:
    stmt = (
        select(Examiner)
        .join(SubjectMarkingGroupMember, SubjectMarkingGroupMember.examiner_id == Examiner.id)
        .where(
            SubjectMarkingGroupMember.group_id == group_id,
            SubjectMarkingGroupMember.examination_id == examination_id,
            SubjectMarkingGroupMember.subject_id == subject_id,
        )
        .options(selectinload(Examiner.subjects).selectinload(ExaminerSubject.subject))
    )
    return list((await session.execute(stmt)).scalars().unique().all())


async def notify_eligible_examiners_in_cohort(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID,
    triggered_by_user_id: UUID | None,
    trigger: str,
) -> dict:
    if not settings.sms_enabled or not settings.nalo_sms_key.strip():
        return {"sms_sent_count": 0, "sms_failed_count": 0, "skipped_count": 0}

    examiners = await _cohort_member_examiners(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )
    sent = 0
    failed = 0
    skipped = 0
    for examiner in examiners:
        if not await is_appointment_letter_available_for_examiner(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
            examiner_id=examiner.id,
        ):
            skipped += 1
            continue
        if examiner.appointment_letter_notified_at is not None:
            skipped += 1
            continue
        result = await maybe_send_appointment_letter_released_sms(
            session,
            examiner,
            trigger=trigger,
            triggered_by_user_id=triggered_by_user_id,
        )
        if result.sent:
            examiner.appointment_letter_notified_at = datetime.utcnow()
            sent += 1
        else:
            failed += 1
    return {"sms_sent_count": sent, "sms_failed_count": failed, "skipped_count": skipped}
