"""Admin: per-subject DAC settings for appointment letters."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, Subject
from app.schemas.examiner_appointment_letter_subject_settings import (
    ExaminerAppointmentLetterSubjectSettingsPut,
    ExaminerAppointmentLetterSubjectSettingsResponse,
)
from app.services.exam_documents import ExamDocumentUploadError
from app.services.examiner_appointment_letter_settings import (
    delete_subject_signature,
    get_or_create_subject_settings,
    get_settings_row,
    get_subject_settings_row,
    read_subject_signature_bytes,
    store_subject_signature,
    subject_settings_to_response,
)

router = APIRouter(
    prefix="/admin/examinations",
    tags=["admin-examiner-appointment-letter-subject-settings"],
)


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    exam = await session.get(Examination, exam_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return exam


async def _load_subject(session: DBSessionDep, subject_id: int) -> Subject:
    subject = await session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
    return subject


@router.get(
    "/{exam_id}/examiner-appointment-letter-subject-settings/{subject_id}",
    response_model=ExaminerAppointmentLetterSubjectSettingsResponse,
)
async def get_examiner_appointment_letter_subject_settings(
    exam_id: int,
    subject_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminerAppointmentLetterSubjectSettingsResponse:
    await _load_examination(session, exam_id)
    await _load_subject(session, subject_id)
    exam_row = await get_settings_row(session, exam_id)
    subject_row = await get_subject_settings_row(session, exam_id, subject_id)
    return subject_settings_to_response(exam_id, subject_id, exam_row, subject_row)


@router.put(
    "/{exam_id}/examiner-appointment-letter-subject-settings/{subject_id}",
    response_model=ExaminerAppointmentLetterSubjectSettingsResponse,
)
async def put_examiner_appointment_letter_subject_settings(
    exam_id: int,
    subject_id: int,
    body: ExaminerAppointmentLetterSubjectSettingsPut,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminerAppointmentLetterSubjectSettingsResponse:
    await _load_examination(session, exam_id)
    await _load_subject(session, subject_id)
    exam_row = await get_settings_row(session, exam_id)
    row = await get_or_create_subject_settings(session, exam_id, subject_id)
    row.director_assessment_name = body.director_assessment_name.strip() or None
    row.director_assessment_title = body.director_assessment_title.strip() or None
    row.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(row)
    return subject_settings_to_response(exam_id, subject_id, exam_row, row)


@router.post(
    "/{exam_id}/examiner-appointment-letter-subject-settings/{subject_id}/signatures/director_assessment_certification",
    response_model=ExaminerAppointmentLetterSubjectSettingsResponse,
)
async def post_subject_dac_signature(
    exam_id: int,
    subject_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    file: UploadFile = File(...),
) -> ExaminerAppointmentLetterSubjectSettingsResponse:
    await _load_examination(session, exam_id)
    await _load_subject(session, subject_id)
    exam_row = await get_settings_row(session, exam_id)
    row = await get_or_create_subject_settings(session, exam_id, subject_id)
    content = await file.read()
    try:
        await store_subject_signature(row, content=content, filename=file.filename or "signature.png")
    except ExamDocumentUploadError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await session.commit()
    await session.refresh(row)
    return subject_settings_to_response(exam_id, subject_id, exam_row, row)


@router.delete(
    "/{exam_id}/examiner-appointment-letter-subject-settings/{subject_id}/signatures/director_assessment_certification",
    response_model=ExaminerAppointmentLetterSubjectSettingsResponse,
)
async def delete_subject_dac_signature(
    exam_id: int,
    subject_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminerAppointmentLetterSubjectSettingsResponse:
    await _load_examination(session, exam_id)
    await _load_subject(session, subject_id)
    exam_row = await get_settings_row(session, exam_id)
    row = await get_subject_settings_row(session, exam_id, subject_id)
    if row is None:
        return subject_settings_to_response(exam_id, subject_id, exam_row, None)
    await delete_subject_signature(row)
    await session.commit()
    await session.refresh(row)
    return subject_settings_to_response(exam_id, subject_id, exam_row, row)


@router.get(
    "/{exam_id}/examiner-appointment-letter-subject-settings/{subject_id}/signatures/director_assessment_certification",
)
async def get_subject_dac_signature(
    exam_id: int,
    subject_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> Response:
    await _load_examination(session, exam_id)
    await _load_subject(session, subject_id)
    row = await get_subject_settings_row(session, exam_id, subject_id)
    payload = read_subject_signature_bytes(row)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signature not found")
    raw, content_type = payload
    return Response(content=raw, media_type=content_type)
