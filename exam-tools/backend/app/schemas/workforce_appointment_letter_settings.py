from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field

from app.schemas.examiner_appointment_letter_settings import (
    AppointmentLetterSignatureMeta,
    AppointmentLetterSignatureRoleApi,
    AppointmentLetterSigningOfficialApi,
)

__all__ = [
    "AppointmentLetterSignatureMeta",
    "AppointmentLetterSignatureRoleApi",
    "AppointmentLetterSigningOfficialApi",
    "WorkforceAppointmentLetterKindApi",
    "WorkforceAppointmentLetterSettingsResponse",
    "WorkforceAppointmentLetterSettingsPut",
]


class WorkforceAppointmentLetterKindApi(str, Enum):
    script_checker = "script_checker"
    data_entry_clerk = "data_entry_clerk"


class WorkforceAppointmentLetterSettingsResponse(BaseModel):
    examination_id: int
    kind: WorkforceAppointmentLetterKindApi
    signing_official: AppointmentLetterSigningOfficialApi
    signed_for_director_general: bool
    director_general_name: str
    director_general_title: str
    director_assessment_name: str
    director_assessment_title: str
    valediction: str
    letter_date: date | None = None
    reference_number: str
    cc_lines: list[str]
    director_general_signature: AppointmentLetterSignatureMeta
    director_assessment_signature: AppointmentLetterSignatureMeta
    updated_at: datetime | None = None


class WorkforceAppointmentLetterSettingsPut(BaseModel):
    signing_official: AppointmentLetterSigningOfficialApi
    signed_for_director_general: bool
    director_general_name: str = Field(default="", max_length=255)
    director_general_title: str = Field(default="", max_length=255)
    director_assessment_name: str = Field(default="", max_length=255)
    director_assessment_title: str = Field(default="", max_length=255)
    valediction: str = Field(default="Yours faithfully", max_length=255)
    letter_date: date | None = None
    reference_number: str = Field(default="", max_length=128)
    cc_lines: list[str] = Field(default_factory=list)
