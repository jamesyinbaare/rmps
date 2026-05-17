"""Bank branch directory (bulk upload + search for inspector pickers)."""

from datetime import datetime
from decimal import Decimal
from math import isfinite
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


def normalize_bank_code_for_api(v: Any) -> str:
    """Coerce ORM / driver / spreadsheet values to plain text for JSON (avoids unquoted JSON numbers)."""
    if v is None:
        raise ValueError("bank_code is required")
    if isinstance(v, bool):
        raise ValueError("bank_code must be plain text, not a boolean")
    if isinstance(v, Decimal):
        s = str(v).strip()
        if not s:
            raise ValueError("bank_code is required")
        return s
    if isinstance(v, float):
        if not isfinite(v):
            raise ValueError("bank_code is required")
        if v == int(v):
            return str(int(v))
        s = f"{v}".rstrip("0").rstrip(".")
        return s if s else str(v)
    if isinstance(v, int):
        return str(v)
    s = str(v).strip()
    if not s:
        raise ValueError("bank_code is required")
    return s


class BankBranchRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    bank_code: str = Field(..., min_length=1, max_length=32)
    bank_name: str
    branch_name: str
    created_at: datetime
    updated_at: datetime

    @field_validator("bank_code", mode="before")
    @classmethod
    def _bank_code_as_text(cls, v: Any) -> str:
        return normalize_bank_code_for_api(v)


class BankBranchListResponse(BaseModel):
    items: list[BankBranchRow]
    total: int


class BankBranchBulkUploadError(BaseModel):
    row_number: int
    error_message: str


class BankBranchBulkUploadResponse(BaseModel):
    total_rows: int
    successful: int
    failed: int
    errors: list[BankBranchBulkUploadError]
    created: int = 0
    updated: int = 0
