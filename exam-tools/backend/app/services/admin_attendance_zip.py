"""Zip export of admin attendance sheet files for a centre."""

from __future__ import annotations

import io
import re
import zipfile
from datetime import date
from pathlib import PurePosixPath

from app.models import InspectorAttendanceSheet
from app.services.attendance_sheet_files import read_attendance_sheet_bytes

_MAX_ZIP_ENTRIES = 500


def safe_filename_part(s: str) -> str:
    t = re.sub(r"[^\w\-]+", "_", s.strip(), flags=re.UNICODE).strip("_")
    return (t or "export")[:80]


def unique_zip_entry_names(names: list[str]) -> list[str]:
    """Ensure each zip member path is unique (case-insensitive)."""
    seen: dict[str, int] = {}
    out: list[str] = []
    for raw in names:
        base = PurePosixPath(raw.replace("\\", "/")).name or "file"
        base = re.sub(r"[^\w.\-]+", "_", base).strip("._") or "file"
        key = base.lower()
        count = seen.get(key, 0)
        seen[key] = count + 1
        if count == 0:
            out.append(base)
        else:
            stem = PurePosixPath(base).stem
            ext = PurePosixPath(base).suffix
            out.append(f"{stem}_{count + 1}{ext}")
    return out


def attendance_zip_download_filename(
    center_code: str,
    center_name: str,
    examination_date: date | None,
) -> str:
    parts = [safe_filename_part(center_code), safe_filename_part(center_name), "attendance"]
    if examination_date is not None:
        parts.append(examination_date.isoformat())
    return "-".join(parts) + ".zip"


def build_attendance_sheets_zip_bytes(sheets: list[InspectorAttendanceSheet]) -> bytes:
    if not sheets:
        raise ValueError("no sheets to zip")
    if len(sheets) > _MAX_ZIP_ENTRIES:
        raise ValueError(f"too many files (max {_MAX_ZIP_ENTRIES})")

    buf = io.BytesIO()
    entry_names = unique_zip_entry_names([s.original_filename for s in sheets])
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for sheet, entry in zip(sheets, entry_names, strict=True):
            data = read_attendance_sheet_bytes(sheet.stored_path)
            zf.writestr(entry, data)
    return buf.getvalue()
