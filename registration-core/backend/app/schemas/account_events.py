"""Schemas for portal account audit events."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AccountEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_user_id: UUID | None = None
    target_user_id: UUID | None = None
    action: str
    metadata: dict[str, Any] | None = None
    created_at: datetime
    actor_email: str | None = None
    target_email: str | None = None


class AccountEventListResponse(BaseModel):
    items: list[AccountEventResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
