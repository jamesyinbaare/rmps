from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models import DataExtractionMethod, Grade
from app.utils.score_utils import parse_score_value


class ScoreUpdate(BaseModel):
    """Schema for updating raw scores."""

    obj_raw_score: str | None = Field(
        None, description="Objectives score: numeric string (>=0), 'A'/'AA' (absent), or None (not entered)"
    )
    essay_raw_score: str | None = Field(
        None, description="Essay score: numeric string (>=0), 'A'/'AA' (absent), or None (not entered)"
    )
    pract_raw_score: str | None = Field(
        None, description="Practical score: numeric string (>=0), 'A'/'AA' (absent), or None (not entered)"
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

    class Config:
        from_attributes = True


class CandidateScoreListResponse(BaseModel):
    """Response for candidate score list for manual entry."""

    items: list[CandidateScoreEntry]
    total: int
    page: int
    page_size: int
    total_pages: int


class ReductoDataResponse(BaseModel):
    """Response for reducto extraction data preview."""

    data: dict
    status: str
    confidence: float | None
    extracted_at: datetime | None


class UpdateScoresFromReductoResponse(BaseModel):
    """Response for updating scores from reducto data."""

    updated_count: int
    unmatched_count: int
    unmatched_records: list[dict]
    errors: list[dict[str, str]]


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
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None

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
