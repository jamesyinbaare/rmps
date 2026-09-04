"""Build admin examiner allowance rows for finance views."""

from __future__ import annotations

from datetime import datetime
from typing import cast
from uuid import UUID

from app.models import Examiner, ExaminerPayoutOverride, Examination, MarkingScriptSourceMode
from app.schemas.admin_examiner_allowance import AdminExaminerAllowanceRow, ExaminerPayoutAdjustmentRow
from app.schemas.examination_examiner_allowance_rate import SubjectMarkingBreakdownRow
from app.services.exam_official_export import examination_label
from app.services.examiner_allocated_booklets import (
    AllocatedBookletsMap,
    _is_manual_marking_source_mode,
)
from app.services.examiner_allowance_groups import ExaminerEnabledKeysMap
from app.services.examiner_compensation import (
    ComputedExaminerCompensation,
    DefaultDaysMap,
    MarkingDefaults,
    MarkingRateMap,
    PayoutAdjustmentInput,
    RoleAllowanceMap,
    SittingRateMap,
    TravelRateMap,
    TravelRoleFactorMap,
    TravelZoneMap,
    TravelZoneNameMap,
    compensation_for_examiner,
    examiner_type_str,
    parse_examiner_type_stored,
    parse_roster_source_stored,
    region_str,
    subject_display,
)
from app.services.examiner_report_count import default_report_count
from app.services.examiner_roster_allowance_eligibility import EligibilityMap


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
    payout_overrides: dict | None = None,
    marking_defaults: MarkingDefaults | None = None,
    sitting_rates: SittingRateMap | None = None,
    default_days: DefaultDaysMap | None = None,
    roster_eligibility: EligibilityMap | None = None,
    group_eligibility: ExaminerEnabledKeysMap | None = None,
    allowance_group_ids: list[UUID] | None = None,
    allowance_group_names: list[str] | None = None,
    payout_adjustments: list[PayoutAdjustmentInput] | None = None,
) -> AdminExaminerAllowanceRow:
    adj_list = list(payout_adjustments or [])
    comp = compensation_for_examiner(
        examiner,
        role_rates,
        marking_rates,
        travel_rates,
        travel_zones,
        travel_zone_names,
        travel_role_factors,
        allocated_booklets,
        payout_override=(payout_overrides or {}).get(examiner.id),
        marking_defaults=marking_defaults,
        sitting_rates=sitting_rates,
        default_days=default_days,
        roster_eligibility=roster_eligibility,
        group_eligibility=group_eligibility,
        payout_adjustments=adj_list,
    )
    subject_codes, subject_names = _subject_labels(examiner)
    override = (payout_overrides or {}).get(examiner.id)
    payout_description: str | None = None
    paper_1_script_count = 0
    paper_2_script_count = 0
    if override is not None:
        payout_description = override.description
        paper_1_script_count = int(override.paper_1_script_count or 0)
        paper_2_script_count = int(override.paper_2_script_count or 0)
        if payout_description:
            subject_codes = ""
            subject_names = payout_description
        elif comp.subject_breakdowns and not subject_codes:
            subject_names = ", ".join(row.subject_name for row in comp.subject_breakdowns if row.subject_name)
    elif comp.subject_breakdowns and not subject_codes:
        subject_codes = ", ".join(row.subject_code for row in comp.subject_breakdowns if row.subject_code)
        subject_names = ", ".join(row.subject_name for row in comp.subject_breakdowns if row.subject_name)
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
        roster_source=parse_roster_source_stored(examiner.roster_source).value,
        chief_examiners_report_count=(
            int(examiner.chief_examiners_report_count)
            if examiner.chief_examiners_report_count is not None
            else default_report_count(parse_examiner_type_stored(examiner.examiner_type))
        ),
        reporting_allowance_enabled=bool(getattr(examiner, "reporting_allowance_enabled", False)),
        num_days=int(examiner.num_days) if getattr(examiner, "num_days", None) is not None else None,
        payout_description=payout_description,
        paper_1_script_count=paper_1_script_count,
        paper_2_script_count=paper_2_script_count,
        responsibility_allowance_ghs=comp.responsibility_allowance_ghs,
        inconvenience_allowance_ghs=comp.inconvenience_allowance_ghs,
        chief_examiners_report_ghs=comp.chief_examiners_report_ghs,
        vetting_of_scripts_ghs=comp.vetting_of_scripts_ghs,
        internal_commuting_ghs=comp.internal_commuting_ghs,
        sitting_allowance_ghs=comp.sitting_allowance_ghs,
        sitting_daily_rate_ghs=comp.sitting_daily_rate_ghs,
        sitting_num_days=comp.sitting_num_days,
        sitting_withholding_tax_ghs=comp.sitting_withholding_tax_ghs,
        sitting_net_ghs=comp.sitting_net_ghs,
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
        allowance_group_ids=list(allowance_group_ids or []),
        allowance_group_names=list(allowance_group_names or []),
        payout_adjustments=[
            ExaminerPayoutAdjustmentRow(
                id=line.id,
                description=line.description,
                amount_ghs=line.amount_ghs,
                is_taxable=line.is_taxable,
                tax_ghs=line.tax_ghs,
                net_ghs=line.net_ghs,
            )
            for line in comp.payout_adjustments
        ],
        adjustments_gross_ghs=comp.adjustments_gross_ghs,
        adjustments_tax_ghs=comp.adjustments_tax_ghs,
        adjustments_net_ghs=comp.adjustments_net_ghs,
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
    payout_overrides: dict | None = None,
    marking_defaults: MarkingDefaults | None = None,
    sitting_rates: SittingRateMap | None = None,
    default_days: DefaultDaysMap | None = None,
    roster_eligibility: EligibilityMap | None = None,
    group_eligibility: ExaminerEnabledKeysMap | None = None,
    examiner_custom_groups: dict[UUID, tuple[list[UUID], list[str]]] | None = None,
    payout_adjustments_by_examiner: dict[UUID, list[PayoutAdjustmentInput]] | None = None,
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
            source_modes=source_modes,
            payout_overrides=payout_overrides,
            marking_defaults=marking_defaults,
            sitting_rates=sitting_rates,
            default_days=default_days,
            roster_eligibility=roster_eligibility,
            group_eligibility=group_eligibility,
            allowance_group_ids=(examiner_custom_groups or {}).get(ex.id, ([], []))[0],
            allowance_group_names=(examiner_custom_groups or {}).get(ex.id, ([], []))[1],
            payout_adjustments=(payout_adjustments_by_examiner or {}).get(ex.id, []),
        )
        for ex in examiners
    ]
