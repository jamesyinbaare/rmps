from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ExaminerGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    source_regions: list[str] = Field(
        default_factory=list,
        description=(
            "Examiner home regions for this cohort (disjoint across groups). "
            "Members are all examiners on this examination whose home region is listed. "
            "For allocation, scripts from schools in these regions are treated as this cohort's script bucket."
        ),
    )


class ExaminerGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)


class ExaminerGroupResponse(BaseModel):
    id: UUID
    examination_id: int
    name: str
    examiner_ids: list[UUID]
    source_regions: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExaminerGroupMembersReplace(BaseModel):
    examiner_ids: list[UUID] = Field(default_factory=list)


class ExaminerGroupSourceRegionsReplace(BaseModel):
    regions: list[str] = Field(
        default_factory=list,
        description=(
            "Examiner home regions for this cohort (disjoint across groups). "
            "Membership is replaced with examiners whose home region is listed. "
            "Schools in these regions map to this cohort's scripts for cross-marking."
        ),
    )
