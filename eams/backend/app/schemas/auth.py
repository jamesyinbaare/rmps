"""Authentication schemas."""
from uuid import UUID

from pydantic import BaseModel, EmailStr


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


class UserCreate(BaseModel):
    """User creation request."""

    email: EmailStr
    password: str
    full_name: str


class UserPasswordChange(BaseModel):
    """Password change request."""

    current_password: str
    new_password: str
