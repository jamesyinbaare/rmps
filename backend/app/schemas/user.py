from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models import UserRole


class UserUpdate(BaseModel):
    """Schema for updating a user."""

    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserPasswordReset(BaseModel):
    """Schema for resetting a user's password."""

    new_password: str = Field(..., min_length=8)


class UserSelfUpdate(BaseModel):
    """Schema for users to update their own profile."""

    full_name: str = Field(..., min_length=1, max_length=255)


class UserPasswordChange(BaseModel):
    """Schema for users to change their own password."""

    current_password: str = Field(..., description="Current password for verification")
    new_password: str = Field(..., min_length=8, description="New password")


class UserListFilters(BaseModel):
    """Schema for filtering user list."""

    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    search: Optional[str] = None  # Search by email or full_name


# Re-export UserResponse from auth schema for convenience
from app.schemas.auth import UserResponse

__all__ = [
    "UserResponse",
    "UserUpdate",
    "UserPasswordReset",
    "UserListFilters",
    "UserSelfUpdate",
    "UserPasswordChange",
]
