"""Parse CSV/XLSX uploads for manual marked script counts."""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import pandas as pd

from app.services.examiner_roster import normalize_header_key, read_examiners_spreadsheet
from app.services.school_bulk_upload import inspector_phone_lookup_candidates, parse_inspector_phone_number


def _canonical_column_map() -> dict[str, str]:
    return {
        "phone": "phone_number",
        "mobile": "phone_number",
        "phone_number": "phone_number",
        "total": "total",
        "scripts": "total",
        "count": "total",
        "allocated_scripts": "total",
        "script_count": "total",
    }


def _rename_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = [normalize_header_key(c) for c in out.columns]
    cmap = _canonical_column_map()
    rename = {c: cmap[c] for c in out.columns if c in cmap}
    return out.rename(columns=rename)


def read_manual_marked_scripts_spreadsheet(file_bytes: bytes, filename: str) -> pd.DataFrame:
    df = read_examiners_spreadsheet(file_bytes, filename)
    return _rename_dataframe_columns(df)


def _parse_total_cell(raw: Any) -> int:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return 0
    s = str(raw).strip()
    if not s:
        return 0
    if re.fullmatch(r"-?\d+", s):
        value = int(s)
    elif isinstance(raw, (int, float)) and not isinstance(raw, bool):
        if float(raw).is_integer():
            value = int(raw)
        else:
            raise ValueError(f"total must be a whole number, got {raw!r}")
    else:
        raise ValueError(f"total must be a whole number, got {raw!r}")
    if value < 0:
        raise ValueError("total must be >= 0")
    return value


@dataclass
class ManualMarkedScriptsUploadRowError:
    row_number: int
    message: str


@dataclass
class ManualMarkedScriptsUploadResult:
    applied_count: int = 0
    skipped_count: int = 0
    errors: list[ManualMarkedScriptsUploadRowError] = field(default_factory=list)
    items: list[tuple[UUID, int]] = field(default_factory=list)


def parse_manual_marked_scripts_upload(
    df: pd.DataFrame,
    *,
    phone_to_examiner_id: dict[str, UUID],
) -> ManualMarkedScriptsUploadResult:
    """Parse upload rows; match phones to subject examiners. Does not persist."""
    if "phone_number" not in df.columns:
        raise ValueError("Missing required column: phone_number (aliases: phone, mobile)")
    if "total" not in df.columns:
        raise ValueError("Missing required column: total (aliases: scripts, count, allocated_scripts)")

    result = ManualMarkedScriptsUploadResult()
    seen_phones: dict[str, int] = {}

    for row_number, (_, row) in enumerate(df.iterrows(), start=2):
        phone_raw = row.get("phone_number")
        if phone_raw is None or (isinstance(phone_raw, float) and pd.isna(phone_raw)):
            result.skipped_count += 1
            continue
        try:
            phone = parse_inspector_phone_number(phone_raw)
        except ValueError as e:
            result.errors.append(ManualMarkedScriptsUploadRowError(row_number=row_number, message=str(e)))
            continue

        if phone in seen_phones:
            result.errors.append(
                ManualMarkedScriptsUploadRowError(
                    row_number=row_number,
                    message=f"Duplicate phone_number {phone!r} (also on row {seen_phones[phone]})",
                )
            )
            continue
        seen_phones[phone] = row_number

        try:
            total = _parse_total_cell(row.get("total"))
        except ValueError as e:
            result.errors.append(ManualMarkedScriptsUploadRowError(row_number=row_number, message=str(e)))
            continue

        examiner_id: UUID | None = None
        for candidate in inspector_phone_lookup_candidates(phone):
            examiner_id = phone_to_examiner_id.get(candidate)
            if examiner_id is not None:
                break
        if examiner_id is None:
            result.errors.append(
                ManualMarkedScriptsUploadRowError(
                    row_number=row_number,
                    message=f"No examiner on this subject matches phone {phone!r}",
                )
            )
            continue

        result.items.append((examiner_id, total))
        if total == 0:
            result.skipped_count += 1
        else:
            result.applied_count += 1

    return result


def generate_manual_marked_scripts_template_bytes(
    *,
    examiner_names: list[tuple[str, str | None]],
) -> bytes:
    """Build XLSX template with phone_number and empty total column."""
    rows = [{"phone_number": phone or "", "total": ""} for _name, phone in examiner_names]
    df = pd.DataFrame(rows)
    bio = io.BytesIO()
    df.to_excel(bio, index=False, engine="openpyxl")
    return bio.getvalue()
