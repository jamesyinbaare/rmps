from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.core.security import verify_token
from app.dependencies.database import DBSessionDep
from app.models import PortalUser, Role

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


class RoleChecker:
    """Role-based authorization checker with hierarchical permissions."""

    def __init__(self, min_role: Role):
        """
        Initialize role checker with minimum required role.

        Args:
            min_role: Minimum role required. Users with roles <= min_role are allowed.
                     (Lower values = higher privileges: SystemAdmin=0, Director=10, ..., PublicUser=90)
        """
        self.min_role = min_role

    async def __call__(
        self,
        current_user: Annotated[PortalUser, Depends(get_current_active_user)],
    ) -> PortalUser:
        """
        Check if user's role meets minimum requirement.

        Since roles are hierarchical (lower value = higher privilege),
        user.role <= min_role means user has sufficient privileges.
        """
        if current_user.role > self.min_role:
            role_names = {
                Role.SystemAdmin: "SystemAdmin",
                Role.Director: "Director",
                Role.DeputyDirector: "DeputyDirector",
                Role.PrincipalManager: "PrincipalManager",
                Role.SeniorManager: "SeniorManager",
                Role.Manager: "Manager",
                Role.Staff: "Staff",
                Role.SchoolAdmin: "SchoolAdmin",
                Role.SchoolStaff: "SchoolStaff",
                Role.PublicUser: "PublicUser",
                Role.APIUSER: "APIUSER",
            }
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required role: {role_names[self.min_role]} or higher",
            )
        return current_user


# Pre-configured role dependencies
system_admin_only = RoleChecker(min_role=Role.SystemAdmin)
director_or_above = RoleChecker(min_role=Role.Director)
deputy_director_or_above = RoleChecker(min_role=Role.DeputyDirector)
principal_manager_or_above = RoleChecker(min_role=Role.PrincipalManager)
senior_manager_or_above = RoleChecker(min_role=Role.SeniorManager)
manager_or_above = RoleChecker(min_role=Role.Manager)
staff_or_above = RoleChecker(min_role=Role.Staff)
school_admin_or_above = RoleChecker(min_role=Role.SchoolAdmin)
school_users_or_above = RoleChecker(min_role=Role.SchoolStaff)  # Allows SchoolAdmin and SchoolStaff
all_authenticated = RoleChecker(min_role=Role.PublicUser)  # Allows all roles

# Typed dependencies for use in route handlers
CurrentUserDep = Annotated[PortalUser, Depends(get_current_active_user)]
SystemAdminDep = Annotated[PortalUser, Depends(system_admin_only)]
DirectorDep = Annotated[PortalUser, Depends(director_or_above)]
DeputyDirectorDep = Annotated[PortalUser, Depends(deputy_director_or_above)]
PrincipalManagerDep = Annotated[PortalUser, Depends(principal_manager_or_above)]
SeniorManagerDep = Annotated[PortalUser, Depends(senior_manager_or_above)]
ManagerDep = Annotated[PortalUser, Depends(manager_or_above)]
StaffDep = Annotated[PortalUser, Depends(staff_or_above)]
SchoolAdminDep = Annotated[PortalUser, Depends(school_admin_or_above)]
SchoolUserDep = Annotated[PortalUser, Depends(school_users_or_above)]
# Keep AdminDep for backward compatibility (maps to Manager)
AdminDep = Annotated[PortalUser, Depends(manager_or_above)]


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
