from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import Role


class UserLogin(BaseModel):
    """Schema for user login. `email` wire key accepts email or username."""

    email: str = Field(..., min_length=1, max_length=255)
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


class PasswordSetupValidateResponse(BaseModel):
    """Generic token validity — never distinguishes expired/used/missing."""

    valid: bool


class PasswordSetupRequest(BaseModel):
    """Consume a password setup / reset token."""

    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=1)


class ForgotPasswordRequest(BaseModel):
    """Request a password reset email (enumeration-safe)."""

    email: EmailStr


class PublicUserCreate(BaseModel):
    """Invite-only public registration: email + username; password set via email link."""

    email: EmailStr
    username: str = Field(..., min_length=3, max_length=32)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        from app.utils.username import validate_private_username

        return validate_private_username(v)


class UserCreate(BaseModel):
    """Schema for creating a user (admin use only)."""

    email: EmailStr
    password: str
    full_name: str = Field(..., min_length=1, max_length=255)
    role: Role
    school_id: int | None = None

    @field_validator("role", mode="before")
    @classmethod
    def validate_role(cls, v: Role | str | int) -> Role:
        """Normalize role to Role enum."""
        if isinstance(v, Role):
            return v
        if isinstance(v, str):
            try:
                return Role[v]
            except KeyError:
                raise ValueError(f"Invalid role: {v}. Valid roles are: {', '.join([r.name for r in Role])}")
        if isinstance(v, int):
            try:
                return Role(v)
            except ValueError:
                raise ValueError(f"Invalid role value: {v}. Valid values are: {', '.join([str(r.value) for r in Role])}")
        raise ValueError(f"Invalid role. Expected Role enum, string, or int, got {type(v)}")


class UserResponse(BaseModel):
    """Schema for user response."""

    id: UUID
    email: str
    username: str
    full_name: str
    role: Role
    school_id: int | None = None
    school_name: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login: datetime | None = None
    invite_sent: bool | None = None

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
    firstname: str = Field(..., min_length=1, max_length=255, description="Candidate's first name")
    lastname: str = Field(..., min_length=1, max_length=255, description="Candidate's last name")
    othername: str | None = Field(None, max_length=255, description="Candidate's other/middle name")
    date_of_birth: date | None = Field(None, description="Date of birth")
    gender: str | None = Field(None, max_length=20, description="Gender")
    contact_email: EmailStr | None = Field(None, description="Contact email address")
    contact_phone: str | None = Field(None, max_length=50, description="Contact phone number")
    address: str | None = Field(None, description="Address")
    national_id: str | None = Field(None, max_length=50, description="National ID number")
    disability: str | None = Field(None, description="Disability type: Visual, Auditory, Physical, Cognitive, Speech, Other")
    guardian_name: str | None = Field(None, max_length=255, description="Guardian name")
    guardian_phone: str | None = Field(None, max_length=50, description="Guardian phone number")
    guardian_digital_address: str | None = Field(None, max_length=50, description="Guardian digital address (Ghana format)")
    guardian_national_id: str | None = Field(None, max_length=50, description="Guardian national ID number")

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
