"""Excel export for admin script-control (worked scripts) summary and detail views."""

from __future__ import annotations

import io
import re
from typing import Literal
from uuid import UUID

import pandas as pd

from app.models import ScriptPackingSeries

ScriptExportMode = Literal["summary", "detail"]

SHEET_NAME = "Worked scripts"


def _series_block_booklet_total(ps: ScriptPackingSeries | None) -> int:
    if ps is None or not ps.envelopes:
        return 0
    return sum(e.booklet_count for e in ps.envelopes)


def _series_detail_cell(ps: ScriptPackingSeries | None) -> str:
    if ps is None or not ps.envelopes:
        return ""
    envs = sorted(ps.envelopes, key=lambda x: x.envelope_number)
    return ",".join(str(e.booklet_count) for e in envs)


def compute_max_series(
    subject_id: int,
    series_count_by_subject: dict[int, int],
    packings: list[ScriptPackingSeries],
) -> int:
    configured = series_count_by_subject.get(subject_id, 1)
    from_data = max((ps.series_number for ps in packings), default=0)
    return max(configured, from_data, 1)


def merge_packings_by_school(
    packings: list[ScriptPackingSeries],
) -> dict[UUID, dict[int, ScriptPackingSeries]]:
    """school_id -> series_number -> ScriptPackingSeries row."""
    by_school: dict[UUID, dict[int, ScriptPackingSeries]] = {}
    for ps in packings:
        if ps.school_id not in by_school:
            by_school[ps.school_id] = {}
        by_school[ps.school_id][ps.series_number] = ps
    return by_school


def build_script_control_export_dataframe(
    *,
    examination_id: int,
    subject_id: int,
    mode: ScriptExportMode,
    max_series: int,
    packings: list[ScriptPackingSeries],
    registered_by_key: dict[str, int],
) -> pd.DataFrame:
    by_school = merge_packings_by_school(packings)
    school_ids = sorted(by_school.keys(), key=lambda sid: _school_sort_key(by_school[sid]))

    columns = [
        "school_code",
        "school_name",
        "region",
        "zone",
        *[f"S{sn}" for sn in range(1, max_series + 1)],
        "total_booklets",
        "registered",
    ]

    rows: list[dict[str, object]] = []
    for school_id in school_ids:
        series_map = by_school[school_id]
        sample = next(iter(series_map.values()))
        sch = sample.school
        school_code = sch.code if sch else ""
        school_name = sch.name if sch else ""
        region = sch.region.value if sch and sch.region is not None else ""
        zone = sch.zone.value if sch and sch.zone is not None else ""

        reg_key = f"{examination_id}:{school_id}:{subject_id}"
        registered = registered_by_key.get(reg_key, "")

        s_vals: dict[str, object] = {}
        row_total = 0
        for sn in range(1, max_series + 1):
            ps = series_map.get(sn)
            if mode == "summary":
                v = _series_block_booklet_total(ps)
                s_vals[f"S{sn}"] = int(v)
                row_total += int(v)
            else:
                s_vals[f"S{sn}"] = _series_detail_cell(ps)
                row_total += _series_block_booklet_total(ps)

        rows.append(
            {
                "school_code": school_code,
                "school_name": school_name,
                "region": region,
                "zone": zone,
                **s_vals,
                "total_booklets": int(row_total),
                "registered": registered if registered != "" else "",
            }
        )

    # Footer totals
    footer: dict[str, object] = {
        "school_code": "Totals",
        "school_name": "",
        "region": "",
        "zone": "",
    }
    grand_total = 0
    for sn in range(1, max_series + 1):
        col = f"S{sn}"
        if mode == "summary":
            col_sum = sum(int(r[col]) for r in rows)
            footer[col] = col_sum
            grand_total += col_sum
        else:
            col_sum = 0
            for school_id in school_ids:
                series_map = by_school[school_id]
                ps = series_map.get(sn)
                col_sum += _series_block_booklet_total(ps)
            footer[col] = col_sum
            grand_total += col_sum
    footer["total_booklets"] = int(grand_total)
    footer["registered"] = ""

    if not rows:
        return pd.DataFrame([footer], columns=columns)

    rows.append(footer)
    return pd.DataFrame(rows, columns=columns)


def _school_sort_key(series_map: dict[int, ScriptPackingSeries]) -> str:
    sample = next(iter(series_map.values()))
    sch = sample.school
    return (sch.code if sch else "").strip().lower()


def script_control_export_excel_bytes(df: pd.DataFrame) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=SHEET_NAME)
    buf.seek(0)
    return buf.getvalue()


def sanitize_export_filename_part(raw: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", raw).strip("_") or "export"
