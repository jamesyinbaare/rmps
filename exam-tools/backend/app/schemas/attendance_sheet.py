from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AttendanceScheduledDateItem(BaseModel):
    examination_date: date
    subject_scopes: list[str] = Field(description="CORE and/or ELECTIVE scheduled at the centre on this date")


class AttendanceSheetScheduledDatesResponse(BaseModel):
    dates: list[AttendanceScheduledDateItem]
    today: date


class AttendanceSheetResponse(BaseModel):
    id: UUID
    examination_id: int
    inspector_exam_posting_id: UUID
    center_id: UUID
    center_code: str
    center_name: str
    subject_scope: str
    examination_date: date
    notes: str | None
    original_filename: str
    size_bytes: int
    uploaded_by_id: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AttendanceSheetListResponse(BaseModel):
    items: list[AttendanceSheetResponse]
    total: int


class AttendanceSheetAdminResponse(AttendanceSheetResponse):
    inspector_user_id: UUID
    inspector_full_name: str
    inspector_phone: str | None = None


class AttendanceSheetAdminListResponse(BaseModel):
    items: list[AttendanceSheetAdminResponse]
    total: int
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=200)


class AttendanceSheetAdminSummaryResponse(BaseModel):
    total_uploads: int
    centres_with_uploads: int
    centres_expected: int | None = None
    centres_missing: int | None = None


class AttendanceCentreComplianceItem(BaseModel):
    center_id: UUID
    center_code: str
    center_name: str
    inspector_user_id: UUID
    inspector_full_name: str
    inspector_phone: str | None = None
    subject_scope: str
    file_count: int = 0
    upload_status: str  # "uploaded" | "missing" | "not_due"


class AttendanceCentreComplianceListResponse(BaseModel):
    items: list[AttendanceCentreComplianceItem]
    total: int
