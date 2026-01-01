from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.config import settings
from app.core.cache import invalidate_user_cache
from app.core.security import get_password_hash
from app.dependencies.auth import RegistrarDep, SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import User, UserRole
from app.schemas.auth import UserResponse
from app.schemas.user import UserPasswordReset, UserUpdate

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
async def list_users(
    session: DBSessionDep,
    current_user: RegistrarDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: UserRole | None = Query(None, description="Filter by role"),
    is_active: bool | None = Query(None, description="Filter by active status"),
    search: str | None = Query(None, description="Search by email or full name"),
) -> list[UserResponse]:
    """List users with pagination and filters. Requires Registrar or higher role.

    Users can only see users with equal or lower privilege (higher role values).
    Lower role values = higher privileges (SUPER_ADMIN=0, REGISTRAR=10, OFFICER=15, DATACLERK=30).
    """
    offset = (page - 1) * page_size
    stmt = select(User)

    # CRITICAL: Filter to only show users with equal or lower privilege (higher role value)
    # Since lower values = higher privileges, we filter for role >= current_user.role
    stmt = stmt.where(User.role >= current_user.role)

    # Apply filters
    if role is not None:
        # Prevent filtering for roles with higher privilege than current user
        if role < current_user.role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot filter for roles with higher privileges than your own",
            )
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    if search:
        search_pattern = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.email).like(search_pattern),
                func.lower(User.full_name).like(search_pattern),
            )
        )

    # Order by created_at descending (newest first)
    stmt = stmt.order_by(User.created_at.desc()).offset(offset).limit(page_size)

    result = await session.execute(stmt)
    users = result.scalars().all()
    return [UserResponse.model_validate(user) for user in users]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID, session: DBSessionDep, current_user: RegistrarDep
) -> UserResponse:
    """Get user details. Requires Registrar or higher role.

    Users can only view users with equal or lower privilege (higher role values).
    """
    stmt = select(User).where(User.id == user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent viewing users with higher privilege (lower role value)
    if user.role < current_user.role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot view users with higher privileges than your own",
        )

    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    user_update: UserUpdate,
    session: DBSessionDep,
    current_user: RegistrarDep,
) -> UserResponse:
    """Update user. Requires Registrar or higher role.

    Users can only update users with equal or lower privilege (higher role values).
    Users cannot assign roles with higher privilege than their own.
    """
    stmt = select(User).where(User.id == user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent updating users with higher privilege (lower role value)
    if user.role < current_user.role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot update users with higher privileges than your own",
        )

    # Prevent users from deactivating themselves
    if user_id == current_user.id and user_update.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate yourself",
        )

    # Prevent assigning a role with higher privilege than current user
    if user_update.role is not None:
        if user_update.role < current_user.role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot assign roles with higher privileges than your own",
            )

    # Update fields if provided
    if user_update.full_name is not None:
        user.full_name = user_update.full_name
    if user_update.role is not None:
        user.role = user_update.role
    if user_update.is_active is not None:
        user.is_active = user_update.is_active

    await session.commit()
    await session.refresh(user)

    # Invalidate cache
    invalidate_user_cache(user_id=user.id, email=user.email)

    return UserResponse.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID, session: DBSessionDep, current_user: SuperAdminDep
) -> None:
    """Delete user. Requires SUPER_ADMIN role only."""
    stmt = select(User).where(User.id == user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent users from deleting themselves
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete yourself",
        )

    # Invalidate cache before deletion
    invalidate_user_cache(user_id=user.id, email=user.email)

    await session.delete(user)
    await session.commit()


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_user_password(
    user_id: UUID,
    password_reset: UserPasswordReset,
    session: DBSessionDep,
    current_user: SuperAdminDep,
) -> None:
    """Reset user password. Requires SUPER_ADMIN role only."""
    stmt = select(User).where(User.id == user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Validate password length
    if len(password_reset.new_password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {settings.password_min_length} characters long",
        )

    # Update password
    user.hashed_password = get_password_hash(password_reset.new_password)
    await session.commit()

    # Invalidate cache
    invalidate_user_cache(user_id=user.id, email=user.email)
