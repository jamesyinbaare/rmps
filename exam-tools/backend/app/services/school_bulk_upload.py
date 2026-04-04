"""Parse CSV/Excel school bulk uploads and coerce row values."""

from __future__ import annotations

import io
import re
from typing import Any
from uuid import UUID

import pandas as pd  # type: ignore[import-untyped]

from app.models import Region, SchoolType, Zone

REQUIRED_COLUMNS = ("code", "name", "region", "zone")

INSPECTOR_REQUIRED_COLUMNS = ("school_code", "phone_number", "full_name")


class SchoolUploadParseError(Exception):
    """Raised when the uploaded file cannot be read or parsed."""


def read_upload_as_dataframe(content: bytes, filename: str) -> pd.DataFrame:
    """Load CSV or Excel bytes into a DataFrame."""
    name = (filename or "unknown").lower()
    try:
        if name.endswith(".csv"):
            try:
                text = content.decode("utf-8")
            except UnicodeDecodeError:
                text = content.decode("latin-1")
            return pd.read_csv(io.StringIO(text))
        if name.endswith(".xlsx"):
            return pd.read_excel(io.BytesIO(content), engine="openpyxl")
        if name.endswith(".xls"):
            return pd.read_excel(io.BytesIO(content))
    except Exception as exc:
        raise SchoolUploadParseError(f"Could not parse file: {exc}") from exc
    raise SchoolUploadParseError("File must be .csv, .xlsx, or .xls")


def normalize_column_names(df: pd.DataFrame) -> pd.DataFrame:
    """Strip headers and build lowercase lookup; rename columns to canonical lowercase names."""
    if df.empty:
        return df
    rename: dict[str, str] = {}
    for col in df.columns:
        if col is None:
            continue
        key = str(col).strip()
        rename[col] = key.lower().replace(" ", "_")
    return df.rename(columns=rename)


def validate_required_columns(df: pd.DataFrame) -> None:
    if df.empty:
        raise SchoolUploadParseError("File has no data rows")
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise SchoolUploadParseError(f"Missing required columns: {', '.join(missing)}")


def validate_inspector_required_columns(df: pd.DataFrame) -> None:
    if df.empty:
        raise SchoolUploadParseError("File has no data rows")
    missing = [c for c in INSPECTOR_REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise SchoolUploadParseError(f"Missing required columns: {', '.join(missing)}")


def _cell_str(val: Any) -> str | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    return s if s else None


def parse_region(raw: Any) -> Region:
    s = _cell_str(raw)
    if not s:
        raise ValueError("region is required")
    normalized = s.strip()
    upper_underscore = re.sub(r"\s+", "_", normalized.upper())
    for r in Region:
        if r.name == upper_underscore or r.value.lower() == normalized.lower():
            return r
    raise ValueError(f"Unknown region: {normalized!r}")


def parse_zone(raw: Any) -> Zone:
    s = _cell_str(raw)
    if not s:
        raise ValueError("zone is required")
    normalized = s.strip().upper()
    if len(normalized) == 1 and normalized in Zone.__members__:
        return Zone[normalized]
    for z in Zone:
        if z.name == normalized or z.value.upper() == normalized:
            return z
    raise ValueError(f"Unknown zone: {s!r}")


def parse_school_type(raw: Any) -> SchoolType | None:
    s = _cell_str(raw)
    if not s:
        return None
    lower = s.lower()
    for st in SchoolType:
        if st.value == lower or st.name.lower() == lower:
            return st
    raise ValueError(f"Unknown school_type: {s!r} (use private or public)")


def parse_bool_cell(raw: Any, *, default: bool = False) -> bool:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return default
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, int | float):
        if raw == 1:
            return True
        if raw == 0:
            return False
    s = str(raw).strip().lower()
    if s in ("", "nan"):
        return default
    if s in ("true", "yes", "1", "y"):
        return True
    if s in ("false", "no", "0", "n"):
        return False
    raise ValueError(f"Invalid boolean value: {raw!r}")


def parse_writes_at_center_id(raw: Any) -> UUID | None:
    s = _cell_str(raw)
    if not s:
        return None
    try:
        return UUID(s)
    except ValueError as exc:
        raise ValueError(f"Invalid writes_at_center_id UUID: {s!r}") from exc


def parse_writes_at_center_code(raw: Any) -> str | None:
    s = _cell_str(raw)
    return s


def parse_school_code(raw: Any) -> str:
    s = _cell_str(raw)
    if not s:
        raise ValueError("code is required")
    if len(s) > 6:
        raise ValueError(f"code must be at most 6 characters, got {len(s)}")
    return s


def parse_school_name(raw: Any) -> str:
    s = _cell_str(raw)
    if not s:
        raise ValueError("name is required")
    if len(s) > 255:
        raise ValueError("name must be at most 255 characters")
    return s


def parse_inspector_school_code(raw: Any) -> str:
    s = _cell_str(raw)
    if not s:
        raise ValueError("school_code is required")
    if len(s) > 10:
        raise ValueError("school_code must be at most 10 characters")
    return s


def parse_inspector_phone_number(raw: Any) -> str:
    s = _cell_str(raw)
    if not s:
        raise ValueError("phone_number is required")
    if len(s) > 50:
        raise ValueError("phone_number must be at most 50 characters")
    return s


def parse_inspector_full_name(raw: Any) -> str:
    s = _cell_str(raw)
    if not s:
        raise ValueError("full_name is required")
    if len(s) > 255:
        raise ValueError("full_name must be at most 255 characters")
    return s
