"""Invitation and quota schemas (examiner invitations; allocation reserved for Scripts Allocation)."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.models import AcceptanceStatus, AllocationStatus, QuotaType


def _validate_non_negative_int(v: int | None) -> int | None:
    """Quota counts must be 0 or positive."""
    if v is None:
        return None
    if v < 0:
        raise ValueError("must be 0 or positive")
    return v


def _validate_non_negative_float(v: float | None) -> float | None:
    """Quota percentage must be 0 or positive."""
    if v is None:
        return None
    if v < 0:
        raise ValueError("must be 0 or positive")
    return v


class SubjectQuotaCreate(BaseModel):
    """Create subject quota request."""

    quota_type: QuotaType
    quota_key: str
    min_count: int | None = None
    max_count: int | None = None
    percentage: float | None = None

    @field_validator("min_count", "max_count")
    @classmethod
    def count_non_negative(cls, v: int | None) -> int | None:
        return _validate_non_negative_int(v)

    @field_validator("percentage")
    @classmethod
    def percentage_non_negative(cls, v: float | None) -> float | None:
        return _validate_non_negative_float(v)


class SubjectQuotaResponse(BaseModel):
    """Subject quota response."""

    id: UUID
    subject_examiner_id: UUID
    subject_id: UUID
    quota_type: QuotaType
    quota_key: str
    min_count: int | None
    max_count: int | None
    percentage: float | None

    class Config:
        from_attributes = True


class SubjectQuotaItem(BaseModel):
    """Single quota item for bulk update (region or gender)."""

    quota_key: str
    min_count: int | None = None
    max_count: int | None = None
    percentage: float | None = None

    @field_validator("min_count", "max_count")
    @classmethod
    def count_non_negative(cls, v: int | None) -> int | None:
        return _validate_non_negative_int(v)

    @field_validator("percentage")
    @classmethod
    def percentage_non_negative(cls, v: float | None) -> float | None:
        return _validate_non_negative_float(v)


class SubjectQuotaBulkUpdate(BaseModel):
    """Bulk update quotas for a subject examiner (replace all)."""

    region_quotas: list[SubjectQuotaItem] = []
    gender_quotas: list[SubjectQuotaItem] = []


class ExaminerAllocationResponse(BaseModel):
    """Examiner invitation response (ORM: ExaminerAllocation)."""

    id: UUID
    examiner_id: UUID
    subject_examiner_id: UUID
    subject_id: UUID
    score: float | None
    rank: int | None
    allocation_status: AllocationStatus
    allocated_at: datetime

    class Config:
        from_attributes = True


class InvitationWithExaminerResponse(BaseModel):
    """Invitation list item with examiner name and region for admin list."""

    id: UUID
    examiner_id: UUID
    examiner_full_name: str | None = None
    examiner_region: str | None = None
    subject_examiner_id: UUID
    subject_id: UUID
    score: float | None
    rank: int | None
    allocation_status: AllocationStatus
    allocated_at: datetime

    class Config:
        from_attributes = True


class AdminAcceptanceListResponse(BaseModel):
    """Admin list of acceptances for a subject examiner with examiner details."""

    id: UUID
    examiner_id: UUID
    examiner_full_name: str | None = None
    examiner_region: str | None = None
    status: AcceptanceStatus
    notified_at: datetime | None
    responded_at: datetime | None
    response_deadline: datetime

    class Config:
        from_attributes = True


class ExaminerAcceptanceResponse(BaseModel):
    """Examiner acceptance response (invitation for My invitations)."""

    id: UUID
    examiner_id: UUID
    subject_examiner_id: UUID
    subject_id: UUID
    allocation_id: UUID
    status: AcceptanceStatus
    notified_at: datetime | None
    responded_at: datetime | None
    response_deadline: datetime
    # Display fields for examiner My invitations (populated when listing)
    subject_code: str | None = None
    subject_name: str | None = None
    examination_year: int | None = None

    class Config:
        from_attributes = True


class AllocationResult(BaseModel):
    """Invitation run result (approved/waitlisted/rejected counts)."""

    approved: int
    waitlisted: int
    rejected: int
    message: str
