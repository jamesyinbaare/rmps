"""Admin listing of exam centre officials across all centres."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.bank_branch import normalize_bank_code_for_api


class AdminExamCentreOfficialRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    examination_id: int
    examination_label: str
    center_id: UUID
    center_code: str
    center_name: str
    full_name: str
    designation: str
    bank_branch_id: UUID
    bank_code: str
    bank_name: str
    branch_name: str
    account_number: str
    num_days: int
    telephone_number: str
    subject_scope: str
    created_at: datetime
    updated_at: datetime

    @field_validator("bank_code", mode="before")
    @classmethod
    def _bank_code_as_text(cls, v: object) -> str:
        return normalize_bank_code_for_api(v)


class AdminExamCentreOfficialListResponse(BaseModel):
    items: list[AdminExamCentreOfficialRow]
    total: int
