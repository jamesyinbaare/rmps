"""Schemas for school exam expected registration counts."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ProgrammeExpectationInput(BaseModel):
    """One programme expected-count entry on save."""

    programme_id: int
    expected_count: int = Field(..., ge=1)


class SchoolExamExpectationsUpdate(BaseModel):
    """Create/update/clear optional expected registration targets."""

    expected_total: int | None = Field(
        None,
        ge=1,
        description="Overall expected candidates; null clears the overall total",
    )
    programmes: list[ProgrammeExpectationInput] = Field(
        default_factory=list,
        description="Per-programme expected counts; empty list clears programme rows",
    )


class ProgrammeExpectationProgress(BaseModel):
    """Expected vs actual for one programme on an exam."""

    programme_id: int
    code: str
    name: str
    expected_count: int | None = None
    actual_count: int = 0
    over: bool = False
    under: bool = False


class SchoolExamExpectationsResponse(BaseModel):
    """Declaration plus live registration progress for a school×exam."""

    exam_id: int
    school_id: int
    expected_total: int | None = None
    actual_total: int = 0
    has_declaration: bool = False
    total_over: bool = False
    total_under: bool = False
    declared_at: datetime | None = None
    declared_by_user_id: UUID | None = None
    declared_by_name: str | None = None
    programmes: list[ProgrammeExpectationProgress] = Field(default_factory=list)
    can_edit: bool = False
