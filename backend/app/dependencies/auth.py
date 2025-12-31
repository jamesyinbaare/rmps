from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.core.cache import get_cached_user, set_cached_user
from app.core.security import verify_token
from app.dependencies.database import DBSessionDep
from app.models import User, UserRole

# HTTP Bearer token security scheme
security = HTTPBearer()


async def get_current_user(
    session: DBSessionDep,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:
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

    # Try to get user from cache first
    user = get_cached_user(user_id)
    if user is not None:
        return user

    # Get user from database if not in cache
    stmt = select(User).where(User.id == user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Cache the user for future requests
    set_cached_user(user)

    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Ensure the current user is active."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return current_user


class RoleChecker:
    """Role-based authorization checker with hierarchical permissions."""

    def __init__(self, min_role: UserRole):
        """
        Initialize role checker with minimum required role.

        Args:
            min_role: Minimum role required. Users with roles <= min_role are allowed.
                     (Lower values = higher privileges: SUPER_ADMIN=0, REGISTRAR=10, OFFICER=15, DATACLERK=30)
        """
        self.min_role = min_role

    async def __call__(
        self,
        current_user: Annotated[User, Depends(get_current_active_user)],
    ) -> User:
        """
        Check if user's role meets minimum requirement.

        Since roles are hierarchical (lower value = higher privilege),
        user.role <= min_role means user has sufficient privileges.
        """
        if current_user.role > self.min_role:
            role_names = {
                UserRole.SUPER_ADMIN: "SuperAdmin",
                UserRole.REGISTRAR: "Registrar",
                UserRole.OFFICER: "OFFICER",
                UserRole.DATACLERK: "DATACLERK",
            }
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required role: {role_names[self.min_role]} or higher",
            )
        return current_user


# Pre-configured role dependencies
super_admin_only = RoleChecker(min_role=UserRole.SUPER_ADMIN)
registrar_or_above = RoleChecker(min_role=UserRole.REGISTRAR)
officer_or_above = RoleChecker(min_role=UserRole.OFFICER)
dataclerk_or_above = RoleChecker(min_role=UserRole.DATACLERK)

# Typed dependencies for use in route handlers
CurrentUserDep = Annotated[User, Depends(get_current_active_user)]
SuperAdminDep = Annotated[User, Depends(super_admin_only)]
RegistrarDep = Annotated[User, Depends(registrar_or_above)]
OfficerDep = Annotated[User, Depends(officer_or_above)]
DataClerkDep = Annotated[User, Depends(dataclerk_or_above)]
