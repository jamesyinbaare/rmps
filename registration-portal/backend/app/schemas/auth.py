from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import PortalUserType


class UserLogin(BaseModel):
    """Schema for user login."""

    email: EmailStr
    password: str


class Token(BaseModel):
    """Schema for authentication token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefreshResponse(BaseModel):
    """Schema for token refresh response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    """Schema for refresh token request."""

    refresh_token: str


class UserCreate(BaseModel):
    """Schema for creating a user."""

    email: EmailStr
    password: str
    full_name: str = Field(..., min_length=1, max_length=255)
    user_type: PortalUserType
    school_id: int | None = None

    @field_validator("user_type")
    @classmethod
    def validate_user_type(cls, v: PortalUserType | str | int) -> PortalUserType:
        """Normalize user_type to PortalUserType enum."""
        if isinstance(v, PortalUserType):
            return v
        if isinstance(v, str):
            try:
                return PortalUserType[v]
            except KeyError:
                raise ValueError(f"Invalid user type: {v}")
        raise ValueError(f"Invalid user type. Expected PortalUserType enum or string, got {type(v)}")


class UserResponse(BaseModel):
    """Schema for user response."""

    id: UUID
    email: str
    full_name: str
    user_type: PortalUserType
    school_id: int | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserSelfUpdate(BaseModel):
    """Schema for user self-update (limited fields)."""

    full_name: str = Field(..., min_length=1, max_length=255)


class UserPasswordChange(BaseModel):
    """Schema for password change."""

    current_password: str
    new_password: str
