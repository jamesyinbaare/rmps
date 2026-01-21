"""Schemas for validation API endpoints."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class ValidationIssueType(str, Enum):
    """Type of validation issue."""

    MISSING_SCORE = "missing_score"
    INVALID_SCORE = "invalid_score"


class ValidationIssueStatus(str, Enum):
    """Status of a validation issue."""

    PENDING = "pending"
    RESOLVED = "resolved"
    IGNORED = "ignored"


class SubjectScoreValidationIssueResponse(BaseModel):
    """Response schema for a validation issue."""

    id: int
    subject_score_id: int
    exam_subject_id: int
    issue_type: ValidationIssueType
    field_name: str
    test_type: int
    message: str
    status: ValidationIssueStatus
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None

    class Config:
        from_attributes = True


class ValidationIssueListResponse(BaseModel):
    """Paginated list of validation issues."""

    total: int
    page: int
    page_size: int
    issues: list[SubjectScoreValidationIssueResponse]


class RunValidationRequest(BaseModel):
    """Request schema for triggering validation."""

    exam_id: int | None = Field(None, description="Optional exam ID to filter by")
    school_id: int | None = Field(None, description="Optional school ID to filter by")
    subject_id: int | None = Field(None, description="Optional subject ID to filter by")


class RunValidationResponse(BaseModel):
    """Response schema for validation run results."""

    total_scores_checked: int
    issues_found: int
    issues_resolved: int
    issues_created: int
    message: str


class ResolveValidationIssueRequest(BaseModel):
    """Request schema for resolving a validation issue."""

    corrected_score: str | None = Field(None, description="Optional corrected score value to apply")


class ValidationIssueDetailResponse(BaseModel):
    """Extended response schema for a validation issue with related details."""

    id: int
    subject_score_id: int
    exam_subject_id: int
    issue_type: ValidationIssueType
    field_name: str
    test_type: int
    message: str
    status: ValidationIssueStatus
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None
    # Extended fields
    candidate_id: int | None = None
    candidate_name: str | None = None
    candidate_index_number: str | None = None
    subject_id: int | None = None
    subject_code: str | None = None
    subject_name: str | None = None
    exam_id: int | None = None
    exam_type: str | None = None
    exam_year: int | None = None
    exam_series: str | None = None
    school_id: int | None = None
    school_name: str | None = None
    current_score_value: str | None = None
    document_id: str | None = None
    document_file_name: str | None = None
    document_numeric_id: int | None = None
    document_mime_type: str | None = None

    class Config:
        from_attributes = True
