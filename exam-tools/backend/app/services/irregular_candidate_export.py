"""Excel export for admin irregular examination candidates."""

from __future__ import annotations

import io
from datetime import date, datetime
from typing import Any

import pandas as pd

from app.models import Examination, IrregularExaminationCandidate


def _display_name(row: IrregularExaminationCandidate) -> str:
    return " ".join(
        part for part in (row.first_name, row.other_name, row.last_name) if part and str(part).strip()
    )


def _format_date(value: date | datetime | None) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    return value.isoformat()


def _enum_value(value: Any) -> str:
    if value is None:
        return ""
    return str(getattr(value, "value", value))


def irregular_candidates_export_filename(exam: Examination) -> str:
    series = f"_{exam.exam_series}" if exam.exam_series else ""
    raw = f"irregular_candidates_{exam.exam_type}_{exam.year}{series}.xlsx"
    return "".join(ch if ch.isalnum() or ch in {"_", "-", "."} else "_" for ch in raw)


def generate_irregular_candidates_export(rows: list[IrregularExaminationCandidate]) -> bytes:
    """Build an .xlsx workbook for irregular candidates (one row per candidate)."""
    records: list[dict[str, Any]] = []
    for row in rows:
        centre = row.examination_centre
        school = row.school
        programme = row.programme
        subjects = row.subject_selections or []
        records.append(
            {
                "id": row.id,
                "centre_code": centre.code if centre else "",
                "centre_name": centre.name if centre else "",
                "region": _enum_value(getattr(centre, "region", None) if centre else None),
                "zone": _enum_value(getattr(centre, "zone", None) if centre else None),
                "school_code": school.code if school else "",
                "school_name": school.name if school else "",
                "first_name": row.first_name,
                "other_name": row.other_name or "",
                "last_name": row.last_name,
                "full_name": _display_name(row),
                "gender": row.gender,
                "date_of_birth": _format_date(row.date_of_birth),
                "phone_number": row.phone_number,
                "guardian_name": row.guardian_name or "",
                "guardian_phone_number": row.guardian_phone_number or "",
                "ghanapost_gps_address": row.ghanapost_gps_address or "",
                "programme_code": programme.code if programme else "",
                "programme_name": programme.name if programme else "",
                "subject_codes": ", ".join(s.subject_code for s in subjects),
                "subject_names": ", ".join(s.subject_name for s in subjects),
                "recorded_at": _format_date(row.created_at),
                "updated_at": _format_date(row.updated_at),
            }
        )

    columns = [
        "id",
        "centre_code",
        "centre_name",
        "region",
        "zone",
        "school_code",
        "school_name",
        "first_name",
        "other_name",
        "last_name",
        "full_name",
        "gender",
        "date_of_birth",
        "phone_number",
        "guardian_name",
        "guardian_phone_number",
        "ghanapost_gps_address",
        "programme_code",
        "programme_name",
        "subject_codes",
        "subject_names",
        "recorded_at",
        "updated_at",
    ]
    df = pd.DataFrame(records, columns=columns)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Irregular candidates")
    output.seek(0)
    return output.getvalue()
