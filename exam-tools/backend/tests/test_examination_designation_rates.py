"""Tests for examination designation allowance rates and compensation helpers."""

from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from app.models import ExamOfficialDesignation, ExaminationDesignationRate
from app.services.exam_official_compensation import (
    compensation_for_official,
    compensation_from_rate_row,
    compute_total_payable_ghs,
)


def _rate(
    daily: str | None = "100",
    commuting: str | None = None,
    airtime: str | None = "20",
) -> ExaminationDesignationRate:
    row = MagicMock(spec=ExaminationDesignationRate)
    row.daily_rate_ghs = Decimal(daily) if daily is not None else None
    row.commuting_allowance_ghs = Decimal(commuting) if commuting is not None else None
    row.airtime_ghs = Decimal(airtime) if airtime is not None else None
    return row


def _official(designation: ExamOfficialDesignation, num_days: int = 3) -> MagicMock:
    off = MagicMock()
    off.designation = designation
    off.num_days = num_days
    return off


def test_compute_total_payable_ghs_null_daily() -> None:
    assert compute_total_payable_ghs(None, 5, Decimal("10"), Decimal("5")) is None


def test_compute_total_payable_ghs_with_optional_allowances() -> None:
    # (50 × 4) + (25 × 4) + 10 = 310 — commuting is per day
    total = compute_total_payable_ghs(Decimal("50"), 4, Decimal("25"), Decimal("10"))
    assert total == Decimal("310")


def test_commuting_scales_with_num_days() -> None:
    total_2_days = compute_total_payable_ghs(Decimal("100"), 2, Decimal("15"), None)
    total_5_days = compute_total_payable_ghs(Decimal("100"), 5, Decimal("15"), None)
    assert total_2_days == Decimal("230")  # 200 + 30
    assert total_5_days == Decimal("575")  # 500 + 75


def test_compute_total_payable_ghs_omitted_optional_as_zero() -> None:
    total = compute_total_payable_ghs(Decimal("50"), 2, None, None)
    assert total == Decimal("100")


def test_compensation_from_rate_row_none() -> None:
    comp = compensation_from_rate_row(None, 3)
    assert comp.daily_rate_ghs is None
    assert comp.total_payable_ghs is None


def test_two_invigilators_same_designation_same_daily_rate_different_totals() -> None:
    rates = {ExamOfficialDesignation.INVIGILATOR: _rate(daily="80", commuting=None, airtime=None)}
    off_a = _official(ExamOfficialDesignation.INVIGILATOR, num_days=2)
    off_b = _official(ExamOfficialDesignation.INVIGILATOR, num_days=5)
    comp_a = compensation_for_official(off_a, rates)
    comp_b = compensation_for_official(off_b, rates)
    assert comp_a.daily_rate_ghs == comp_b.daily_rate_ghs == Decimal("80")
    assert comp_a.total_payable_ghs == Decimal("160")
    assert comp_b.total_payable_ghs == Decimal("400")


def test_supervisor_vs_invigilator_different_rates() -> None:
    rates = {
        ExamOfficialDesignation.INVIGILATOR: _rate(daily="50"),
        ExamOfficialDesignation.SUPERVISOR: _rate(daily="120", airtime=None),
    }
    inv = compensation_for_official(_official(ExamOfficialDesignation.INVIGILATOR, 1), rates)
    sup = compensation_for_official(_official(ExamOfficialDesignation.SUPERVISOR, 1), rates)
    assert inv.daily_rate_ghs == Decimal("50")
    assert sup.daily_rate_ghs == Decimal("120")


def test_designation_from_api_label_invalid() -> None:
    from app.services.exam_official_compensation import designation_from_api_label

    with pytest.raises(ValueError, match="Invalid designation"):
        designation_from_api_label("Not A Role")
