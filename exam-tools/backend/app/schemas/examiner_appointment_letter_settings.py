from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class AppointmentLetterSigningOfficialApi(str, Enum):
    DIRECTOR_GENERAL = "director_general"
    DIRECTOR_ASSESSMENT_CERTIFICATION = "director_assessment_certification"


class AppointmentLetterSignatureRoleApi(str, Enum):
    DIRECTOR_GENERAL = "director_general"
    DIRECTOR_ASSESSMENT_CERTIFICATION = "director_assessment_certification"


class AppointmentLetterSignatureMeta(BaseModel):
    has_signature: bool
    content_type: str | None = None


class ExaminerAppointmentLetterSettingsResponse(BaseModel):
    examination_id: int
    signing_official: AppointmentLetterSigningOfficialApi
    signed_for_director_general: bool
    director_general_name: str
    director_general_title: str
    director_assessment_name: str
    director_assessment_title: str
    valediction: str
    letter_date: date | None = None
    cc_lines: list[str]
    director_general_signature: AppointmentLetterSignatureMeta
    director_assessment_signature: AppointmentLetterSignatureMeta
    updated_at: datetime | None = None


class ExaminerAppointmentLetterSettingsPut(BaseModel):
    signing_official: AppointmentLetterSigningOfficialApi
    signed_for_director_general: bool
    director_general_name: str = Field(max_length=255)
    director_general_title: str = Field(max_length=255)
    director_assessment_name: str = Field(max_length=255)
    director_assessment_title: str = Field(max_length=255)
    valediction: str = Field(default="Yours faithfully", max_length=255)
    letter_date: date | None = None
    cc_lines: list[str] = Field(default_factory=list)


class ExaminerAppointmentLetterSettingsCopyFrom(BaseModel):
    source_examination_id: int


class ExaminerAppointmentLetterSettingsCopyFromResponse(BaseModel):
    examination_id: int
    source_examination_id: int
    cc_lines_copied: int
    signatures_copied: int
