from datetime import date, datetime, time
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ExaminationCreate(BaseModel):
    exam_type: str = Field(..., min_length=1, max_length=50)
    exam_series: str | None = Field(None, max_length=20)
    year: int = Field(..., ge=1900, le=2100)
    description: str | None = None


class ExaminationUpdate(BaseModel):
    exam_type: str | None = Field(None, min_length=1, max_length=50)
    exam_series: str | None = Field(None, max_length=20)
    year: int | None = Field(None, ge=1900, le=2100)
    description: str | None = None


class ExaminationResponse(BaseModel):
    id: int
    exam_type: str
    exam_series: str | None
    year: int
    description: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExaminationScheduleCreate(BaseModel):
    original_code: str = Field(..., min_length=1, max_length=50, description="Subject original_code or code to look up")
    papers: list[dict[str, Any]] = Field(
        ...,
        description="Papers with date and start_time (ISO), optional end_time",
    )
    venue: str | None = Field(None, max_length=255)
    duration_minutes: int | None = Field(None, ge=1)
    instructions: str | None = None

    @field_validator("papers")
    @classmethod
    def validate_papers(cls, v: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not v:
            raise ValueError("papers list cannot be empty")
        for paper_entry in v:
            if not isinstance(paper_entry, dict):
                raise ValueError("Each paper entry must be a dictionary")
            if "paper" not in paper_entry:
                raise ValueError("Each paper entry must have a 'paper' field")
            if paper_entry["paper"] not in (1, 2):
                raise ValueError("Paper number must be 1 or 2")
            if "date" not in paper_entry:
                raise ValueError("Each paper entry must have a 'date' field")
            if "start_time" not in paper_entry:
                raise ValueError("Each paper entry must have a 'start_time' field")
            try:
                date.fromisoformat(str(paper_entry["date"]).split("T")[0])
            except (ValueError, TypeError) as e:
                raise ValueError(
                    f"Invalid date format for paper {paper_entry['paper']}. Use YYYY-MM-DD",
                ) from e
            try:
                time.fromisoformat(str(paper_entry["start_time"]))
            except (ValueError, TypeError) as e:
                raise ValueError(
                    f"Invalid start_time for paper {paper_entry['paper']}. Use HH:MM or HH:MM:SS",
                ) from e
            if "end_time" in paper_entry and paper_entry["end_time"] is not None:
                try:
                    time.fromisoformat(str(paper_entry["end_time"]))
                except (ValueError, TypeError) as e:
                    raise ValueError(
                        f"Invalid end_time for paper {paper_entry['paper']}",
                    ) from e
        return v


class ExaminationScheduleUpdate(BaseModel):
    subject_code: str | None = Field(None, min_length=1, max_length=50)
    subject_name: str | None = Field(None, min_length=1, max_length=255)
    papers: list[dict[str, Any]] | None = None
    venue: str | None = Field(None, max_length=255)
    duration_minutes: int | None = Field(None, ge=1)
    instructions: str | None = None

    @field_validator("papers")
    @classmethod
    def validate_papers(cls, v: list[dict[str, Any]] | None) -> list[dict[str, Any]] | None:
        if v is None:
            return v
        if not v:
            raise ValueError("papers list cannot be empty")
        for paper_entry in v:
            if not isinstance(paper_entry, dict) or "paper" not in paper_entry:
                raise ValueError("Invalid paper entry")
            if paper_entry["paper"] not in (1, 2):
                raise ValueError("Paper number must be 1 or 2")
            if "date" not in paper_entry or "start_time" not in paper_entry:
                raise ValueError("Each paper needs date and start_time")
            date.fromisoformat(str(paper_entry["date"]).split("T")[0])
            time.fromisoformat(str(paper_entry["start_time"]))
            if "end_time" in paper_entry and paper_entry["end_time"] is not None:
                time.fromisoformat(str(paper_entry["end_time"]))
        return v


class ExaminationScheduleBulkUploadError(BaseModel):
    row_number: int
    error_message: str
    field: str | None = None


class ExaminationScheduleBulkUploadResponse(BaseModel):
    total_rows: int
    successful: int
    failed: int
    errors: list[ExaminationScheduleBulkUploadError]


class ExaminationScheduleResponse(BaseModel):
    id: int
    examination_id: int
    subject_code: str
    subject_name: str
    papers: list[dict[str, Any]]
    venue: str | None
    duration_minutes: int | None
    instructions: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TimetableEntry(BaseModel):
    subject_code: str
    subject_name: str
    paper: int
    examination_date: date
    examination_time: time
    examination_end_time: time | None = None
    venue: str | None = None
    duration_minutes: int | None = None
    instructions: str | None = None


class TimetablePreviewResponse(BaseModel):
    examination_id: int
    exam_type: str
    exam_series: str | None
    year: int
    school_id: UUID | None = None
    school_code: str | None = None
    entries: list[TimetableEntry]


class CenterScopeSchoolItem(BaseModel):
    id: UUID
    code: str
    name: str

    model_config = {"from_attributes": True}


class MyCenterSchoolsResponse(BaseModel):
    center_school_id: UUID
    schools: list[CenterScopeSchoolItem]


class CentreScopeProgrammeItem(BaseModel):
    """Programme linked to the centre (or selected school) with subject count from programme_subjects."""

    id: int
    code: str
    name: str
    subject_count: int = Field(ge=0, description="Subjects associated with this programme.")


class MyCenterProgrammesResponse(BaseModel):
    programmes: list[CentreScopeProgrammeItem]


class StaffCentreOverviewUpcomingItem(BaseModel):
    """Single timetable slot (subject + paper) for dashboard preview."""

    subject_code: str
    subject_name: str
    paper: int
    examination_date: date
    examination_time: time


class StaffCentreOverviewResponse(BaseModel):
    """Supervisor/inspector dashboard: centre scope stats and next timetable slots."""

    examination_id: int
    exam_type: str
    exam_series: str | None
    year: int
    candidate_count: int = Field(ge=0, description="Candidates registered for this exam at schools in the centre scope.")
    school_count: int = Field(ge=0, description="Schools in the examination centre (host plus schools that write there).")
    upcoming: list[StaffCentreOverviewUpcomingItem] = Field(
        default_factory=list,
        description="Future sessions from the centre timetable (candidate-linked subjects), sorted by date and time.",
    )
    sessions_today: list[StaffCentreOverviewUpcomingItem] = Field(
        default_factory=list,
        description="All sessions on today's calendar date in the centre timezone (including papers that already started).",
    )


class StaffCentreDaySummarySlotRow(BaseModel):
    subject_code: str
    subject_name: str
    papers_label: str = Field(description='Paper number(s), e.g. "1" or "1 & 2" when merged same day.')
    times_label: str = Field(description='Start time(s), e.g. "09:00" or "09:00 · 14:00" when times differ.')
    counts_by_school: list[int] = Field(
        default_factory=list,
        description="Per-school counts in the same order as `schools` on the response (after excluding schools with no candidates that day).",
    )
    row_total: int = Field(ge=0)


class StaffCentreDaySummaryResponse(BaseModel):
    examination_date: date
    schools: list[CenterScopeSchoolItem] = Field(
        default_factory=list,
        description="Schools with at least one candidate on this day, in centre order; drives pivoted table rows.",
    )
    slots: list[StaffCentreDaySummarySlotRow] = Field(default_factory=list)
    unique_candidates: int = Field(ge=0)
    invigilators_required: int = Field(ge=0, description="ceil(unique_candidates / 30); 0 if no candidates.")


class ExaminationScriptSeriesConfigRow(BaseModel):
    subject_id: int
    subject_code: str
    subject_name: str
    series_count: int = Field(ge=1, le=32767, description="Number of packing series for this subject (each paper shows series 1..N).")


class ExaminationScriptSeriesConfigResponse(BaseModel):
    items: list[ExaminationScriptSeriesConfigRow]


class ExaminationScriptSeriesConfigPut(BaseModel):
    items: list[ExaminationScriptSeriesConfigRow]

    @field_validator("items")
    @classmethod
    def unique_subject_ids(cls, v: list[ExaminationScriptSeriesConfigRow]) -> list[ExaminationScriptSeriesConfigRow]:
        ids = [r.subject_id for r in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate subject_id in items")
        return v
