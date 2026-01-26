"""Examiner application schemas."""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.models import (
    ExaminerApplicationStatus,
    ExaminerDocumentType,
    ExaminerSubjectPreferenceType,
    PaymentStatus,
)


class ExaminerApplicationCreate(BaseModel):
    """Create examiner application request."""

    # Personal Particulars
    full_name: str
    title: str | None = None
    nationality: str | None = None
    date_of_birth: date | None = None
    office_address: str | None = None
    residential_address: str | None = None
    email_address: EmailStr | None = None
    telephone_office: str | None = None
    telephone_cell: str | None = None
    present_school_institution: str | None = None
    present_rank_position: str | None = None
    subject_area: str | None = None
    additional_information: str | None = None
    ceased_examining_explanation: str | None = None


class ExaminerApplicationUpdate(BaseModel):
    """Update examiner application request."""

    full_name: str | None = None
    title: str | None = None
    nationality: str | None = None
    date_of_birth: date | None = None
    office_address: str | None = None
    residential_address: str | None = None
    email_address: EmailStr | None = None
    telephone_office: str | None = None
    telephone_cell: str | None = None
    present_school_institution: str | None = None
    present_rank_position: str | None = None
    subject_area: str | None = None
    additional_information: str | None = None
    ceased_examining_explanation: str | None = None


class ExaminerApplicationResponse(BaseModel):
    """Examiner application response."""

    id: UUID
    examiner_id: UUID
    application_number: str
    status: ExaminerApplicationStatus
    full_name: str
    title: str | None
    nationality: str | None
    date_of_birth: date | None
    office_address: str | None
    residential_address: str | None
    email_address: str | None
    telephone_office: str | None
    telephone_cell: str | None
    present_school_institution: str | None
    present_rank_position: str | None
    subject_area: str | None
    additional_information: str | None
    ceased_examining_explanation: str | None
    payment_status: PaymentStatus | None
    submitted_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExaminerApplicationDocumentResponse(BaseModel):
    """Examiner application document response."""

    id: UUID
    application_id: UUID
    document_type: ExaminerDocumentType
    file_name: str
    file_size: int
    mime_type: str
    uploaded_at: datetime

    class Config:
        from_attributes = True


class ExaminerRecommendationTokenRequest(BaseModel):
    """Request recommendation token."""

    recommender_email: EmailStr
    recommender_name: str


class ExaminerRecommendationCreate(BaseModel):
    """Create examiner recommendation."""

    recommender_name: str
    recommender_status: str | None = None
    recommender_office_address: str | None = None
    recommender_phone: str | None = None
    quality_ratings: dict[str, int] | None = None  # {quality_name: rating (1-6)}
    integrity_assessment: str | None = None
    certification_statement: str | None = None
    recommendation_decision: bool  # True = recommend, False = do not recommend
    recommender_signature: str | None = None
    recommender_date: date | None = None


class ExaminerRecommendationResponse(BaseModel):
    """Examiner recommendation response."""

    id: UUID
    application_id: UUID
    recommender_name: str | None
    recommender_status: str | None
    recommender_office_address: str | None
    recommender_phone: str | None
    quality_ratings: dict[str, int] | None
    integrity_assessment: str | None
    certification_statement: str | None
    recommendation_decision: bool | None
    recommender_signature: str | None
    recommender_date: date | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
