"""Bank of Ghana (BoG) payment Excel export for examiner allowances."""

from __future__ import annotations

from app.models import Examiner, Examination, ExaminerType
from app.schemas.admin_examiner_allowance import AdminExaminerAllowanceRow
from app.services.exam_official_bog_export import (
    BogExportRow,
    bog_workbook_bytes,
    exam_bog_export_filename,
)
from app.services.examiner_allowance_list import examiner_to_admin_row
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


def _bog_display_name(raw: str) -> str:
    return raw.strip().upper()


def _role_label(examiner_type: str) -> str:
    try:
        return _examiner_type_label(ExaminerType(examiner_type))
    except ValueError:
        return examiner_type


def bog_rows_from_admin_items(items: list[AdminExaminerAllowanceRow]) -> list[BogExportRow]:
    rows: list[BogExportRow] = []
    serial = 0
    sorted_items = sorted(items, key=lambda r: (r.examiner_type, r.full_name.lower()))
    for item in sorted_items:
        account = (item.account_number or "").strip()
        sort_code = (item.bank_code or "").strip()
        if not account or not sort_code:
            continue
        if item.total_payable_ghs <= 0:
            continue
        serial += 1
        rows.append(
            BogExportRow(
                serial=f"{serial:06d}",
                sort_code=sort_code,
                account_number=account,
                full_name=_bog_display_name(item.full_name),
                designation=_role_label(item.examiner_type),
                amount=item.total_payable_ghs,
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
    *,
    title: str,
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
        )
        for ex in examiners
    ]
    rows = bog_rows_from_admin_items(items)
    return bog_workbook_bytes([], {}, title=title, prebuilt_rows=rows)


def examiner_bog_export_filename(exam_part: str) -> str:
    return exam_bog_export_filename(exam_part, "examiners")
