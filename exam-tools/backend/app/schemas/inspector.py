from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import UserRole


class InspectorCreate(BaseModel):
    """Inspector accounts use phone + password; optional postings via core/elective centre host codes."""

    phone_number: str = Field(..., max_length=50)
    full_name: str = Field(..., max_length=255, min_length=1)
    password: str = Field(..., min_length=8)
    examination_id: int | None = None
    core: str | None = None
    elective: str | None = None

    model_config = ConfigDict(str_strip_whitespace=True)

    @model_validator(mode="after")
    def validate_posting_fields(self) -> Self:
        core_s = (self.core or "").strip()
        elective_s = (self.elective or "").strip()
        touched = self.examination_id is not None or bool(core_s) or bool(elective_s)
        if not touched:
            return self
        if self.examination_id is None:
            raise ValueError("examination_id is required when core or elective is set")
        if not core_s and not elective_s:
            raise ValueError("At least one of core or elective centre codes is required when examination_id is set")
        return self


class InspectorCreatedPostingRow(BaseModel):
    posting_id: UUID
    center_code: str
    subject_scope: str


class InspectorCreatedResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    school_code: str | None
    phone_number: str | None
    full_name: str
    role: UserRole
    created_at: datetime
    created_postings: list[InspectorCreatedPostingRow] = Field(default_factory=list)


class InspectorBulkUploadError(BaseModel):
    row_number: int
    error_message: str


class InspectorBulkCreatedRow(BaseModel):
    row_number: int
    phone_number: str
    full_name: str


class InspectorBulkUploadResponse(BaseModel):
    total_rows: int
    successful: int
    failed: int
    errors: list[InspectorBulkUploadError]
    created: list[InspectorBulkCreatedRow] = []


class InspectorSchoolRow(BaseModel):
    """Inspector directory row (no home school: assignments are via postings)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    phone_number: str | None
    school_code: str | None
    school_name: str | None = None
    is_active: bool = True


class InspectorUpdate(BaseModel):
    full_name: str | None = Field(None, max_length=255, min_length=1)
    phone_number: str | None = Field(None, max_length=50)
    is_active: bool | None = None

    model_config = ConfigDict(str_strip_whitespace=True)

    @model_validator(mode="after")
    def require_at_least_one_field(self) -> Self:
        if self.full_name is None and self.phone_number is None and self.is_active is None:
            raise ValueError("At least one of full_name, phone_number, or is_active must be provided")
        return self


class InspectorPasswordReset(BaseModel):
    new_password: str = Field(..., min_length=8)


class InspectorListResponse(BaseModel):
    items: list[InspectorSchoolRow]
    total: int
