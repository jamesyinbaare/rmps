"""Schemas for per-examination examiner reference region groups."""

from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.services.examiner_reference_code import validate_code_prefix


class ExaminerRegionGroupRow(BaseModel):
    id: UUID | None = None
    name: str = Field(min_length=1, max_length=64)
    code_prefix: str = Field(min_length=1, max_length=2)
    regions: list[str] = Field(min_length=1)

    @field_validator("code_prefix")
    @classmethod
    def _normalize_prefix(cls, v: str) -> str:
        return validate_code_prefix(v)

    @field_validator("regions")
    @classmethod
    def _strip_regions(cls, values: list[str]) -> list[str]:
        return [str(v).strip() for v in values if str(v).strip()]


class ExaminationExaminerRegionGroupsResponse(BaseModel):
    examination_id: int
    groups: list[ExaminerRegionGroupRow]
    regions_complete: bool
    roster_total: int = 0
    with_code_count: int = 0
    missing_code_count: int = 0


class ExaminationExaminerRegionGroupsPut(BaseModel):
    groups: list[ExaminerRegionGroupRow] = Field(min_length=1)


class ExaminerReferenceCodesActionResponse(BaseModel):
    examination_id: int
    assigned_count: int
    skipped_count: int
    roster_total: int


class ExaminerReferenceCodesRegenerateRequest(BaseModel):
    confirm: bool = False
