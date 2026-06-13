"""Build admin examiner allowance rows for finance views."""

from __future__ import annotations

from datetime import datetime
from typing import cast

from app.models import Examiner, Examination, MarkingScriptSourceMode
from app.schemas.admin_examiner_allowance import AdminExaminerAllowanceRow
from app.schemas.examination_examiner_allowance_rate import SubjectMarkingBreakdownRow
from app.services.exam_official_export import examination_label
from app.services.examiner_allocated_booklets import (
    AllocatedBookletsMap,
    _is_manual_marking_source_mode,
)
from app.services.examiner_compensation import (
    ComputedExaminerCompensation,
    MarkingRateMap,
    RoleAllowanceMap,
    TravelRateMap,
    TravelRoleFactorMap,
    TravelZoneMap,
    TravelZoneNameMap,
    compensation_for_examiner,
    examiner_type_str,
    region_str,
    subject_display,
)


def _subject_labels(examiner: Examiner) -> tuple[str, str]:
    codes: list[str] = []
    names: list[str] = []
    for link in examiner.subjects:
        code, name = subject_display(link.subject)
        if code:
            codes.append(code)
        if name:
            names.append(name)
    return ", ".join(codes), ", ".join(names)


MarkingScriptSourceModes = dict[int, MarkingScriptSourceMode]


def _script_source_for_subject(
    source_modes: MarkingScriptSourceModes | None,
    subject_id: int,
) -> str:
    if source_modes and _is_manual_marking_source_mode(source_modes.get(subject_id)):
        return "manual"
    return "allocation"


def _breakdown_rows(
    comp: ComputedExaminerCompensation,
    source_modes: MarkingScriptSourceModes | None = None,
) -> list[SubjectMarkingBreakdownRow]:
    return [
        SubjectMarkingBreakdownRow(
            subject_id=row.subject_id,
            subject_code=row.subject_code,
            subject_name=row.subject_name,
            paper_number=row.paper_number,
            allocated_booklets=row.allocated_booklets,
            rate_per_script_ghs=row.rate_per_script_ghs,
            marking_allowance_ghs=row.marking_allowance_ghs,
            script_source=_script_source_for_subject(source_modes, row.subject_id),
        )
        for row in comp.subject_breakdowns
    ]


def examiner_to_admin_row(
    examiner: Examiner,
    examination: Examination,
    role_rates: RoleAllowanceMap,
    marking_rates: MarkingRateMap,
    travel_rates: TravelRateMap,
    travel_zones: TravelZoneMap,
    travel_zone_names: TravelZoneNameMap,
    travel_role_factors: TravelRoleFactorMap,
    allocated_booklets: AllocatedBookletsMap,
    source_modes: MarkingScriptSourceModes | None = None,
) -> AdminExaminerAllowanceRow:
    comp = compensation_for_examiner(
        examiner,
        role_rates,
        marking_rates,
        travel_rates,
        travel_zones,
        travel_zone_names,
        travel_role_factors,
        allocated_booklets,
    )
    subject_codes, subject_names = _subject_labels(examiner)
    bank = examiner.bank_account
    bank_branch = bank.bank_branch if bank is not None else None
    return AdminExaminerAllowanceRow(
        id=examiner.id,
        examination_id=int(examination.id),
        examination_label=examination_label(examination),
        full_name=cast(str, examiner.name),
        reference_code=cast(str, examiner.reference_code) if examiner.reference_code else None,
        examiner_type=examiner_type_str(examiner.examiner_type),
        region=region_str(examiner.region),
        subject_codes=subject_codes,
        subject_names=subject_names,
        bank_branch_id=bank.bank_branch_id if bank is not None else None,
        bank_code=cast(str, bank_branch.bank_code) if bank_branch is not None else None,
        bank_name=cast(str, bank_branch.bank_name) if bank_branch is not None else None,
        branch_name=cast(str, bank_branch.branch_name) if bank_branch is not None else None,
        account_number=cast(str, bank.account_number) if bank is not None else None,
        phone_number=cast(str, examiner.phone_number) if examiner.phone_number else None,
        responsibility_allowance_ghs=comp.responsibility_allowance_ghs,
        inconvenience_allowance_ghs=comp.inconvenience_allowance_ghs,
        chief_examiners_report_ghs=comp.chief_examiners_report_ghs,
        vetting_of_scripts_ghs=comp.vetting_of_scripts_ghs,
        internal_commuting_ghs=comp.internal_commuting_ghs,
        marking_allowance_ghs=comp.marking_allowance_ghs,
        travel_base_ghs=comp.travel_base_ghs,
        travel_zone_name=comp.travel_zone_name,
        travel_role_factor=comp.travel_role_factor,
        travel_and_transport_ghs=comp.travel_and_transport_ghs,
        total_allocated_scripts=comp.total_allocated_scripts,
        marking_withholding_tax_ghs=comp.marking_withholding_tax_ghs,
        marking_net_ghs=comp.marking_net_ghs,
        vetting_withholding_tax_ghs=comp.vetting_withholding_tax_ghs,
        vetting_net_ghs=comp.vetting_net_ghs,
        payout_travel_commuting_ghs=comp.payout_travel_commuting_ghs,
        payout_allowances_marking_ghs=comp.payout_allowances_marking_ghs,
        total_payable_ghs=comp.total_payable_ghs,
        subject_breakdowns=_breakdown_rows(comp, source_modes),
        created_at=cast(datetime, examiner.created_at),
        updated_at=cast(datetime, examiner.updated_at),
    )


def examiners_to_admin_rows(
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
) -> list[AdminExaminerAllowanceRow]:
    return [
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
