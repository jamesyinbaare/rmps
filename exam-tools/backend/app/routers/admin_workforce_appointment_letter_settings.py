"""Admin: per-examination + workforce-kind appointment letter signatory settings and preview."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import AppointmentLetterSigningOfficial, Examination, WorkforceKind
from app.schemas.workforce_appointment_letter_settings import (
    AppointmentLetterSignatureRoleApi,
    WorkforceAppointmentLetterSettingsPut,
    WorkforceAppointmentLetterSettingsResponse,
)
from app.services.exam_documents import ExamDocumentUploadError
from app.services.workforce_appointment_letter_pdf import (
    WorkforceAppointmentLetterError,
    build_dummy_preview_pdf,
)
from app.services.workforce_appointment_letter_settings import (
    DEFAULT_VALEDICTION,
    delete_signature_for_role,
    get_or_create_settings,
    get_settings_row,
    read_signature_bytes,
    settings_to_response,
    store_signature_for_role,
)

router = APIRouter(
    prefix="/admin/examinations",
    tags=["admin-workforce-appointment-letter-settings"],
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


async def _get_settings(exam_id: int, kind: WorkforceKind, session: DBSessionDep) -> WorkforceAppointmentLetterSettingsResponse:
    await _load_examination(session, exam_id)
    row = await get_settings_row(session, exam_id, kind)
    return settings_to_response(exam_id, kind, row)


async def _put_settings(
    exam_id: int,
    kind: WorkforceKind,
    body: WorkforceAppointmentLetterSettingsPut,
    session: DBSessionDep,
) -> WorkforceAppointmentLetterSettingsResponse:
    await _load_examination(session, exam_id)
    row = await get_or_create_settings(session, exam_id, kind)
    row.signing_official = AppointmentLetterSigningOfficial(body.signing_official.value)
    row.signed_for_director_general = body.signed_for_director_general
    row.director_general_name = body.director_general_name.strip() or None
    row.director_general_title = body.director_general_title.strip() or None
    row.director_assessment_name = body.director_assessment_name.strip() or None
    row.director_assessment_title = body.director_assessment_title.strip() or None
    row.valediction = body.valediction.strip() or DEFAULT_VALEDICTION
    row.letter_date = body.letter_date
    row.reference_number = body.reference_number.strip() or None
    row.cc_lines = [line.strip() for line in body.cc_lines if line.strip()]
    row.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(row)
    return settings_to_response(exam_id, kind, row)


async def _post_signature(
    exam_id: int,
    kind: WorkforceKind,
    role: str,
    session: DBSessionDep,
    file: UploadFile,
) -> WorkforceAppointmentLetterSettingsResponse:
    await _load_examination(session, exam_id)
    parsed_role = _parse_signature_role(role)
    row = await get_or_create_settings(session, exam_id, kind)
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
    return settings_to_response(exam_id, kind, row)


async def _delete_signature(
    exam_id: int,
    kind: WorkforceKind,
    role: str,
    session: DBSessionDep,
) -> WorkforceAppointmentLetterSettingsResponse:
    await _load_examination(session, exam_id)
    parsed_role = _parse_signature_role(role)
    row = await get_or_create_settings(session, exam_id, kind)
    await delete_signature_for_role(row, role=parsed_role)
    await session.commit()
    await session.refresh(row)
    return settings_to_response(exam_id, kind, row)


async def _get_signature(
    exam_id: int,
    kind: WorkforceKind,
    role: str,
    session: DBSessionDep,
) -> Response:
    await _load_examination(session, exam_id)
    parsed_role = _parse_signature_role(role)
    row = await get_settings_row(session, exam_id, kind)
    payload = read_signature_bytes(row, parsed_role)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signature not found")
    raw, content_type = payload
    return Response(content=raw, media_type=content_type)


async def _get_preview_pdf(exam_id: int, kind: WorkforceKind, session: DBSessionDep) -> Response:
    await _load_examination(session, exam_id)
    try:
        pdf_bytes, filename = await build_dummy_preview_pdf(session, examination_id=exam_id, kind=kind)
    except (ValueError, WorkforceAppointmentLetterError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# --- Script checker ---------------------------------------------------------


@router.get(
    "/{exam_id}/script-checker-appointment-letter-settings",
    response_model=WorkforceAppointmentLetterSettingsResponse,
)
async def get_script_checker_appointment_letter_settings(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> WorkforceAppointmentLetterSettingsResponse:
    return await _get_settings(exam_id, WorkforceKind.SCRIPT_CHECKER, session)


@router.put(
    "/{exam_id}/script-checker-appointment-letter-settings",
    response_model=WorkforceAppointmentLetterSettingsResponse,
)
async def put_script_checker_appointment_letter_settings(
    exam_id: int,
    body: WorkforceAppointmentLetterSettingsPut,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> WorkforceAppointmentLetterSettingsResponse:
    return await _put_settings(exam_id, WorkforceKind.SCRIPT_CHECKER, body, session)


@router.post(
    "/{exam_id}/script-checker-appointment-letter-settings/signatures/{role}",
    response_model=WorkforceAppointmentLetterSettingsResponse,
)
async def post_script_checker_appointment_letter_signature(
    exam_id: int,
    role: str,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    file: UploadFile = File(...),
) -> WorkforceAppointmentLetterSettingsResponse:
    return await _post_signature(exam_id, WorkforceKind.SCRIPT_CHECKER, role, session, file)


@router.delete(
    "/{exam_id}/script-checker-appointment-letter-settings/signatures/{role}",
    response_model=WorkforceAppointmentLetterSettingsResponse,
)
async def delete_script_checker_appointment_letter_signature(
    exam_id: int,
    role: str,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> WorkforceAppointmentLetterSettingsResponse:
    return await _delete_signature(exam_id, WorkforceKind.SCRIPT_CHECKER, role, session)


@router.get("/{exam_id}/script-checker-appointment-letter-settings/signatures/{role}")
async def get_script_checker_appointment_letter_signature(
    exam_id: int,
    role: str,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> Response:
    return await _get_signature(exam_id, WorkforceKind.SCRIPT_CHECKER, role, session)


@router.get("/{exam_id}/script-checker-appointment-letter-preview.pdf")
async def get_script_checker_appointment_letter_preview_pdf(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> Response:
    return await _get_preview_pdf(exam_id, WorkforceKind.SCRIPT_CHECKER, session)


# --- Data entry clerk --------------------------------------------------------


@router.get(
    "/{exam_id}/data-entry-clerk-appointment-letter-settings",
    response_model=WorkforceAppointmentLetterSettingsResponse,
)
async def get_data_entry_clerk_appointment_letter_settings(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> WorkforceAppointmentLetterSettingsResponse:
    return await _get_settings(exam_id, WorkforceKind.DATA_ENTRY_CLERK, session)


@router.put(
    "/{exam_id}/data-entry-clerk-appointment-letter-settings",
    response_model=WorkforceAppointmentLetterSettingsResponse,
)
async def put_data_entry_clerk_appointment_letter_settings(
    exam_id: int,
    body: WorkforceAppointmentLetterSettingsPut,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> WorkforceAppointmentLetterSettingsResponse:
    return await _put_settings(exam_id, WorkforceKind.DATA_ENTRY_CLERK, body, session)


@router.post(
    "/{exam_id}/data-entry-clerk-appointment-letter-settings/signatures/{role}",
    response_model=WorkforceAppointmentLetterSettingsResponse,
)
async def post_data_entry_clerk_appointment_letter_signature(
    exam_id: int,
    role: str,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    file: UploadFile = File(...),
) -> WorkforceAppointmentLetterSettingsResponse:
    return await _post_signature(exam_id, WorkforceKind.DATA_ENTRY_CLERK, role, session, file)


@router.delete(
    "/{exam_id}/data-entry-clerk-appointment-letter-settings/signatures/{role}",
    response_model=WorkforceAppointmentLetterSettingsResponse,
)
async def delete_data_entry_clerk_appointment_letter_signature(
    exam_id: int,
    role: str,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> WorkforceAppointmentLetterSettingsResponse:
    return await _delete_signature(exam_id, WorkforceKind.DATA_ENTRY_CLERK, role, session)


@router.get("/{exam_id}/data-entry-clerk-appointment-letter-settings/signatures/{role}")
async def get_data_entry_clerk_appointment_letter_signature(
    exam_id: int,
    role: str,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> Response:
    return await _get_signature(exam_id, WorkforceKind.DATA_ENTRY_CLERK, role, session)


@router.get("/{exam_id}/data-entry-clerk-appointment-letter-preview.pdf")
async def get_data_entry_clerk_appointment_letter_preview_pdf(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> Response:
    return await _get_preview_pdf(exam_id, WorkforceKind.DATA_ENTRY_CLERK, session)
