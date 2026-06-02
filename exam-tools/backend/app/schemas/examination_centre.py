"""Schemas for per-examination centre management."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import CentreStructureMode, ExaminationCentreMembershipScope
from app.schemas.centre_location import CentreLocationResponse
from app.schemas.school import PostedInspectorAtCentreRow


class ExaminationCentreResponse(BaseModel):
    id: UUID
    examination_id: int
    code: str
    name: str
    region: str | None = None
    zone: str | None = None
    hosted_school_count: int = 0
    has_location: bool = False
    location: CentreLocationResponse | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExaminationCentreListResponse(BaseModel):
    items: list[ExaminationCentreResponse]
    total: int
    centre_structure_mode: CentreStructureMode


class ExaminationCentreMembershipItem(BaseModel):
    school_id: UUID
    school_code: str
    school_name: str
    subject_scope: ExaminationCentreMembershipScope


class ExaminationCentreDetailResponse(BaseModel):
    centre: ExaminationCentreResponse
    memberships: list[ExaminationCentreMembershipItem]
    posted_inspectors: list[PostedInspectorAtCentreRow] = []
    posted_inspector_posting_count: int = Field(
        0,
        description="Inspector postings before identity merge (CORE+ELECTIVE pairs count as two).",
    )


class ExaminationCentreCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=255)
    region: str | None = None
    zone: str | None = None


class ExaminationCentreUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=32)
    name: str | None = Field(None, min_length=1, max_length=255)
    region: str | None = None
    zone: str | None = None


class ExaminationCentreMembershipAssign(BaseModel):
    school_code: str
    subject_scope: ExaminationCentreMembershipScope


class ExaminationCentreMembershipBulkUpdate(BaseModel):
    assignments: list[ExaminationCentreMembershipAssign]


class UpgradeToSplitResponse(BaseModel):
    examination_id: int
    centre_structure_mode: CentreStructureMode
    memberships_created: int
    memberships_removed: int


class ExaminationCentreBulkUploadError(BaseModel):
    row_number: int
    error_message: str


class ExaminationCentreBulkUploadResponse(BaseModel):
    examination_id: int
    subject_scope: ExaminationCentreMembershipScope
    total_rows: int
    centres_created: int
    memberships_added: int
    memberships_skipped: int
    failed: int
    errors: list[ExaminationCentreBulkUploadError] = Field(default_factory=list)
