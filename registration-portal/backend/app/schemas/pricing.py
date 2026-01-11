"""Schemas for registration pricing management."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.subject import SubjectResponse


class ApplicationFeeResponse(BaseModel):
    """Schema for application fee response."""

    id: int
    exam_id: int | None
    fee: Decimal
    currency: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ApplicationFeeCreate(BaseModel):
    """Schema for creating/updating application fee."""

    fee: Decimal = Field(..., gt=0, description="Application fee amount")
    currency: str = Field(default="GHS", max_length=3)
    is_active: bool = Field(default=True)


class SubjectPricingResponse(BaseModel):
    """Schema for subject pricing response."""

    id: int
    subject_id: int
    exam_id: int | None
    price: Decimal
    currency: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    subject: SubjectResponse

    class Config:
        from_attributes = True


class SubjectPricingCreate(BaseModel):
    """Schema for creating/updating subject pricing."""

    subject_id: int
    price: Decimal = Field(..., gt=0, description="Price for the subject")
    currency: str = Field(default="GHS", max_length=3)
    is_active: bool = Field(default=True)


class SubjectPricingBulkUpdate(BaseModel):
    """Schema for bulk updating subject pricing."""

    pricing: list[SubjectPricingCreate] = Field(..., min_length=1)


class TieredPricingResponse(BaseModel):
    """Schema for tiered pricing response."""

    id: int
    exam_id: int | None
    min_subjects: int
    max_subjects: int | None
    price: Decimal
    currency: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TieredPricingCreate(BaseModel):
    """Schema for creating/updating tiered pricing."""

    min_subjects: int = Field(..., ge=1, description="Minimum number of subjects")
    max_subjects: int | None = Field(None, ge=1, description="Maximum number of subjects (None for unlimited)")
    price: Decimal = Field(..., gt=0, description="Price for this tier")
    currency: str = Field(default="GHS", max_length=3)
    is_active: bool = Field(default=True)


class TieredPricingBulkUpdate(BaseModel):
    """Schema for bulk updating tiered pricing."""

    pricing: list[TieredPricingCreate] = Field(..., min_length=1)


class ExamPricingResponse(BaseModel):
    """Schema for complete exam pricing response."""

    exam_id: int
    application_fee: ApplicationFeeResponse | None
    subject_pricing: list[SubjectPricingResponse]
    tiered_pricing: list[TieredPricingResponse]


class ImportPricingRequest(BaseModel):
    """Schema for importing pricing from another exam."""

    source_exam_id: int = Field(..., description="ID of the exam to import pricing from")
    import_application_fee: bool = Field(default=True, description="Import application fee")
    import_subject_pricing: bool = Field(default=True, description="Import subject pricing")
    import_tiered_pricing: bool = Field(default=True, description="Import tiered pricing")
