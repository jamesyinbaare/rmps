from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class AdminPasswordReset(BaseModel):
    mode: Literal["auto", "manual"] = "manual"
    new_password: str | None = Field(None, min_length=8, max_length=128)


class AdminPasswordResetResponse(BaseModel):
    generated_password: str | None = None


class StaffEmailUserRow(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr
    is_active: bool
    created_at: datetime


class StaffEmailUserListResponse(BaseModel):
    items: list[StaffEmailUserRow]
    total: int
