"""Schemas for per-examination inspector submission settings."""

from datetime import date, datetime

from pydantic import BaseModel, Field


class InspectorSubmissionSettingsResponse(BaseModel):
    examination_id: int
    core_submission_period_start: date | None = None
    core_submission_period_end: date | None = None
    elective_submission_period_start: date | None = None
    elective_submission_period_end: date | None = None
    officials_core_enabled: bool = True
    officials_elective_enabled: bool = True
    updated_at: datetime | None = None


class InspectorSubmissionSettingsPut(BaseModel):
    core_submission_period_start: date | None = Field(
        default=None,
        description="First day Core inspector submissions are open (inclusive).",
    )
    core_submission_period_end: date | None = Field(
        default=None,
        description="Last day Core inspector submissions are open (inclusive).",
    )
    elective_submission_period_start: date | None = Field(
        default=None,
        description="First day Elective inspector submissions are open (inclusive).",
    )
    elective_submission_period_end: date | None = Field(
        default=None,
        description="Last day Elective inspector submissions are open (inclusive).",
    )
    officials_core_enabled: bool = True
    officials_elective_enabled: bool = True


class InspectorSubmissionStatusResponse(BaseModel):
    core_period_open: bool
    core_submission_period_start: date | None = None
    core_submission_period_end: date | None = None
    elective_period_open: bool
    elective_submission_period_start: date | None = None
    elective_submission_period_end: date | None = None
    officials_core_enabled: bool = True
    officials_elective_enabled: bool = True
