from datetime import date, datetime, time
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.admin_exam_official import AdminExamCentreOfficialRow


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
    centre_structure_mode: str
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


class MyDepotSchoolsResponse(BaseModel):
    """Schools assigned to the depot keeper's depot (for timetable filters)."""

    schools: list[CenterScopeSchoolItem]


class StaffCentreOverviewUpcomingItem(BaseModel):
    """Single timetable slot (subject + paper) for dashboard preview."""

    subject_code: str
    subject_name: str
    paper: int
    examination_date: date
    examination_time: time


class InspectorPostedWorkspaceItem(BaseModel):
    """Inspector operational workspace for an examination (posting)."""

    posting_id: UUID
    center_id: UUID
    center_code: str
    center_name: str
    subject_scope: str


class StaffCentreSchoolCandidateItem(BaseModel):
    """Per-school candidate totals within a centre scope."""

    school_id: UUID
    school_code: str
    school_name: str
    candidate_count: int = Field(ge=0)


class StaffCandidateWriteDestination(BaseModel):
    """Where this school's candidates write for one centre membership scope."""

    subject_scope: str = Field(description="Membership scope: ALL, CORE, or ELECTIVE.")
    centre_id: UUID
    centre_code: str
    centre_name: str
    centre_region: str = Field(description="Region of the examination centre.")


class StaffCentreOverviewResponse(BaseModel):
    """Supervisor/inspector dashboard: centre scope stats and next timetable slots."""

    examination_id: int
    exam_type: str
    exam_series: str | None
    year: int
    supervisor_school_code: str = Field(description="School code linked to this account.")
    supervisor_school_name: str = Field(description="Name of the school linked to this account.")
    examination_centre_host_school_id: UUID = Field(description="Host school id for this examination centre cluster.")
    examination_centre_host_code: str = Field(description="Host school code (examination centre).")
    examination_centre_host_name: str = Field(description="Host school name (examination centre).")
    supervisor_school_is_centre_host: bool = Field(
        description="True when this account's school is the examination centre host (writes_at_center_id is null).",
    )
    centre_structure_mode: str = Field(
        default="UNIFIED",
        description="UNIFIED or SPLIT — determines whether multiple write destinations per scope are expected.",
    )
    candidate_write_destinations: list[StaffCandidateWriteDestination] = Field(
        default_factory=list,
        description="Per membership scope, which examination centre this school writes at (SPLIT may list CORE and ELECTIVE separately).",
    )
    dashboard_viewer: str = Field(
        default="supervisor",
        description="supervisor or inspector — controls dashboard presentation.",
    )
    centre_subject_scope: str | None = Field(
        default=None,
        description="When dashboard_viewer is inspector: ALL, CORE, or ELECTIVE for the active workspace scope.",
    )
    candidate_count: int = Field(ge=0, description="Candidates registered for this exam at schools in the centre scope.")
    school_count: int = Field(
        ge=0,
        description="Schools in centre scope with at least one registered candidate for this examination.",
    )
    upcoming: list[StaffCentreOverviewUpcomingItem] = Field(
        default_factory=list,
        description="Future sessions from the centre timetable (candidate-linked subjects), sorted by date and time.",
    )
    sessions_today: list[StaffCentreOverviewUpcomingItem] = Field(
        default_factory=list,
        description="All sessions on today's calendar date in the centre timezone (including papers that already started).",
    )
    examination_centre_region: str = Field(
        description="Human-readable region of the examination centre host school.",
    )
    examination_window_start: date | None = Field(
        default=None,
        description="Earliest candidate-linked timetable date for this examination at the centre, if any.",
    )
    examination_window_end: date | None = Field(
        default=None,
        description="Latest candidate-linked timetable date for this examination at the centre, if any.",
    )
    schools_with_candidate_counts: list[StaffCentreSchoolCandidateItem] = Field(
        default_factory=list,
        description="Schools in centre scope with at least one registered candidate, ordered by school code.",
    )
    inspector_posted_workspaces: list[InspectorPostedWorkspaceItem] | None = Field(
        default=None,
        description="Inspectors with postings: workspaces (centre + subject scope) for this examination.",
    )


class ExecutiveCentreListItem(BaseModel):
    """Examination centre host with aggregated candidate counts (national executive list)."""

    center_id: UUID
    center_code: str
    center_name: str
    region: str
    zone: str
    candidate_count: int = Field(ge=0)
    school_count: int = Field(ge=0, description="Schools in centre scope with at least one candidate.")
    inspector_count: int = Field(ge=0, description="Inspector postings at this centre for the examination.")


class NationalExecutiveOverviewResponse(StaffCentreOverviewResponse):
    """National monitoring overview plus per-centre rows for drill-down."""

    centres: list[ExecutiveCentreListItem] = Field(default_factory=list)
    centre_count: int = Field(
        ge=0,
        description="Examination centres with candidates in scope (always set; equals len(centres) when centres are included).",
    )


