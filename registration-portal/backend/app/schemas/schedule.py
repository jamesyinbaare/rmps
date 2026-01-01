from datetime import date, datetime, time

from pydantic import BaseModel, Field


class ExaminationScheduleCreate(BaseModel):
    """Schema for creating an examination schedule."""

    subject_code: str = Field(..., min_length=1, max_length=10)
    subject_name: str = Field(..., min_length=1, max_length=255)
    examination_date: date
    examination_time: time
    examination_end_time: time | None = None
    venue: str | None = Field(None, max_length=255)
    duration_minutes: int | None = Field(None, ge=1)
    instructions: str | None = None


class ExaminationScheduleUpdate(BaseModel):
    """Schema for updating an examination schedule."""

    subject_code: str | None = Field(None, min_length=1, max_length=10)
    subject_name: str | None = Field(None, min_length=1, max_length=255)
    examination_date: date | None = None
    examination_time: time | None = None
    examination_end_time: time | None = None
    venue: str | None = Field(None, max_length=255)
    duration_minutes: int | None = Field(None, ge=1)
    instructions: str | None = None


class ExaminationScheduleResponse(BaseModel):
    """Schema for examination schedule response."""

    id: int
    registration_exam_id: int
    subject_code: str
    subject_name: str
    examination_date: date
    examination_time: time
    examination_end_time: time | None = None
    venue: str | None = None
    duration_minutes: int | None = None
    instructions: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TimetableEntry(BaseModel):
    """Schema for a single timetable entry."""

    subject_code: str
    subject_name: str
    examination_date: date
    examination_time: time
    examination_end_time: time | None = None
    venue: str | None = None
    duration_minutes: int | None = None
    instructions: str | None = None


class TimetableResponse(BaseModel):
    """Schema for timetable response."""

    exam_id: int
    exam_type: str
    exam_series: str
    year: int
    entries: list[TimetableEntry]
