"""Pydantic schemas for workforce exercise cohorts (script checkers / data entry clerks)."""

from __future__ import annotations

from datetime import datetime, time
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.cohort_examiner_portal_release import AppointmentLettersReleaseModeApi


class WorkforceExerciseGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    exercise_start_date: datetime | None = None
    work_start_time: time | None = None
    work_end_time: time | None = None
    venue: str | None = Field(default=None, max_length=255)


class WorkforceExerciseGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    exercise_start_date: datetime | None = None
    work_start_time: time | None = None
    work_end_time: time | None = None
    venue: str | None = Field(default=None, max_length=255)


class WorkforceExerciseGroupMembersReplace(BaseModel):
    person_ids: list[UUID] = Field(default_factory=list)


class WorkforceExerciseGroupAssignRequest(BaseModel):
    cohort_name: str | None = Field(default=None, max_length=255)


class WorkforceExerciseGroupResponse(BaseModel):
    id: UUID
    examination_id: int
    kind: str
    name: str
    is_default: bool = False
    member_person_ids: list[UUID] = Field(default_factory=list)
    member_count: int = 0
    exercise_start_date: datetime | None = None
    work_start_time: time | None = None
    work_end_time: time | None = None
    venue: str | None = None
    appointment_letters_release_enabled: bool = False
    appointment_letters_release_mode: str = "scheduled_date"
    appointment_letters_release_at: datetime | None = None
    bank_details_editable: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkforceExerciseGroupReleasePut(BaseModel):
    appointment_letters_release_enabled: bool
    appointment_letters_release_mode: AppointmentLettersReleaseModeApi = (
        AppointmentLettersReleaseModeApi.SCHEDULED_DATE
    )
    appointment_letters_release_at: datetime | None = None
    bank_details_editable: bool = False


class WorkforceExerciseGroupReleaseResponse(BaseModel):
    examination_id: int
    kind: str
    group_id: UUID
    group_name: str
    is_default: bool
    appointment_letters_release_enabled: bool
    appointment_letters_release_mode: AppointmentLettersReleaseModeApi
    appointment_letters_release_at: datetime | None = None
    bank_details_editable: bool
    updated_at: datetime
    rostered_person_count: int
    pending_release_count: int
    eligible_now_count: int
    notified_count: int
