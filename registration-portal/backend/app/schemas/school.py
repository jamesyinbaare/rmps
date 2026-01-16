from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class BulkUploadError(BaseModel):
    """Schema for bulk upload error details."""

    row_number: int
    error_message: str
    field: str | None = None


class BulkUploadResponse(BaseModel):
    """Schema for bulk upload response."""

    total_rows: int
    successful: int
    failed: int
    errors: list[BulkUploadError]


class SchoolCreate(BaseModel):
    """Schema for creating a school."""

    code: str = Field(..., min_length=1, max_length=6)
    name: str = Field(..., min_length=1, max_length=255)
    is_private_examination_center: bool = Field(default=False, description="Whether this school is available as an examination center for private candidates")
    # Profile fields (all optional during creation)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    digital_address: str | None = Field(None, max_length=50)
    post_office_address: str | None = Field(None, max_length=255)
    is_private: bool | None = Field(None, description="True for private, False for public school")
    principal_name: str | None = Field(None, max_length=255)
    principal_email: str | None = Field(None, max_length=255)
    principal_phone: str | None = Field(None, max_length=50)


class SchoolUpdate(BaseModel):
    """Schema for updating a school."""

    name: str | None = Field(None, min_length=1, max_length=255)
    is_active: bool | None = None
    is_private_examination_center: bool | None = Field(None, description="Whether this school is available as an examination center for private candidates")
    # Profile fields (all optional)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    digital_address: str | None = Field(None, max_length=50)
    post_office_address: str | None = Field(None, max_length=255)
    is_private: bool | None = Field(None, description="True for private, False for public school")
    principal_name: str | None = Field(None, max_length=255)
    principal_email: str | None = Field(None, max_length=255)
    principal_phone: str | None = Field(None, max_length=50)


class SchoolResponse(BaseModel):
    """Schema for school response."""

    id: int
    code: str
    name: str
    is_active: bool
    is_private_examination_center: bool
    # Profile fields
    email: str | None = None
    phone: str | None = None
    digital_address: str | None = None
    post_office_address: str | None = None
    is_private: bool | None = None
    principal_name: str | None = None
    principal_email: str | None = None
    principal_phone: str | None = None
    profile_completed: bool = False
    admin_count: int | None = None
    candidate_count: int | None = None

    class Config:
        from_attributes = True


class SchoolDetailResponse(SchoolResponse):
    """Extended school response with timestamps."""

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SchoolStatisticsResponse(BaseModel):
    """Schema for school statistics."""

    school_id: int
    school_code: str
    school_name: str
    total_candidates: int
    candidates_by_exam: dict[str, int]  # exam_id -> count
    candidates_by_status: dict[str, int]  # status -> count
    active_admin_count: int
    total_exams: int

    class Config:
        from_attributes = True


class SchoolListResponse(BaseModel):
    """Paginated school list response."""

    items: list[SchoolResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

    class Config:
        from_attributes = True
