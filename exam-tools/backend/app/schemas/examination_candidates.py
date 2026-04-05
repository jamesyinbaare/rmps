from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ExaminationCandidateSubjectResponse(BaseModel):
    id: int
    subject_id: int | None
    subject_code: str
    subject_name: str
    series: int | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExaminationCandidateResponse(BaseModel):
    id: int
    examination_id: int
    school_id: UUID | None
    school_code: str | None = None
    school_name: str | None = None
    programme_id: int | None
    programme_code: str | None = None
    registration_number: str
    index_number: str | None
    full_name: str
    date_of_birth: date | None
    registration_status: str | None
    source_candidate_id: int | None
    subject_selections: list[ExaminationCandidateSubjectResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_candidate(cls, c: Any) -> ExaminationCandidateResponse:
        school_code = c.school.code if getattr(c, "school", None) else None
        school_name = c.school.name if getattr(c, "school", None) else None
        programme_code = c.programme.code if getattr(c, "programme", None) else None
        return cls(
            id=c.id,
            examination_id=c.examination_id,
            school_id=c.school_id,
            school_code=school_code,
            school_name=school_name,
            programme_id=c.programme_id,
            programme_code=programme_code,
            registration_number=c.registration_number,
            index_number=c.index_number,
            full_name=c.full_name,
            date_of_birth=c.date_of_birth,
            registration_status=c.registration_status,
            source_candidate_id=c.source_candidate_id,
            subject_selections=[
                ExaminationCandidateSubjectResponse.model_validate(s) for s in (c.subject_selections or [])
            ],
            created_at=c.created_at,
            updated_at=c.updated_at,
        )


class ExaminationCandidateImportError(BaseModel):
    row_number: int
    error_message: str
    field: str | None = None


class ExaminationCandidateImportResponse(BaseModel):
    total_rows: int
    successful: int
    failed: int
    errors: list[ExaminationCandidateImportError]
