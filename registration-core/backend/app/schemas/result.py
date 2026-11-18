"""Schemas for results management."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.core.exam_codes import normalize_exam_type, normalize_exam_series
from app.models import Grade, ResultBlockType


class CandidateResultCreate(BaseModel):
    """Schema for creating a candidate result."""

    registration_candidate_id: int
    subject_id: int
    grade: Grade


class CandidateResultUpdate(BaseModel):
    """Schema for updating a candidate result."""

    grade: Optional[Grade] = None


class CandidateResultResponse(BaseModel):
    """Schema for candidate result response."""

    id: int
    registration_candidate_id: int
    subject_id: int
    subject_code: str
    subject_name: str
    registration_exam_id: int
    exam_type: str
    exam_series: str
    exam_year: int
    grade: Grade
    is_published: bool
    published_at: Optional[datetime] = None
    published_by_user_id: Optional[UUID] = None
    candidate_name: str
    candidate_index_number: Optional[str] = None
    candidate_registration_number: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CandidateResultBulkPublishItem(BaseModel):
    """Schema for a single result item in bulk publish."""

    registration_number: str
    index_number: Optional[str] = None
    subject_code: str
    grade: Grade


class CandidateResultBulkPublish(BaseModel):
    """Schema for bulk publishing results."""

    exam_id: int
    results: list[CandidateResultBulkPublishItem] = Field(..., min_length=1)


class CandidateResultBulkPublishResponse(BaseModel):
    """Schema for bulk publish response."""

    total_processed: int
    successful: int
    failed: int
    errors: list[dict[str, str]]


class PublishResultsFilterRequest(BaseModel):
    """Schema for publishing results with filters."""

    school_ids: list[int] | None = None
    subject_ids: list[int] | None = None


class ResultBlockCreate(BaseModel):
    """Schema for creating a result block."""

    block_type: ResultBlockType
    registration_exam_id: int
    registration_candidate_id: Optional[int] = None
    school_id: Optional[int] = None
    subject_id: Optional[int] = None
    reason: Optional[str] = None


class ResultBlockResponse(BaseModel):
    """Schema for result block response."""

    id: int
    block_type: ResultBlockType
    registration_exam_id: int
    exam_type: str
    exam_series: str
    exam_year: int
    registration_candidate_id: Optional[int] = None
    candidate_name: Optional[str] = None
    candidate_registration_number: Optional[str] = None
    school_id: Optional[int] = None
    school_name: Optional[str] = None
    school_code: Optional[str] = None
    subject_id: Optional[int] = None
    subject_code: Optional[str] = None
    subject_name: Optional[str] = None
    is_active: bool
    blocked_by_user_id: UUID
    blocked_by_user_name: str
    reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ResultAccessPinCreate(BaseModel):
    """Schema for creating PIN/Serial combinations."""

    count: int = Field(..., gt=0, le=1000, description="Number of PIN/Serial combinations to generate")
    max_uses: Optional[int] = Field(None, gt=0, description="Maximum number of uses per combination (defaults to config)")


class ResultAccessPinResponse(BaseModel):
    """Schema for PIN/Serial combination response."""

    id: int
    pin: str
    serial_number: str
    max_uses: int
    current_uses: int
    is_active: bool
    created_by_user_id: Optional[UUID] = None
    created_by_user_name: Optional[str] = None
    expires_at: Optional[datetime] = None
    first_used_registration_number: Optional[str] = None
    first_used_exam_id: Optional[int] = None
    first_used_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ResultAccessPinUpdate(BaseModel):
    """Schema for updating a PIN/Serial combination."""

    is_active: Optional[bool] = None
    expires_at: Optional[datetime] = None


class PublicResultCheckRequest(BaseModel):
    """Schema for public result check request.

    Supports simple codes/aliases for exam_type and exam_series:
    - Exam types: "cert2", "tech1", "1", etc. → normalized to full names
    - Exam series: "mj", "may_june", "1", etc. → normalized to "MAY/JUNE" or "NOV/DEC"
    - Full names are also accepted for backward compatibility
    """

    index_number: Optional[str] = None
    registration_number: Optional[str] = None
    exam_type: str
    exam_series: str
    year: int
    pin: Optional[str] = None
    serial_number: Optional[str] = None

    @model_validator(mode="after")
    def normalize_exam_codes(self) -> "PublicResultCheckRequest":
        """Normalize exam_type and exam_series codes/aliases to canonical names."""
        # Normalize exam_type
        if self.exam_type:
            normalized_type = normalize_exam_type(self.exam_type)
            if normalized_type:
                self.exam_type = normalized_type

        # Normalize exam_series
        if self.exam_series:
            normalized_series = normalize_exam_series(self.exam_series)
            if normalized_series:
                self.exam_series = normalized_series

        return self

    class Config:
        json_schema_extra = {
            "example": {
                "index_number": "12345",
                "registration_number": "REG001",
                "exam_type": "cert2",  # Can use code or full name
                "exam_series": "mj",   # Can use code or full name
                "year": 2024,
            }
        }


class PublicSubjectResult(BaseModel):
    """Schema for a single subject result in public response."""

    subject_code: str
    subject_name: Optional[str] = None
    grade: Optional[Grade] = None  # None means pending (no grade available)


class PublicResultResponse(BaseModel):
    """Schema for public result response."""

    candidate_name: str
    index_number: Optional[str] = None
    registration_number: str
    exam_type: str
    exam_series: str
    year: int
    results: list[PublicSubjectResult]
    exam_published: bool
    school_name: Optional[str] = None
    school_code: Optional[str] = None
    programme_name: Optional[str] = None
    programme_code: Optional[str] = None
    photo_url: Optional[str] = None
