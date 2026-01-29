"""Examination and subject examiner schemas."""
from datetime import datetime, timezone
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.models import ExamSeries, ExamType, MarkingCycleStatus


def _naive_utc(dt: datetime | None) -> datetime | None:
    """Convert to naive UTC for TIMESTAMP WITHOUT TIME ZONE columns."""
    if dt is None:
        return None
    if not isinstance(dt, datetime):
        return dt
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _parse_exam_type(v: ExamType | str) -> ExamType:
    """Accept enum name (CERTIFICATE_II) or value (Certificate II Examinations)."""
    if isinstance(v, ExamType):
        return v
    s = v if isinstance(v, str) else str(v)
    try:
        return ExamType(s)  # value match
    except ValueError:
        pass
    try:
        return ExamType[s]  # name match (e.g. CERTIFICATE_II)
    except KeyError:
        raise ValueError(f"Invalid ExamType: {s!r}")


def _parse_exam_series(v: ExamSeries | str | None) -> ExamSeries | None:
    """Accept enum name (MAY_JUNE) or value (MAY/JUNE)."""
    if v is None:
        return None
    if isinstance(v, ExamSeries):
        return v
    s = v if isinstance(v, str) else str(v)
    try:
        return ExamSeries(s)  # value match
    except ValueError:
        pass
    try:
        return ExamSeries[s]  # name match
    except KeyError:
        raise ValueError(f"Invalid ExamSeries: {s!r}")


# -----------------------------------------------------------------------------
# Examination
# -----------------------------------------------------------------------------


class ExaminationCreate(BaseModel):
    """Create examination request."""

    type: ExamType
    series: ExamSeries | None = None
    year: int
    acceptance_deadline: datetime | None = None

    @field_validator("type", mode="before")
    @classmethod
    def type_accept_name_or_value(cls, v: ExamType | str) -> ExamType:
        return _parse_exam_type(v)

    @field_validator("series", mode="before")
    @classmethod
    def series_accept_name_or_value(cls, v: ExamSeries | str | None) -> ExamSeries | None:
        return _parse_exam_series(v)

    @field_validator("acceptance_deadline", mode="after")
    @classmethod
    def acceptance_deadline_naive_utc(cls, v: datetime | None) -> datetime | None:
        return _naive_utc(v)


class ExaminationUpdate(BaseModel):
    """Update examination request."""

    type: ExamType | None = None
    series: ExamSeries | None = None
    year: int | None = None
    acceptance_deadline: datetime | None = None

    @field_validator("type", mode="before")
    @classmethod
    def type_accept_name_or_value(cls, v: ExamType | str | None) -> ExamType | None:
        if v is None:
            return None
        return _parse_exam_type(v)

    @field_validator("series", mode="before")
    @classmethod
    def series_accept_name_or_value(cls, v: ExamSeries | str | None) -> ExamSeries | None:
        return _parse_exam_series(v)

    @field_validator("acceptance_deadline", mode="after")
    @classmethod
    def acceptance_deadline_naive_utc(cls, v: datetime | None) -> datetime | None:
        return _naive_utc(v)


class ExaminationResponse(BaseModel):
    """Examination response."""

    id: UUID
    type: ExamType
    series: ExamSeries | None
    year: int
    acceptance_deadline: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# -----------------------------------------------------------------------------
# Subject examiner
# -----------------------------------------------------------------------------


class SubjectExaminerCreate(BaseModel):
    """Create subject examiner request."""

    subject_id: UUID
    total_required: int
    experience_ratio: float


class SubjectExaminerUpdate(BaseModel):
    """Update subject examiner request."""

    total_required: int | None = None
    experience_ratio: float | None = None
    status: MarkingCycleStatus | None = None


class SubjectExaminerResponse(BaseModel):
    """Subject examiner response."""

    id: UUID
    examination_id: UUID
    subject_id: UUID
    total_required: int
    experience_ratio: float
    status: MarkingCycleStatus
    created_at: datetime
    updated_at: datetime
    # Optional display fields (populated when needed)
    examination_type: ExamType | None = None
    examination_series: ExamSeries | None = None
    examination_year: int | None = None
    acceptance_deadline: datetime | None = None

    class Config:
        from_attributes = True
