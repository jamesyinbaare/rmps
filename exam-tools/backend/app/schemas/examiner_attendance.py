from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ExaminerAttendanceMarkRequest(BaseModel):
    reference_code: str = Field(min_length=1, max_length=64)


class ExaminerAttendanceRow(BaseModel):
    id: UUID
    examination_id: int
    examiner_id: UUID
    reference_code: str
    attendance_date: date
    examiner_name: str
    examiner_type: str
    examiner_type_label: str
    region: str
    subject_codes: list[str]
    marked_at: datetime
    marked_by_name: str | None = None
    examination_name: str | None = None


class ExaminerAttendanceMarkResponse(BaseModel):
    valid: bool
    recorded: bool = False
    already_marked: bool = False
    message: str
    reference_code: str | None = None
    name: str | None = None
    examiner_type: str | None = None
    examiner_type_label: str | None = None
    region: str | None = None
    subject_codes: list[str] = Field(default_factory=list)
    examiner_id: UUID | None = None
    examination_id: int | None = None
    examination_name: str | None = None
    attendance_date: date | None = None


class ExaminerAttendanceListResponse(BaseModel):
    items: list[ExaminerAttendanceRow]
    total: int
