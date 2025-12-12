from datetime import datetime

from pydantic import BaseModel, Field


class ExamBase(BaseModel):
    """Base exam schema."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    year: int = Field(..., ge=1900, le=2100)
    series: str = Field(..., min_length=1, max_length=50)
    number_of_series: int = Field(1, ge=1, le=10)


class ExamCreate(ExamBase):
    """Schema for creating an exam."""

    pass


class ExamUpdate(BaseModel):
    """Schema for updating an exam."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    year: int | None = Field(None, ge=1900, le=2100)
    series: str | None = Field(None, min_length=1, max_length=50)
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
    mcq_percentage: float = Field(..., ge=0.0, le=100.0)
    essay_percentage: float = Field(..., ge=0.0, le=100.0)
    practical_percentage: float | None = Field(None, ge=0.0, le=100.0)


class ExamSubjectUpdate(BaseModel):
    """Schema for updating exam subject percentages."""

    mcq_percentage: float | None = Field(None, ge=0.0, le=100.0)
    essay_percentage: float | None = Field(None, ge=0.0, le=100.0)
    practical_percentage: float | None = Field(None, ge=0.0, le=100.0)


class ExamSubjectResponse(BaseModel):
    """Schema for exam subject response."""

    id: int
    exam_id: int
    subject_id: int
    subject_code: str
    subject_name: str
    mcq_percentage: float
    essay_percentage: float
    practical_percentage: float | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
