"""Pydantic schemas for script checkers and data entry clerks."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.bank_branch import normalize_bank_code_for_api


class WorkforceAssignmentBatchStatusSchema(StrEnum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class WorkforceAvailabilityStatusSchema(StrEnum):
    pending = "pending"
    confirmed = "confirmed"
    declined = "declined"


class WorkforceRosterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone_number: str | None = Field(default=None, max_length=50)
    region: str | None = None
    reference_code: str | None = Field(default=None, max_length=64)


class WorkforceRosterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    phone_number: str | None = Field(default=None, max_length=50)
    region: str | None = None
    reference_code: str | None = Field(default=None, max_length=64)


class WorkforceRosterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    examination_id: int
    name: str
    phone_number: str | None
    region: str | None
    reference_code: str | None
    portal_url: str
    portal_invite_sms_sent_at: datetime | None
    availability_status: WorkforceAvailabilityStatusSchema
    availability_responded_at: datetime | None
    availability_deadline: datetime | None
    has_bank_account: bool
    created_at: datetime
    updated_at: datetime


class WorkforceBulkInviteSmsRequest(BaseModel):
    ids: list[UUID] = Field(min_length=1)


class WorkforceInviteSmsResult(BaseModel):
    id: UUID
    sent: bool
    error: str | None = None


class WorkforceBulkInviteSmsResponse(BaseModel):
    results: list[WorkforceInviteSmsResult]
    sent_count: int
    failed_count: int


class WorkforceAssignmentBatchRow(BaseModel):
    id: UUID
    examination_id: int
    subject_id: int
    paper_number: int
    script_count: int
    status: WorkforceAssignmentBatchStatusSchema
    batch_sequence: int
    assigned_at: datetime
    assigned_by_user_id: UUID | None
    completed_at: datetime | None
    completed_by_user_id: UUID | None


class WorkforceAssignmentPersonRow(BaseModel):
    id: UUID
    name: str
    reference_code: str | None
    phone_number: str | None
    availability_status: WorkforceAvailabilityStatusSchema
    has_bank_account: bool
    active_batch: WorkforceAssignmentBatchRow | None
    assigned_total: int
    completed_total: int
    uncompleted_total: int
    batches: list[WorkforceAssignmentBatchRow]


class WorkforceAssignmentGridResponse(BaseModel):
    examination_id: int
    subject_id: int
    paper_number: int
    items: list[WorkforceAssignmentPersonRow]


class WorkforceAssignmentRosterResponse(BaseModel):
    examination_id: int
    items: list[WorkforceAssignmentPersonRow]


class WorkforceAssignmentBatchCreate(BaseModel):
    person_id: UUID
    script_count: int = Field(ge=1)


class WorkforceRatesPut(BaseModel):
    rate_per_script_ghs: Decimal = Field(ge=0)
    commuting_allowance_ghs: Decimal = Field(default=Decimal("0"), ge=0)
    lunch_allowance_ghs: Decimal = Field(default=Decimal("0"), ge=0)
    withholding_tax_percent: Decimal = Field(default=Decimal("10"), ge=0, le=100)


class WorkforceRatesResponse(BaseModel):
    examination_id: int
    rate_per_script_ghs: Decimal | None = None
    commuting_allowance_ghs: Decimal | None = None
    lunch_allowance_ghs: Decimal | None = None
    withholding_tax_percent: Decimal = Field(default=Decimal("10"))


class WorkforcePayoutCompletedBatchLine(BaseModel):
    subject_id: int
    subject_code: str | None
    subject_name: str | None
    paper_number: int
    script_count: int
    batch_sequence: int


class WorkforcePayoutRow(BaseModel):
    id: UUID
    examination_id: int
    examination_label: str
    full_name: str
    reference_code: str | None
    phone_number: str | None
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
    has_rate: bool
    payable_ghs: Decimal
    completed_batch_lines: list[WorkforcePayoutCompletedBatchLine] = Field(default_factory=list)
    bank_branch_id: UUID | None
    bank_code: str | None
    bank_name: str | None
    branch_name: str | None
    account_number: str | None
    has_bank_account: bool

    @field_validator("bank_code", mode="before")
    @classmethod
    def _bank_code_as_text(cls, v: Any) -> str | None:
        if v is None:
            return None
        return normalize_bank_code_for_api(v)


class WorkforcePayoutListResponse(BaseModel):
    items: list[WorkforcePayoutRow]
    total: int


class WorkforcePublicBatchRow(BaseModel):
    id: UUID
    subject_id: int
    subject_code: str | None
    subject_name: str | None
    paper_number: int
    script_count: int
    status: WorkforceAssignmentBatchStatusSchema
    batch_sequence: int
    assigned_at: datetime
    completed_at: datetime | None


class WorkforcePublicPortalResponse(BaseModel):
    id: UUID
    name: str
    examination_id: int
    examination_label: str
    reference_code: str | None
    region: str | None = None
    role_label: str
    availability_status: WorkforceAvailabilityStatusSchema
    availability_responded_at: datetime | None
    availability_deadline: datetime | None
    can_respond: bool
    active_batches: list[WorkforcePublicBatchRow]
    completed_batches: list[WorkforcePublicBatchRow]
    has_bank_account: bool


class WorkforceAvailabilityActionResponse(BaseModel):
    status: WorkforceAvailabilityStatusSchema
    message: str


class WorkforceBankAccountUpsert(BaseModel):
    bank_branch_id: UUID
    account_number: str = Field(min_length=1, max_length=32)


class WorkforceBankAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    person_id: UUID
    bank_branch_id: UUID
    bank_code: str
    bank_name: str
    branch_name: str
    account_number: str
    created_at: datetime
    updated_at: datetime

    @field_validator("bank_code", mode="before")
    @classmethod
    def _bank_code_as_text(cls, v: Any) -> str:
        return normalize_bank_code_for_api(v)
