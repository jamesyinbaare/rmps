from datetime import datetime

from pydantic import BaseModel, Field

from app.models import ExamName, ExamSeries


class ExamBase(BaseModel):
    """Base exam schema."""

    name: ExamName
    description: str | None = None
    year: int = Field(..., ge=1900, le=2100)
    series: ExamSeries
    number_of_series: int = Field(1, ge=1, le=10)


class ExamCreate(ExamBase):
    """Schema for creating an exam."""

    pass


class ExamUpdate(BaseModel):
    """Schema for updating an exam."""

    name: ExamName | None = None
    description: str | None = None
    year: int | None = Field(None, ge=1900, le=2100)
    series: ExamSeries | None = None
    number_of_series: int | None = Field(None, ge=1, le=10)


class ExamResponse(ExamBase):
    """Schema for exam response."""

    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExamListResponse(BaseModel):
    """Schema for paginated exam list response."""

    items: list[ExamResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ExamSubjectCreate(BaseModel):
    """Schema for adding a subject to an exam."""

    subject_id: int
    obj_pct: float | None = Field(None, ge=0.0, le=100.0)
    essay_pct: float | None = Field(None, ge=0.0, le=100.0)
    pract_pct: float | None = Field(None, ge=0.0, le=100.0)
    obj_max_score: float | None = Field(None, ge=0.0)
    essay_max_score: float | None = Field(None, ge=0.0)
    pract_max_score: float | None = Field(None, ge=0.0)


class ExamSubjectUpdate(BaseModel):
    """Schema for updating exam subject percentages."""

    obj_pct: float | None = Field(None, ge=0.0, le=100.0)
    essay_pct: float | None = Field(None, ge=0.0, le=100.0)
    pract_pct: float | None = Field(None, ge=0.0, le=100.0)
    obj_max_score: float | None = Field(None, ge=0.0)
    essay_max_score: float | None = Field(None, ge=0.0)
    pract_max_score: float | None = Field(None, ge=0.0)


class ExamSubjectResponse(BaseModel):
    """Schema for exam subject response."""

    id: int
    exam_id: int
    subject_id: int
    subject_code: str
    subject_name: str
    obj_pct: float | None
    essay_pct: float | None
    pract_pct: float | None
    obj_max_score: float | None
    essay_max_score: float | None
    pract_max_score: float | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
