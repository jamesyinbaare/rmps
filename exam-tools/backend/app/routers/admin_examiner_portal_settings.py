"""Admin: per-examination examiner portal settings (appointment letter release)."""

from fastapi import APIRouter, HTTPException, status

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import Examiner, Examination, ExaminerSubject
from app.schemas.examiner_portal_settings import (
    ExaminerPortalSettingsPut,
    ExaminerPortalSettingsResponse,
    NotifyEligibleAppointmentLettersResponse,
)
from app.services.examiner_portal_release import (
    get_or_create_portal_settings,
    is_appointment_letter_available,
    resolve_coordination_end_at,
)
from app.services.sms.examiner_appointment_letter_release import notify_eligible_examiners

router = APIRouter(
    prefix="/admin/examinations/{examination_id}/examiner-portal-settings",
    tags=["admin-examiner-portal-settings"],
)


async def _summary_counts(session, examination_id: int) -> dict:
    stmt = (
        select(Examiner)
        .where(Examiner.examination_id == examination_id)
        .options(selectinload(Examiner.subjects).selectinload(ExaminerSubject.subject))
    )
    examiners = list((await session.execute(stmt)).scalars().all())
    rostered = len(examiners)
    with_end = 0
    eligible = 0
    notified = 0
    for examiner in examiners:
        if await resolve_coordination_end_at(session, examiner) is not None:
            with_end += 1
        if await is_appointment_letter_available(session, examiner):
            eligible += 1
        if examiner.appointment_letter_notified_at is not None:
            notified += 1
    return {
        "rostered_examiner_count": rostered,
        "with_coordination_end_count": with_end,
        "eligible_now_count": eligible,
        "notified_count": notified,
    }


@router.get("", response_model=ExaminerPortalSettingsResponse)
async def get_examiner_portal_settings(
    examination_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminerPortalSettingsResponse:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    row = await get_or_create_portal_settings(session, examination_id)
    counts = await _summary_counts(session, examination_id)
    return ExaminerPortalSettingsResponse(
        examination_id=examination_id,
        appointment_letters_release_enabled=bool(row.appointment_letters_release_enabled),
        updated_at=row.updated_at,
        **counts,
    )


@router.put("", response_model=ExaminerPortalSettingsResponse)
async def put_examiner_portal_settings(
    examination_id: int,
    body: ExaminerPortalSettingsPut,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminerPortalSettingsResponse:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    from datetime import datetime

    row = await get_or_create_portal_settings(session, examination_id)
    row.appointment_letters_release_enabled = body.appointment_letters_release_enabled
    row.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(row)
    counts = await _summary_counts(session, examination_id)
    return ExaminerPortalSettingsResponse(
        examination_id=examination_id,
        appointment_letters_release_enabled=bool(row.appointment_letters_release_enabled),
        updated_at=row.updated_at,
        **counts,
    )


@router.post(
    "/notify-eligible-appointment-letters",
    response_model=NotifyEligibleAppointmentLettersResponse,
)
async def post_notify_eligible_appointment_letters(
    examination_id: int,
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
) -> NotifyEligibleAppointmentLettersResponse:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    result = await notify_eligible_examiners(
        session,
        examination_id=examination_id,
        triggered_by_user_id=user.id,
        trigger="notify_eligible",
    )
    await session.commit()
    return NotifyEligibleAppointmentLettersResponse(**result)
