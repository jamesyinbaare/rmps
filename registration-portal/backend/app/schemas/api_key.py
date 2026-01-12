"""Schemas for API key management."""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ApiKeyCreate(BaseModel):
    """Schema for creating an API key."""

    name: str = Field(..., min_length=1, max_length=255, description="User-friendly name for the API key")
    rate_limit_per_minute: Optional[int] = Field(60, ge=1, le=1000, description="Rate limit per minute")


class ApiKeyResponse(BaseModel):
    """Schema for API key response (without full key)."""

    id: UUID
    name: str
    key_prefix: str
    is_active: bool
    last_used_at: Optional[datetime] = None
    created_at: datetime
    rate_limit_per_minute: int
    total_requests: int
    total_verifications: int

    class Config:
        from_attributes = True


class ApiKeyCreateResponse(BaseModel):
    """Schema for API key creation response (includes full key once)."""

    id: UUID
    name: str
    api_key: str  # Full key shown only once
    key_prefix: str
    is_active: bool
    created_at: datetime
    rate_limit_per_minute: int

    class Config:
        from_attributes = True


class ApiKeyUpdate(BaseModel):
    """Schema for updating an API key."""

    name: Optional[str] = Field(None, min_length=1, max_length=255, description="User-friendly name for the API key")
    rate_limit_per_minute: Optional[int] = Field(None, ge=1, le=1000, description="Rate limit per minute")
    is_active: Optional[bool] = Field(None, description="Whether the API key is active")


class ApiKeyUsageStats(BaseModel):
    """Schema for API key usage statistics."""

    total_requests: int
    total_verifications: int
    requests_today: int
    requests_this_month: int
    average_duration_ms: Optional[float] = None
    last_used_at: Optional[datetime] = None
