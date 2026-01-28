"""Authentication dependencies."""
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.core.security import verify_token
from app.dependencies.database import DBSessionDep
from app.models import User, UserRole

# HTTP Bearer token security scheme
security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)


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

    # Get user from database
    stmt = select(User).where(User.id == user_id)
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
) -> User | None:
    """Return the current user if Authorization header is present; otherwise None."""
    if credentials is None:
        return None
    # Reuse strict validation: invalid/expired tokens should still be 401
    return await get_current_user(session=session, credentials=credentials)


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
                     (Lower values = higher privileges: SYSTEM_ADMIN=0, ADMIN=10, EXAMINER=20)
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
                UserRole.SYSTEM_ADMIN: "SYSTEM_ADMIN",
                UserRole.ADMIN: "ADMIN",
                UserRole.EXAMINER: "EXAMINER",
            }
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required role: {role_names[self.min_role]} or higher",
            )
        return current_user


# Pre-configured role dependencies
system_admin_only = RoleChecker(min_role=UserRole.SYSTEM_ADMIN)
admin_or_above = RoleChecker(min_role=UserRole.ADMIN)
examiner_or_above = RoleChecker(min_role=UserRole.EXAMINER)  # Allows all roles

# Typed dependencies for use in route handlers
CurrentUserDep = Annotated[User, Depends(get_current_active_user)]
SystemAdminDep = Annotated[User, Depends(system_admin_only)]
AdminDep = Annotated[User, Depends(admin_or_above)]
