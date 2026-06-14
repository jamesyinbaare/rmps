"""Per-examination appointment letter signatory and CC settings."""

from __future__ import annotations

import base64
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AppointmentLetterSigningOfficial,
    ExaminationExaminerAppointmentLetterSettings,
)
from app.schemas.examiner_appointment_letter_settings import (
    AppointmentLetterSignatureMeta,
    AppointmentLetterSignatureRoleApi,
    AppointmentLetterSigningOfficialApi,
    ExaminerAppointmentLetterSettingsResponse,
)
from app.services.exam_documents import (
    ExamDocumentUploadError,
    read_stored_bytes,
    remove_stored_file,
    write_stored_file,
)

SIGNATURE_MAX_BYTES = 512_000
LEGACY_SIGNATURE_REL_PATH = "img/examiner-appointment-signatory-signature.png"

DEFAULT_DIRECTOR_GENERAL_TITLE = "DIRECTOR-GENERAL"
DEFAULT_DIRECTOR_ASSESSMENT_NAME = "ERIC ASIEDU ANSAH"
DEFAULT_DIRECTOR_ASSESSMENT_TITLE = "DIRECTOR 1, ASSESSMENT AND CERTIFICATION"
DEFAULT_CC_LINES = ["The Accountant.", "The Internal Auditor."]
DEFAULT_VALEDICTION = "Yours faithfully"

_SIGNATURE_CONTENT_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def _trim(value: str | None) -> str:
    return (value or "").strip()


def _resolved_cc_lines(raw: list | None) -> list[str]:
    if not raw:
        return list(DEFAULT_CC_LINES)
    lines = [_trim(str(line)) for line in raw if _trim(str(line))]
    return lines or list(DEFAULT_CC_LINES)


def _resolved_dg_name(row: ExaminationExaminerAppointmentLetterSettings | None) -> str:
    if row is None:
        return ""
    return _trim(row.director_general_name)


def _resolved_dg_title(row: ExaminationExaminerAppointmentLetterSettings | None) -> str:
    if row is None:
        return DEFAULT_DIRECTOR_GENERAL_TITLE
    return _trim(row.director_general_title) or DEFAULT_DIRECTOR_GENERAL_TITLE


def _resolved_dac_name(row: ExaminationExaminerAppointmentLetterSettings | None) -> str:
    if row is None:
        return DEFAULT_DIRECTOR_ASSESSMENT_NAME
    return _trim(row.director_assessment_name) or DEFAULT_DIRECTOR_ASSESSMENT_NAME


def _resolved_dac_title(row: ExaminationExaminerAppointmentLetterSettings | None) -> str:
    if row is None:
        return DEFAULT_DIRECTOR_ASSESSMENT_TITLE
    return _trim(row.director_assessment_title) or DEFAULT_DIRECTOR_ASSESSMENT_TITLE


def _signing_official(row: ExaminationExaminerAppointmentLetterSettings | None) -> AppointmentLetterSigningOfficial:
    if row is None:
        return AppointmentLetterSigningOfficial.DIRECTOR_ASSESSMENT_CERTIFICATION
    official = row.signing_official
    if isinstance(official, AppointmentLetterSigningOfficial):
        return official
    return AppointmentLetterSigningOfficial(str(official))


def _signed_for_dg(row: ExaminationExaminerAppointmentLetterSettings | None) -> bool:
    if row is None:
        return True
    return bool(row.signed_for_director_general)


def _resolved_valediction(row: ExaminationExaminerAppointmentLetterSettings | None) -> str:
    if row is None:
        return DEFAULT_VALEDICTION
    return _trim(row.valediction) or DEFAULT_VALEDICTION


def resolve_letter_date(row: ExaminationExaminerAppointmentLetterSettings | None) -> date | None:
    if row is None or row.letter_date is None:
        return None
    return row.letter_date


def letter_date_as_datetime(value: date) -> datetime:
    return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)


def require_letter_date_for_pdf(row: ExaminationExaminerAppointmentLetterSettings | None) -> datetime:
    resolved = resolve_letter_date(row)
    if resolved is None:
        raise ValueError("Configure the appointment letter date before generating letters")
    return letter_date_as_datetime(resolved)


