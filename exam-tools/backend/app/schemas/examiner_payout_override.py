"""Schemas for payout-override examiner bulk upload and payout settings."""

from decimal import Decimal

from pydantic import BaseModel, Field


class ExaminerPayoutOverrideBulkImportRowError(BaseModel):
    row_number: int
    message: str


class ExaminerPayoutOverrideBulkImportResponse(BaseModel):
    created_count: int
    updated_count: int
    errors: list[ExaminerPayoutOverrideBulkImportRowError] = Field(default_factory=list)


class ExaminerPayoutAdjustmentUpdate(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    amount_ghs: Decimal = Field(gt=0)
    is_taxable: bool = False


class ExaminerPayoutSettingsUpdate(BaseModel):
    chief_examiners_report_count: int | None = Field(default=None, ge=0)
    reporting_allowance_enabled: bool | None = None
    description: str | None = Field(default=None, max_length=200)
    paper_1_script_count: int | None = Field(default=None, ge=0)
    paper_2_script_count: int | None = Field(default=None, ge=0)
    payout_adjustments: list[ExaminerPayoutAdjustmentUpdate] | None = None
