"""Schemas for per-examination quota region groups (separate from reference-code groups)."""

from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ExaminerQuotaRegionGroupRow(BaseModel):
    id: UUID | None = None
    name: str = Field(min_length=1, max_length=64)
    regions: list[str] = Field(min_length=1)

    @field_validator("regions")
    @classmethod
    def _strip_regions(cls, values: list[str]) -> list[str]:
        return [str(v).strip() for v in values if str(v).strip()]


class ExaminationExaminerQuotaRegionGroupsResponse(BaseModel):
    examination_id: int
    groups: list[ExaminerQuotaRegionGroupRow]
    regions_complete: bool


class ExaminationExaminerQuotaRegionGroupsPut(BaseModel):
    groups: list[ExaminerQuotaRegionGroupRow] = Field(min_length=1)