def _signature_meta(stored_path: str | None) -> AppointmentLetterSignatureMeta:
    if not stored_path:
        return AppointmentLetterSignatureMeta(has_signature=False)
    ext = Path(stored_path).suffix.lower()
    return AppointmentLetterSignatureMeta(
        has_signature=True,
        content_type=_SIGNATURE_CONTENT_TYPES.get(ext),
    )


async def get_settings_row(
    session: AsyncSession,
    examination_id: int,
) -> ExaminationExaminerAppointmentLetterSettings | None:
    return await session.get(ExaminationExaminerAppointmentLetterSettings, examination_id)


async def get_or_create_settings(
    session: AsyncSession,
    examination_id: int,
) -> ExaminationExaminerAppointmentLetterSettings:
    row = await get_settings_row(session, examination_id)
    if row is not None:
        return row
    row = ExaminationExaminerAppointmentLetterSettings(
        examination_id=examination_id,
        signing_official=AppointmentLetterSigningOfficial.DIRECTOR_ASSESSMENT_CERTIFICATION,
        signed_for_director_general=True,
        cc_lines=[],
        updated_at=datetime.utcnow(),
    )
    session.add(row)
    await session.flush()
    return row


def settings_to_response(
    examination_id: int,
    row: ExaminationExaminerAppointmentLetterSettings | None,
) -> ExaminerAppointmentLetterSettingsResponse:
    official = _signing_official(row)
    return ExaminerAppointmentLetterSettingsResponse(
        examination_id=examination_id,
        signing_official=AppointmentLetterSigningOfficialApi(official.value),
        signed_for_director_general=_signed_for_dg(row),
        director_general_name=_resolved_dg_name(row),
        director_general_title=_resolved_dg_title(row),
        director_assessment_name=_resolved_dac_name(row),
        director_assessment_title=_resolved_dac_title(row),
        valediction=_resolved_valediction(row),
        letter_date=resolve_letter_date(row),
        cc_lines=_resolved_cc_lines(row.cc_lines if row is not None else None),
        director_general_signature=_signature_meta(
            row.director_general_signature_path if row is not None else None
        ),
        director_assessment_signature=_signature_meta(
            row.director_assessment_signature_path if row is not None else None
        ),
        updated_at=row.updated_at if row is not None else None,
    )


def _legacy_signature_src() -> str | None:
    app_dir = Path(__file__).parent.parent
    rel = LEGACY_SIGNATURE_REL_PATH
    if (app_dir / rel).is_file():
        return rel
    return None


def _signature_data_uri(stored_path: str) -> str | None:
    try:
        raw = read_stored_bytes(stored_path)
    except FileNotFoundError:
        return None
    ext = Path(stored_path).suffix.lower()
    content_type = _SIGNATURE_CONTENT_TYPES.get(ext, "image/png")
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def resolve_signatory_context(
    row: ExaminationExaminerAppointmentLetterSettings | None,
) -> dict[str, Any]:
    official = _signing_official(row)
    signed_for_dg = _signed_for_dg(row)

    if official == AppointmentLetterSigningOfficial.DIRECTOR_GENERAL:
        signatory_name = _resolved_dg_name(row) or DEFAULT_DIRECTOR_GENERAL_TITLE
        signatory_title = _resolved_dg_title(row)
        signature_path = row.director_general_signature_path if row is not None else None
        signed_for_dg = False
    else:
        signatory_name = _resolved_dac_name(row)
        signatory_title = _resolved_dac_title(row)
        signature_path = row.director_assessment_signature_path if row is not None else None

    signatory_signature_src: str | None = None
    if signature_path:
        signatory_signature_src = _signature_data_uri(signature_path)
    if signatory_signature_src is None:
        signatory_signature_src = _legacy_signature_src()

    return {
        "signatory_name": signatory_name,
        "signatory_title": signatory_title,
        "signed_for_director_general": signed_for_dg,
        "cc_lines": _resolved_cc_lines(row.cc_lines if row is not None else None),
        "valediction": _resolved_valediction(row),
        "signatory_signature_src": signatory_signature_src,
    }


