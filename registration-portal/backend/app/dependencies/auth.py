from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.core.security import verify_token
from app.dependencies.database import DBSessionDep
from app.models import PortalUser, PortalUserType

# HTTP Bearer token security scheme
security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)


async def get_current_user(
    session: DBSessionDep,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> PortalUser:
    """Extract and verify JWT token, then return the current user."""
    token = credentials.credentials

    # Verify token
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract user_id from token (JWT sub claim is a string UUID)
    user_id_str: str | None = payload.get("sub")
    if user_id_str is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_id = UUID(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user from database
    stmt = select(PortalUser).where(PortalUser.id == user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_user_optional(
    session: DBSessionDep,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_optional),
) -> PortalUser | None:
    """Return the current user if Authorization header is present; otherwise None."""
    if credentials is None:
        return None
    # Reuse strict validation: invalid/expired tokens should still be 401
    return await get_current_user(session=session, credentials=credentials)


async def get_current_active_user(
    current_user: Annotated[PortalUser, Depends(get_current_user)],
) -> PortalUser:
    """Ensure the current user is active."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return current_user


class UserTypeChecker:
    """User type-based authorization checker."""

    def __init__(self, allowed_types: list[PortalUserType]):
        """
        Initialize user type checker with allowed user types.

        Args:
            allowed_types: List of user types that are allowed to access the endpoint.
        """
        self.allowed_types = allowed_types

    async def __call__(
        self,
        current_user: Annotated[PortalUser, Depends(get_current_active_user)],
    ) -> PortalUser:
        """Check if user's type is in the allowed list."""
        if current_user.user_type not in self.allowed_types:
            allowed_names = [ut.value for ut in self.allowed_types]
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required user type: {', '.join(allowed_names)}",
            )
        return current_user


# Pre-configured user type dependencies
system_admin_only = UserTypeChecker(allowed_types=[PortalUserType.SYSTEM_ADMIN])
admin_or_above = UserTypeChecker(allowed_types=[PortalUserType.SYSTEM_ADMIN, PortalUserType.ADMIN])
school_admin_or_above = UserTypeChecker(allowed_types=[PortalUserType.SYSTEM_ADMIN, PortalUserType.SCHOOL_ADMIN])
school_users_or_above = UserTypeChecker(
    allowed_types=[PortalUserType.SYSTEM_ADMIN, PortalUserType.SCHOOL_ADMIN, PortalUserType.SCHOOL_USER]
)
all_authenticated = UserTypeChecker(
    allowed_types=[
        PortalUserType.SYSTEM_ADMIN,
        PortalUserType.SCHOOL_ADMIN,
        PortalUserType.SCHOOL_USER,
        PortalUserType.PRIVATE_USER,
        PortalUserType.ADMIN,
    ]
)

# Typed dependencies for use in route handlers
CurrentUserDep = Annotated[PortalUser, Depends(get_current_active_user)]
SystemAdminDep = Annotated[PortalUser, Depends(system_admin_only)]
AdminDep = Annotated[PortalUser, Depends(admin_or_above)]  # SYSTEM_ADMIN or ADMIN
SchoolAdminDep = Annotated[PortalUser, Depends(school_admin_or_above)]
SchoolUserDep = Annotated[PortalUser, Depends(school_users_or_above)]


async def get_current_school_user(
    current_user: Annotated[PortalUser, Depends(school_users_or_above)],
) -> PortalUser:
    """Ensure the current user is a school user (admin or regular) and has a school_id."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School user must be associated with a school",
        )
    return current_user


SchoolUserWithSchoolDep = Annotated[PortalUser, Depends(get_current_school_user)]
