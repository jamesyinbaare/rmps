from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.examiner_appointment_letter_settings import AppointmentLetterSignatureMeta


class ExaminerAppointmentLetterSubjectSettingsResponse(BaseModel):
    examination_id: int
    subject_id: int
    director_assessment_name: str
    director_assessment_title: str
    director_assessment_signature: AppointmentLetterSignatureMeta
    uses_exam_default_name: bool
    uses_exam_default_title: bool
    uses_exam_default_signature: bool
    updated_at: datetime | None = None


class ExaminerAppointmentLetterSubjectSettingsPut(BaseModel):
    director_assessment_name: str = Field(max_length=255)
    director_assessment_title: str = Field(max_length=255)


class ExaminerAppointmentLetterSubjectSettingsCopyFromResponse(BaseModel):
    examination_id: int
    source_examination_id: int
    subjects_copied: int
    signatures_copied: int
