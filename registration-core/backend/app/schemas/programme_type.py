"""Schemas for programme type taxonomy."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProgrammeTypeBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: int | None = None
    sort_order: int = 0
    is_active: bool = True


class ProgrammeTypeCreate(ProgrammeTypeBase):
    pass


class ProgrammeTypeUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=50)
    name: str | None = Field(None, min_length=1, max_length=255)
    parent_id: int | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class ProgrammeTypeResponse(ProgrammeTypeBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProgrammeTypeTreeNode(ProgrammeTypeResponse):
    children: list["ProgrammeTypeTreeNode"] = Field(default_factory=list)
    path: str | None = None


ProgrammeTypeTreeNode.model_rebuild()
