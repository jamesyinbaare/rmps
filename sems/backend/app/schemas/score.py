from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models import DataExtractionMethod, Grade
from app.utils.score_utils import parse_score_value


class ScoreUpdate(BaseModel):
    """Schema for updating raw scores."""

    obj_raw_score: str | None = Field(
        None, description="Objectives score: numeric string (>=0), 'A'/'AA'/'AAA' (absent), or None (not entered)"
    )
    essay_raw_score: str | None = Field(
        None, description="Essay score: numeric string (>=0), 'A'/'AA'/'AAA' (absent), or None (not entered)"
    )
    pract_raw_score: str | None = Field(
        None, description="Practical score: numeric string (>=0), 'A'/'AA'/'AAA' (absent), or None (not entered)"
    )
    extraction_method: DataExtractionMethod | None = Field(
        None, description="Extraction method used for this update. If not provided, will be inferred from endpoint context."
    )

    @field_validator("obj_raw_score", "essay_raw_score", "pract_raw_score")
    @classmethod
    def validate_score(cls, v: str | float | None) -> str | None:
        """Validate and normalize score value."""
        return parse_score_value(v)


class ScoreResponse(BaseModel):
    """Extended score response with candidate and subject info."""

    id: int
    subject_registration_id: int
    obj_raw_score: str | None
    essay_raw_score: str | None
    pract_raw_score: str | None
    obj_normalized: float | None = None
    essay_normalized: float | None = None
    pract_normalized: float | None = None
    total_score: float
    obj_document_id: str | None = None
    essay_document_id: str | None = None
    pract_document_id: str | None = None
    created_at: datetime
    updated_at: datetime
    # Extended fields
    candidate_id: int
    candidate_name: str
    candidate_index_number: str
    subject_id: int
    subject_code: str
    subject_name: str
    grade: Grade | None = None  # Calculated on-the-fly from total_score using grade ranges

    class Config:
        from_attributes = True


class DocumentScoresResponse(BaseModel):
    """List of scores for a document with candidate details."""

    document_id: str
    scores: list[ScoreResponse]


class BatchScoreUpdateItem(BaseModel):
    """Single score update item for batch operations."""

    score_id: int | None = None  # None if creating new score
    subject_registration_id: int
    obj_raw_score: str | None = None
    essay_raw_score: str | None = None
    pract_raw_score: str | None = None
    extraction_method: DataExtractionMethod | None = Field(
        None, description="Extraction method used for this update. If not provided, will be inferred from endpoint context."
    )

    @field_validator("obj_raw_score", "essay_raw_score", "pract_raw_score")
    @classmethod
    def validate_score(cls, v: str | float | None) -> str | None:
        """Validate and normalize score value."""
        return parse_score_value(v)


class BatchScoreUpdate(BaseModel):
    """Schema for batch score updates."""

    scores: list[BatchScoreUpdateItem]


class BatchScoreUpdateResponse(BaseModel):
    """Response for batch score updates."""

    successful: int
    failed: int
    errors: list[dict[str, str]]


class CandidateScoreEntry(BaseModel):
    """Candidate with score information for manual entry."""

    candidate_id: int
    candidate_name: str
    candidate_index_number: str
    subject_registration_id: int
    subject_id: int
    subject_code: str
    subject_name: str
    subject_series: int | None = None
    exam_id: int
    exam_name: str
    exam_year: int
    exam_series: str
    programme_id: int | None
    programme_code: str | None
    programme_name: str | None
    score_id: int | None
    obj_raw_score: str | None
    essay_raw_score: str | None
    pract_raw_score: str | None
    # ExamSubject test type configuration
    obj_pct: float | None = None
    essay_pct: float | None = None
    pract_pct: float | None = None
    # Document IDs for matching
    obj_document_id: str | None = None
    essay_document_id: str | None = None
    pract_document_id: str | None = None

    class Config:
        from_attributes = True


class CandidateScoreListResponse(BaseModel):
    """Response for candidate score list for manual entry."""

    items: list[CandidateScoreEntry]
    total: int
    page: int
    page_size: int
    total_pages: int


