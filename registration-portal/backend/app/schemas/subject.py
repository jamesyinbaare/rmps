from datetime import datetime

from pydantic import BaseModel, Field

from app.models import SubjectType


class SubjectBase(BaseModel):
    """Base subject schema."""

    code: str = Field(..., min_length=1, max_length=10)
    original_code: str | None = Field(None, min_length=1, max_length=50, description="Original subject code (e.g., from external system)")
    name: str = Field(..., min_length=1, max_length=255)
    subject_type: SubjectType = Field(..., description="Subject type: CORE or ELECTIVE")


class SubjectCreate(SubjectBase):
    """Schema for creating a subject."""

    pass


class SubjectUpdate(BaseModel):
    """Schema for updating a subject."""

    name: str | None = Field(None, min_length=1, max_length=255)
    code: str | None = Field(None, min_length=1, max_length=10)
    original_code: str | None = Field(None, min_length=1, max_length=50, description="Original subject code (e.g., from external system)")
    subject_type: SubjectType | None = Field(None, description="Subject type: CORE or ELECTIVE")


class SubjectResponse(SubjectBase):
    """Schema for subject response."""

    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SubjectListResponse(BaseModel):
    """Schema for paginated subject list response."""

    items: list[SubjectResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


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
