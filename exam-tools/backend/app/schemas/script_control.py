from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ScriptEnvelopeItem(BaseModel):
    envelope_number: int = Field(ge=1)
    booklet_count: int = Field(ge=0)
    verified: bool = Field(
        default=False,
        description="Depot keeper has verified this envelope.",
    )


class ScriptSeriesPackingResponse(BaseModel):
    id: UUID
    envelopes: list[ScriptEnvelopeItem]
    verified: bool = Field(
        default=False,
        description="True when every envelope in this series has been verified by the depot keeper.",
    )

    model_config = {"from_attributes": False}


class ScriptSeriesSlotResponse(BaseModel):
    series_number: int
    packing: ScriptSeriesPackingResponse | None = None
    verified: bool = Field(
        default=False,
        description="When true, every envelope in this series has been verified; inspectors cannot edit or delete it.",
    )


class ScriptPaperSlotResponse(BaseModel):
    paper_number: int
    examination_date: date | None = Field(
        default=None,
        description="Scheduled examination calendar date for this paper from the timetable, if present.",
    )
    series: list[ScriptSeriesSlotResponse]


class ScriptSubjectRowResponse(BaseModel):
    subject_id: int
    subject_code: str
    subject_name: str
    papers: list[ScriptPaperSlotResponse]


class MySchoolScriptControlResponse(BaseModel):
    """Script packing grid for one school; subjects come from that school’s registered candidates for the exam."""

    examination_id: int
    exam_type: str
    exam_series: str | None
    year: int
    school_id: UUID = Field(description="School selected for packing; matches query parameter school_id.")
    school_code: str
    scripts_per_envelope: int = Field(
        ge=1,
        description="Configured maximum booklets per envelope; booklet_count must not exceed this on save.",
    )
    subjects: list[ScriptSubjectRowResponse]


class ScriptControlSlotKeyRequest(BaseModel):
    """Subject / paper / series / envelope for depot keeper script verify."""

    subject_id: int
    paper_number: int = Field(ge=1)
    series_number: int = Field(ge=1, le=32767)
    envelope_number: int = Field(ge=1, description="Which envelope within the series to verify.")


class ScriptControlEnvelopeVerificationToggleRequest(ScriptControlSlotKeyRequest):
    verified: bool = Field(
        ...,
        description="Set true to verify this envelope; false to unverify.",
    )


class ScriptSeriesUpsertRequest(BaseModel):
    subject_id: int
    paper_number: int = Field(ge=1)
    series_number: int = Field(ge=1, le=32767)

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
    envelope_count: int
    total_booklets: int


class ScriptControlAdminListResponse(BaseModel):
    items: list[ScriptControlAdminRow]
    total: int
