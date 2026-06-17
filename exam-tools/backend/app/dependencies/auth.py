from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.core.security import verify_token
from app.dependencies.database import DBSessionDep
from app.models import User, UserRole

security = HTTPBearer()
optional_bearer = HTTPBearer(auto_error=False)


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
super_admin_or_finance_officer = RoleChecker(
    allowed_roles={UserRole.SUPER_ADMIN, UserRole.FINANCE_OFFICER},
)
super_admin_or_test_admin_officer = RoleChecker(
    allowed_roles={UserRole.SUPER_ADMIN, UserRole.TEST_ADMIN_OFFICER},
)
super_admin_or_finance_officer_or_test_admin_officer = RoleChecker(
    allowed_roles={
        UserRole.SUPER_ADMIN,
        UserRole.FINANCE_OFFICER,
        UserRole.TEST_ADMIN_OFFICER,
    },
)
super_admin_or_test_admin_officer_or_subject_officer = RoleChecker(
    allowed_roles={
        UserRole.SUPER_ADMIN,
        UserRole.TEST_ADMIN_OFFICER,
        UserRole.SUBJECT_OFFICER,
    },
)
top_level_officer = RoleChecker(
    allowed_roles={
        UserRole.SUPER_ADMIN,
        UserRole.TEST_ADMIN_OFFICER,
        UserRole.EXECUTIVE_VIEWER,
    },
)
portal_examination_list = RoleChecker(
    allowed_roles={
        UserRole.SUPER_ADMIN,
        UserRole.TEST_ADMIN_OFFICER,
        UserRole.FINANCE_OFFICER,
        UserRole.EXECUTIVE_VIEWER,
    },
)
supervisor_only = RoleChecker(allowed_roles={UserRole.SUPERVISOR})
inspector_only = RoleChecker(allowed_roles={UserRole.INSPECTOR})
subject_officer_only = RoleChecker(allowed_roles={UserRole.SUBJECT_OFFICER})
depot_keeper_only = RoleChecker(allowed_roles={UserRole.DEPOT_KEEPER})
supervisor_or_inspector = RoleChecker(allowed_roles={UserRole.SUPERVISOR, UserRole.INSPECTOR})
supervisor_inspector_or_depot_keeper = RoleChecker(
    allowed_roles={UserRole.SUPER_ADMIN, UserRole.SUPERVISOR, UserRole.INSPECTOR, UserRole.DEPOT_KEEPER},
)
staff_active_examination_roles = RoleChecker(
    allowed_roles={
        UserRole.SUPER_ADMIN,
        UserRole.TEST_ADMIN_OFFICER,
        UserRole.SUPERVISOR,
        UserRole.INSPECTOR,
        UserRole.SUBJECT_OFFICER,
        UserRole.DEPOT_KEEPER,
    },
)
exam_document_reader = RoleChecker(
    allowed_roles={UserRole.SUPER_ADMIN, UserRole.SUPERVISOR, UserRole.INSPECTOR, UserRole.DEPOT_KEEPER},
)


CurrentUserDep = Annotated[User, Depends(get_current_active_user)]
SuperAdminDep = Annotated[User, Depends(super_admin_only)]
SuperAdminOrFinanceOfficerDep = Annotated[User, Depends(super_admin_or_finance_officer)]
SuperAdminOrTestAdminOfficerDep = Annotated[User, Depends(super_admin_or_test_admin_officer)]
SuperAdminOrFinanceOfficerOrTestAdminOfficerDep = Annotated[
    User,
    Depends(super_admin_or_finance_officer_or_test_admin_officer),
]
SuperAdminOrTestAdminOfficerOrSubjectOfficerDep = Annotated[
    User,
    Depends(super_admin_or_test_admin_officer_or_subject_officer),
]
TopLevelOfficerDep = Annotated[User, Depends(top_level_officer)]
PortalExaminationListDep = Annotated[User, Depends(portal_examination_list)]
SupervisorDep = Annotated[User, Depends(supervisor_only)]
InspectorDep = Annotated[User, Depends(inspector_only)]
SubjectOfficerDep = Annotated[User, Depends(subject_officer_only)]
DepotKeeperDep = Annotated[User, Depends(depot_keeper_only)]
SupervisorOrInspectorDep = Annotated[User, Depends(supervisor_or_inspector)]
SupervisorInspectorOrDepotKeeperDep = Annotated[User, Depends(supervisor_inspector_or_depot_keeper)]
StaffActiveExaminationDep = Annotated[User, Depends(staff_active_examination_roles)]
ExamDocumentReaderDep = Annotated[User, Depends(exam_document_reader)]


def get_inspector_posting_id_from_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(optional_bearer)],
) -> UUID | None:
    """JWT claim from inspector login; ignored for other roles."""
    if credentials is None:
        return None
    payload = verify_token(credentials.credentials)
    if payload is None:
        return None
    if payload.get("role") != UserRole.INSPECTOR.name:
        return None
    raw = payload.get("inspector_posting_id")
    if not raw:
        return None
    try:
        return UUID(str(raw))
    except (ValueError, TypeError):
        return None


InspectorJwtPostingIdDep = Annotated[UUID | None, Depends(get_inspector_posting_id_from_token)]


def get_subject_officer_assignment_id_from_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(optional_bearer)],
) -> UUID | None:
    """JWT claim from subject-officer login or select-workspace; ignored for other roles."""
    if credentials is None:
        return None
    payload = verify_token(credentials.credentials)
    if payload is None:
        return None
    if payload.get("role") != UserRole.SUBJECT_OFFICER.name:
        return None
    raw = payload.get("subject_officer_assignment_id")
    if not raw:
        return None
    try:
        return UUID(str(raw))
    except (ValueError, TypeError):
        return None


SubjectOfficerJwtAssignmentIdDep = Annotated[
    UUID | None,
    Depends(get_subject_officer_assignment_id_from_token),
]