def validate_signature_upload(content: bytes, filename: str) -> str:
    if len(content) > SIGNATURE_MAX_BYTES:
        raise ExamDocumentUploadError("Signature image too large (max 500 KB)")
    from app.services.exam_documents import normalized_extension

    ext = normalized_extension(filename)
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        raise ExamDocumentUploadError("Signature must be PNG, JPEG, WebP, or GIF")
    return ext


def _signature_path_attr(role: AppointmentLetterSignatureRoleApi) -> str:
    if role == AppointmentLetterSignatureRoleApi.DIRECTOR_GENERAL:
        return "director_general_signature_path"
    return "director_assessment_signature_path"


def _delete_signature_path(path: str | None) -> None:
    if not path:
        return
    try:
        remove_stored_file(path)
    except (ExamDocumentUploadError, FileNotFoundError):
        pass


async def store_signature_for_role(
    row: ExaminationExaminerAppointmentLetterSettings,
    *,
    role: AppointmentLetterSignatureRoleApi,
    content: bytes,
    filename: str,
) -> None:
    ext = validate_signature_upload(content, filename)
    attr = _signature_path_attr(role)
    old_path = getattr(row, attr)
    stored_path = write_stored_file(content, ext)
    setattr(row, attr, stored_path)
    if old_path and old_path != stored_path:
        _delete_signature_path(old_path)
    row.updated_at = datetime.utcnow()


async def delete_signature_for_role(
    row: ExaminationExaminerAppointmentLetterSettings,
    *,
    role: AppointmentLetterSignatureRoleApi,
) -> None:
    attr = _signature_path_attr(role)
    old_path = getattr(row, attr)
    setattr(row, attr, None)
    _delete_signature_path(old_path)
    row.updated_at = datetime.utcnow()


def read_signature_bytes(row: ExaminationExaminerAppointmentLetterSettings | None, role: AppointmentLetterSignatureRoleApi) -> tuple[bytes, str] | None:
    if row is None:
        return None
    attr = _signature_path_attr(role)
    stored_path = getattr(row, attr)
    if not stored_path:
        return None
    try:
        raw = read_stored_bytes(stored_path)
    except FileNotFoundError:
        return None
    ext = Path(stored_path).suffix.lower()
    content_type = _SIGNATURE_CONTENT_TYPES.get(ext, "application/octet-stream")
    return raw, content_type


def _clone_signature_path(source_path: str | None) -> str | None:
    if not source_path:
        return None
    try:
        raw = read_stored_bytes(source_path)
    except FileNotFoundError:
        return None
    ext = Path(source_path).suffix.lower()
    return write_stored_file(raw, ext)


async def copy_settings_from_examination(
    session: AsyncSession,
    *,
    target_examination_id: int,
    source_examination_id: int,
) -> tuple[ExaminationExaminerAppointmentLetterSettings, int, int]:
    source = await get_settings_row(session, source_examination_id)
    target = await get_or_create_settings(session, target_examination_id)

    signatures_copied = 0
    if source is not None:
        target.signing_official = _signing_official(source)
        target.signed_for_director_general = bool(source.signed_for_director_general)
        target.director_general_name = source.director_general_name
        target.director_general_title = source.director_general_title
        target.director_assessment_name = source.director_assessment_name
        target.director_assessment_title = source.director_assessment_title
        target.valediction = source.valediction
        target.letter_date = source.letter_date
        target.cc_lines = list(source.cc_lines or [])

        for attr in ("director_general_signature_path", "director_assessment_signature_path"):
            old_target_path = getattr(target, attr)
            _delete_signature_path(old_target_path)
            cloned = _clone_signature_path(getattr(source, attr))
            setattr(target, attr, cloned)
            if cloned:
                signatures_copied += 1

    target.updated_at = datetime.utcnow()
    await session.flush()
    cc_count = len(_resolved_cc_lines(target.cc_lines))
    return target, cc_count, signatures_copied
