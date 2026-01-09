from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models import Role


class SchoolUserCreate(BaseModel):
    """Schema for creating a school user (by coordinator)."""

    email: EmailStr
    password: str
    full_name: str = Field(..., min_length=1, max_length=255)
    role: Role = Role.User


class SchoolAdminUserCreate(BaseModel):
    """Schema for creating a coordinator (by system admin)."""

    email: EmailStr
    password: str
    full_name: str = Field(..., min_length=1, max_length=255)
    school_id: int


class UserUpdate(BaseModel):
    """Schema for updating a user (admin only)."""

    full_name: str | None = Field(None, min_length=1, max_length=255)
    is_active: bool | None = None


class UserListResponse(BaseModel):
    """Schema for user list response."""

    items: list["UserResponse"]
    total: int
    page: int
    page_size: int
    total_pages: int


from app.schemas.auth import UserResponse

UserListResponse.model_rebuild()
