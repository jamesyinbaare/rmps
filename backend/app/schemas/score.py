from datetime import datetime

from pydantic import BaseModel, Field, field_validator

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

    class Config:
        from_attributes = True


class CandidateScoreListResponse(BaseModel):
    """Response for candidate score list for manual entry."""

    items: list[CandidateScoreEntry]
    total: int
    page: int
    page_size: int
    total_pages: int
