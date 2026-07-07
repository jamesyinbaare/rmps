"""Per-cohort appointment letter and bank details release policy."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AppointmentLettersReleaseMode,
    SubjectMarkingGroup,
    SubjectMarkingGroupMember,
)


def bank_details_pending_message(*, editable: bool) -> str | None:
    if editable:
        return None
    return "Bank details entry has been disabled by the examination office."


def appointment_letter_pending_message(
    *,
    release_enabled: bool,
    release_mode: AppointmentLettersReleaseMode,
    release_at: datetime | None,
    examiner_accepted: bool,
) -> str | None:
    if not release_enabled:
        return (
            "Your appointment letter will be available once released "
            "by the examination office."
        )

    if release_mode == AppointmentLettersReleaseMode.ON_ACCEPTANCE:
        if not examiner_accepted:
            return (
                "Confirm your availability first. Your appointment letter "
                "will be available on your profile after you accept."
            )
        return None

    if release_at is None:
        return (
            "Your appointment letter will be available once the examination "
            "office sets a release date."
        )
    if datetime.utcnow() >= release_at:
        return None
    return (
        f"Your appointment letter will be available on "
        f"{release_at.strftime('%d %b %Y at %H:%M')} UTC. You will receive an SMS when it is ready."
    )


def _parse_release_mode(raw: str | AppointmentLettersReleaseMode) -> AppointmentLettersReleaseMode:
    if isinstance(raw, AppointmentLettersReleaseMode):
        return raw
    try:
        return AppointmentLettersReleaseMode(str(raw))
    except ValueError:
        return AppointmentLettersReleaseMode.SCHEDULED_DATE


def is_cohort_appointment_letter_released(
    group: SubjectMarkingGroup,
    *,
    now: datetime | None = None,
    examiner_accepted: bool = True,
) -> bool:
    if not group.appointment_letters_release_enabled:
        return False
    mode = _parse_release_mode(group.appointment_letters_release_mode)
    if mode == AppointmentLettersReleaseMode.ON_ACCEPTANCE:
        return examiner_accepted
    release_at = group.appointment_letters_release_at
    if release_at is None:
        return False
    current = now or datetime.utcnow()
    return current >= release_at


def is_cohort_bank_details_editable(group: SubjectMarkingGroup) -> bool:
    return bool(group.examiner_bank_details_editable_by_examiners)


async def _examiner_cohort_memberships(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
) -> list[SubjectMarkingGroup]:
    stmt = (
        select(SubjectMarkingGroup)
        .join(SubjectMarkingGroupMember, SubjectMarkingGroupMember.group_id == SubjectMarkingGroup.id)
        .where(
            SubjectMarkingGroup.examination_id == examination_id,
            SubjectMarkingGroup.subject_id == subject_id,
            SubjectMarkingGroupMember.examiner_id == examiner_id,
        )
        .order_by(SubjectMarkingGroup.is_default.desc(), SubjectMarkingGroup.name)
    )
    return list((await session.execute(stmt)).scalars().unique().all())


async def _default_cohort(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> SubjectMarkingGroup | None:
    stmt = select(SubjectMarkingGroup).where(
        SubjectMarkingGroup.examination_id == examination_id,
        SubjectMarkingGroup.subject_id == subject_id,
        SubjectMarkingGroup.is_default.is_(True),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def resolve_effective_cohorts(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
) -> list[SubjectMarkingGroup]:
    groups = await _examiner_cohort_memberships(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )
    if groups:
        return groups
    default_group = await _default_cohort(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
    )
    if default_group is not None:
        return [default_group]
    return []


async def is_appointment_letter_available_for_examiner(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
    examiner_accepted: bool = True,
) -> bool:
    groups = await resolve_effective_cohorts(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )
    if not groups:
        return False
    return any(
        is_cohort_appointment_letter_released(group, examiner_accepted=examiner_accepted)
        for group in groups
    )


async def is_bank_details_editable_for_examiner(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
) -> bool:
    groups = await resolve_effective_cohorts(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )
    if not groups:
        return False
    return any(is_cohort_bank_details_editable(group) for group in groups)


def _appointment_letter_pending_for_group(
    group: SubjectMarkingGroup,
    *,
    examiner_accepted: bool,
) -> str | None:
    release_enabled = bool(group.appointment_letters_release_enabled)
    mode = _parse_release_mode(group.appointment_letters_release_mode)
    return appointment_letter_pending_message(
        release_enabled=release_enabled,
        release_mode=mode,
        release_at=group.appointment_letters_release_at,
        examiner_accepted=examiner_accepted,
    )


async def appointment_letter_pending_message_for_examiner(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
    examiner_accepted: bool = True,
) -> str | None:
    if await is_appointment_letter_available_for_examiner(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
        examiner_accepted=examiner_accepted,
    ):
        return None

    groups = await resolve_effective_cohorts(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )
    if not groups:
        return (
            "Your appointment letter will be available once released "
            "by the examination office."
        )

    enabled_groups = [group for group in groups if group.appointment_letters_release_enabled]
    if not enabled_groups:
        return (
            "Your appointment letter will be available once released "
            "by the examination office."
        )

    now = datetime.utcnow()
    future_scheduled = []
    for group in enabled_groups:
        mode = _parse_release_mode(group.appointment_letters_release_mode)
        if mode != AppointmentLettersReleaseMode.SCHEDULED_DATE:
            continue
        release_at = group.appointment_letters_release_at
        if release_at is not None and now < release_at:
            future_scheduled.append(group)

    if future_scheduled:
        earliest = min(future_scheduled, key=lambda group: group.appointment_letters_release_at)
        release_at = earliest.appointment_letters_release_at
        assert release_at is not None
        return (
            f"Your appointment letter will be available on "
            f"{release_at.strftime('%d %b %Y at %H:%M')} UTC. You will receive an SMS when it is ready."
        )

    for group in enabled_groups:
        msg = _appointment_letter_pending_for_group(group, examiner_accepted=examiner_accepted)
        if msg is not None:
            return msg

    return (
        "Your appointment letter will be available once released "
        "by the examination office."
    )


async def bank_details_pending_message_for_examiner(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
) -> str | None:
    editable = await is_bank_details_editable_for_examiner(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )
    return bank_details_pending_message(editable=editable)


def cohort_release_summary_fields(group: SubjectMarkingGroup) -> dict:
    release_enabled = bool(group.appointment_letters_release_enabled)
    mode = _parse_release_mode(group.appointment_letters_release_mode)
    return {
        "appointment_letters_release_enabled": release_enabled,
        "appointment_letters_release_mode": mode.value,
        "appointment_letters_release_at": group.appointment_letters_release_at,
        "examiner_bank_details_editable_by_examiners": bool(
            group.examiner_bank_details_editable_by_examiners
        ),
    }


def _primary_cohort(groups: list[SubjectMarkingGroup]) -> SubjectMarkingGroup | None:
    if not groups:
        return None
    return next((group for group in groups if not group.is_default), groups[0])


async def release_display_fields_for_examiner(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
    examiner_accepted: bool = True,
) -> dict:
    groups = await resolve_effective_cohorts(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )
    primary = _primary_cohort(groups)
    summary = cohort_release_summary_fields(primary) if primary is not None else {
        "appointment_letters_release_enabled": False,
        "appointment_letters_release_mode": AppointmentLettersReleaseMode.SCHEDULED_DATE.value,
        "appointment_letters_release_at": None,
        "examiner_bank_details_editable_by_examiners": False,
    }
    available = await is_appointment_letter_available_for_examiner(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
        examiner_accepted=examiner_accepted,
    )
    pending = await appointment_letter_pending_message_for_examiner(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
        examiner_accepted=examiner_accepted,
    )
    bank_pending = await bank_details_pending_message_for_examiner(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )
    bank_editable = await is_bank_details_editable_for_examiner(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )
    return {
        **summary,
        "appointment_letters_available": available,
        "appointment_letters_pending_message": pending,
        "bank_details_editable_by_examiners": bank_editable,
        "bank_details_available": bank_editable,
        "bank_details_pending_message": bank_pending,
    }


async def release_display_fields_for_subject_preview(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_accepted: bool,
) -> dict:
    default_group = await _default_cohort(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
    )
    if default_group is None:
        return {
            "appointment_letters_release_enabled": False,
            "appointment_letters_available": False,
            "appointment_letters_release_mode": AppointmentLettersReleaseMode.SCHEDULED_DATE.value,
            "appointment_letters_release_at": None,
            "appointment_letters_pending_message": (
                "Your appointment letter will be available once released "
                "by the examination office."
            ),
            "bank_details_editable_by_examiners": False,
            "bank_details_available": False,
            "bank_details_pending_message": bank_details_pending_message(editable=False),
        }

    release_enabled = bool(default_group.appointment_letters_release_enabled)
    mode = _parse_release_mode(default_group.appointment_letters_release_mode)
    available = is_cohort_appointment_letter_released(
        default_group,
        examiner_accepted=examiner_accepted,
    )
    pending = appointment_letter_pending_message(
        release_enabled=release_enabled,
        release_mode=mode,
        release_at=default_group.appointment_letters_release_at,
        examiner_accepted=examiner_accepted,
    )
    bank_editable = is_cohort_bank_details_editable(default_group)
    return {
        "appointment_letters_release_enabled": release_enabled,
        "appointment_letters_available": available,
        "appointment_letters_release_mode": mode.value,
        "appointment_letters_release_at": default_group.appointment_letters_release_at,
        "appointment_letters_pending_message": pending,
        "bank_details_editable_by_examiners": bank_editable,
        "bank_details_available": bank_editable,
        "bank_details_pending_message": bank_details_pending_message(editable=bank_editable),
    }
