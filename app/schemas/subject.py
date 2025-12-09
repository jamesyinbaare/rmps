from datetime import datetime

from pydantic import BaseModel, Field


class SubjectBase(BaseModel):
    """Base subject schema."""

    code: str = Field(..., min_length=4, max_length=4)
    name: str = Field(..., min_length=1, max_length=255)


class SubjectCreate(SubjectBase):
    """Schema for creating a subject."""

    pass


class SubjectUpdate(BaseModel):
    """Schema for updating a subject."""

    name: str | None = Field(None, min_length=1, max_length=255)


class SubjectResponse(SubjectBase):
    """Schema for subject response."""

    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SubjectStatistics(BaseModel):
    """Schema for subject statistics."""

    subject_id: int
    subject_code: str
    subject_name: str
    total_documents: int
    total_schools: int
    documents_by_test_type: dict[str, int]  # "1" or "2" -> count
    sheet_sequence_gaps: list[int]  # List of missing sheet numbers
