from datetime import datetime

from pydantic import BaseModel, Field

from app.models import ExamType, SubjectType


class SubjectBase(BaseModel):
    """Base subject schema."""

    code: str = Field(..., min_length=3, max_length=3)
    original_code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    exam_type: ExamType


class SubjectCreate(SubjectBase):
    """Schema for creating a subject."""

    subject_type: SubjectType = Field(..., description="Subject type: CORE or ELECTIVE")


class SubjectUpdate(BaseModel):
    """Schema for updating a subject."""

    name: str | None = Field(None, min_length=1, max_length=255)
    original_code: str | None = Field(None, min_length=1, max_length=50)
    subject_type: SubjectType | None = Field(None, description="Subject type: CORE or ELECTIVE")
    exam_type: ExamType | None = None


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


class SubjectBulkUploadError(BaseModel):
    """Schema for bulk upload error details."""

    row_number: int
    error_message: str
    field: str | None = None


class SubjectBulkUploadResponse(BaseModel):
    """Schema for bulk upload response."""

    total_rows: int
    successful: int
    failed: int
    errors: list[SubjectBulkUploadError]
