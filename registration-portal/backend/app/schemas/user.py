from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

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


class AdminUserCreate(BaseModel):
    """Schema for creating an admin user (by system admin). Excludes User and PublicUser roles."""

    email: EmailStr
    password: str
    full_name: str = Field(..., min_length=1, max_length=255)
    role: Role
    school_id: int | None = None

    @field_validator("role", mode="before")
    @classmethod
    def validate_role(cls, v: Role | str | int) -> Role:
        """Normalize role to Role enum and validate it's not User or PublicUser."""
        if isinstance(v, Role):
            role = v
        elif isinstance(v, str):
            try:
                role = Role[v]
            except KeyError:
                raise ValueError(f"Invalid role: {v}. Valid roles are: {', '.join([r.name for r in Role])}")
        elif isinstance(v, int):
            try:
                role = Role(v)
            except ValueError:
                raise ValueError(f"Invalid role value: {v}. Valid values are: {', '.join([str(r.value) for r in Role])}")
        else:
            raise ValueError(f"Invalid role. Expected Role enum, string, or int, got {type(v)}")

        # Reject User and PublicUser roles
        if role == Role.User or role == Role.PublicUser:
            raise ValueError("Cannot create User or PublicUser accounts. These roles are reserved for self-registration.")

        return role

    @model_validator(mode="after")
    def validate_school_id(self) -> "AdminUserCreate":
        """Validate that school_id is provided when role is SchoolAdmin."""
        if self.role == Role.SchoolAdmin and self.school_id is None:
            raise ValueError("school_id is required when role is SchoolAdmin")
        return self


class UserPasswordReset(BaseModel):
    """Schema for resetting a user's password."""

    new_password: str = Field(..., min_length=8, description="New password (minimum 8 characters)")


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
