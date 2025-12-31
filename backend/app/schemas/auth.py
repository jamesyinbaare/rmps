from datetime import datetime
from typing import Optional, Union
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_serializer, field_validator

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

    @field_validator("role", mode="before")
    @classmethod
    def validate_role(cls, v: Union[str, int, UserRole]) -> UserRole:
        """Validate and convert role to UserRole enum."""
        if isinstance(v, UserRole):
            return v
        if isinstance(v, str):
            # Try to get enum by name
            try:
                return UserRole[v]
            except KeyError:
                # If not found by name, try to find by value name
                valid_names = [r.name for r in UserRole]
                raise ValueError(f"Invalid role '{v}'. Must be one of: {', '.join(valid_names)}")
        if isinstance(v, int):
            try:
                return UserRole(v)
            except ValueError:
                valid_values = [str(r.value) for r in UserRole]
                raise ValueError(f"Invalid role value '{v}'. Must be one of: {', '.join(valid_values)}")
        raise ValueError(f"Invalid role type. Expected string, int, or UserRole enum, got {type(v)}")


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

    @field_serializer("role")
    def serialize_role(self, role: UserRole) -> str:
        """Serialize UserRole enum to its name string."""
        return role.name

    class Config:
        from_attributes = True
