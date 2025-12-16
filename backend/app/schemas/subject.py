from datetime import datetime

from pydantic import BaseModel, Field

from app.models import SubjectType


class SubjectBase(BaseModel):
    """Base subject schema."""

    code: str = Field(..., min_length=3, max_length=3)
    name: str = Field(..., min_length=1, max_length=255)


class SubjectCreate(SubjectBase):
    """Schema for creating a subject."""

    subject_type: SubjectType = Field(..., description="Subject type: CORE or ELECTIVE")


class SubjectUpdate(BaseModel):
    """Schema for updating a subject."""

    name: str | None = Field(None, min_length=1, max_length=255)
    subject_type: SubjectType | None = Field(None, description="Subject type: CORE or ELECTIVE")


class SubjectResponse(SubjectBase):
    """Schema for subject response."""

    id: int
    subject_type: SubjectType
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
