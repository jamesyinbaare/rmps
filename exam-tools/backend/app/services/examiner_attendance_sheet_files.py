from __future__ import annotations

import re
from datetime import date
from pathlib import Path

try:
    from google.cloud.exceptions import NotFound
except ImportError:
    NotFound = Exception  # type: ignore[misc,assignment]

from app.config import settings
from app.services.exam_documents import (
    ExamDocumentUploadError,
    _get_gcs_bucket,
    _guess_content_type,
    is_uuid_stored_object_key,
    normalized_extension,
    read_stored_bytes,
    remove_stored_file,
    storage_base_dir,
    validate_size,
)

ATTENDANCE_ALLOWED_EXTENSIONS = frozenset({".pdf", ".png", ".jpg", ".jpeg", ".webp"})

_UNSAFE_FILENAME_CHARS = re.compile(r'[/\\:*?"<>|]+')
_STORAGE_DIR_NAME = "examiner-marking-attendance-sheets"
_MAX_STORED_PATH_LEN = 512


class ExaminerAttendanceSheetUploadError(ExamDocumentUploadError):
    """Invalid examiner marking attendance sheet upload."""


def examiner_attendance_normalized_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in ATTENDANCE_ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ATTENDANCE_ALLOWED_EXTENSIONS))
        raise ExaminerAttendanceSheetUploadError(f"File type not allowed. Use one of: {allowed}")
    return normalized_extension(filename)


def _sanitize_filename_segment(value: str) -> str:
    cleaned = _UNSAFE_FILENAME_CHARS.sub(" ", value.strip())
    return " ".join(cleaned.split())


def build_examiner_attendance_sheet_filename(
    cohort_name: str,
    subject_code: str,
    attendance_date: date,
    ext: str,
    *,
    collision_index: int = 1,
) -> str:
    cohort_part = _sanitize_filename_segment(cohort_name.strip()[:20])
    code_part = _sanitize_filename_segment(subject_code.strip())
    date_part = attendance_date.isoformat()
    base = " ".join(p for p in (cohort_part, code_part, date_part) if p)
    if not base:
        base = date_part or "attendance"
    if collision_index > 1:
        base = f"{base} ({collision_index})"
    if not ext.startswith("."):
        ext = f".{ext}"
    return f"{base}{ext}"


def _uses_gcs() -> bool:
    return settings.storage_backend.lower() == "gcs"


def _local_storage_parent() -> Path:
    return storage_base_dir().resolve().parent


def _max_basename_len(examination_id: int) -> int:
    reserved = len(_STORAGE_DIR_NAME) + 1 + len(str(examination_id)) + 1
    if _uses_gcs():
        prefix = (settings.gcs_attendance_sheets_prefix or "").strip().strip("/")
        if prefix:
            reserved = len(prefix) + 1 + reserved
    return max(24, _MAX_STORED_PATH_LEN - reserved)


def _safe_basename(display_filename: str, examination_id: int) -> str:
    examiner_attendance_normalized_extension(display_filename)
    raw_name = Path(display_filename).name.strip()
    if not raw_name or raw_name in (".", ".."):
        raise ExaminerAttendanceSheetUploadError("Invalid filename")
    if "/" in raw_name or "\\" in raw_name:
        raise ExaminerAttendanceSheetUploadError("Invalid filename")
    cleaned = _UNSAFE_FILENAME_CHARS.sub(" ", raw_name)
    cleaned = " ".join(cleaned.split())
    if not cleaned:
        raise ExaminerAttendanceSheetUploadError("Invalid filename")
    max_len = _max_basename_len(examination_id)
    if len(cleaned) > max_len:
        p = Path(cleaned)
        ext = p.suffix
        stem = p.stem[: max(1, max_len - len(ext))]
        cleaned = f"{stem}{ext}"
    return cleaned


def _gcs_object_key(examination_id: int, basename: str) -> str:
    prefix = (settings.gcs_attendance_sheets_prefix or "").strip().strip("/")
    rel = f"{_STORAGE_DIR_NAME}/{examination_id}/{basename}"
    if prefix:
        return f"{prefix}/{rel}"
    return rel


def _resolve_local_path(stored_path: str) -> Path:
    if not stored_path or stored_path.startswith("/") or "\\" in stored_path:
        raise ExaminerAttendanceSheetUploadError("Invalid stored path")
    if ".." in Path(stored_path).parts:
        raise ExaminerAttendanceSheetUploadError("Invalid stored path")
    root = _local_storage_parent()
    candidate = (root / stored_path).resolve()
    storage_root = (root / _STORAGE_DIR_NAME).resolve()
    if not str(candidate).startswith(str(storage_root)) or candidate == storage_root:
        raise ExaminerAttendanceSheetUploadError("Invalid stored path")
    return candidate


def write_examiner_attendance_sheet_file(content: bytes, examination_id: int, display_filename: str) -> str:
    validate_size(content)
    basename = _safe_basename(display_filename, examination_id)
    if _uses_gcs():
        key = _gcs_object_key(examination_id, basename)
        if len(key) > _MAX_STORED_PATH_LEN:
            raise ExaminerAttendanceSheetUploadError("Stored path too long; shorten metadata.")
        bucket = _get_gcs_bucket()
        blob = bucket.blob(key)
        blob.upload_from_string(content, content_type=_guess_content_type(basename))
        return key
    dir_path = _local_storage_parent() / _STORAGE_DIR_NAME / str(examination_id)
    dir_path.mkdir(parents=True, exist_ok=True)
    path = dir_path / basename
    path.write_bytes(content)
    rel = f"{_STORAGE_DIR_NAME}/{examination_id}/{basename}"
    if len(rel) > _MAX_STORED_PATH_LEN:
        raise ExaminerAttendanceSheetUploadError("Stored path too long; shorten metadata.")
    return rel


def read_examiner_attendance_sheet_bytes(stored_path: str) -> bytes:
    if is_uuid_stored_object_key(stored_path):
        return read_stored_bytes(stored_path)
    if _uses_gcs():
        bucket = _get_gcs_bucket()
        blob = bucket.blob(stored_path)
        try:
            return blob.download_as_bytes()
        except NotFound:
            raise FileNotFoundError(stored_path)
    path = _resolve_local_path(stored_path)
    if not path.is_file():
        raise FileNotFoundError(stored_path)
    return path.read_bytes()


def remove_examiner_attendance_sheet_file(stored_path: str) -> None:
    if is_uuid_stored_object_key(stored_path):
        remove_stored_file(stored_path)
        return
    if _uses_gcs():
        bucket = _get_gcs_bucket()
        blob = bucket.blob(stored_path)
        try:
            blob.delete()
        except NotFound:
            pass
        return
    path = _resolve_local_path(stored_path)
    if path.is_file():
        path.unlink()
