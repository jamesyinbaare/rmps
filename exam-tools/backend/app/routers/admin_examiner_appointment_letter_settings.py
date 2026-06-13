"""Admin: per-examination appointment letter signatory and CC settings."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import AppointmentLetterSigningOfficial, Examination
from app.schemas.examiner_appointment_letter_settings import (
    AppointmentLetterSignatureRoleApi,
    AppointmentLetterSigningOfficialApi,
    ExaminerAppointmentLetterSettingsCopyFrom,
    ExaminerAppointmentLetterSettingsCopyFromResponse,
    ExaminerAppointmentLetterSettingsPut,
    ExaminerAppointmentLetterSettingsResponse,
)
from app.services.exam_documents import ExamDocumentUploadError
from app.services.examiner_appointment_letter_settings import (
    DEFAULT_VALEDICTION,
    copy_settings_from_examination,
    delete_signature_for_role,
    get_or_create_settings,
    get_settings_row,
    read_signature_bytes,
    settings_to_response,
    store_signature_for_role,
)

router = APIRouter(
    prefix="/admin/examinations",
    tags=["admin-examiner-appointment-letter-settings"],
)


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    exam = await session.get(Examination, exam_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return exam


def _parse_signature_role(role: str) -> AppointmentLetterSignatureRoleApi:
    try:
        return AppointmentLetterSignatureRoleApi(role)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature role") from exc


@router.get(
    "/{exam_id}/examiner-appointment-letter-settings",
    response_model=ExaminerAppointmentLetterSettingsResponse,
)
async def get_examiner_appointment_letter_settings(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminerAppointmentLetterSettingsResponse:
    await _load_examination(session, exam_id)
    row = await get_settings_row(session, exam_id)
    return settings_to_response(exam_id, row)


@router.put(
    "/{exam_id}/examiner-appointment-letter-settings",
    response_model=ExaminerAppointmentLetterSettingsResponse,
)
async def put_examiner_appointment_letter_settings(
    exam_id: int,
    body: ExaminerAppointmentLetterSettingsPut,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminerAppointmentLetterSettingsResponse:
    await _load_examination(session, exam_id)
    row = await get_or_create_settings(session, exam_id)
    row.signing_official = AppointmentLetterSigningOfficial(body.signing_official.value)
    row.signed_for_director_general = body.signed_for_director_general
    row.director_general_name = body.director_general_name.strip() or None
    row.director_general_title = body.director_general_title.strip() or None
    row.director_assessment_name = body.director_assessment_name.strip() or None
    row.director_assessment_title = body.director_assessment_title.strip() or None
    row.valediction = body.valediction.strip() or DEFAULT_VALEDICTION
    row.letter_date = body.letter_date
    row.cc_lines = [line.strip() for line in body.cc_lines if line.strip()]
    row.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(row)
    return settings_to_response(exam_id, row)


@router.post(
    "/{exam_id}/examiner-appointment-letter-settings/copy-from",
    response_model=ExaminerAppointmentLetterSettingsCopyFromResponse,
)
async def post_copy_examiner_appointment_letter_settings(
    exam_id: int,
    body: ExaminerAppointmentLetterSettingsCopyFrom,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminerAppointmentLetterSettingsCopyFromResponse:
    if body.source_examination_id == exam_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source examination must differ from the target examination",
        )
    await _load_examination(session, exam_id)
    source_exam = await session.get(Examination, body.source_examination_id)
    if source_exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source examination not found")

    _, cc_count, signatures_copied = await copy_settings_from_examination(
        session,
        target_examination_id=exam_id,
        source_examination_id=body.source_examination_id,
    )
    await session.commit()
    return ExaminerAppointmentLetterSettingsCopyFromResponse(
        examination_id=exam_id,
        source_examination_id=body.source_examination_id,
        cc_lines_copied=cc_count,
        signatures_copied=signatures_copied,
    )


@router.post(
    "/{exam_id}/examiner-appointment-letter-settings/signatures/{role}",
    response_model=ExaminerAppointmentLetterSettingsResponse,
)
async def post_examiner_appointment_letter_signature(
    exam_id: int,
    role: str,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    file: UploadFile = File(...),
) -> ExaminerAppointmentLetterSettingsResponse:
    await _load_examination(session, exam_id)
    parsed_role = _parse_signature_role(role)
    row = await get_or_create_settings(session, exam_id)
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    try:
        await store_signature_for_role(
            row,
            role=parsed_role,
            content=raw,
            filename=file.filename or "signature.png",
        )
    except ExamDocumentUploadError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await session.commit()
    await session.refresh(row)
    return settings_to_response(exam_id, row)


@router.delete(
    "/{exam_id}/examiner-appointment-letter-settings/signatures/{role}",
    response_model=ExaminerAppointmentLetterSettingsResponse,
)
async def delete_examiner_appointment_letter_signature(
    exam_id: int,
    role: str,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminerAppointmentLetterSettingsResponse:
    await _load_examination(session, exam_id)
    parsed_role = _parse_signature_role(role)
    row = await get_or_create_settings(session, exam_id)
    await delete_signature_for_role(row, role=parsed_role)
    await session.commit()
    await session.refresh(row)
    return settings_to_response(exam_id, row)


@router.get("/{exam_id}/examiner-appointment-letter-settings/signatures/{role}")
async def get_examiner_appointment_letter_signature(
    exam_id: int,
    role: str,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> Response:
    await _load_examination(session, exam_id)
    parsed_role = _parse_signature_role(role)
    row = await get_settings_row(session, exam_id)
    payload = read_signature_bytes(row, parsed_role)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signature not found")
    raw, content_type = payload
    return Response(content=raw, media_type=content_type)
