from __future__ import annotations

from datetime import date
from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class QuestionPaperSeriesSlotResponse(BaseModel):
    series_number: int
    copies_received: int = Field(ge=0)
    copies_used: int = Field(ge=0)
    copies_to_library: int = Field(ge=0)
    copies_remaining: int = Field(ge=0)


class QuestionPaperPaperSlotResponse(BaseModel):
    paper_number: int
    examination_date: date | None = Field(
        default=None,
        description="Scheduled examination calendar date for this paper from the timetable, if present.",
    )
    series: list[QuestionPaperSeriesSlotResponse]


class QuestionPaperSubjectRowResponse(BaseModel):
    subject_id: int
    subject_code: str
    subject_original_code: str | None = Field(
        default=None,
        description="Canonical subject code when distinct from subject_code (timetable may use either).",
    )
    subject_name: str
    papers: list[QuestionPaperPaperSlotResponse]


class MyCenterQuestionPaperControlResponse(BaseModel):
    examination_id: int
    exam_type: str
    exam_series: str | None
    year: int
    center_id: UUID = Field(description="Examination centre host school id.")
    center_code: str
    center_name: str
    subjects: list[QuestionPaperSubjectRowResponse]


class QuestionPaperSlotUpsertRequest(BaseModel):
    subject_id: int
    paper_number: int = Field(ge=1)
    series_number: int = Field(ge=1, le=32767)
    copies_received: int = Field(ge=0)
    copies_used: int = Field(ge=0)
    copies_to_library: int = Field(ge=0)
    copies_remaining: int = Field(ge=0)

    @model_validator(mode="after")
    def allocation_not_over_received(self) -> Self:
        allocated = self.copies_used + self.copies_to_library + self.copies_remaining
        if allocated > self.copies_received:
            raise ValueError(
                "Used + to library + remaining cannot exceed received "
                f"({allocated} > {self.copies_received})."
            )
        return self


class QuestionPaperSlotUpsertResponse(BaseModel):
    id: UUID
    subject_id: int
    paper_number: int
    series_number: int
    copies_received: int
    copies_used: int
    copies_to_library: int
    copies_remaining: int


class QuestionPaperControlAdminRow(BaseModel):
    question_paper_control_id: UUID
    examination_id: int
    center_id: UUID
    center_code: str
    subject_id: int
    subject_code: str
    subject_name: str
    paper_number: int
    series_number: int
    copies_received: int
    copies_used: int
    copies_to_library: int
    copies_remaining: int


class QuestionPaperControlAdminListResponse(BaseModel):
    items: list[QuestionPaperControlAdminRow]
    total: int
