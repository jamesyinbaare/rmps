"""Executive viewer accounts (read-only national monitoring); super admin creates."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.security import get_password_hash
from app.dependencies.auth import SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import User, UserRole
from app.schemas.executive_viewer import ExecutiveViewerCreate, ExecutiveViewerCreatedResponse

router = APIRouter(prefix="/executive-viewers", tags=["executive-viewers"])


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
