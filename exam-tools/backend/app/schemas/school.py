from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import Region, SchoolType, Zone
from app.schemas.inspector import InspectorSchoolRow


class SchoolCreate(BaseModel):
    code: str = Field(..., max_length=15)
    name: str = Field(..., max_length=255)
    region: Region
    zone: Zone
    school_type: SchoolType | None = None
    is_private_examination_center: bool = False
    writes_at_center_id: UUID | None = None
    writes_at_center_code: str | None = Field(
        None,
        max_length=15,
        description="Host examination centre school code; do not set together with writes_at_center_id.",
    )
    depot_code: str | None = Field(
        None,
        max_length=32,
        description="Assign to depot by code when creating (must match an existing depot).",
    )


class SchoolUpdate(BaseModel):
    """Partial update. School ``code`` is immutable (supervisor login)."""

    name: str | None = Field(None, max_length=255)
    region: Region | None = None
    zone: Zone | None = None
    school_type: SchoolType | None = None
    is_private_examination_center: bool | None = None
    writes_at_center_id: UUID | None = None
    writes_at_center_code: str | None = Field(
        default=None,
        max_length=15,
        description="Host examination centre by school code; empty clears. Do not set together with writes_at_center_id.",
    )
    depot_id: UUID | None = None
    depot_code: str | None = Field(
        default=None,
        max_length=32,
        description="Assign by depot code; null or empty clears. Omit to leave unchanged.",
    )


class SchoolResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    region: Region
    zone: Zone
    school_type: SchoolType | None
    is_private_examination_center: bool
    writes_at_center_id: UUID | None
    writes_at_center_code: str | None = None
    depot_id: UUID | None = None
    depot_code: str | None = None
    created_at: datetime
    updated_at: datetime


class SchoolCreatedResponse(BaseModel):
    """Supervisor credentials: ``supervisor_full_name`` and ``supervisor_initial_password`` equal school ``code``."""

    school: SchoolResponse
    supervisor_full_name: str
    supervisor_initial_password: str


class SchoolBulkUploadError(BaseModel):
    row_number: int
    error_message: str


class ProvisionedSupervisor(BaseModel):
    """``supervisor_full_name`` and ``supervisor_initial_password`` match ``school_code``."""

    row_number: int
    school_code: str
    supervisor_full_name: str
    supervisor_initial_password: str


class SchoolBulkUploadResponse(BaseModel):
    total_rows: int
    successful: int
    failed: int
    errors: list[SchoolBulkUploadError]
    provisioned_supervisors: list[ProvisionedSupervisor] = []


class SchoolListResponse(BaseModel):
    items: list[SchoolResponse]
    total: int


class ExaminationCenterSummary(BaseModel):
    """A school with ``writes_at_center_id`` null acts as an examination centre host."""

    school: SchoolResponse
    hosted_school_count: int


class ExaminationCenterListResponse(BaseModel):
    items: list[ExaminationCenterSummary]
    total: int


class ExaminationCenterDetailResponse(BaseModel):
    center: SchoolResponse
    hosted_schools: list[SchoolResponse]
    inspectors: list[InspectorSchoolRow]
