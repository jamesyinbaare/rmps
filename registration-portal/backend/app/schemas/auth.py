from __future__ import annotations

from datetime import date, datetime
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


class PrivateUserRegistrationRequest(BaseModel):
    """Schema for private user registration with exam and candidate data."""

    # Account fields
    email: EmailStr
    password: str
    full_name: str = Field(..., min_length=1, max_length=255)

    # Exam and examination center selection
    exam_id: int = Field(..., description="The exam ID to register for")
    school_id: int = Field(..., description="The examination center (school) ID")

    # Bio data
    name: str = Field(..., min_length=1, max_length=255, description="Candidate's full name")
    date_of_birth: date | None = Field(None, description="Date of birth")
    gender: str | None = Field(None, max_length=20, description="Gender")
    contact_email: EmailStr | None = Field(None, description="Contact email address")
    contact_phone: str | None = Field(None, max_length=50, description="Contact phone number")
    address: str | None = Field(None, description="Address")
    national_id: str | None = Field(None, max_length=50, description="National ID number")

    # Programme (optional)
    programme_id: int | None = Field(None, description="Programme ID (optional)")

    # Subjects
    subject_ids: list[int] = Field(default_factory=list, description="List of subject IDs to register for")


class PrivateUserRegistrationResponse(BaseModel):
    """Schema for private user registration response."""

    user: UserResponse
    registration: dict  # Will be RegistrationCandidateResponse, using dict to avoid circular import
    token: Token

    class Config:
        from_attributes = True
