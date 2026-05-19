from __future__ import annotations

import re
from datetime import date
from pathlib import Path

from app.services.exam_documents import (
    ExamDocumentUploadError,
    normalized_extension,
    read_stored_bytes,
    remove_stored_file,
    validate_size,
    write_stored_file,
)

ATTENDANCE_ALLOWED_EXTENSIONS = frozenset({".pdf", ".png", ".jpg", ".jpeg", ".webp"})

_UNSAFE_FILENAME_CHARS = re.compile(r'[/\\:*?"<>|]+')


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


def write_attendance_sheet_file(content: bytes, extension: str) -> str:
    validate_size(content)
    return write_stored_file(content, extension)


def read_attendance_sheet_bytes(stored_path: str) -> bytes:
    return read_stored_bytes(stored_path)


def remove_attendance_sheet_file(stored_path: str) -> None:
    remove_stored_file(stored_path)
