"""Subject schemas for application subject selection and admin."""
from uuid import UUID

from pydantic import BaseModel

from app.models import SubjectType


class SubjectResponse(BaseModel):
    """Subject list/response for dropdown."""

    id: UUID
    code: str
    name: str
    type: SubjectType | None = None
    description: str | None = None

    class Config:
        from_attributes = True


class SubjectTypeOption(BaseModel):
    """Subject type option for first dropdown (value + label)."""

    value: str
    label: str


class SubjectCreate(BaseModel):
    """Create subject (admin)."""

    code: str
    name: str
    type: SubjectType | None = None
    description: str | None = None


class SubjectBulkUploadError(BaseModel):
    """Per-row error for bulk upload."""

    row_number: int
    error_message: str
    field: str | None = None


class SubjectBulkUploadResponse(BaseModel):
    """Bulk upload result."""

    total_rows: int
    successful: int
    failed: int
    errors: list[SubjectBulkUploadError]
