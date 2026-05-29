"""Compute official compensation from per-examination designation rates."""

from dataclasses import dataclass
from decimal import Decimal
from typing import cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExamCentreOfficial, ExamOfficialDesignation, ExaminationDesignationRate


@dataclass(frozen=True)
class ComputedCompensation:
    daily_rate_ghs: Decimal | None
    commuting_allowance_ghs: Decimal | None
    airtime_ghs: Decimal | None
    total_payable_ghs: Decimal | None


def _to_decimal(value: object | None) -> Decimal | None:
    if value is None:
        return None
    return cast(Decimal, value)


def compute_total_payable_ghs(
    daily_rate_ghs: Decimal | None,
    num_days: int,
    commuting_allowance_per_day_ghs: Decimal | None,
    airtime_ghs: Decimal | None,
) -> Decimal | None:
    """Total = (daily rate × days) + (commuting per day × days) + one-time airtime."""
    if daily_rate_ghs is None:
        return None
    days = Decimal(num_days)
    commuting_per_day = (
        commuting_allowance_per_day_ghs if commuting_allowance_per_day_ghs is not None else Decimal("0")
    )
    airtime = airtime_ghs if airtime_ghs is not None else Decimal("0")
    return daily_rate_ghs * days + commuting_per_day * days + airtime


def compensation_from_rate_row(
    rate: ExaminationDesignationRate | None,
    num_days: int,
) -> ComputedCompensation:
    if rate is None:
        return ComputedCompensation(None, None, None, None)
    daily = _to_decimal(rate.daily_rate_ghs)
    commuting = _to_decimal(rate.commuting_allowance_ghs)
    airtime = _to_decimal(rate.airtime_ghs)
    total = compute_total_payable_ghs(daily, num_days, commuting, airtime)
    return ComputedCompensation(daily, commuting, airtime, total)


def compensation_for_official(
    official: ExamCentreOfficial,
    rates_by_designation: dict[ExamOfficialDesignation, ExaminationDesignationRate],
) -> ComputedCompensation:
    rate = rates_by_designation.get(official.designation)
    return compensation_from_rate_row(rate, int(official.num_days))


async def load_designation_rates_map(
    session: AsyncSession,
    examination_id: int,
) -> dict[ExamOfficialDesignation, ExaminationDesignationRate]:
    stmt = select(ExaminationDesignationRate).where(
        ExaminationDesignationRate.examination_id == examination_id,
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()
    out: dict[ExamOfficialDesignation, ExaminationDesignationRate] = {}
    for row in rows:
        des = row.designation
        if isinstance(des, ExamOfficialDesignation):
            out[des] = row
        else:
            for member in ExamOfficialDesignation:
                if member.value == str(des):
                    out[member] = row
                    break
    return out


def designation_from_api_label(label: str) -> ExamOfficialDesignation:
    raw = label.strip()
    for member in ExamOfficialDesignation:
        if member.value == raw:
            return member
    raise ValueError(f"Invalid designation: {label}")


def all_designation_labels() -> list[str]:
    return [member.value for member in ExamOfficialDesignation]


def format_ghs_amount(value: Decimal | None) -> str:
    if value is None:
        return ""
    return f"{value:.2f}"


def compensation_export_values(
    official: ExamCentreOfficial,
    rates_by_designation: dict[ExamOfficialDesignation, ExaminationDesignationRate],
) -> tuple[str, str, str, str]:
    comp = compensation_for_official(official, rates_by_designation)
    return (
        format_ghs_amount(comp.daily_rate_ghs),
        format_ghs_amount(comp.commuting_allowance_ghs),
        format_ghs_amount(comp.airtime_ghs),
        format_ghs_amount(comp.total_payable_ghs),
    )
