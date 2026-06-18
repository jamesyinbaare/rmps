"""Zip export of admin examiner marking attendance sheet files."""

from __future__ import annotations

import io
import re
import zipfile
from datetime import date
from pathlib import PurePosixPath

from app.models import ExaminerMarkingAttendanceSheet
from app.services.examiner_attendance_sheet_files import read_examiner_attendance_sheet_bytes

_MAX_ZIP_ENTRIES = 500


def safe_filename_part(s: str) -> str:
    t = re.sub(r"[^\w\-]+", "_", s.strip(), flags=re.UNICODE).strip("_")
    return (t or "export")[:80]


def unique_zip_entry_names(names: list[str]) -> list[str]:
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


def examiner_attendance_zip_download_filename(
    subject_code: str,
    cohort_name: str,
    attendance_date: date | None,
) -> str:
    parts = [safe_filename_part(subject_code), safe_filename_part(cohort_name), "marking-attendance"]
    if attendance_date is not None:
        parts.append(attendance_date.isoformat())
    return "-".join(parts) + ".zip"


def build_examiner_attendance_sheets_zip_bytes(sheets: list[ExaminerMarkingAttendanceSheet]) -> bytes:
    if not sheets:
        raise ValueError("no sheets to zip")
    if len(sheets) > _MAX_ZIP_ENTRIES:
        raise ValueError(f"too many files (max {_MAX_ZIP_ENTRIES})")

    buf = io.BytesIO()
    entry_names = unique_zip_entry_names([s.original_filename for s in sheets])
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for sheet, entry in zip(sheets, entry_names, strict=True):
            data = read_examiner_attendance_sheet_bytes(sheet.stored_path)
            zf.writestr(entry, data)
    return buf.getvalue()
