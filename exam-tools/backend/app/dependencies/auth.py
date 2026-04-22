from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.core.security import verify_token
from app.dependencies.database import DBSessionDep
from app.models import User, UserRole

security = HTTPBearer()


async def get_current_user(
    session: DBSessionDep,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:
    token = credentials.credentials

    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

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


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return current_user


class RoleChecker:
    """Role-based authorization checker for exam-tools."""

    def __init__(self, allowed_roles: set[UserRole]):
        self.allowed_roles = allowed_roles

    async def __call__(
        self,
        current_user: Annotated[User, Depends(get_current_active_user)],
    ) -> User:
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user


super_admin_only = RoleChecker(allowed_roles={UserRole.SUPER_ADMIN})
super_admin_or_test_admin_officer = RoleChecker(
    allowed_roles={UserRole.SUPER_ADMIN, UserRole.TEST_ADMIN_OFFICER},
)
supervisor_only = RoleChecker(allowed_roles={UserRole.SUPERVISOR})
inspector_only = RoleChecker(allowed_roles={UserRole.INSPECTOR})
depot_keeper_only = RoleChecker(allowed_roles={UserRole.DEPOT_KEEPER})
supervisor_or_inspector = RoleChecker(allowed_roles={UserRole.SUPERVISOR, UserRole.INSPECTOR})
supervisor_inspector_or_depot_keeper = RoleChecker(
    allowed_roles={UserRole.SUPERVISOR, UserRole.INSPECTOR, UserRole.DEPOT_KEEPER},
)
exam_document_reader = RoleChecker(
    allowed_roles={UserRole.SUPER_ADMIN, UserRole.SUPERVISOR, UserRole.INSPECTOR, UserRole.DEPOT_KEEPER},
)


CurrentUserDep = Annotated[User, Depends(get_current_active_user)]
SuperAdminDep = Annotated[User, Depends(super_admin_only)]
SuperAdminOrTestAdminOfficerDep = Annotated[User, Depends(super_admin_or_test_admin_officer)]
SupervisorDep = Annotated[User, Depends(supervisor_only)]
InspectorDep = Annotated[User, Depends(inspector_only)]
DepotKeeperDep = Annotated[User, Depends(depot_keeper_only)]
SupervisorOrInspectorDep = Annotated[User, Depends(supervisor_or_inspector)]
SupervisorInspectorOrDepotKeeperDep = Annotated[User, Depends(supervisor_inspector_or_depot_keeper)]
ExamDocumentReaderDep = Annotated[User, Depends(exam_document_reader)]
