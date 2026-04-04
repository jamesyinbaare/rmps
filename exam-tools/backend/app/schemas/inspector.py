from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import UserRole


class InspectorCreate(BaseModel):
    """Inspector login uses ``school_code`` and ``phone_number`` (no password hash)."""

    school_code: str = Field(..., max_length=10)
    phone_number: str = Field(..., max_length=50)
    full_name: str = Field(..., max_length=255, min_length=1)

    model_config = ConfigDict(str_strip_whitespace=True)


class InspectorCreatedResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    school_code: str | None
    phone_number: str | None
    full_name: str
    role: UserRole
    created_at: datetime


class InspectorBulkUploadError(BaseModel):
    row_number: int
    error_message: str


class InspectorBulkCreatedRow(BaseModel):
    row_number: int
    school_code: str
    phone_number: str
    full_name: str


class InspectorBulkUploadResponse(BaseModel):
    total_rows: int
    successful: int
    failed: int
    errors: list[InspectorBulkUploadError]
    created: list[InspectorBulkCreatedRow] = []
