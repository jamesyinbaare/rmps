"""Schemas for manual marking script source API."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class MarkingScriptSourceExaminerRow(BaseModel):
    examiner_id: UUID
    name: str
    examiner_type: str
    phone_number: str | None
    allocation_count: int
    manual_count: int
    effective_count: int


class MarkingScriptSourceResponse(BaseModel):
    examination_id: int
    subject_id: int
    source_mode: str
    available_papers: list[int]
    paper_number: int | None = None
    examiners: list[MarkingScriptSourceExaminerRow] = Field(default_factory=list)


class MarkingScriptSourceUpdate(BaseModel):
    source_mode: str


class ManualMarkedScriptItem(BaseModel):
    examiner_id: UUID
    paper_number: int = Field(ge=1)
    script_count: int = Field(ge=0)


class ManualMarkedScriptsUpsertRequest(BaseModel):
    items: list[ManualMarkedScriptItem]


class ManualMarkedScriptsUploadRowError(BaseModel):
    row_number: int
    message: str


class ManualMarkedScriptsUploadResponse(BaseModel):
    applied_count: int
    skipped_count: int
    errors: list[ManualMarkedScriptsUploadRowError]
    validate_only: bool = False
