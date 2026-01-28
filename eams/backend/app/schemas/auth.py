"""Authentication schemas."""
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_serializer, field_validator

from app.models import UserRole


class UserLogin(BaseModel):
    """User login request."""

    email: EmailStr
    password: str


class Token(BaseModel):
    """Token response."""

    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """User response."""

    id: UUID
    email: str
    full_name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True

    @field_validator("role", mode="before")
    @classmethod
    def role_to_name(cls, value: UserRole | str) -> str:
        """Accept role enum from ORM and normalize to enum name for API."""
        if isinstance(value, UserRole):
            return value.name
        return str(value)

    @field_serializer("role")
    def serialize_role(self, value: UserRole | str) -> str:
        """Serialize role as name (e.g. SYSTEM_ADMIN) for JSON."""
        if isinstance(value, UserRole):
            return value.name
        return str(value)


class UserMeResponse(UserResponse):
    """User + examiner_id for GET /me. Used for login redirect to profile/{examiner_id}."""

    examiner_id: str | None = None


class UserCreate(BaseModel):
    """User creation request."""

    email: EmailStr
    password: str
    full_name: str


class UserPasswordChange(BaseModel):
    """Password change request."""

    current_password: str
    new_password: str
