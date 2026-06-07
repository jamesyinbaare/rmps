from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.bank_branch import normalize_bank_code_for_api


class ExaminerBankAccountUpsert(BaseModel):
    bank_branch_id: UUID
    account_number: str = Field(min_length=1, max_length=32)


class ExaminerBankAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    examiner_id: UUID
    bank_branch_id: UUID
    bank_code: str
    bank_name: str
    branch_name: str
    account_number: str
    created_at: datetime
    updated_at: datetime

    @field_validator("bank_code", mode="before")
    @classmethod
    def _bank_code_as_text(cls, v: Any) -> str:
        return normalize_bank_code_for_api(v)
