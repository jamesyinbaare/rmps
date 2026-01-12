"""Schemas for API user management."""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.api_key import ApiKeyResponse
from app.schemas.credit import CreditBalanceResponse


class ApiUserCreate(BaseModel):
    """Schema for creating an API user."""

    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    full_name: str = Field(..., min_length=1, max_length=255)


class ApiUserUpdate(BaseModel):
    """Schema for updating an API user."""

    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8, description="New password (optional)")


class ApiUserResponse(BaseModel):
    """Schema for API user response with basic info."""

    id: UUID
    email: str
    full_name: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class ApiUserListResponse(BaseModel):
    """Schema for paginated API user list."""

    items: list["ApiUserListItem"]
    total: int
    page: int
    page_size: int
    total_pages: int


class ApiUserListItem(BaseModel):
    """Schema for API user list item with summary stats."""

    id: UUID
    email: str
    full_name: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    credit_balance: Decimal
    total_api_keys: int
    active_api_keys: int
    total_requests: int
    total_verifications: int

    class Config:
        from_attributes = True


class ApiUserUsageStats(BaseModel):
    """Schema for API user usage statistics."""

    total_requests: int
    total_verifications: int
    requests_today: int
    requests_this_week: int
    requests_this_month: int
    successful_requests: int
    failed_requests: int
    average_duration_ms: Optional[float] = None
    total_credits_used: Decimal
    credits_remaining: Decimal


class ApiUserDetailResponse(BaseModel):
    """Schema for detailed API user information."""

    user: ApiUserResponse
    credit_balance: CreditBalanceResponse
    api_keys: list[ApiKeyResponse]
    usage_stats: ApiUserUsageStats
    created_at: datetime
    last_activity: Optional[datetime] = None
