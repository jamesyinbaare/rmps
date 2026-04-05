from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ScriptEnvelopeItem(BaseModel):
    envelope_number: int = Field(ge=1)
    booklet_count: int = Field(ge=0)


class ScriptSeriesPackingResponse(BaseModel):
    id: UUID
    scripts_per_envelope: int
    candidate_count: int | None
    envelopes: list[ScriptEnvelopeItem]

    model_config = {"from_attributes": False}


class ScriptSeriesSlotResponse(BaseModel):
    series_number: int
    packing: ScriptSeriesPackingResponse | None


class ScriptPaperSlotResponse(BaseModel):
    paper_number: int
    series: list[ScriptSeriesSlotResponse]


class ScriptSubjectRowResponse(BaseModel):
    subject_id: int
    subject_code: str
    subject_name: str
    papers: list[ScriptPaperSlotResponse]


class MySchoolScriptControlResponse(BaseModel):
    examination_id: int
    exam_type: str
    exam_series: str | None
    year: int
    school_id: UUID
    school_code: str
    subjects: list[ScriptSubjectRowResponse]


class ScriptSeriesUpsertRequest(BaseModel):
    subject_id: int
    paper_number: int = Field(ge=1)
    series_number: int = Field(ge=1, le=6)
    scripts_per_envelope: int = Field(default=50, ge=1)
    candidate_count: int | None = Field(default=None, ge=0)

    envelopes: list[ScriptEnvelopeItem] = Field(default_factory=list)

    @field_validator("envelopes")
    @classmethod
    def unique_envelope_numbers(cls, v: list[ScriptEnvelopeItem]) -> list[ScriptEnvelopeItem]:
        nums = [e.envelope_number for e in v]
        if len(nums) != len(set(nums)):
            raise ValueError("envelope_number values must be unique")
        return v


class ScriptControlAdminRow(BaseModel):
    packing_series_id: UUID
    examination_id: int
    school_id: UUID
    school_code: str
    subject_id: int
    subject_code: str
    subject_name: str
    paper_number: int
    series_number: int
    scripts_per_envelope: int
    candidate_count: int | None
    envelope_count: int
    total_booklets: int


class ScriptControlAdminListResponse(BaseModel):
    items: list[ScriptControlAdminRow]
    total: int
