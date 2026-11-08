"""Schemas for inspector irregular candidate registration."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class IrregularCandidateSubjectItem(BaseModel):
    subject_id: int | None = None
    subject_code: str
    subject_name: str


class IrregularCandidateStatusResponse(BaseModel):
    enabled: bool


class IrregularCandidateResponse(BaseModel):
    id: int
    examination_id: int
    examination_centre_id: UUID
    examination_centre_code: str
    examination_centre_name: str
    school_id: UUID
    school_code: str
    school_name: str
    programme_id: int
    programme_code: str
    programme_name: str
    first_name: str
    last_name: str
    other_name: str | None = None
    gender: str
    date_of_birth: date
    phone_number: str
    guardian_name: str | None = None
    guardian_phone_number: str | None = None
    ghanapost_gps_address: str | None = None
    subjects: list[IrregularCandidateSubjectItem] = Field(default_factory=list)
    recorded_by_user_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class IrregularCandidateListResponse(BaseModel):
    items: list[IrregularCandidateResponse]
    total: int


class IrregularCandidateAdminListResponse(BaseModel):
    items: list[IrregularCandidateResponse]
    total: int
    skip: int
    limit: int


class IrregularCandidateProgrammeItem(BaseModel):
    id: int
    code: str
    name: str
