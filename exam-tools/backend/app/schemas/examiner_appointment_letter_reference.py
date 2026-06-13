from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.script_allocation import ExaminerTypeSchema


class ExaminerAppointmentLetterReferenceSubjectRef(BaseModel):
    id: int
    code: str
    name: str
    subject_type: str


class ExaminerAppointmentLetterReferenceItem(BaseModel):
    subject_id: int
    examiner_type: ExaminerTypeSchema
    reference_number: str | None = None


class ExaminationExaminerAppointmentLetterReferencesResponse(BaseModel):
    examination_id: int
    subjects: list[ExaminerAppointmentLetterReferenceSubjectRef]
    items: list[ExaminerAppointmentLetterReferenceItem]


class ExaminerAppointmentLetterReferencePutCell(BaseModel):
    subject_id: int
    examiner_type: ExaminerTypeSchema
    reference_number: str | None = Field(default=None, max_length=128)


class ExaminationExaminerAppointmentLetterReferencesPut(BaseModel):
    items: list[ExaminerAppointmentLetterReferencePutCell] = Field(default_factory=list)
