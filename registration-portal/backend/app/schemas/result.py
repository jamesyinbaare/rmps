"""Schemas for results management."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

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


class PublicResultCheckRequest(BaseModel):
    """Schema for public result check request."""

    index_number: Optional[str] = None
    registration_number: Optional[str] = None
    exam_type: str
    exam_series: str
    year: int

    class Config:
        json_schema_extra = {
            "example": {
                "index_number": "12345",
                "registration_number": "REG001",
                "exam_type": "Certificate II Examination",
                "exam_series": "MAY/JUNE",
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
