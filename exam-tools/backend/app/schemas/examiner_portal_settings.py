from datetime import datetime

from pydantic import BaseModel


class ExaminerPortalSettingsResponse(BaseModel):
    examination_id: int
    appointment_letters_release_enabled: bool
    updated_at: datetime
    rostered_examiner_count: int
    with_coordination_end_count: int
    eligible_now_count: int
    notified_count: int


class ExaminerPortalSettingsPut(BaseModel):
    appointment_letters_release_enabled: bool


class NotifyEligibleAppointmentLettersResponse(BaseModel):
    sms_sent_count: int
    sms_failed_count: int
    skipped_count: int
