"""Tests for workforce payout compensation."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from unittest.mock import MagicMock

from app.models import WorkforceAssignmentBatchStatus
from app.services.workforce_compensation import (
    DEFAULT_WITHHOLDING_TAX_PERCENT,
    WorkforceRateConfig,
    compute_script_checker_bulk_payout,
    compute_workforce_payout,
    rate_config_from_row,
    rate_for_paper,
    work_days_from_batches,
)


def _batch(
    *,
    script_count: int,
    paper_number: int = 1,
    completed_at: datetime | None = None,
    status=WorkforceAssignmentBatchStatus.COMPLETED,
    num_days: int | None = None,
):
    batch = MagicMock()
    batch.status = status
    batch.script_count = script_count
    batch.completed_at = completed_at
    batch.assigned_at = datetime(2026, 6, 1, 9, 0)
    batch.subject_id = 1
    batch.paper_number = paper_number
    batch.batch_sequence = 1
    batch.num_days = num_days
    return batch


def test_rate_config_from_row_defaults_tax_when_missing_row() -> None:
    config = rate_config_from_row(None)
    assert config.has_rate_row is False
    assert config.withholding_tax_percent == DEFAULT_WITHHOLDING_TAX_PERCENT


def test_work_days_counts_distinct_completed_dates() -> None:
    batches = [
        _batch(script_count=10, completed_at=datetime(2026, 6, 1, 12)),
        _batch(script_count=5, completed_at=datetime(2026, 6, 1, 15)),
        _batch(script_count=8, completed_at=datetime(2026, 6, 2, 10)),
    ]
    assert work_days_from_batches(batches) == 2


def test_work_days_sums_stored_num_days() -> None:
    batches = [
        _batch(script_count=10, completed_at=datetime(2026, 6, 1, 12), num_days=3),
        _batch(script_count=5, completed_at=datetime(2026, 6, 2, 10), num_days=2),
    ]
    assert work_days_from_batches(batches) == 5


def test_work_days_mixes_stored_and_legacy_dates() -> None:
    batches = [
        _batch(script_count=10, completed_at=datetime(2026, 6, 1, 12), num_days=3),
        _batch(script_count=5, completed_at=datetime(2026, 6, 2, 10)),
        _batch(script_count=5, completed_at=datetime(2026, 6, 2, 15)),
    ]
    # 3 stored + 1 distinct legacy date
    assert work_days_from_batches(batches) == 4


def test_compute_workforce_payout_applies_tax_and_daily_allowances() -> None:
    config = WorkforceRateConfig(
        rate_per_script_ghs=Decimal("2.00"),
        commuting_allowance_ghs=Decimal("15.00"),
        lunch_allowance_ghs=Decimal("20.00"),
        withholding_tax_percent=Decimal("10"),
        has_rate_row=True,
    )
    batches = [
        _batch(script_count=100, completed_at=datetime(2026, 6, 1, 12)),
        _batch(script_count=50, completed_at=datetime(2026, 6, 2, 12)),
    ]
    result = compute_workforce_payout(batches, config, subjects={})

    assert result.completed_scripts == 150
    assert result.num_days == 2
    assert result.script_gross_ghs == Decimal("300.00")
    assert result.withholding_tax_ghs == Decimal("30.00")
    assert result.script_net_ghs == Decimal("270.00")
    assert result.commuting_payable_ghs == Decimal("30.00")
    assert result.lunch_payable_ghs == Decimal("40.00")
    assert result.payable_ghs == Decimal("340.00")


def test_script_checker_ot_st_rates_by_paper_number() -> None:
    config = WorkforceRateConfig(
        rate_per_script_ghs=Decimal("0.40"),
        objective_rate_per_script_ghs=Decimal("0.40"),
        subjective_rate_per_script_ghs=Decimal("0.50"),
        commuting_allowance_ghs=Decimal("0"),
        lunch_allowance_ghs=Decimal("0"),
        withholding_tax_percent=Decimal("10"),
        has_rate_row=True,
    )
    assert rate_for_paper(config, 1) == Decimal("0.40")
    assert rate_for_paper(config, 2) == Decimal("0.50")

    batches = [
        _batch(script_count=100, paper_number=1, completed_at=datetime(2026, 6, 1, 12)),
        _batch(script_count=100, paper_number=2, completed_at=datetime(2026, 6, 1, 13)),
    ]
    result = compute_workforce_payout(batches, config, subjects={})
    # 100*0.40 + 100*0.50 = 90
    assert result.script_gross_ghs == Decimal("90.00")
    assert result.withholding_tax_ghs == Decimal("9.00")
    assert result.payable_ghs == Decimal("81.00")


def test_script_checker_bulk_payout_uses_paper_totals_and_days_at_post() -> None:
    config = WorkforceRateConfig(
        rate_per_script_ghs=Decimal("0.40"),
        objective_rate_per_script_ghs=Decimal("0.40"),
        subjective_rate_per_script_ghs=Decimal("0.50"),
        commuting_allowance_ghs=Decimal("15.00"),
        lunch_allowance_ghs=Decimal("20.00"),
        withholding_tax_percent=Decimal("10"),
        has_rate_row=True,
    )
    bulk = MagicMock(paper1_script_count=100, paper2_script_count=80, num_days=3)
    result = compute_script_checker_bulk_payout(bulk, config)

    assert result.completed_scripts == 180
    assert result.num_days == 3
    assert result.script_gross_ghs == Decimal("80.00")  # 100*0.40 + 80*0.50
    assert result.withholding_tax_ghs == Decimal("8.00")
    assert result.script_net_ghs == Decimal("72.00")
    assert result.commuting_payable_ghs == Decimal("45.00")
    assert result.lunch_payable_ghs == Decimal("60.00")
    assert result.payable_ghs == Decimal("177.00")
    assert [line["paper_number"] for line in result.completed_batch_lines] == [1, 2]


def test_script_checker_bulk_payout_none_is_zero() -> None:
    config = WorkforceRateConfig(
        rate_per_script_ghs=Decimal("0.40"),
        objective_rate_per_script_ghs=Decimal("0.40"),
        subjective_rate_per_script_ghs=Decimal("0.50"),
        commuting_allowance_ghs=Decimal("15.00"),
        lunch_allowance_ghs=Decimal("20.00"),
        withholding_tax_percent=Decimal("10"),
        has_rate_row=True,
    )
    result = compute_script_checker_bulk_payout(None, config)
    assert result.completed_scripts == 0
    assert result.num_days == 0
    assert result.payable_ghs == Decimal("0.00")
