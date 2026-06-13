"""Compute examiner compensation from per-examination allowance rates."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import TypeVar, cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Examiner,
    ExaminerAllowanceType,
    ExaminerBankAccount,
    ExaminerSubject,
    ExaminerType,
    ExaminationExaminerMarkingRate,
    ExaminationExaminerRoleAllowanceRate,
    ExaminationExaminerTravelRate,
    ExaminationExaminerTravelRoleFactor,
    ExaminationExaminerTravelZone,
    ExaminationExaminerTravelZoneRegion,
    Region,
    Subject,
)
from app.services.examiner_allocated_booklets import AllocatedBookletsMap

WITHHOLDING_TAX_RATE = Decimal("0.10")
_MONEY_QUANTIZE = Decimal("0.01")


def withholding_tax(gross: Decimal) -> tuple[Decimal, Decimal]:
    """Return (net, tax) after 10% withholding on gross marking/vetting amounts."""
    if gross <= 0:
        return Decimal("0"), Decimal("0")
    tax = (gross * WITHHOLDING_TAX_RATE).quantize(_MONEY_QUANTIZE)
    return gross - tax, tax


@dataclass(frozen=True)
class TravelCompensation:
    base_ghs: Decimal
    zone_name: str | None
    role_factor: Decimal
    payable_ghs: Decimal


@dataclass(frozen=True)
class SubjectMarkingBreakdown:
    subject_id: int
    subject_code: str
    subject_name: str
    paper_number: int
    allocated_booklets: int
    rate_per_script_ghs: Decimal | None
    marking_allowance_ghs: Decimal


@dataclass(frozen=True)
class ComputedExaminerCompensation:
    responsibility_allowance_ghs: Decimal
    inconvenience_allowance_ghs: Decimal
    chief_examiners_report_ghs: Decimal
    vetting_of_scripts_ghs: Decimal
    internal_commuting_ghs: Decimal
    marking_allowance_ghs: Decimal
    travel_base_ghs: Decimal
    travel_zone_name: str | None
    travel_role_factor: Decimal
    travel_and_transport_ghs: Decimal
    total_allocated_scripts: int
    marking_withholding_tax_ghs: Decimal
    marking_net_ghs: Decimal
    vetting_withholding_tax_ghs: Decimal
    vetting_net_ghs: Decimal
    payout_travel_commuting_ghs: Decimal
    payout_allowances_marking_ghs: Decimal
    total_payable_ghs: Decimal
    subject_breakdowns: list[SubjectMarkingBreakdown]


RoleAllowanceKey = tuple[ExaminerType, ExaminerAllowanceType]
RoleAllowanceMap = dict[RoleAllowanceKey, Decimal | None]
MarkingRateKey = tuple[int, int]
MarkingRateMap = dict[MarkingRateKey, Decimal | None]
TravelRateMap = dict[Region, Decimal | None]
TravelZoneMap = dict[Region, UUID]
TravelZoneNameMap = dict[UUID, str]
TravelRoleFactorKey = tuple[ExaminerType, UUID]
TravelRoleFactorMap = dict[TravelRoleFactorKey, Decimal | None]

TRegionMapValue = TypeVar("TRegionMapValue")

_ALLOWANCE_FIELD_BY_TYPE: dict[ExaminerAllowanceType, str] = {
    ExaminerAllowanceType.RESPONSIBILITY: "responsibility_allowance_ghs",
    ExaminerAllowanceType.INCONVENIENCE: "inconvenience_allowance_ghs",
    ExaminerAllowanceType.CHIEF_EXAMINERS_REPORT: "chief_examiners_report_ghs",
    ExaminerAllowanceType.VETTING_OF_SCRIPTS: "vetting_of_scripts_ghs",
    ExaminerAllowanceType.INTERNAL_COMMUTING: "internal_commuting_ghs",
}


def _to_decimal(value: object | None) -> Decimal | None:
    if value is None:
        return None
    return cast(Decimal, value)


def _amount_or_zero(value: Decimal | None) -> Decimal:
    return value if value is not None else Decimal("0")


def _factor_or_one(value: Decimal | None) -> Decimal:
    return value if value is not None else Decimal("1")


def parse_examiner_type_stored(raw: object) -> ExaminerType:
    if isinstance(raw, ExaminerType):
        return raw
    text = str(raw).strip()
    for member in ExaminerType:
        if member.value == text or member.name == text:
            return member
    raise ValueError(f"Invalid examiner type (expected one of: {all_examiner_type_labels()})")


def examiner_type_from_api_label(label: str) -> ExaminerType:
    return parse_examiner_type_stored(label)


def allowance_type_from_api_label(label: str) -> ExaminerAllowanceType:
    raw = label.strip()
    for member in ExaminerAllowanceType:
        if member.value == raw:
            return member
    raise ValueError(f"Invalid allowance type (expected one of: {all_allowance_type_labels()})")


def all_examiner_type_labels() -> list[str]:
    return [member.value for member in ExaminerType]


def all_allowance_type_labels() -> list[str]:
    return [member.value for member in ExaminerAllowanceType]


def allowance_type_label(allowance_type: ExaminerAllowanceType) -> str:
    labels = {
        ExaminerAllowanceType.RESPONSIBILITY: "Responsibility allowance",
        ExaminerAllowanceType.INCONVENIENCE: "Inconvenience allowance",
        ExaminerAllowanceType.CHIEF_EXAMINERS_REPORT: "Chief Examiner's Report",
        ExaminerAllowanceType.VETTING_OF_SCRIPTS: "Vetting of Scripts",
        ExaminerAllowanceType.INTERNAL_COMMUTING: "Internal Commuting",
    }
    return labels[allowance_type]


def examiner_type_str(examiner_type: object) -> str:
    if isinstance(examiner_type, ExaminerType):
        return examiner_type.value
    return str(examiner_type)


def region_str(region: object) -> str:
    if isinstance(region, Region):
        return region.value
    return str(region)


def parse_region_stored(raw: object) -> Region:
    if isinstance(raw, Region):
        return raw
    text = str(raw).strip()
    for member in Region:
        if member.value == text or member.name == text:
            return member
    for member in Region:
        if member.value.lower() == text.lower():
            return member
    raise ValueError(f"Unknown region: {text!r}")


def subject_display(subject: Subject | None) -> tuple[str, str]:
    if subject is None:
        return "", ""
    code = (subject.original_code or subject.code or "").strip()
    name = (subject.name or "").strip()
    return code, name


async def load_role_allowance_rates_map(
    session: AsyncSession,
    examination_id: int,
) -> RoleAllowanceMap:
    stmt = select(ExaminationExaminerRoleAllowanceRate).where(
        ExaminationExaminerRoleAllowanceRate.examination_id == examination_id,
    )
    result = await session.execute(stmt)
    out: RoleAllowanceMap = {}
    for row in result.scalars().all():
        et = parse_examiner_type_stored(row.examiner_type)
        at = row.allowance_type
        if not isinstance(at, ExaminerAllowanceType):
            at = ExaminerAllowanceType(str(at))
        out[(et, at)] = _to_decimal(row.amount_ghs)
    return out


async def load_marking_rates_map(
    session: AsyncSession,
    examination_id: int,
) -> MarkingRateMap:
    stmt = select(ExaminationExaminerMarkingRate).where(
        ExaminationExaminerMarkingRate.examination_id == examination_id,
    )
    result = await session.execute(stmt)
    out: MarkingRateMap = {}
    for row in result.scalars().all():
        out[(int(row.subject_id), int(row.paper_number))] = _to_decimal(row.rate_per_script_ghs)
    return out


async def load_travel_rates_map(
    session: AsyncSession,
    examination_id: int,
) -> TravelRateMap:
    stmt = select(ExaminationExaminerTravelRate).where(
        ExaminationExaminerTravelRate.examination_id == examination_id,
    )
    result = await session.execute(stmt)
    out: TravelRateMap = {}
    for row in result.scalars().all():
        region = parse_region_stored(row.region)
        out[region] = _to_decimal(row.amount_ghs)
    return out


async def load_travel_zones_map(
    session: AsyncSession,
    examination_id: int,
) -> tuple[TravelZoneMap, TravelZoneNameMap]:
    zone_stmt = select(ExaminationExaminerTravelZone).where(
        ExaminationExaminerTravelZone.examination_id == examination_id,
    )
    zone_result = await session.execute(zone_stmt)
    zone_names: TravelZoneNameMap = {}
    for zone in zone_result.scalars().all():
        zone_names[zone.id] = str(zone.name)

    region_stmt = select(ExaminationExaminerTravelZoneRegion).where(
        ExaminationExaminerTravelZoneRegion.examination_id == examination_id,
    )
    region_result = await session.execute(region_stmt)
    region_to_zone: TravelZoneMap = {}
    for row in region_result.scalars().all():
        region = parse_region_stored(row.region)
        region_to_zone[region] = row.zone_id
    return region_to_zone, zone_names


async def load_travel_role_factors_map(
    session: AsyncSession,
    examination_id: int,
) -> TravelRoleFactorMap:
    stmt = select(ExaminationExaminerTravelRoleFactor).where(
        ExaminationExaminerTravelRoleFactor.examination_id == examination_id,
    )
    result = await session.execute(stmt)
    out: TravelRoleFactorMap = {}
    for row in result.scalars().all():
        et = parse_examiner_type_stored(row.examiner_type)
        out[(et, row.zone_id)] = _to_decimal(row.factor)
    return out


def _lookup_map_by_region(map: dict[Region, TRegionMapValue], region: Region) -> TRegionMapValue | None:
    """Resolve travel maps even when region keys were built from mixed DB representations."""
    if region in map:
        return map[region]
    for key, value in map.items():
        if isinstance(key, Region) and key.value == region.value:
            return value
        if isinstance(key, str):
            try:
                if parse_region_stored(key) == region:
                    return value
            except ValueError:
                continue
    return None


def compute_travel_compensation(
    *,
    region: object,
    examiner_type: object,
    travel_rates: TravelRateMap,
    travel_zones: TravelZoneMap,
    travel_zone_names: TravelZoneNameMap,
    travel_role_factors: TravelRoleFactorMap,
) -> TravelCompensation:
    """T&T payable = regional base amount × role factor for the examiner's zone (default 1)."""
    parsed_region = parse_region_stored(region)
    parsed_type = parse_examiner_type_stored(examiner_type)
    travel_base = _amount_or_zero(_lookup_map_by_region(travel_rates, parsed_region))
    zone_id = _lookup_map_by_region(travel_zones, parsed_region)
    travel_zone_name = travel_zone_names.get(zone_id) if zone_id is not None else None
    factor_raw = travel_role_factors.get((parsed_type, zone_id)) if zone_id is not None else None
    travel_factor = _factor_or_one(factor_raw)
    travel = travel_base * travel_factor
    return TravelCompensation(
        base_ghs=travel_base,
        zone_name=travel_zone_name,
        role_factor=travel_factor,
        payable_ghs=travel,
    )


