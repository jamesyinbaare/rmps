from datetime import datetime

from pydantic import BaseModel, Field


class ScoreUpdate(BaseModel):
    """Schema for updating raw scores."""

    obj_raw_score: float | None = Field(None, ge=0.0, description="Objectives raw score")
    essay_raw_score: float | None = Field(None, ge=0.0, description="Essay raw score")
    pract_raw_score: float | None = Field(None, ge=0.0, description="Practical raw score")


class ScoreResponse(BaseModel):
    """Extended score response with candidate and subject info."""

    id: int
    subject_registration_id: int
    obj_raw_score: float | None
    essay_raw_score: float
    pract_raw_score: float | None
    obj_normalized: float | None = None
    essay_normalized: float | None = None
    pract_normalized: float | None = None
    total_score: float
    document_id: str | None = None
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
    obj_raw_score: float | None = None
    essay_raw_score: float | None = None
    pract_raw_score: float | None = None


class BatchScoreUpdate(BaseModel):
    """Schema for batch score updates."""

    scores: list[BatchScoreUpdateItem]


class BatchScoreUpdateResponse(BaseModel):
    """Response for batch score updates."""

    successful: int
    failed: int
    errors: list[dict[str, str]]
