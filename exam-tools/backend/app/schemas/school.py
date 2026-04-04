from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import Region, SchoolType, Zone


class SchoolCreate(BaseModel):
    code: str = Field(..., max_length=6)
    name: str = Field(..., max_length=255)
    region: Region
    zone: Zone
    school_type: SchoolType | None = None
    is_private_examination_center: bool = False
    writes_at_center_id: UUID | None = None


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
