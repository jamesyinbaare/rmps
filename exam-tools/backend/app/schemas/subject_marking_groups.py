from __future__ import annotations

from datetime import datetime, time
from uuid import UUID

from pydantic import BaseModel, Field


class SubjectMarkingGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    coordination_start_date: datetime | None = None
    coordination_start_time: time | None = None
    coordination_end_date: datetime | None = None
    coordination_end_time: time | None = None
    marking_start_date: datetime | None = None
    marking_end_date: datetime | None = None
    marked_script_submission_deadline: datetime | None = None


class SubjectMarkingGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    coordination_start_date: datetime | None = None
    coordination_start_time: time | None = None
    coordination_end_date: datetime | None = None
    coordination_end_time: time | None = None
    marking_start_date: datetime | None = None
    marking_end_date: datetime | None = None
    marked_script_submission_deadline: datetime | None = None


class SubjectMarkingGroupMembersReplace(BaseModel):
    source_regions: list[str] = Field(default_factory=list)
    source_roles: list[str] = Field(default_factory=list)
    examiner_ids: list[UUID] = Field(default_factory=list)


class SubjectMarkingGroupResponse(BaseModel):
    id: UUID
    examination_id: int
    subject_id: int
    name: str
    is_default: bool = False
    examiner_ids: list[UUID]
    source_regions: list[str]
    source_roles: list[str]
    coordination_start_date: datetime | None
    coordination_start_time: time | None
    coordination_end_date: datetime | None
    coordination_end_time: time | None
    marking_start_date: datetime | None
    marking_end_date: datetime | None
    marked_script_submission_deadline: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
