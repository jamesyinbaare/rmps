"""Schemas for school invoice generation."""

from decimal import Decimal
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ProgrammeInvoiceItem(BaseModel):
    """Schema for programme-level invoice item."""

    programme_id: int
    programme_code: str
    programme_name: str
    candidate_count: int
    total_amount: Decimal

    class Config:
        from_attributes = True


class ExaminationInvoiceItem(BaseModel):
    """Schema for examination-level invoice item."""

    exam_id: int
    exam_type: str
    exam_series: Optional[str] = None
    year: int
    candidate_count: int
    total_amount: Decimal
    programmes: Optional[list[ProgrammeInvoiceItem]] = None  # Only present when grouped by programme

    class Config:
        from_attributes = True


class SchoolInvoiceItem(BaseModel):
    """Schema for school-level invoice item in summary."""

    school_id: int
    school_code: str
    school_name: str
    candidate_count: int
    total_amount: Decimal

    class Config:
        from_attributes = True


class SchoolInvoiceResponse(BaseModel):
    """Schema for school invoice response."""

    school_id: int
    school_code: str
    school_name: str
    registration_type: str  # "free_tvet" or "referral"
    examination: ExaminationInvoiceItem
    generated_at: datetime

    class Config:
        from_attributes = True


class AdminSummaryInvoiceResponse(BaseModel):
    """Schema for admin summary invoice response (all schools)."""

    registration_type: str  # "free_tvet" or "referral"
    examination: ExaminationInvoiceItem
    schools: list[SchoolInvoiceItem]
    total_candidate_count: int
    total_amount: Decimal
    generated_at: datetime

    class Config:
        from_attributes = True
