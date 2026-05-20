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

# DB column inspector_attendance_sheets.stored_path is String(512)
_MAX_STORED_PATH_LEN = 512


class AttendanceSheetUploadError(ExamDocumentUploadError):
    """Invalid attendance sheet upload."""


def attendance_normalized_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in ATTENDANCE_ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ATTENDANCE_ALLOWED_EXTENSIONS))
        raise AttendanceSheetUploadError(f"File type not allowed. Use one of: {allowed}")
    return normalized_extension(filename)


def _sanitize_filename_segment(value: str) -> str:
    cleaned = _UNSAFE_FILENAME_CHARS.sub(" ", value.strip())
    return " ".join(cleaned.split())


def build_attendance_sheet_filename(
    centre_code: str,
    centre_name: str,
    examination_date: date,
    ext: str,
    *,
    collision_index: int = 1,
) -> str:
    """Build display/download name: ``{code} {name[:10]} {date}`` with optional `` (n)`` suffix."""
    name_prefix = centre_name.strip()[:10]
    code_part = _sanitize_filename_segment(centre_code)
    name_part = _sanitize_filename_segment(name_prefix)
    date_part = examination_date.isoformat()
    base = " ".join(p for p in (code_part, name_part, date_part) if p)
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
    """Upper bound on filename length so stored_path stays within the DB limit."""
    if _uses_gcs():
        prefix = (settings.gcs_attendance_sheets_prefix or "").strip().strip("/")
        reserved = (len(prefix) + 1 if prefix else 0) + len(str(examination_id)) + 1
    else:
        reserved = len("attendance-sheets/") + len(str(examination_id)) + 1
    return max(24, _MAX_STORED_PATH_LEN - reserved)


def _safe_attendance_basename(display_filename: str, examination_id: int) -> str:
    attendance_normalized_extension(display_filename)
    raw_name = Path(display_filename).name.strip()
    if not raw_name or raw_name in (".", ".."):
        raise AttendanceSheetUploadError("Invalid filename")
    if "/" in raw_name or "\\" in raw_name:
        raise AttendanceSheetUploadError("Invalid filename")
    cleaned = _UNSAFE_FILENAME_CHARS.sub(" ", raw_name)
    cleaned = " ".join(cleaned.split())
    if not cleaned:
        raise AttendanceSheetUploadError("Invalid filename")
    max_len = _max_basename_len(examination_id)
    if len(cleaned) > max_len:
        p = Path(cleaned)
        ext = p.suffix
        stem = p.stem[: max(1, max_len - len(ext))]
        cleaned = f"{stem}{ext}"
    return cleaned


def _gcs_attendance_object_key(examination_id: int, basename: str) -> str:
    prefix = (settings.gcs_attendance_sheets_prefix or "").strip().strip("/")
    if prefix:
        return f"{prefix}/{examination_id}/{basename}"
    return f"{examination_id}/{basename}"


def _resolve_local_attendance_path(stored_path: str) -> Path:
    if not stored_path or stored_path.startswith("/") or "\\" in stored_path:
        raise AttendanceSheetUploadError("Invalid stored path")
    if ".." in Path(stored_path).parts:
        raise AttendanceSheetUploadError("Invalid stored path")
    root = _local_storage_parent()
    candidate = (root / stored_path).resolve()
    attendance_root = (root / "attendance-sheets").resolve()
    if not str(candidate).startswith(str(attendance_root)) or candidate == attendance_root:
        raise AttendanceSheetUploadError("Invalid stored path")
    return candidate


def write_attendance_sheet_file(content: bytes, examination_id: int, display_filename: str) -> str:
    """Write attendance bytes; returns stored_path (full GCS object key or local path under storage root)."""
    validate_size(content)
    basename = _safe_attendance_basename(display_filename, examination_id)
    if _uses_gcs():
        key = _gcs_attendance_object_key(examination_id, basename)
        if len(key) > _MAX_STORED_PATH_LEN:
            raise AttendanceSheetUploadError("Stored path too long; shorten centre metadata.")
        bucket = _get_gcs_bucket()
        blob = bucket.blob(key)
        blob.upload_from_string(content, content_type=_guess_content_type(basename))
        return key
    dir_path = _local_storage_parent() / "attendance-sheets" / str(examination_id)
    dir_path.mkdir(parents=True, exist_ok=True)
    path = dir_path / basename
    path.write_bytes(content)
    rel = f"attendance-sheets/{examination_id}/{basename}"
    if len(rel) > _MAX_STORED_PATH_LEN:
        raise AttendanceSheetUploadError("Stored path too long; shorten centre metadata.")
    return rel


def read_attendance_sheet_bytes(stored_path: str) -> bytes:
    if is_uuid_stored_object_key(stored_path):
        return read_stored_bytes(stored_path)
    if _uses_gcs():
        bucket = _get_gcs_bucket()
        blob = bucket.blob(stored_path)
        try:
            return blob.download_as_bytes()
        except NotFound:
            raise FileNotFoundError(stored_path)
    path = _resolve_local_attendance_path(stored_path)
    if not path.is_file():
        raise FileNotFoundError(stored_path)
    return path.read_bytes()


def remove_attendance_sheet_file(stored_path: str) -> None:
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
    path = _resolve_local_attendance_path(stored_path)
    if path.is_file():
        path.unlink()
