from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class AppointmentLettersReleaseModeApi(str, Enum):
    ON_ACCEPTANCE = "on_acceptance"
    SCHEDULED_DATE = "scheduled_date"


class ExaminerPortalSettingsResponse(BaseModel):
    examination_id: int
    appointment_letters_release_enabled: bool
    appointment_letters_release_mode: AppointmentLettersReleaseModeApi
    appointment_letters_release_at: datetime | None = None
    examiner_bank_details_editable_by_examiners: bool
    updated_at: datetime
    rostered_examiner_count: int
    pending_release_count: int
    eligible_now_count: int
    notified_count: int


class ExaminerPortalSettingsPut(BaseModel):
    appointment_letters_release_enabled: bool
    appointment_letters_release_mode: AppointmentLettersReleaseModeApi = (
        AppointmentLettersReleaseModeApi.SCHEDULED_DATE
    )
    appointment_letters_release_at: datetime | None = None
    examiner_bank_details_editable_by_examiners: bool = False


class NotifyEligibleAppointmentLettersResponse(BaseModel):
    sms_sent_count: int
    sms_failed_count: int
    skipped_count: int
