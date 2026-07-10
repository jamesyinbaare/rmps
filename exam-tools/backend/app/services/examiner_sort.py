"""Shared natural-sort helpers for examiner lists (attendance, lunch coupons, etc.)."""

from __future__ import annotations

import enum
import re

from app.models import Examiner, Region


class ExaminerSortField(enum.Enum):
    REFERENCE_CODE = "reference_code"
    NAME = "name"
    REGION = "region"


def name_sort_key(examiner: Examiner) -> str:
    return (examiner.name or "").casefold()


def natural_sort_key(text: str) -> tuple:
    parts: list[tuple[int, int | str]] = []
    for part in re.split(r"(\d+)", text):
        if not part:
            continue
        if part.isdigit():
            parts.append((0, int(part)))
        else:
            parts.append((1, part.casefold()))
    return tuple(parts)


def reference_code_sort_key(examiner: Examiner) -> tuple:
    code = (examiner.reference_code or "").strip()
    if not code:
        return ((1,), name_sort_key(examiner))
    return ((0, natural_sort_key(code)), name_sort_key(examiner))


def region_sort_key(examiner: Examiner) -> tuple[str, str]:
    region = examiner.region.value if isinstance(examiner.region, Region) else str(examiner.region or "")
    return (region.casefold(), name_sort_key(examiner))


def sort_examiners(
    examiners: list[Examiner],
    sort_by: ExaminerSortField = ExaminerSortField.REFERENCE_CODE,
) -> list[Examiner]:
    if sort_by == ExaminerSortField.NAME:
        return sorted(examiners, key=name_sort_key)
    if sort_by == ExaminerSortField.REGION:
        return sorted(examiners, key=region_sort_key)
    return sorted(examiners, key=reference_code_sort_key)
