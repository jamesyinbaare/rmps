"""Tests for workforce payout compensation."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from unittest.mock import MagicMock

from app.models import WorkforceAssignmentBatchStatus
from app.services.workforce_compensation import (
    DEFAULT_WITHHOLDING_TAX_PERCENT,
    WorkforceRateConfig,
    compute_workforce_payout,
    rate_config_from_row,
    work_days_from_batches,
)


def _batch(*, script_count: int, completed_at: datetime | None = None, status=WorkforceAssignmentBatchStatus.COMPLETED):
    batch = MagicMock()
    batch.status = status
    batch.script_count = script_count
    batch.completed_at = completed_at
    batch.assigned_at = datetime(2026, 6, 1, 9, 0)
    batch.subject_id = 1
    batch.paper_number = 1
    batch.batch_sequence = 1
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
