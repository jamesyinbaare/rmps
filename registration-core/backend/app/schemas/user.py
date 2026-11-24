from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models import Role


class SchoolUserCreate(BaseModel):
    """Schema for creating a school user (by coordinator). Invite-only — no password."""

    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    role: Role = Role.SchoolStaff
    username: str | None = Field(None, max_length=255)


class SchoolAdminUserCreate(BaseModel):
    """Schema for creating a coordinator (by system admin). Invite-only — no password."""

    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    school_id: int
    username: str | None = Field(None, max_length=255)


class SchoolAdminReplace(BaseModel):
    """Replace the active coordinator for a school. Invite-only — no password.

    school_id comes from the path; this body matches SchoolAdminUserCreate minus school_id.
    """

    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    username: str | None = Field(None, max_length=255)


class AdminUserCreate(BaseModel):
    """Schema for creating an admin user (by system admin). Invite-only — no password.

    Excludes SchoolStaff and PublicUser roles. Allows APIUSER role.
    """

    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    role: Role
    school_id: int | None = None
    username: str | None = Field(None, max_length=255)

    @field_validator("role", mode="before")
    @classmethod
    def validate_role(cls, v: Role | str | int) -> Role:
        """Normalize role to Role enum and validate it's not SchoolStaff or PublicUser."""
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

        # Reject SchoolStaff and PublicUser roles
        if role == Role.SchoolStaff or role == Role.PublicUser:
            raise ValueError("Cannot create SchoolStaff or PublicUser accounts. These roles are reserved for self-registration.")

        return role

    @model_validator(mode="after")
    def validate_school_id(self) -> "AdminUserCreate":
        """Validate that school_id is provided when role is SchoolAdmin, and not provided for APIUSER."""
        if self.role == Role.SchoolAdmin and self.school_id is None:
            raise ValueError("school_id is required when role is SchoolAdmin")
        if self.role == Role.APIUSER and self.school_id is not None:
            raise ValueError("school_id should not be provided when role is APIUSER")
        return self


class UserPasswordReset(BaseModel):
    """Deprecated: admin reset now sends an email link. Kept for API compatibility."""

    new_password: str | None = Field(
        None,
        min_length=8,
        description="Deprecated — ignored. Admin reset sends a set-password email.",
    )


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
