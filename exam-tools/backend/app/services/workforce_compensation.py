"""Compute workforce payout from per-examination rates and completed batches."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import cast

from app.models import (
    ExaminationDataEntryClerkRate,
    ExaminationScriptCheckerRate,
    Subject,
    WorkforceAssignmentBatchStatus,
)

DEFAULT_WITHHOLDING_TAX_PERCENT = Decimal("10")
_MONEY_QUANTIZE = Decimal("0.01")


@dataclass(frozen=True)
class WorkforceRateConfig:
    rate_per_script_ghs: Decimal
    commuting_allowance_ghs: Decimal
    lunch_allowance_ghs: Decimal
    withholding_tax_percent: Decimal
    has_rate_row: bool


@dataclass(frozen=True)
class WorkforcePayoutBreakdown:
    completed_scripts: int
    num_days: int
    rate_per_script_ghs: Decimal
    commuting_allowance_ghs: Decimal
    lunch_allowance_ghs: Decimal
    commuting_payable_ghs: Decimal
    lunch_payable_ghs: Decimal
    script_gross_ghs: Decimal
    withholding_tax_percent: Decimal
    withholding_tax_ghs: Decimal
    script_net_ghs: Decimal
    payable_ghs: Decimal
    has_rate: bool
    completed_batch_lines: list[dict]


def _to_decimal(value: object | None, default: Decimal = Decimal("0")) -> Decimal:
    if value is None:
        return default
    return cast(Decimal, value)


def rate_config_from_row(
    row: ExaminationScriptCheckerRate | ExaminationDataEntryClerkRate | None,
) -> WorkforceRateConfig:
    if row is None:
        return WorkforceRateConfig(
            rate_per_script_ghs=Decimal("0"),
            commuting_allowance_ghs=Decimal("0"),
            lunch_allowance_ghs=Decimal("0"),
            withholding_tax_percent=DEFAULT_WITHHOLDING_TAX_PERCENT,
            has_rate_row=False,
        )
    return WorkforceRateConfig(
        rate_per_script_ghs=_to_decimal(row.rate_per_script_ghs),
        commuting_allowance_ghs=_to_decimal(row.commuting_allowance_ghs),
        lunch_allowance_ghs=_to_decimal(row.lunch_allowance_ghs),
        withholding_tax_percent=_to_decimal(row.withholding_tax_percent, DEFAULT_WITHHOLDING_TAX_PERCENT),
        has_rate_row=True,
    )


def _batch_status_value(batch) -> str:
    return batch.status.value if hasattr(batch.status, "value") else str(batch.status)


def _batch_work_date(batch) -> date | None:
    if batch.completed_at is not None:
        return batch.completed_at.date()
    if batch.assigned_at is not None:
        return batch.assigned_at.date()
    return None


def work_days_from_batches(batches) -> int:
    dates: set[date] = set()
    has_completed = False
    for batch in batches:
        if _batch_status_value(batch) != WorkforceAssignmentBatchStatus.COMPLETED.value:
            continue
        has_completed = True
        work_date = _batch_work_date(batch)
        if work_date is not None:
            dates.add(work_date)
    if not has_completed:
        return 0
    return max(len(dates), 1)


def _completed_batch_lines(
    batches,
    subjects: dict[int, Subject],
) -> list[dict]:
    lines: list[dict] = []
    for batch in batches:
        if _batch_status_value(batch) != WorkforceAssignmentBatchStatus.COMPLETED.value:
            continue
        subject = subjects.get(int(batch.subject_id))
        lines.append(
            {
                "subject_id": int(batch.subject_id),
                "subject_code": subject.code if subject else None,
                "subject_name": subject.name if subject else None,
                "paper_number": int(batch.paper_number),
                "script_count": int(batch.script_count),
                "batch_sequence": int(batch.batch_sequence),
            }
        )
    return sorted(
        lines,
        key=lambda row: (
            (row["subject_name"] or row["subject_code"] or "").lower(),
            int(row["paper_number"]),
            int(row["batch_sequence"]),
        ),
    )


def compute_workforce_payout(
    batches,
    config: WorkforceRateConfig,
    *,
    subjects: dict[int, Subject],
) -> WorkforcePayoutBreakdown:
    completed_scripts = 0
    for batch in batches:
        if _batch_status_value(batch) != WorkforceAssignmentBatchStatus.COMPLETED.value:
            continue
        completed_scripts += int(batch.script_count)

    num_days = work_days_from_batches(batches)
    script_gross = Decimal(completed_scripts) * config.rate_per_script_ghs
    tax_rate = config.withholding_tax_percent / Decimal("100")
    withholding_tax = (script_gross * tax_rate).quantize(_MONEY_QUANTIZE) if script_gross > 0 else Decimal("0")
    script_net = script_gross - withholding_tax
    commuting_payable = config.commuting_allowance_ghs * Decimal(num_days)
    lunch_payable = config.lunch_allowance_ghs * Decimal(num_days)
    payable = (script_net + commuting_payable + lunch_payable).quantize(_MONEY_QUANTIZE)

    return WorkforcePayoutBreakdown(
        completed_scripts=completed_scripts,
        num_days=num_days,
        rate_per_script_ghs=config.rate_per_script_ghs,
        commuting_allowance_ghs=config.commuting_allowance_ghs,
        lunch_allowance_ghs=config.lunch_allowance_ghs,
        commuting_payable_ghs=commuting_payable,
        lunch_payable_ghs=lunch_payable,
        script_gross_ghs=script_gross,
        withholding_tax_percent=config.withholding_tax_percent,
        withholding_tax_ghs=withholding_tax,
        script_net_ghs=script_net,
        payable_ghs=payable,
        has_rate=config.has_rate_row,
        completed_batch_lines=_completed_batch_lines(batches, subjects),
    )
