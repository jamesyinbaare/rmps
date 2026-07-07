"""Admin: per-cohort examiner portal release (appointment letters and bank details)."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import AppointmentLettersReleaseMode, Examiner, Examination, SubjectMarkingGroupMember
from app.schemas.cohort_examiner_portal_release import (
    AppointmentLettersReleaseModeApi,
    CohortExaminerPortalReleasePut,
    CohortExaminerPortalReleaseResponse,
    NotifyEligibleAppointmentLettersResponse,
)
from app.services.cohort_portal_release import (
    cohort_release_summary_fields,
    is_appointment_letter_available_for_examiner,
)
from app.services.sms.examiner_appointment_letter_release import notify_eligible_examiners_in_cohort
from app.services.subject_marking_group import load_group

router = APIRouter(
    prefix="/admin/examinations/{examination_id}/subjects/{subject_id}/marking-groups/{group_id}/examiner-portal-release",
    tags=["admin-cohort-examiner-portal-release"],
)


def _parse_release_mode(raw: str | AppointmentLettersReleaseMode) -> AppointmentLettersReleaseMode:
    if isinstance(raw, AppointmentLettersReleaseMode):
        return raw
    try:
        return AppointmentLettersReleaseMode(str(raw))
    except ValueError:
        return AppointmentLettersReleaseMode.SCHEDULED_DATE


def _as_naive_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


async def _cohort_member_examiners(
    session,
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
        .options(selectinload(Examiner.subjects))
    )
    return list((await session.execute(stmt)).scalars().unique().all())


async def _summary_counts(
    session,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID,
    group,
) -> dict:
    examiners = await _cohort_member_examiners(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )
    rostered = len(examiners)
    pending = 0
    eligible = 0
    notified = 0
    mode = _parse_release_mode(group.appointment_letters_release_mode)
    release_enabled = bool(group.appointment_letters_release_enabled)

    for examiner in examiners:
        if await is_appointment_letter_available_for_examiner(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
            examiner_id=examiner.id,
        ):
            eligible += 1
        elif release_enabled:
            if mode == AppointmentLettersReleaseMode.SCHEDULED_DATE and group.appointment_letters_release_at is None:
                pending += 1
            elif (
                mode == AppointmentLettersReleaseMode.SCHEDULED_DATE
                and group.appointment_letters_release_at is not None
                and datetime.utcnow() < group.appointment_letters_release_at
            ):
                pending += 1
        if examiner.appointment_letter_notified_at is not None:
            notified += 1

    return {
        "rostered_examiner_count": rostered,
        "pending_release_count": pending,
        "eligible_now_count": eligible,
        "notified_count": notified,
    }


def _response_for_group(group, counts: dict) -> CohortExaminerPortalReleaseResponse:
    summary = cohort_release_summary_fields(group)
    mode = _parse_release_mode(group.appointment_letters_release_mode)
    return CohortExaminerPortalReleaseResponse(
        examination_id=int(group.examination_id),
        subject_id=int(group.subject_id),
        group_id=group.id,
        group_name=group.name,
        is_default=bool(group.is_default),
        appointment_letters_release_enabled=bool(summary["appointment_letters_release_enabled"]),
        appointment_letters_release_mode=AppointmentLettersReleaseModeApi(mode.value),
        appointment_letters_release_at=summary["appointment_letters_release_at"],
        examiner_bank_details_editable_by_examiners=bool(
            summary["examiner_bank_details_editable_by_examiners"]
        ),
        updated_at=group.updated_at,
        **counts,
    )


async def _load_group_or_404(
    session,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID,
):
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    group = await load_group(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cohort not found")
    return group


@router.get("", response_model=CohortExaminerPortalReleaseResponse)
async def get_cohort_examiner_portal_release(
    examination_id: int,
    subject_id: int,
    group_id: UUID,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> CohortExaminerPortalReleaseResponse:
    group = await _load_group_or_404(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )
    counts = await _summary_counts(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
        group=group,
    )
    return _response_for_group(group, counts)


@router.put("", response_model=CohortExaminerPortalReleaseResponse)
async def put_cohort_examiner_portal_release(
    examination_id: int,
    subject_id: int,
    group_id: UUID,
    body: CohortExaminerPortalReleasePut,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> CohortExaminerPortalReleaseResponse:
    group = await _load_group_or_404(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )

    mode = AppointmentLettersReleaseMode(body.appointment_letters_release_mode.value)
    if mode == AppointmentLettersReleaseMode.SCHEDULED_DATE and body.appointment_letters_release_enabled:
        if body.appointment_letters_release_at is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Set a release date and time when using scheduled release.",
            )

    group.appointment_letters_release_enabled = body.appointment_letters_release_enabled
    group.appointment_letters_release_mode = mode.value
    group.appointment_letters_release_at = (
        _as_naive_utc(body.appointment_letters_release_at)
        if mode == AppointmentLettersReleaseMode.SCHEDULED_DATE
        else None
    )
    group.examiner_bank_details_editable_by_examiners = body.examiner_bank_details_editable_by_examiners
    group.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(group)
    counts = await _summary_counts(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
        group=group,
    )
    return _response_for_group(group, counts)


@router.post(
    "/notify-eligible-appointment-letters",
    response_model=NotifyEligibleAppointmentLettersResponse,
)
async def post_notify_eligible_appointment_letters(
    examination_id: int,
    subject_id: int,
    group_id: UUID,
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
) -> NotifyEligibleAppointmentLettersResponse:
    await _load_group_or_404(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )
    result = await notify_eligible_examiners_in_cohort(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
        triggered_by_user_id=user.id,
        trigger="notify_eligible",
    )
    await session.commit()
    return NotifyEligibleAppointmentLettersResponse(**result)
