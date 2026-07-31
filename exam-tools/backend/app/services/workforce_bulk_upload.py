"""Excel/CSV bulk roster upload for script checkers and data entry clerks."""

from __future__ import annotations

import io
from datetime import datetime
from typing import Any

import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataEntryClerk, Examination, ScriptChecker, WorkforceKind
from app.services.examiner_roster import normalize_header_key
from app.services.school_bulk_upload import parse_inspector_phone_number
from app.services.script_allocation import parse_region
from app.services.sms.phone import normalize_msisdn
from app.services.workforce_exercise_group import (
    assign_person_to_group,
    ensure_default_group,
    get_or_create_named_group,
)
from app.services.workforce_portal import generate_portal_token
from app.services.workforce_roster import data_entry_clerk_to_dict, script_checker_to_dict

_MAX_BULK_BYTES = 5 * 1024 * 1024
_MAX_BULK_ROWS = 2000


def _canonical_column_map() -> dict[str, str]:
    """Map normalized header -> logical field name."""
    return {
        "name": "name",
        "full_name": "name",
        "phone": "phone_number",
        "phone_number": "phone_number",
        "mobile": "phone_number",
        "region": "region",
        "cohort": "cohort_name",
        "cohort_name": "cohort_name",
        "group": "cohort_name",
        "group_name": "cohort_name",
        "reference_code": "reference_code",
    }


def _rename_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = [normalize_header_key(c) for c in out.columns]
    cmap = _canonical_column_map()
    rename = {c: cmap[c] for c in out.columns if c in cmap}
    return out.rename(columns=rename)


def read_workforce_roster_spreadsheet(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """Load workforce roster bulk-upload CSV/XLSX with every column as str (preserves leading zeros)."""
    lower = filename.lower()
    bio = io.BytesIO(file_bytes)
    if lower.endswith(".csv"):
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = file_bytes.decode("latin-1")
        df = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
    elif lower.endswith(".xlsx"):
        df = pd.read_excel(bio, engine="openpyxl", dtype=str, keep_default_na=False)
    else:
        raise ValueError("Upload a .csv or .xlsx file")
    if df.empty:
        raise ValueError("The file has no data rows")
    return _rename_dataframe_columns(df)


def _row_field(row: pd.Series, key: str) -> str | None:
    value = row.get(key)
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    return text or None


def parse_workforce_roster_row(row: pd.Series) -> dict[str, Any]:
    """Parse one spreadsheet row into roster create fields (name, phone_number, region, cohort_name)."""
    name = _row_field(row, "name")
    if not name:
        raise ValueError("Name is required")

    phone_raw = row.get("phone_number")
    phone_number: str | None = None
    if phone_raw is not None and not (isinstance(phone_raw, float) and pd.isna(phone_raw)) and str(phone_raw).strip():
        phone_number = parse_inspector_phone_number(phone_raw)
        try:
            normalize_msisdn(phone_number)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    region_raw = _row_field(row, "region")
    region = parse_region(region_raw) if region_raw else None

    return {
        "name": name,
        "phone_number": phone_number,
        "region": region,
        "cohort_name": _row_field(row, "cohort_name"),
        "reference_code": _row_field(row, "reference_code"),
    }


async def bulk_upload_workforce_roster(
    session: AsyncSession,
    *,
    examination_id: int,
    kind: WorkforceKind,
    df: pd.DataFrame,
    availability_deadline: datetime | None = None,
) -> tuple[list[dict], list[tuple[int, str]]]:
    """Create roster rows from a parsed spreadsheet.

    Returns (created_row_dicts, errors) where errors is a list of (row_number, message).
    Ensures the exam+kind default cohort exists, and assigns each row to its named cohort
    (creating the cohort if needed) or the default cohort when no cohort_name is given.

    Each row is committed independently (mirroring the examiner bulk-import pattern) so that
    one bad row does not roll back previously-created rows or expire cached ORM state.
    """
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")

    model = ScriptChecker if kind == WorkforceKind.SCRIPT_CHECKER else DataEntryClerk
    to_dict = script_checker_to_dict if kind == WorkforceKind.SCRIPT_CHECKER else data_entry_clerk_to_dict

    # Ensure the default cohort exists up front (and commit it) so later per-row rollbacks
    # never discard it.
    await ensure_default_group(session, examination_id=examination_id, kind=kind)
    await session.commit()

    created_rows: list[dict] = []
    errors: list[tuple[int, str]] = []

    for row_number, (_, srow) in enumerate(df.iterrows(), start=2):
        try:
            fields = parse_workforce_roster_row(srow)
        except ValueError as exc:
            errors.append((row_number, str(exc)))
            continue

        try:
            cohort_name = fields["cohort_name"]
            if cohort_name:
                group = await get_or_create_named_group(
                    session,
                    examination_id=examination_id,
                    kind=kind,
                    name=cohort_name,
                )
            else:
                group = await ensure_default_group(session, examination_id=examination_id, kind=kind)

            person = model(
                examination_id=examination_id,
                name=fields["name"],
                phone_number=fields["phone_number"],
                region=fields["region"],
                reference_code=fields["reference_code"],
                portal_token=generate_portal_token(),
                availability_deadline=availability_deadline,
            )
            session.add(person)
            await session.flush()
            await assign_person_to_group(
                session,
                examination_id=examination_id,
                kind=kind,
                person_id=person.id,
                group=group,
            )
            await session.commit()
            await session.refresh(person, attribute_names=["bank_account"])
            created_rows.append(to_dict(person))
        except Exception as exc:  # noqa: BLE001 - row-level import; surface message to admin
            await session.rollback()
            errors.append((row_number, str(exc)))

    return created_rows, errors
