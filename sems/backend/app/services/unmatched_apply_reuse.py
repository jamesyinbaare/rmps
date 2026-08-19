"""Reuse clerk-confirmed unmatched resolutions on a later exact apply."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from app.models import UnmatchedRecordStatus

ReuseAction = Literal["write", "skip", "create"]


def reuse_action(
    status: UnmatchedRecordStatus | str | None,
    resolved_subject_registration_id: int | None,
) -> ReuseAction:
    """Decide what apply should do when exact index match failed."""
    if status is None:
        return "create"
    value = status.value if isinstance(status, UnmatchedRecordStatus) else status
    if value == UnmatchedRecordStatus.IGNORED.value:
        return "skip"
    if value == UnmatchedRecordStatus.RESOLVED.value:
        if resolved_subject_registration_id:
            return "write"
        return "skip"
    return "create"


def _row_sort_key(row: Any) -> datetime:
    return getattr(row, "resolved_at", None) or getattr(row, "created_at", None) or datetime.min


def build_unmatched_reuse_index(rows: list[Any]) -> dict[tuple, Any]:
    """Latest resolved/ignored row wins per (sn, index) and per index-only."""
    indexed: dict[tuple, Any] = {}
    for row in sorted(rows, key=_row_sort_key):
        sn = getattr(row, "sn", None)
        index_number = getattr(row, "index_number", None)
        if sn is not None and index_number:
            indexed[("sn", sn, index_number)] = row
        if index_number:
            indexed[("idx", index_number)] = row
    return indexed


def lookup_unmatched_reuse(
    indexed: dict[tuple, Any],
    *,
    sn: int | None,
    index_number: str | None,
) -> Any | None:
    if sn is not None and index_number:
        hit = indexed.get(("sn", sn, index_number))
        if hit is not None:
            return hit
    if index_number:
        return indexed.get(("idx", index_number))
    return None
