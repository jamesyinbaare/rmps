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
from app.services.examiner_allowance_export import (
    allocated_scripts_for_scope,
    bank_account_incomplete,
    paper_numbers_for_export,
    scripts_for_paper,
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


def include_script_paper_columns(mode: ExaminerBogPayoutMode) -> bool:
    """T&T-only BoG files stay bank-oriented without allocation columns."""
    return mode != ExaminerBogPayoutMode.TRAVEL_COMMUTING


def bog_rows_from_admin_items(
    items: list[AdminExaminerAllowanceRow],
    mode: ExaminerBogPayoutMode = ExaminerBogPayoutMode.ALL,
    *,
    subject_id: int | None = None,
    paper_numbers: list[int] | None = None,
) -> list[BogExportRow]:
    rows: list[BogExportRow] = []
    serial = 0
    papers = list(paper_numbers or [])
    attach_scripts = include_script_paper_columns(mode)
    sorted_items = sorted(items, key=lambda r: (r.examiner_type, r.full_name.lower()))
    for item in sorted_items:
        account = (item.account_number or "").strip()
        sort_code = (item.bank_code or "").strip()
        amount = payout_amount_for_mode(item, mode)
        if amount < 0:
            amount = Decimal("0")
        serial += 1
        allocated = None
        paper_counts: tuple[int, ...] = ()
        if attach_scripts:
            allocated = allocated_scripts_for_scope(item, subject_id=subject_id)
            paper_counts = tuple(scripts_for_paper(item, p, subject_id=subject_id) for p in papers)
        rows.append(
            BogExportRow(
                serial=f"{serial:06d}",
                sort_code=sort_code,
                account_number=account,
                full_name=_bog_display_name(item.full_name),
                designation=_role_label(item.examiner_type),
                amount=amount,
                phone_number=(item.phone_number or "").strip(),
                incomplete_bank=bank_account_incomplete(item),
                reference_code=(item.reference_code or "").strip(),
                allocated_scripts=allocated,
                paper_script_counts=paper_counts,
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
    subject_id: int | None = None,
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
    papers: list[int] = []
    if include_script_paper_columns(mode):
        papers = paper_numbers_for_export(items, subject_id=subject_id)
    rows = bog_rows_from_admin_items(
        items,
        mode,
        subject_id=subject_id,
        paper_numbers=papers,
    )
    return bog_workbook_bytes(
        [],
        {},
        title=title,
        prebuilt_rows=rows,
        include_phone=True,
        script_paper_numbers=papers if include_script_paper_columns(mode) else None,
    )


def examiner_bog_export_filename(exam_part: str, mode: ExaminerBogPayoutMode = ExaminerBogPayoutMode.ALL) -> str:
    return exam_bog_export_filename(exam_part, _MODE_FILENAME_SLUGS[mode])
