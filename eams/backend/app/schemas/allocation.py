"""Allocation schemas."""
from datetime import datetime, timezone
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.models import AcceptanceStatus, AllocationStatus, MarkingCycleStatus, QuotaType


def _naive_utc(dt: datetime | None) -> datetime | None:
    """Convert to naive UTC for TIMESTAMP WITHOUT TIME ZONE columns."""
    if dt is None:
        return None
    if not isinstance(dt, datetime):
        return dt
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


class MarkingCycleCreate(BaseModel):
    """Create marking cycle request."""

    year: int
    subject_id: UUID
    total_required: int
    experience_ratio: float
    acceptance_deadline: datetime | None = None

    @field_validator("acceptance_deadline", mode="after")
    @classmethod
    def acceptance_deadline_naive_utc(cls, v: datetime | None) -> datetime | None:
        return _naive_utc(v)


class MarkingCycleUpdate(BaseModel):
    """Update marking cycle request."""

    total_required: int | None = None
    experience_ratio: float | None = None
    acceptance_deadline: datetime | None = None
    status: MarkingCycleStatus | None = None

    @field_validator("acceptance_deadline", mode="after")
    @classmethod
    def acceptance_deadline_naive_utc(cls, v: datetime | None) -> datetime | None:
        return _naive_utc(v)


class MarkingCycleResponse(BaseModel):
    """Marking cycle response."""

    id: UUID
    year: int
    subject_id: UUID
    total_required: int
    experience_ratio: float
    acceptance_deadline: datetime | None
    status: MarkingCycleStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SubjectQuotaCreate(BaseModel):
    """Create subject quota request."""

    quota_type: QuotaType
    quota_key: str
    min_count: int | None = None
    max_count: int | None = None
    percentage: float | None = None


class SubjectQuotaResponse(BaseModel):
    """Subject quota response."""

    id: UUID
    cycle_id: UUID
    subject_id: UUID
    quota_type: QuotaType
    quota_key: str
    min_count: int | None
    max_count: int | None
    percentage: float | None

    class Config:
        from_attributes = True


class ExaminerAllocationResponse(BaseModel):
    """Examiner allocation response."""

    id: UUID
    examiner_id: UUID
    cycle_id: UUID
    subject_id: UUID
    score: float | None
    rank: int | None
    allocation_status: AllocationStatus
    allocated_at: datetime

    class Config:
        from_attributes = True


class ExaminerAcceptanceResponse(BaseModel):
    """Examiner acceptance response."""

    id: UUID
    examiner_id: UUID
    cycle_id: UUID
    subject_id: UUID
    allocation_id: UUID
    status: AcceptanceStatus
    notified_at: datetime | None
    responded_at: datetime | None
    response_deadline: datetime

    class Config:
        from_attributes = True


class AllocationResult(BaseModel):
    """Allocation execution result."""

    approved: int
    waitlisted: int
    rejected: int
    message: str
