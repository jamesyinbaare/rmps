"""Schemas for school fees & invoices management."""

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


PAYABLE_REGISTRATION_TYPES = ("fee_paying", "referral", "private")
ALL_INVOICE_REGISTRATION_TYPES = ("fee_paying", "referral", "private", "free_tvet")


class FeeTypeBreakdown(BaseModel):
    registration_type: str
    candidate_count: int
    amount_due: Decimal


class FeesSummaryResponse(BaseModel):
    school_id: Optional[int] = None
    exam_id: Optional[int] = None
    amount_due: Decimal
    unpaid_candidate_count: int
    by_type: list[FeeTypeBreakdown] = Field(default_factory=list)


class FeesExamSummaryItem(BaseModel):
    exam_id: int
    amount_due: Decimal
    unpaid_candidate_count: int


class FeesExamSummaryResponse(BaseModel):
    items: list[FeesExamSummaryItem] = Field(default_factory=list)


class FeeCandidateItem(BaseModel):
    id: int
    registration_number: str
    firstname: str
    lastname: str
    othername: Optional[str] = None
    registration_type: Optional[str] = None
    fee_payment_status: str
    programme_code: Optional[str] = None
    amount: Decimal
    on_open_invoice: bool = False
    open_invoice_number: Optional[str] = None
    open_invoice_status: Optional[str] = None
    open_invoice_amount: Optional[Decimal] = None

    class Config:
        from_attributes = True


class FeeCandidatesResponse(BaseModel):
    exam_id: int
    school_id: Optional[int] = None
    candidates: list[FeeCandidateItem]
    total_amount: Decimal
    total_count: int


class CreateSchoolFeeInvoiceRequest(BaseModel):
    exam_id: int
    school_id: Optional[int] = None  # required for admin; ignored for school users
    candidate_ids: Optional[list[int]] = None
    all_unpaid: bool = False
    registration_types: Optional[list[str]] = None  # used with all_unpaid
    allow_free_tvet: bool = False  # download-only invoices may include free_tvet


class SchoolFeeInvoiceItemResponse(BaseModel):
    id: int
    candidate_id: int
    amount: Decimal
    registration_number: Optional[str] = None
    candidate_name: Optional[str] = None
    registration_type: Optional[str] = None

    class Config:
        from_attributes = True


class BankDepositProofResponse(BaseModel):
    id: int
    school_registration_invoice_id: int
    file_name: str
    mime_type: str
    deposit_reference: Optional[str] = None
    deposited_amount: Optional[Decimal] = None
    status: str
    uploaded_by_user_id: Optional[UUID] = None
    reviewed_by_user_id: Optional[UUID] = None
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    invoice_number: Optional[str] = None
    school_id: Optional[int] = None
    school_name: Optional[str] = None
    exam_id: Optional[int] = None
    invoice_amount: Optional[Decimal] = None

    class Config:
        from_attributes = True


class SchoolFeeInvoiceResponse(BaseModel):
    id: int
    invoice_number: str
    school_id: int
    exam_id: int
    amount: Decimal
    currency: str
    status: str
    payment_method: Optional[str] = None
    linked_invoice_id: Optional[int] = None
    created_by_user_id: Optional[UUID] = None
    paid_at: Optional[datetime] = None
    confirmed_by_user_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    items: list[SchoolFeeInvoiceItemResponse] = Field(default_factory=list)
    bank_deposit_proofs: list[BankDepositProofResponse] = Field(default_factory=list)
    school_name: Optional[str] = None
    school_code: Optional[str] = None
    exam_type: Optional[str] = None
    exam_series: Optional[str] = None
    exam_year: Optional[int] = None
    reused: bool = False

    class Config:
        from_attributes = True


class PaystackPayResponse(BaseModel):
    authorization_url: str
    reference: str
    invoice_id: int
    school_registration_invoice_id: int


class RejectBankDepositRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=1000)
