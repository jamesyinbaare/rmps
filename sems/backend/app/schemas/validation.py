"""Schemas for validation API endpoints."""

from datetime import datetime
from enum import Enum
from uuid import UUID

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
    resolved_by_user_id: UUID | None = None
    batch_id: int | None = None
    batch_name: str | None = None
    batch_has_document: bool | None = None
    candidate_name: str | None = None
    candidate_index_number: str | None = None

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
    issues_reopened: int = 0
    message: str


class ResolveValidationIssueRequest(BaseModel):
    """Request schema for resolving a validation issue."""

    corrected_score: str = Field(..., min_length=1, description="Corrected score value to apply")


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
    resolved_by_user_id: UUID | None = None
    batch_id: int | None = None
    batch_name: str | None = None
    batch_has_document: bool | None = None
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
    max_score: float | None = None

    class Config:
        from_attributes = True


class MyValidationStatsResponse(BaseModel):
    """Personal validation issue resolution stats for the current user."""

    open_count: int
    resolved_today: int
    resolved_week: int
    resolved_total: int
    ignored_total: int
    assigned_pending_count: int = 0


class ClerkValidationStatsItem(BaseModel):
    """Per-clerk resolution stats for supervisor leaderboard."""

    user_id: UUID
    full_name: str
    resolved_today: int
    resolved_week: int
    resolved_total: int


class ClerkValidationStatsResponse(BaseModel):
    """Ranked clerk resolution stats."""

    clerks: list[ClerkValidationStatsItem]


# --- Batches ---


class CreateBatchesRequest(BaseModel):
    exam_id: int
    subject_id: int
    test_type: int = Field(..., ge=1, le=3)
    target_size: int = Field(500, ge=1, le=5000)
    tolerance: int = Field(50, ge=0, le=5000)
    has_document: bool | None = Field(
        True,
        description="True=DOC only (default), False=NOD only, null=both streams",
    )


class ClearBatchesRequest(BaseModel):
    exam_id: int
    subject_id: int
    test_type: int = Field(..., ge=1, le=3)


class ClearBatchesResponse(BaseModel):
    batches_deleted: int
    pending_unbatched: int
    resolved_preserved: int


class IssueBatchResponse(BaseModel):
    id: int
    name: str
    exam_id: int
    subject_id: int
    test_type: int
    has_document: bool
    target_size: int
    tolerance: int
    issue_count: int
    assigned_to_user_id: UUID | None = None
    assigned_by_user_id: UUID | None = None
    assigned_at: datetime | None = None
    created_by_user_id: UUID | None = None
    created_at: datetime
    assigned_to_name: str | None = None

    class Config:
        from_attributes = True


class CreateBatchesResponse(BaseModel):
    batches: list[dict]
    oversized_groups: list[dict]
    created_doc_count: int
    created_nod_count: int


class IssueBatchListResponse(BaseModel):
    batches: list[IssueBatchResponse]
    total: int


class ClerkBatchProgressStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class ClerkBatchItem(BaseModel):
    """Batch allocated to the current clerk, with live progress."""

    id: int
    name: str
    exam_id: int
    subject_id: int
    subject_code: str | None = None
    subject_name: str | None = None
    exam_year: int | None = None
    exam_type: str | None = None
    exam_series: str | None = None
    test_type: int
    has_document: bool
    issue_count: int
    pending_count: int
    done_count: int
    total_count: int
    progress_status: ClerkBatchProgressStatus
    assigned_at: datetime | None = None
    created_at: datetime


class ClerkBatchListResponse(BaseModel):
    batches: list[ClerkBatchItem]
    total: int
    in_progress_count: int
    completed_count: int


class AssignBatchesRequest(BaseModel):
    batch_ids: list[int] = Field(..., min_length=1)
    user_id: UUID


class ReleaseBatchesRequest(BaseModel):
    batch_ids: list[int] | None = None
    user_id: UUID | None = None


class AssignBatchesResponse(BaseModel):
    assigned_count: int
    batch_ids: list[int]


class ReleaseBatchesResponse(BaseModel):
    released_count: int


class BatchSummaryUnbatchedItem(BaseModel):
    exam_id: int
    subject_id: int
    subject_code: str
    test_type: int
    has_document: bool
    pending_count: int


class ClerkActiveExamItem(BaseModel):
    exam_id: int
    exam_label: str
    assigned_batches: int
    assigned_pending_issues: int


class BatchSummaryClerkItem(BaseModel):
    user_id: UUID
    full_name: str
    assigned_batches: int
    assigned_pending_issues: int
    active_exam_id: int | None = None
    active_exam_label: str | None = None
    active_exams: list[ClerkActiveExamItem] = Field(default_factory=list)


class BatchSummaryResponse(BaseModel):
    unbatched: list[BatchSummaryUnbatchedItem]
    clerks: list[BatchSummaryClerkItem]
    # Exam-scoped KPIs (populated when exam_id query is set; otherwise global aggregates)
    pending_unbatched: int = 0
    pending_assigned: int = 0
    batch_count_unassigned: int = 0
    batch_count_assigned: int = 0
    resolved_in_exam: int = 0
    clerks_with_work: int = 0


# --- Clerks directory ---


class ClerkListItem(BaseModel):
    user_id: UUID
    full_name: str
    email: str | None = None
    resolved_today: int = 0
    active_exam_id: int | None = None
    active_exam_label: str | None = None
    active_exams: list[ClerkActiveExamItem] = Field(default_factory=list)


class ClerkListResponse(BaseModel):
    clerks: list[ClerkListItem]
