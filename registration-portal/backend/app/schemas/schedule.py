from datetime import date, datetime, time
from typing import Any

from pydantic import BaseModel, Field, field_validator


class ExaminationScheduleBulkUploadError(BaseModel):
    """Schema for bulk upload error details."""

    row_number: int
    error_message: str
    field: str | None = None


class ExaminationScheduleBulkUploadResponse(BaseModel):
    """Schema for bulk upload response."""

    total_rows: int
    successful: int
    failed: int
    errors: list[ExaminationScheduleBulkUploadError]


class ExaminationScheduleCreate(BaseModel):
    """Schema for creating an examination schedule."""

    original_code: str = Field(..., min_length=1, max_length=50, description="Subject original_code to lookup")
    examination_date: date
    examination_time: time
    examination_end_time: time | None = None
    papers: list[dict[str, Any]] = Field(default=[{"paper": 1}], description="List of papers: [{'paper': 1}, {'paper': 2}] or [{'paper': 1, 'start_time': '...', 'end_time': '...'}, ...]")
    venue: str | None = Field(None, max_length=255)
    duration_minutes: int | None = Field(None, ge=1)
    instructions: str | None = None

    @field_validator("papers")
    @classmethod
    def validate_papers(cls, v: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Validate papers structure."""
        if not v:
            raise ValueError("papers list cannot be empty")
        for paper_entry in v:
            if not isinstance(paper_entry, dict):
                raise ValueError("Each paper entry must be a dictionary")
            if "paper" not in paper_entry:
                raise ValueError("Each paper entry must have a 'paper' field")
            if paper_entry["paper"] not in [1, 2]:
                raise ValueError("Paper number must be 1 or 2")
        return v


class ExaminationScheduleUpdate(BaseModel):
    """Schema for updating an examination schedule."""

    subject_code: str | None = Field(None, min_length=1, max_length=10)
    subject_name: str | None = Field(None, min_length=1, max_length=255)
    examination_date: date | None = None
    examination_time: time | None = None
    examination_end_time: time | None = None
    papers: list[dict[str, Any]] | None = Field(None, description="List of papers: [{'paper': 1}, {'paper': 2}] or [{'paper': 1, 'start_time': '...', 'end_time': '...'}, ...]")
    venue: str | None = Field(None, max_length=255)
    duration_minutes: int | None = Field(None, ge=1)
    instructions: str | None = None

    @field_validator("papers")
    @classmethod
    def validate_papers(cls, v: list[dict[str, Any]] | None) -> list[dict[str, Any]] | None:
        """Validate papers structure."""
        if v is None:
            return v
        if not v:
            raise ValueError("papers list cannot be empty")
        for paper_entry in v:
            if not isinstance(paper_entry, dict):
                raise ValueError("Each paper entry must be a dictionary")
            if "paper" not in paper_entry:
                raise ValueError("Each paper entry must have a 'paper' field")
            if paper_entry["paper"] not in [1, 2]:
                raise ValueError("Paper number must be 1 or 2")
        return v


class ExaminationScheduleResponse(BaseModel):
    """Schema for examination schedule response."""

    id: int
    registration_exam_id: int
    subject_code: str
    subject_name: str
    examination_date: date
    examination_time: time
    examination_end_time: time | None = None
    papers: list[dict[str, Any]] = Field(default=[{"paper": 1}])
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
