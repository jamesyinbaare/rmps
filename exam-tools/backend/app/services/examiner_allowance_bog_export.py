"""Bank of Ghana (BoG) payment Excel export for examiner allowances."""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum

from app.models import Examiner, Examination, ExaminerType
from app.schemas.admin_examiner_allowance import AdminExaminerAllowanceRow
from app.services.exam_official_bog_export import (
    BogExportRow,
    bog_workbook_bytes,
    exam_bog_export_filename,
)
from app.services.examiner_allowance_list import MarkingScriptSourceModes, examiner_to_admin_row
from app.services.examiner_allocated_booklets import AllocatedBookletsMap
from app.services.examiner_compensation import (
    MarkingRateMap,
    RoleAllowanceMap,
    TravelRateMap,
    TravelRoleFactorMap,
    TravelZoneMap,
    TravelZoneNameMap,
)
from app.services.examiner_invitation import _examiner_type_label


class ExaminerBogPayoutMode(StrEnum):
    TRAVEL_COMMUTING = "travel_commuting"
    ALLOWANCES_MARKING = "allowances_marking"
    ALL = "all"


_MODE_TITLES: dict[ExaminerBogPayoutMode, str] = {
    ExaminerBogPayoutMode.TRAVEL_COMMUTING: "T&T & commuting",
    ExaminerBogPayoutMode.ALLOWANCES_MARKING: "Allowances & marking",
    ExaminerBogPayoutMode.ALL: "All together",
}

_MODE_FILENAME_SLUGS: dict[ExaminerBogPayoutMode, str] = {
    ExaminerBogPayoutMode.TRAVEL_COMMUTING: "examiners_travel_commuting",
    ExaminerBogPayoutMode.ALLOWANCES_MARKING: "examiners_allowances_marking",
    ExaminerBogPayoutMode.ALL: "examiners",
}


def payout_amount_for_mode(item: AdminExaminerAllowanceRow, mode: ExaminerBogPayoutMode) -> Decimal:
    if mode == ExaminerBogPayoutMode.TRAVEL_COMMUTING:
        return item.payout_travel_commuting_ghs
    if mode == ExaminerBogPayoutMode.ALLOWANCES_MARKING:
        return item.payout_allowances_marking_ghs
    return item.total_payable_ghs


def bog_export_title(examination_label: str, mode: ExaminerBogPayoutMode) -> str:
    return f"BoG payment — {examination_label} — examiners — {_MODE_TITLES[mode]}"


def _bog_display_name(raw: str) -> str:
    return raw.strip().upper()


def _role_label(examiner_type: str) -> str:
    try:
        return _examiner_type_label(ExaminerType(examiner_type))
    except ValueError:
        return examiner_type


def bog_rows_from_admin_items(
    items: list[AdminExaminerAllowanceRow],
    mode: ExaminerBogPayoutMode = ExaminerBogPayoutMode.ALL,
) -> list[BogExportRow]:
    rows: list[BogExportRow] = []
    serial = 0
    sorted_items = sorted(items, key=lambda r: (r.examiner_type, r.full_name.lower()))
    for item in sorted_items:
        account = (item.account_number or "").strip()
        sort_code = (item.bank_code or "").strip()
        if not account or not sort_code:
            continue
        amount = payout_amount_for_mode(item, mode)
        if amount <= 0:
            continue
        serial += 1
        rows.append(
            BogExportRow(
                serial=f"{serial:06d}",
                sort_code=sort_code,
                account_number=account,
                full_name=_bog_display_name(item.full_name),
                designation=_role_label(item.examiner_type),
                amount=amount,
            )
        )
    return rows


def examiner_bog_workbook_bytes(
    examiners: list[Examiner],
    examination: Examination,
    role_rates: RoleAllowanceMap,
    marking_rates: MarkingRateMap,
    travel_rates: TravelRateMap,
    travel_zones: TravelZoneMap,
    travel_zone_names: TravelZoneNameMap,
    travel_role_factors: TravelRoleFactorMap,
    allocated_booklets: AllocatedBookletsMap,
    source_modes: MarkingScriptSourceModes | None = None,
    *,
    title: str,
    mode: ExaminerBogPayoutMode = ExaminerBogPayoutMode.ALL,
) -> bytes:
    items = [
        examiner_to_admin_row(
            ex,
            examination,
            role_rates,
            marking_rates,
            travel_rates,
            travel_zones,
            travel_zone_names,
            travel_role_factors,
            allocated_booklets,
            source_modes,
        )
        for ex in examiners
    ]
    rows = bog_rows_from_admin_items(items, mode)
    return bog_workbook_bytes([], {}, title=title, prebuilt_rows=rows)


def examiner_bog_export_filename(exam_part: str, mode: ExaminerBogPayoutMode = ExaminerBogPayoutMode.ALL) -> str:
    return exam_bog_export_filename(exam_part, _MODE_FILENAME_SLUGS[mode])