class ExecutivePostedInspectorItem(BaseModel):
    posting_id: UUID
    inspector_full_name: str
    inspector_phone_number: str | None = None
    subject_scope: str


class ExecutiveCentreDetailResponse(BaseModel):
    overview: StaffCentreOverviewResponse
    posted_inspectors: list[ExecutivePostedInspectorItem] = Field(default_factory=list)
    posted_inspector_posting_count: int = Field(
        0,
        description="Inspector postings before identity merge (CORE+ELECTIVE pairs count as two).",
    )


class StaffDepotOverviewResponse(BaseModel):
    """Depot keeper: depot-wide candidate/school counts and timetable slots."""

    examination_id: int
    exam_type: str
    exam_series: str | None
    year: int
    depot_code: str
    depot_name: str
    candidate_count: int = Field(ge=0, description="Candidates at depot schools for this examination.")
    school_count: int = Field(ge=0, description="Schools in the depot.")
    upcoming: list[StaffCentreOverviewUpcomingItem] = Field(
        default_factory=list,
        description="Future sessions from candidate-linked timetable entries, sorted by date and time.",
    )
    sessions_today: list[StaffCentreOverviewUpcomingItem] = Field(
        default_factory=list,
        description="All sessions on today's date in the configured timezone.",
    )
    timetable_distinct_subject_count: int = Field(
        ge=0,
        description="Distinct subject codes on the candidate-linked timetable for this examination and depot.",
    )
    region_summary: str | None = Field(
        default=None,
        description="Human-readable region label when all depot schools share one region; otherwise a multi-region label.",
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


class FinanceCentreDayInvigilatorRow(BaseModel):
    examination_date: date
    unique_candidates: int = Field(ge=0)
    invigilators_required: int = Field(ge=0)


class FinanceCentreInvigilatorSummaryItem(BaseModel):
    center_id: UUID
    center_code: str
    center_name: str
    days: list[FinanceCentreDayInvigilatorRow] = Field(default_factory=list)


class FinanceCentreInvigilatorSummaryResponse(BaseModel):
    examination_id: int
    centres: list[FinanceCentreInvigilatorSummaryItem] = Field(default_factory=list)


class FinanceCentreShellCentre(BaseModel):
    center_id: UUID
    center_code: str
    center_name: str


class FinanceCentreInvigilatorSummaryShellResponse(BaseModel):
    """Centre list and examination dates for progressive finance grid loading."""

    examination_id: int
    examination_dates: list[date] = Field(default_factory=list)
    centres: list[FinanceCentreShellCentre] = Field(default_factory=list)


class FinanceCentreSchoolSummaryRoleCounts(BaseModel):
    external_inspector: int = Field(0, ge=0)
    police_officer: int = Field(0, ge=0)
    supervisor: int = Field(0, ge=0)
    depot_keeper: int = Field(0, ge=0)
    assistant_supervisor: int = Field(0, ge=0)


class FinanceCentreSchoolSummaryResponse(BaseModel):
    center_id: UUID
    center_code: str
    center_name: str
    subject_filter: str
    expected_invigilations_total: int = Field(ge=0)
    invigilator_days_declared: int = Field(ge=0)
    variance: int
    role_counts: FinanceCentreSchoolSummaryRoleCounts
    officials: list[AdminExamCentreOfficialRow] = Field(default_factory=list)


class FinanceCentreOfficialStatisticsRow(BaseModel):
    center_id: UUID
    center_code: str
    center_name: str
    invigilator_count: int = Field(0, ge=0)
    invigilator_days: int = Field(0, ge=0)
    expected_invigilator_days: int = Field(0, ge=0)
    invigilator_variance: int = 0
    external_inspector: int = Field(0, ge=0)
    supervisor: int = Field(0, ge=0)
    assistant_supervisor: int = Field(0, ge=0)
    police_officer: int = Field(0, ge=0)
    depot_keeper: int = Field(0, ge=0)
    total_officials: int = Field(0, ge=0)


class FinanceCentreOfficialStatisticsResponse(BaseModel):
    examination_id: int
    subject_filter: str
    centres: list[FinanceCentreOfficialStatisticsRow] = Field(default_factory=list)
    totals: FinanceCentreOfficialStatisticsRow


class FinanceCentreOfficialStatisticsShellResponse(BaseModel):
    """Centre list for progressive official statistics loading."""

    examination_id: int
    subject_filter: str
    centres: list[FinanceCentreShellCentre] = Field(default_factory=list)


class FinanceCentreOfficialStatisticsExportBody(BaseModel):
    """Pre-computed statistics for Excel export (no server-side recalculation)."""

    exam_label: str = Field(..., min_length=1)
    summary: FinanceCentreOfficialStatisticsResponse


class ExaminationScriptSeriesConfigRow(BaseModel):
    subject_id: int
    subject_code: str
    subject_name: str
    subject_type: str = Field(description="CORE or ELECTIVE")
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
