"""Executive viewer accounts (read-only national monitoring); super admin creates."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.security import get_password_hash
from app.dependencies.auth import SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import User, UserRole
from app.schemas.executive_viewer import ExecutiveViewerCreate, ExecutiveViewerCreatedResponse
from app.schemas.password_reset import AdminPasswordReset, AdminPasswordResetResponse, StaffEmailUserListResponse
from app.services.admin_password_reset import apply_admin_password_reset
from app.services.staff_email_users import list_staff_email_users, load_staff_email_user

router = APIRouter(prefix="/executive-viewers", tags=["executive-viewers"])

_MAX_PAGE = 100
_DEFAULT_PAGE = 20


@router.get(
    "",
    response_model=StaffEmailUserListResponse,
    summary="List executive viewer accounts",
)
async def list_executive_viewers(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_PAGE, ge=1, le=_MAX_PAGE),
) -> StaffEmailUserListResponse:
    return await list_staff_email_users(
        session,
        UserRole.EXECUTIVE_VIEWER,
        skip=skip,
        limit=limit,
    )


@router.post(
    "",
    response_model=ExecutiveViewerCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an executive viewer account",
)
async def create_executive_viewer(
    data: ExecutiveViewerCreate,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> ExecutiveViewerCreatedResponse:
    """Email/password sign-in via ``POST /auth/super-admin/login``; monitoring dashboard only."""
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
        role=UserRole.EXECUTIVE_VIEWER,
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

    return ExecutiveViewerCreatedResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
    )


@router.post(
    "/{user_id}/reset-password",
    response_model=AdminPasswordResetResponse,
    summary="Reset an executive viewer password",
)
async def reset_executive_viewer_password(
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
        UserRole.EXECUTIVE_VIEWER,
        not_found_detail="Executive viewer not found",
    )
    try:
        return await apply_admin_password_reset(session, user, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
