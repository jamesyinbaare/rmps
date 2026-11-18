"""Schemas for registration pricing management."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.subject import SubjectResponse
from app.schemas.programme import ProgrammeResponse
from app.models import RegistrationType


class ApplicationFeeResponse(BaseModel):
    """Schema for application fee response."""

    id: int
    exam_id: int | None
    registration_type: str | None
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
    registration_type: str | None = Field(None, description="Registration type: free_tvet, private, referral, or None for all types")


class SubjectPricingResponse(BaseModel):
    """Schema for subject pricing response."""

    id: int
    subject_id: int
    exam_id: int | None
    registration_type: str | None
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
    registration_type: str | None = Field(None, description="Registration type: free_tvet, private, referral, or None for all types")


class SubjectPricingBulkUpdate(BaseModel):
    """Schema for bulk updating subject pricing."""

    pricing: list[SubjectPricingCreate] = Field(..., min_length=1)


class TieredPricingResponse(BaseModel):
    """Schema for tiered pricing response."""

    id: int
    exam_id: int | None
    registration_type: str | None
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
    registration_type: str | None = Field(None, description="Registration type: free_tvet, private, referral, or None for all types")


class TieredPricingBulkUpdate(BaseModel):
    """Schema for bulk updating tiered pricing."""

    pricing: list[TieredPricingCreate] = Field(..., min_length=1)


class ProgrammePricingResponse(BaseModel):
    """Schema for programme pricing response."""

    id: int
    programme_id: int
    exam_id: int | None
    registration_type: str | None
    price: Decimal
    currency: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    programme: ProgrammeResponse

    class Config:
        from_attributes = True


class ProgrammePricingCreate(BaseModel):
    """Schema for creating/updating programme pricing."""

    programme_id: int
    price: Decimal = Field(..., gt=0, description="Price for the programme")
    currency: str = Field(default="GHS", max_length=3)
    is_active: bool = Field(default=True)
    registration_type: str | None = Field(None, description="Registration type: free_tvet, private, referral, or None for all types")


class ProgrammePricingBulkUpdate(BaseModel):
    """Schema for bulk updating programme pricing."""

    pricing: list[ProgrammePricingCreate] = Field(..., min_length=1)


class ExamPricingModelResponse(BaseModel):
    """Schema for exam pricing model response."""

    id: int
    exam_id: int | None
    registration_type: str | None
    pricing_model_preference: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExamPricingModelCreate(BaseModel):
    """Schema for creating/updating exam pricing model."""

    registration_type: str | None = Field(None, description="Registration type: free_tvet, private, referral, or None for all types")
    pricing_model_preference: str = Field(..., description="Pricing model: 'per_subject', 'tiered', or 'per_programme' (must be explicit, no 'auto')")


class ExamPricingResponse(BaseModel):
    """Schema for complete exam pricing response."""

    exam_id: int
    application_fee: ApplicationFeeResponse | None
    subject_pricing: list[SubjectPricingResponse]
    tiered_pricing: list[TieredPricingResponse]
    programme_pricing: list[ProgrammePricingResponse]
    pricing_models: list[ExamPricingModelResponse]


class ImportPricingRequest(BaseModel):
    """Schema for importing pricing from another exam."""

    source_exam_id: int = Field(..., description="ID of the exam to import pricing from")
    import_application_fee: bool = Field(default=True, description="Import application fee")
    import_subject_pricing: bool = Field(default=True, description="Import subject pricing")
    import_tiered_pricing: bool = Field(default=True, description="Import tiered pricing")
    import_programme_pricing: bool = Field(default=True, description="Import programme pricing")
    import_pricing_models: bool = Field(default=True, description="Import pricing models")