class AbsentReviewEntry(BaseModel):
    """One absent paper row for QA review (flattened from SubjectScore)."""

    score_id: int
    candidate_id: int
    candidate_name: str
    candidate_index_number: str
    school_id: int | None = None
    school_name: str | None = None
    school_code: str | None = None
    subject_id: int
    subject_code: str
    subject_name: str
    exam_id: int
    test_type: int
    field_name: str
    absent_marker: str
    obj_raw_score: str | None = None
    essay_raw_score: str | None = None
    pract_raw_score: str | None = None
    total_score: float
    grade: Grade | None = None
    max_score: float | None = None
    document_id: str | None = None
    document_file_name: str | None = None
    document_numeric_id: int | None = None
    document_mime_type: str | None = None


class AbsentReviewListResponse(BaseModel):
    """Paginated absent-review rows."""

    items: list[AbsentReviewEntry]
    total: int
    page: int
    page_size: int
    total_pages: int


class ConfirmAbsentReviewRequest(BaseModel):
    """Confirm that an absent mark is correct for a paper field."""

    score_id: int
    field_name: str = Field(..., description="obj_raw_score, essay_raw_score, or pract_raw_score")


class ConfirmAbsentReviewResponse(BaseModel):
    """Response after confirming an absent mark."""

    score_id: int
    field_name: str
    test_type: int
    confirmed_at: datetime


class ReductoDataResponse(BaseModel):
    """Response for extraction data preview."""

    data: dict
    status: str
    confidence: float | None
    extracted_at: datetime | None
    provider: str | None = None
    applied_at: datetime | None = None
    current_applied: bool = False


class UpdateScoresFromReductoRequest(BaseModel):
    """Request for updating scores from extracted data."""

    verify: bool = Field(
        default=True,
        description="If True, compare score and verify fields before inserting (default True)",
    )
    provider: Literal["reducto", "llama"] = Field(
        ...,
        description="Which provider's current extract to apply (llama or reducto).",
    )


class UpdateScoresFromReductoResponse(BaseModel):
    """Response for updating scores from reducto data."""

    updated_count: int
    unmatched_count: int
    skipped_count: int = 0
    skipped_records: list[dict] = []
    unmatched_records: list[dict]
    errors: list[dict[str, str]]
    cleared_count: int = 0
    scores_applied_at: datetime | None = None
    scores_applied_count: int | None = None
    scores_unmatched_count: int | None = None


class UnmatchedIndexMatch(BaseModel):
    subject_registration_id: int
    index_number: str
    candidate_name: str
    school_name: str | None = None
    current_score: str | None = None


class UnmatchedIndexSuggestion(BaseModel):
    raw_index_number: str | None = None
    cleaned_index_number: str | None = None
    noise_chars: str = ""
    highlight: list[tuple[str, bool]] = Field(default_factory=list)
    matches: list[UnmatchedIndexMatch] = Field(default_factory=list)
    unique: bool = False
    likely_ocr_noise: bool = False
    score_field: str | None = None


class UnmatchedExtractionRecordResponse(BaseModel):
    """Response for unmatched extraction record."""

    id: int
    document_id: int
    document_extracted_id: str | None
    document_school_name: str | None
    document_subject_name: str | None
    index_number: str | None
    candidate_name: str | None
    score: str | None
    sn: int | None
    raw_data: dict | None
    status: str
    extraction_method: str
    extraction_provider: str | None = None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    suggestion: UnmatchedIndexSuggestion | None = None
    resolved_subject_registration_id: int | None = None

    class Config:
        from_attributes = True


class UnmatchedRecordsListResponse(BaseModel):
    """Response for list of unmatched records."""

    items: list[UnmatchedExtractionRecordResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ResolveUnmatchedRecordRequest(BaseModel):
    """Request to resolve an unmatched record."""

    subject_registration_id: int
    score_field: str = Field(..., description="'obj', 'essay', or 'pract'")
    score_value: str | None = Field(None, description="Score value to apply")


class BulkUnmatchedIdsRequest(BaseModel):
    record_ids: list[int] = Field(..., min_length=1)


class BulkUnmatchedOcrResolveRequest(BaseModel):
    record_ids: list[int] | None = None
    document_id: int | None = None
    extraction_method: str | None = None


class BulkUnmatchedActionError(BaseModel):
    record_id: int
    reason: str


class BulkUnmatchedActionResponse(BaseModel):
    applied: int = 0
    skipped: int = 0
    failed: int = 0
    errors: list[BulkUnmatchedActionError] = Field(default_factory=list)


class ResultsExportJobCreateResponse(BaseModel):
    job_id: int
    status: str


class ResultsExportJobStatusResponse(BaseModel):
    job_id: int
    exam_id: int
    status: str
    filename: str | None = None
    message: str | None = None
    error_message: str | None = None
