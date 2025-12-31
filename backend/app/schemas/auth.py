from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.models import UserRole


class Token(BaseModel):
    """JWT token response schema."""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """JWT token payload schema."""
    user_id: UUID | None = None
    email: str | None = None


class UserLogin(BaseModel):
    """User login request schema."""
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    """User registration schema."""
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.DATACLERK


class UserResponse(BaseModel):
    """User response schema (excludes password)."""
    id: UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True
