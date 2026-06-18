"""Admin: per-examination examiner portal settings (appointment letter release)."""

from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import AppointmentLettersReleaseMode, Examiner, Examination, ExaminerSubject
from app.schemas.examiner_portal_settings import (
    AppointmentLettersReleaseModeApi,
    ExaminerPortalSettingsPut,
    ExaminerPortalSettingsResponse,
    NotifyEligibleAppointmentLettersResponse,
)
from app.services.examiner_portal_release import (
    get_or_create_portal_settings,
    is_appointment_letter_available,
)
from app.services.sms.examiner_appointment_letter_release import notify_eligible_examiners

router = APIRouter(
    prefix="/admin/examinations/{examination_id}/examiner-portal-settings",
    tags=["admin-examiner-portal-settings"],
)


def _parse_release_mode(raw: str | AppointmentLettersReleaseMode) -> AppointmentLettersReleaseMode:
    if isinstance(raw, AppointmentLettersReleaseMode):
        return raw
    try:
        return AppointmentLettersReleaseMode(str(raw))
    except ValueError:
        return AppointmentLettersReleaseMode.SCHEDULED_DATE


async def _summary_counts(session, examination_id: int, portal_row) -> dict:
    stmt = (
        select(Examiner)
        .where(Examiner.examination_id == examination_id)
        .options(selectinload(Examiner.subjects).selectinload(ExaminerSubject.subject))
    )
    examiners = list((await session.execute(stmt)).scalars().all())
    rostered = len(examiners)
    pending = 0
    eligible = 0
    notified = 0
    mode = _parse_release_mode(portal_row.appointment_letters_release_mode)
    release_enabled = bool(portal_row.appointment_letters_release_enabled)

    for examiner in examiners:
        if await is_appointment_letter_available(session, examiner):
            eligible += 1
        elif release_enabled:
            if mode == AppointmentLettersReleaseMode.SCHEDULED_DATE and portal_row.appointment_letters_release_at is None:
                pending += 1
            elif mode == AppointmentLettersReleaseMode.SCHEDULED_DATE and portal_row.appointment_letters_release_at is not None:
                if datetime.utcnow() < portal_row.appointment_letters_release_at:
                    pending += 1
        if examiner.appointment_letter_notified_at is not None:
            notified += 1

    return {
        "rostered_examiner_count": rostered,
        "pending_release_count": pending,
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
    counts = await _summary_counts(session, examination_id, row)
    mode = _parse_release_mode(row.appointment_letters_release_mode)
    return ExaminerPortalSettingsResponse(
        examination_id=examination_id,
        appointment_letters_release_enabled=bool(row.appointment_letters_release_enabled),
        appointment_letters_release_mode=AppointmentLettersReleaseModeApi(mode.value),
        appointment_letters_release_at=row.appointment_letters_release_at,
        examiner_bank_details_editable_by_examiners=bool(
            row.examiner_bank_details_editable_by_examiners
        ),
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

    mode = AppointmentLettersReleaseMode(body.appointment_letters_release_mode.value)
    if mode == AppointmentLettersReleaseMode.SCHEDULED_DATE and body.appointment_letters_release_enabled:
        if body.appointment_letters_release_at is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Set a release date and time when using scheduled release.",
            )

    row = await get_or_create_portal_settings(session, examination_id)
    row.appointment_letters_release_enabled = body.appointment_letters_release_enabled
    row.appointment_letters_release_mode = mode.value
    row.appointment_letters_release_at = body.appointment_letters_release_at
    row.examiner_bank_details_editable_by_examiners = body.examiner_bank_details_editable_by_examiners
    row.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(row)
    counts = await _summary_counts(session, examination_id, row)
    return ExaminerPortalSettingsResponse(
        examination_id=examination_id,
        appointment_letters_release_enabled=bool(row.appointment_letters_release_enabled),
        appointment_letters_release_mode=AppointmentLettersReleaseModeApi(mode.value),
        appointment_letters_release_at=row.appointment_letters_release_at,
        examiner_bank_details_editable_by_examiners=bool(
            row.examiner_bank_details_editable_by_examiners
        ),
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
