"""Admin endpoints for system administrators."""
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.dependencies.auth import CurrentUserDep, SystemAdminDep
from app.dependencies.database import DBSessionDep
from app.models import (
    PortalUser,
    PortalUserType,
    RegistrationExam,
    ExamRegistrationPeriod,
    RegistrationCandidate,
    RegistrationExport,
    ExportStatus,
    School,
    ExaminationSchedule,
)
from app.schemas.registration import (
    RegistrationExamCreate,
    RegistrationExamUpdate,
    RegistrationExamResponse,
    ExamRegistrationPeriodUpdate,
)
from app.schemas.user import SchoolAdminUserCreate, UserResponse, UserListResponse
from app.schemas.schedule import (
    ExaminationScheduleCreate,
    ExaminationScheduleUpdate,
    ExaminationScheduleResponse,
)
from app.core.security import get_password_hash
from app.config import settings

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.post("/school-admin-users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_school_admin_user(
    user_data: SchoolAdminUserCreate, session: DBSessionDep, current_user: SystemAdminDep
) -> UserResponse:
    """Create a school admin user account (system admin only)."""
    # Check if user already exists
    stmt = select(PortalUser).where(PortalUser.email == user_data.email)
    result = await session.execute(stmt)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Validate school exists
    school_stmt = select(School).where(School.id == user_data.school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()

    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Validate password length
    if len(user_data.password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {settings.password_min_length} characters long",
        )

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = PortalUser(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        user_type=PortalUserType.SCHOOL_ADMIN,
        school_id=user_data.school_id,
        is_active=True,
        created_by_user_id=current_user.id,
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    return UserResponse.model_validate(new_user)


@router.get("/school-admin-users", response_model=list[UserResponse])
async def list_school_admin_users(session: DBSessionDep, current_user: SystemAdminDep) -> list[UserResponse]:
    """List all school admin users."""
    stmt = select(PortalUser).where(PortalUser.user_type == PortalUserType.SCHOOL_ADMIN)
    result = await session.execute(stmt)
    users = result.scalars().all()

    return [UserResponse.model_validate(user) for user in users]


# Placeholder for other admin endpoints - to be implemented
# - Exam management (CRUD)
# - Registration period management
# - Export functionality
# - Generate index numbers
# - Schedule management
