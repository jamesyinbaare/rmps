"""Permission-based authorization dependencies for FastAPI routes."""
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import DBSessionDep
from app.models import PortalUser, Role
from app.services.permission_service import check_permission
from app.config import settings
from app.core.permissions import get_permission


class PermissionChecker:
    """Permission-based authorization checker with override support."""

    def __init__(self, permission_key: str):
        """
        Initialize permission checker with required permission key.

        Args:
            permission_key: The permission key required to access the route.
        """
        self.permission_key = permission_key

    async def __call__(
        self,
        current_user: Annotated[PortalUser, Depends(get_current_active_user)],
        session: DBSessionDep,
    ) -> PortalUser:
        """
        Check if user has the required permission.

        Permission resolution order:
        1. User-level override (highest priority)
        2. Role-level override
        3. Role hierarchy (default)

        Raises HTTPException with 403 if user lacks permission.
        """
        # Check if permission exists
        permission_def = get_permission(self.permission_key)
        if permission_def is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Unknown permission: {self.permission_key}",
            )

        # Check permission
        has_permission = await check_permission(
            user=current_user,
            permission_key=self.permission_key,
            session=session,
        )

        if not has_permission:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required permission: {self.permission_key}",
            )

        return current_user


async def get_permission_manager_user(
    current_user: Annotated[PortalUser, Depends(get_current_active_user)],
) -> PortalUser:
    """
    Ensure the current user has permission to manage permissions.

    Uses configurable minimum role from settings (default: Director).
    """
    # Get minimum role from settings
    min_role_name = settings.permission_management_min_role
    try:
        min_role = Role[min_role_name]
    except KeyError:
        # Default to Director if invalid role name in settings
        min_role = Role.Director

    if current_user.role > min_role:
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
        }
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions. Required role: {role_names[min_role]} or higher to manage permissions",
        )

    return current_user


# Typed dependencies for common permissions
PermissionManagerDep = Annotated[PortalUser, Depends(get_permission_manager_user)]

# Common permission dependencies can be created like:
# UserManagementViewDep = Annotated[PortalUser, Depends(PermissionChecker("user_management.view"))]
# UserManagementEditDep = Annotated[PortalUser, Depends(PermissionChecker("user_management.edit"))]
