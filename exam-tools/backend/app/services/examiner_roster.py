"""Helpers for allocation examiner roster: region→zones, CSV/XLSX bulk import."""

from __future__ import annotations

import io
import re
from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExaminerType, Region, School, Subject, Zone
from app.services.script_allocation import parse_zone, zones_from_strings


def normalize_header_key(key: str) -> str:
    s = str(key).strip().lower()
    s = re.sub(r"\s+", "_", s)
    return s


def parse_region(value: str | None) -> Region:
    if value is None or not str(value).strip():
        raise ValueError("Region is required")
    raw = str(value).strip()
    for r in Region:
        if r.value.lower() == raw.lower():
            return r
    raise ValueError(f"Unknown region: {raw!r}")


async def distinct_zones_for_region(session: AsyncSession, region: Region) -> list[Zone]:
    stmt = select(School.zone).where(School.region == region).distinct().order_by(School.zone)
    res = await session.execute(stmt)
    return [row[0] for row in res.all()]


async def resolve_examiner_allowed_zones(
    session: AsyncSession,
    *,
    allowed_zones_explicit: list[str],
    allowed_region: str | None,
    restrict_zone: str | None,
) -> list[Zone]:
    """Derive marking zones from explicit list, or region (+ optional single zone within that region)."""
    if allowed_zones_explicit:
        return zones_from_strings(allowed_zones_explicit)
    if not allowed_region or not str(allowed_region).strip():
        raise ValueError("allowed_region is required")
    r = parse_region(allowed_region)
    region_zones = await distinct_zones_for_region(session, r)
    if not region_zones:
        raise ValueError(f"No schools are recorded in region {r.value}, so zones cannot be derived")
    if restrict_zone:
        z = parse_zone(restrict_zone)
        if z not in region_zones:
            avail = ", ".join(sorted(x.value for x in region_zones))
            raise ValueError(f"Zone {z.value} is not among school zones in {r.value} (available: {avail})")
        return [z]
    return region_zones


def prefill_region_zone_for_examiner(
    allowed_zones: set[Zone],
    regions_to_zones: dict[Region, frozenset[Zone]],
) -> tuple[str | None, str | None]:
    """Best-effort UI prefill: full region name, or single zone letter, or unknown."""
    if not allowed_zones:
        return None, None
    if len(allowed_zones) == 1:
        z = next(iter(allowed_zones))
        return None, z.value
    fz = frozenset(allowed_zones)
    for r, rz in regions_to_zones.items():
        if rz == fz:
            return r.value, None
    return None, None


async def load_region_to_zones_map(session: AsyncSession) -> dict[Region, frozenset[Zone]]:
    out: dict[Region, frozenset[Zone]] = {}
    for r in Region:
        zs = await distinct_zones_for_region(session, r)
        out[r] = frozenset(zs)
    return out


def parse_examiner_type_cell(value: Any) -> ExaminerType:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        raise ValueError("Examiner type is required")
    raw = str(value).strip()
    if not raw:
        raise ValueError("Examiner type is required")
    v = raw.lower().replace(" ", "_")
    aliases: dict[str, ExaminerType] = {
        "chief": ExaminerType.CHIEF,
        "chief_examiner": ExaminerType.CHIEF,
        "ce": ExaminerType.CHIEF,
        "team_leader": ExaminerType.TEAM_LEADER,
        "tl": ExaminerType.TEAM_LEADER,
        "assistant": ExaminerType.ASSISTANT,
        "assistant_examiner": ExaminerType.ASSISTANT,
        "ae": ExaminerType.ASSISTANT,
    }
    if v in aliases:
        return aliases[v]
    try:
        return ExaminerType(v)
    except ValueError as e:
        raise ValueError(f"Unknown examiner type: {raw!r}") from e


async def subject_id_for_code(session: AsyncSession, code: str) -> int:
    c = str(code).strip()
    if not c:
        raise ValueError("Subject code is required")
    stmt = select(Subject).where(Subject.code == c)
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        stmt_ci = select(Subject).where(Subject.code.ilike(c))
        matches = list((await session.execute(stmt_ci)).scalars().all())
        if len(matches) == 1:
            row = matches[0]
        elif len(matches) > 1:
            raise ValueError(f"Ambiguous subject code: {c!r}")
    if row is None:
        raise ValueError(f"Unknown subject code: {c!r}")
    return int(row.id)


def _canonical_column_map() -> dict[str, str]:
    """Map normalized header → logical field name."""
    return {
        "name": "name",
        "full_name": "name",
        "examiner_name": "name",
        "subject_code": "subject_code",
        "subject": "subject_code",
        "sub_code": "subject_code",
        "examiner_type": "examiner_type",
        "type": "examiner_type",
        "role": "examiner_type",
        "region": "region",
        "zone": "restrict_zone",
        "allowed_zone": "restrict_zone",
        "source_zone": "restrict_zone",
    }


def _rename_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = [normalize_header_key(c) for c in out.columns]
    cmap = _canonical_column_map()
    rename = {c: cmap[c] for c in out.columns if c in cmap}
    return out.rename(columns=rename)


def read_examiners_spreadsheet(file_bytes: bytes, filename: str) -> pd.DataFrame:
    lower = filename.lower()
    bio = io.BytesIO(file_bytes)
    if lower.endswith(".csv"):
        df = pd.read_csv(bio)
    elif lower.endswith(".xlsx"):
        df = pd.read_excel(bio, engine="openpyxl")
    else:
        raise ValueError("Upload a .csv or .xlsx file")
    if df.empty:
        raise ValueError("The file has no data rows")
    return _rename_dataframe_columns(df)


async def dataframe_row_to_examiner_fields(
    session: AsyncSession,
    row: pd.Series,
) -> dict[str, Any]:
    """Parse one spreadsheet row into create kwargs (name, examiner_type, subject_ids, allowed_region, restrict_zone)."""
    name = row.get("name")
    if name is None or (isinstance(name, float) and pd.isna(name)) or not str(name).strip():
        raise ValueError("Name is required")
    sub = row.get("subject_code")
    if sub is None or (isinstance(sub, float) and pd.isna(sub)):
        raise ValueError("Subject code is required")
    sid = await subject_id_for_code(session, str(sub))
    et = parse_examiner_type_cell(row.get("examiner_type"))
    reg = row.get("region")
    allowed_region: str | None = None
    if reg is not None and not (isinstance(reg, float) and pd.isna(reg)) and str(reg).strip():
        allowed_region = str(reg).strip()
    rz = row.get("restrict_zone")
    restrict: str | None = None
    if rz is not None and not (isinstance(rz, float) and pd.isna(rz)) and str(rz).strip():
        restrict = str(rz).strip()
    if not allowed_region:
        raise ValueError("Region is required")
    return {
        "name": str(name).strip(),
        "examiner_type": et,
        "subject_ids": [sid],
        "allowed_region": allowed_region,
        "restrict_zone": restrict,
    }
