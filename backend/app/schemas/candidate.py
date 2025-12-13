from datetime import date, datetime

from pydantic import BaseModel, Field


class CandidateBase(BaseModel):
    """Base candidate schema."""

    school_id: int
    name: str = Field(..., min_length=1, max_length=255)
    index_number: str = Field(..., min_length=1, max_length=50)
    date_of_birth: date | None = None
    gender: str | None = Field(None, max_length=20)
    programme_id: int | None = None


class CandidateCreate(CandidateBase):
    """Schema for creating a candidate."""

    pass


class CandidateUpdate(BaseModel):
    """Schema for updating a candidate."""

    school_id: int | None = None
    name: str | None = Field(None, min_length=1, max_length=255)
    index_number: str | None = Field(None, min_length=1, max_length=50)
    date_of_birth: date | None = None
    gender: str | None = Field(None, max_length=20)
    programme_id: int | None = None


class CandidateResponse(CandidateBase):
    """Schema for candidate response."""

    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CandidateListResponse(BaseModel):
    """Schema for paginated candidate list response."""

    items: list[CandidateResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ExamRegistrationCreate(BaseModel):
    """Schema for registering a candidate for an exam."""

    pass  # candidate_id and exam_id come from path parameters


class ExamRegistrationResponse(BaseModel):
    """Schema for exam registration response."""

    id: int
    candidate_id: int
    exam_id: int
    exam_name: str
    exam_year: int
    exam_series: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SubjectRegistrationCreate(BaseModel):
    """Schema for adding a subject to an exam registration."""

    series: int | None = Field(None, ge=1, description="Group number (1 to exam.number_of_series)")


class SubjectRegistrationResponse(BaseModel):
    """Schema for subject registration response."""

    id: int
    exam_registration_id: int
    subject_id: int
    subject_code: str
    subject_name: str
    series: int | None
    created_at: datetime
    updated_at: datetime
    subject_score: "SubjectScoreResponse | None" = None

    class Config:
        from_attributes = True


class SubjectScoreResponse(BaseModel):
    """Schema for subject score response."""

    id: int
    subject_registration_id: int
    mcq_raw_score: float
    essay_raw_score: float
    practical_raw_score: float | None
    total_score: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Update forward references
SubjectRegistrationResponse.model_rebuild()
