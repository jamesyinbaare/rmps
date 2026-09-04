"""Schemas for exam-scoped examiner allowance groups."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AllowanceGroupEligibilityCell(BaseModel):
    allowance_key: str
    enabled: bool


class AllowanceGroupRow(BaseModel):
    id: UUID
    name: str
    is_general: bool
    member_count: int = 0
    allowances: dict[str, bool] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ExaminationAllowanceGroupsResponse(BaseModel):
    examination_id: int
    groups: list[AllowanceGroupRow]


class AllowanceGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class AllowanceGroupRename(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class AllowanceGroupEligibilityPut(BaseModel):
    cells: list[AllowanceGroupEligibilityCell] = Field(default_factory=list)


class AllowanceGroupMembersPut(BaseModel):
    examiner_ids: list[UUID] = Field(default_factory=list)


class AllowanceGroupMemberRow(BaseModel):
    id: UUID
    name: str
    examiner_type: str
    region: str
    roster_source: str
    reference_code: str | None = None


class AllowanceGroupMembersResponse(BaseModel):
    group_id: UUID
    examiner_ids: list[UUID] = Field(default_factory=list)
    members: list[AllowanceGroupMemberRow] = Field(default_factory=list)
    is_general: bool = False


class ExaminerAllowanceGroupMembershipPut(BaseModel):
    group_ids: list[UUID] = Field(default_factory=list)


class ExaminerAllowanceGroupMembershipResponse(BaseModel):
    examiner_id: UUID
    group_ids: list[UUID]
