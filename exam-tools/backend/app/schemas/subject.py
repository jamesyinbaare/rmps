from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import SubjectType


class SubjectBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=10)
    original_code: str | None = Field(None, min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    subject_type: SubjectType = Field(..., description="Subject type: CORE or ELECTIVE")


class SubjectCreate(SubjectBase):
    pass


class SubjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    code: str | None = Field(None, min_length=1, max_length=10)
    original_code: str | None = Field(None, min_length=1, max_length=50)
    subject_type: SubjectType | None = None


class SubjectResponse(SubjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class SubjectListResponse(BaseModel):
    items: list[SubjectResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class SubjectBulkUploadError(BaseModel):
    row_number: int
    error_message: str
    field: str | None = None


class SubjectBulkUploadResponse(BaseModel):
    total_rows: int
    successful: int
    failed: int
    errors: list[SubjectBulkUploadError]
