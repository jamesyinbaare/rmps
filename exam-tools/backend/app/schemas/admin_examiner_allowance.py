"""Admin listing of examiner allowances for finance."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.bank_branch import normalize_bank_code_for_api
from app.schemas.examination_examiner_allowance_rate import SubjectMarkingBreakdownRow


class ExaminerPayoutAdjustmentRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID | None = None
    description: str
    amount_ghs: Decimal
    is_taxable: bool
    tax_ghs: Decimal
    net_ghs: Decimal
    source: str = "examiner"
    group_name: str | None = None


class AdminExaminerAllowanceRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    examination_id: int
    examination_label: str
    full_name: str
    reference_code: str | None = None
    examiner_type: str
    region: str
    subject_codes: str
    subject_names: str
    bank_branch_id: UUID | None = None
    bank_code: str | None = None
    bank_name: str | None = None
    branch_name: str | None = None
    account_number: str | None = None
    phone_number: str | None = None
    roster_source: str
    chief_examiners_report_count: int = 1
    reporting_allowance_enabled: bool = False
    num_days: int | None = None
    payout_description: str | None = None
    paper_1_script_count: int = 0
    paper_2_script_count: int = 0
    responsibility_allowance_ghs: Decimal
    inconvenience_allowance_ghs: Decimal
    chief_examiners_report_ghs: Decimal
    vetting_of_scripts_ghs: Decimal
    internal_commuting_ghs: Decimal
    sitting_allowance_ghs: Decimal
    sitting_daily_rate_ghs: Decimal
    sitting_num_days: int = 0
    sitting_withholding_tax_ghs: Decimal
    sitting_net_ghs: Decimal
    marking_allowance_ghs: Decimal
    travel_base_ghs: Decimal
    travel_zone_name: str | None = None
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
    subject_breakdowns: list[SubjectMarkingBreakdownRow]
    allowance_group_ids: list[UUID] = []
    allowance_group_names: list[str] = []
    payout_adjustments: list[ExaminerPayoutAdjustmentRow] = []
    adjustments_gross_ghs: Decimal = Decimal("0")
    adjustments_tax_ghs: Decimal = Decimal("0")
    adjustments_net_ghs: Decimal = Decimal("0")
    created_at: datetime
    updated_at: datetime

    @field_validator("bank_code", mode="before")
    @classmethod
    def _bank_code_as_text(cls, v: object) -> str | None:
        if v is None:
            return None
        return normalize_bank_code_for_api(v)


class AdminExaminerAllowanceListResponse(BaseModel):
    items: list[AdminExaminerAllowanceRow]
    total: int
