"""Exam centre officials (inspector CRUD; one list per examination centre host)."""

import re
from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.bank_branch import normalize_bank_code_for_api

GHANA_PHONE_RE = re.compile(r"^0(20|23|24|25|26|27|28|29|50|54|55|56|57|59)\d{7}$")


class ExamOfficialDesignationApi(str, Enum):
    depot_keeper = "Depot Keeper"
    supervisor = "Supervisor"
    assistant_supervisor = "Assistant Supervisor"
    invigilator = "Invigilator"
    police_officer = "Police Officer"


class ExamCentreOfficialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    examination_id: int
    center_id: UUID
    full_name: str
    designation: str
    bank_branch_id: UUID
    bank_code: str
    bank_name: str
    branch_name: str
    account_number: str
    num_days: int
    telephone_number: str
    created_at: datetime
    updated_at: datetime

    @field_validator("bank_code", mode="before")
    @classmethod
    def _bank_code_as_text(cls, v: object) -> str:
        return normalize_bank_code_for_api(v)


class ExamCentreOfficialListResponse(BaseModel):
    items: list[ExamCentreOfficialResponse]


class ExamCentreOfficialCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    designation: ExamOfficialDesignationApi
    bank_branch_id: UUID
    account_number: str = Field(..., pattern=r"^\d{13}$")
    num_days: int = Field(..., ge=1, le=32767)
    telephone_number: str = Field(..., min_length=10, max_length=10)

    @field_validator("full_name")
    @classmethod
    def strip_full_name(cls, v: str) -> str:
        t = v.strip()
        if not t:
            raise ValueError("full_name cannot be blank")
        return t

    @field_validator("telephone_number")
    @classmethod
    def validate_gh_phone(cls, v: str) -> str:
        s = v.strip()
        if not GHANA_PHONE_RE.fullmatch(s):
            raise ValueError("telephone_number must be a valid Ghana number (10 digits)")
        return s


class ExamCentreOfficialUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=255)
    designation: ExamOfficialDesignationApi | None = None
    bank_branch_id: UUID | None = None
    account_number: str | None = Field(None, pattern=r"^\d{13}$")
    num_days: int | None = Field(None, ge=1, le=32767)
    telephone_number: str | None = Field(None, min_length=10, max_length=10)

    @field_validator("full_name")
    @classmethod
    def strip_full_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        t = v.strip()
        if not t:
            raise ValueError("full_name cannot be blank")
        return t

    @field_validator("telephone_number")
    @classmethod
    def validate_gh_phone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if not GHANA_PHONE_RE.fullmatch(s):
            raise ValueError("telephone_number must be a valid Ghana number (10 digits)")
        return s