def _lookup_role_amount(
    rates: RoleAllowanceMap,
    examiner_type: ExaminerType,
    allowance_type: ExaminerAllowanceType,
) -> Decimal | None:
    return rates.get((examiner_type, allowance_type))


def compensation_for_examiner(
    examiner: Examiner,
    role_rates: RoleAllowanceMap,
    marking_rates: MarkingRateMap,
    travel_rates: TravelRateMap,
    travel_zones: TravelZoneMap,
    travel_zone_names: TravelZoneNameMap,
    travel_role_factors: TravelRoleFactorMap,
    allocated_booklets: AllocatedBookletsMap,
) -> ComputedExaminerCompensation:
    examiner_type = parse_examiner_type_stored(examiner.examiner_type)

    role_totals = {field: Decimal("0") for field in _ALLOWANCE_FIELD_BY_TYPE.values()}
    for allowance_type in ExaminerAllowanceType:
        raw = _lookup_role_amount(role_rates, examiner_type, allowance_type)
        amount = _amount_or_zero(raw)
        field = _ALLOWANCE_FIELD_BY_TYPE[allowance_type]
        role_totals[field] = amount

    subject_by_id: dict[int, Subject | None] = {}
    for link in examiner.subjects:
        subject_by_id[int(link.subject_id)] = link.subject

    subject_paper_keys: set[tuple[int, int]] = set()
    for (ex_id, subject_id, paper_number), count in allocated_booklets.items():
        if ex_id == examiner.id and count > 0:
            subject_paper_keys.add((subject_id, paper_number))

    marking_total = Decimal("0")
    total_allocated_scripts = 0
    subject_breakdowns: list[SubjectMarkingBreakdown] = []

    for subject_id, paper_number in sorted(subject_paper_keys):
        booklets = allocated_booklets.get((examiner.id, subject_id, paper_number), 0)
        if booklets <= 0:
            continue
        total_allocated_scripts += booklets
        rate_raw = marking_rates.get((subject_id, paper_number))
        rate_amount = _amount_or_zero(rate_raw)
        marking_amount = rate_amount * Decimal(booklets)
        marking_total += marking_amount

        subject = subject_by_id.get(subject_id)
        code, name = subject_display(subject)
        subject_breakdowns.append(
            SubjectMarkingBreakdown(
                subject_id=subject_id,
                subject_code=code,
                subject_name=name,
                paper_number=paper_number,
                allocated_booklets=booklets,
                rate_per_script_ghs=rate_raw,
                marking_allowance_ghs=marking_amount,
            )
        )

    travel_comp = compute_travel_compensation(
        region=examiner.region,
        examiner_type=examiner_type,
        travel_rates=travel_rates,
        travel_zones=travel_zones,
        travel_zone_names=travel_zone_names,
        travel_role_factors=travel_role_factors,
    )

    marking_net, marking_tax = withholding_tax(marking_total)
    vetting_gross = role_totals["vetting_of_scripts_ghs"]
    vetting_net, vetting_tax = withholding_tax(vetting_gross)

    payout_travel_commuting = role_totals["internal_commuting_ghs"] + travel_comp.payable_ghs
    payout_allowances_marking = (
        role_totals["responsibility_allowance_ghs"]
        + role_totals["inconvenience_allowance_ghs"]
        + role_totals["chief_examiners_report_ghs"]
        + marking_net
        + vetting_net
    )
    total_payable = payout_travel_commuting + payout_allowances_marking

    return ComputedExaminerCompensation(
        responsibility_allowance_ghs=role_totals["responsibility_allowance_ghs"],
        inconvenience_allowance_ghs=role_totals["inconvenience_allowance_ghs"],
        chief_examiners_report_ghs=role_totals["chief_examiners_report_ghs"],
        vetting_of_scripts_ghs=vetting_gross,
        internal_commuting_ghs=role_totals["internal_commuting_ghs"],
        marking_allowance_ghs=marking_total,
        travel_base_ghs=travel_comp.base_ghs,
        travel_zone_name=travel_comp.zone_name,
        travel_role_factor=travel_comp.role_factor,
        travel_and_transport_ghs=travel_comp.payable_ghs,
        total_allocated_scripts=total_allocated_scripts,
        marking_withholding_tax_ghs=marking_tax,
        marking_net_ghs=marking_net,
        vetting_withholding_tax_ghs=vetting_tax,
        vetting_net_ghs=vetting_net,
        payout_travel_commuting_ghs=payout_travel_commuting,
        payout_allowances_marking_ghs=payout_allowances_marking,
        total_payable_ghs=total_payable,
        subject_breakdowns=subject_breakdowns,
    )


async def load_examiners_with_relations(
    session: AsyncSession,
    examination_id: int,
    *,
    examiner_id: UUID | None = None,
) -> list[Examiner]:
    stmt = (
        select(Examiner)
        .where(Examiner.examination_id == examination_id)
        .options(
            selectinload(Examiner.subjects).selectinload(ExaminerSubject.subject),
            selectinload(Examiner.bank_account).selectinload(ExaminerBankAccount.bank_branch),
        )
        .order_by(Examiner.name.asc())
    )
    if examiner_id is not None:
        stmt = stmt.where(Examiner.id == examiner_id)
    result = await session.execute(stmt)
    return list(result.scalars().all())


def format_ghs_amount(value: Decimal | None) -> str:
    if value is None:
        return ""
    return f"{value:.2f}"
