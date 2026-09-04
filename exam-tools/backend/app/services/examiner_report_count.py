"""Parse and validate report allowance count from uploads and API."""

from __future__ import annotations

from typing import Any

import pandas as pd

from app.models import ExaminerType

# Roles that default to one report (AE defaults to zero).
REPORT_COUNT_DEFAULT_ONE_TYPES: frozenset[ExaminerType] = frozenset(
    {
        ExaminerType.CHIEF,
        ExaminerType.ASSISTANT_CHIEF,
        ExaminerType.TEAM_LEADER,
    }
)

# Kept for callers that still import the old name.
REPORT_COUNT_ELIGIBLE_TYPES = REPORT_COUNT_DEFAULT_ONE_TYPES


def default_report_count(examiner_type: ExaminerType) -> int:
    if examiner_type == ExaminerType.ASSISTANT:
        return 0
    return 1


def parse_report_count_cell(raw: Any, *, default: int = 1) -> int:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return default
    text = str(raw).strip()
    if not text:
        return default
    if not text.isdigit():
        raise ValueError("report_count must be a whole number >= 0")
    value = int(text)
    if value < 0:
        raise ValueError("report_count must be >= 0")
    return value


def parse_reporting_allowance_flag(raw: Any) -> bool:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return False
    text = str(raw).strip().casefold()
    if not text:
        return False
    return text in {"1", "yes", "y", "true", "t", "on", "enabled"}


def reporting_allowance_enabled_for_examiner(
    examiner_type: ExaminerType,
    *,
    reporting_allowance_enabled: bool = False,
    report_count: int | None = None,
) -> bool:
    """Any role can receive reporting; count > 0 is the gate."""
    del examiner_type, reporting_allowance_enabled
    if report_count is None:
        return True
    return report_count > 0


def validate_report_count_for_type(
    report_count: int,
    examiner_type: ExaminerType,
    *,
    reporting_allowance_enabled: bool = False,
) -> None:
    del examiner_type, reporting_allowance_enabled
    if report_count < 0:
        raise ValueError("report_count must be >= 0")
