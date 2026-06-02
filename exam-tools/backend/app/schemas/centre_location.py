"""Schemas for centre_locations (GPS keyed by centre code)."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import CentreLocationSource


class CentreLocationUpdate(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy_m: float | None = Field(None, ge=0)


class CentreLocationResponse(BaseModel):
    centre_code: str
    latitude: float
    longitude: float
    accuracy_m: float | None = None
    source: CentreLocationSource
    captured_at: datetime
    captured_by_user_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CentreLocationListResponse(BaseModel):
    items: list[CentreLocationResponse]
    total: int
