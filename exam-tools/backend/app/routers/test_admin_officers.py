"""Test admin officer accounts (monitoring + worked scripts); super admin creates."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.security import get_password_hash
from app.dependencies.auth import SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import User, UserRole
from app.schemas.password_reset import AdminPasswordReset, AdminPasswordResetResponse, StaffEmailUserListResponse
from app.schemas.test_admin_officer import TestAdminOfficerCreate, TestAdminOfficerCreatedResponse
from app.services.admin_password_reset import apply_admin_password_reset
from app.services.staff_email_users import list_staff_email_users, load_staff_email_user

router = APIRouter(prefix="/test-admin-officers", tags=["test-admin-officers"])

_MAX_PAGE = 100
_DEFAULT_PAGE = 20


@router.get(
    "",
    response_model=StaffEmailUserListResponse,
    summary="List test admin officer accounts",
)
async def list_test_admin_officers(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_PAGE, ge=1, le=_MAX_PAGE),
) -> StaffEmailUserListResponse:
    return await list_staff_email_users(
        session,
        UserRole.TEST_ADMIN_OFFICER,
        skip=skip,
        limit=limit,
    )


@router.post(
    "",
    response_model=TestAdminOfficerCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a test admin officer account",
)
async def create_test_admin_officer(
    data: TestAdminOfficerCreate,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> TestAdminOfficerCreatedResponse:
    """Email/password sign-in via ``POST /auth/super-admin/login``; worked-scripts monitoring and correction APIs."""
    email_str = str(data.email).strip()

    dup = await session.execute(select(User).where(User.email == email_str))
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    user = User(
        email=email_str,
        full_name=data.full_name.strip(),
        role=UserRole.TEST_ADMIN_OFFICER,
        hashed_password=get_password_hash(data.password),
        is_active=True,
    )
    session.add(user)
    try:
        await session.commit()
        await session.refresh(user)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create user (constraint violation)",
        ) from None

    return TestAdminOfficerCreatedResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
    )


@router.post(
    "/{user_id}/reset-password",
    response_model=AdminPasswordResetResponse,
    summary="Reset a test admin officer password",
)
async def reset_test_admin_officer_password(
    user_id: UUID,
    data: AdminPasswordReset,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> AdminPasswordResetResponse:
    if data.mode == "manual" and data.new_password is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="new_password is required when mode is manual",
        )
    user = await load_staff_email_user(
        session,
        user_id,
        UserRole.TEST_ADMIN_OFFICER,
        not_found_detail="Test admin officer not found",
    )
    try:
        return await apply_admin_password_reset(session, user, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
