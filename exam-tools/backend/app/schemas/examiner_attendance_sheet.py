from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ExaminerAttendanceSheetResponse(BaseModel):
    id: UUID
    examination_id: int
    subject_id: int
    cohort_id: UUID
    cohort_name: str
    attendance_date: date
    notes: str | None
    original_filename: str
    size_bytes: int
    uploaded_by_id: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExaminerAttendanceSheetListResponse(BaseModel):
    items: list[ExaminerAttendanceSheetResponse]
    total: int


class ExaminerAttendanceSheetAdminResponse(ExaminerAttendanceSheetResponse):
    subject_code: str
    subject_name: str
    uploader_full_name: str | None = None


class ExaminerAttendanceSheetAdminListResponse(BaseModel):
    items: list[ExaminerAttendanceSheetAdminResponse]
    total: int
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=200)


class ExaminerAttendanceSheetAdminSummaryResponse(BaseModel):
    total_uploads: int
    cohorts_with_uploads: int
    cohorts_expected: int | None = None
    cohorts_missing: int | None = None
