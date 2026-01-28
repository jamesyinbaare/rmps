"""Authentication endpoints."""
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.config import settings
from app.core.security import create_access_token, create_refresh_token, get_password_hash, verify_password
from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import Examiner, User, UserRole
from app.schemas.auth import Token, UserCreate, UserLogin, UserMeResponse, UserPasswordChange, UserResponse

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


@router.post("/login", response_model=Token, status_code=status.HTTP_200_OK)
async def login(user_credentials: UserLogin, session: DBSessionDep) -> Token:
    """Authenticate user and return JWT token."""
    # Query database for user
    stmt = select(User).where(User.email == user_credentials.email)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    # Verify user exists and password is correct
    if not user or not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )

    # Create access token
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email}, expires_delta=access_token_expires
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, session: DBSessionDep) -> UserResponse:
    """Public registration endpoint. Creates EXAMINER role by default."""
    # Check if user already exists
    stmt = select(User).where(User.email == user_data.email)
    result = await session.execute(stmt)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Validate password length
    if len(user_data.password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {settings.password_min_length} characters long",
        )

    # Create new user - always EXAMINER for public registration
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        role=UserRole.EXAMINER,  # Always EXAMINER for unauthenticated registration
        is_active=True,
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    return UserResponse.model_validate(new_user)


@router.get("/me", response_model=UserMeResponse)
async def get_current_user_info(
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> UserMeResponse:
    """Get current user information. Includes examiner_id when user has an examiner profile."""
    base = UserResponse.model_validate(current_user)
    examiner_stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()
    examiner_id_str: str | None = str(examiner.id) if examiner else None
    return UserMeResponse(
        **base.model_dump(),
        examiner_id=examiner_id_str,
    )


@router.post("/change-password", status_code=status.HTTP_200_OK)
async def change_password(
    password_data: UserPasswordChange,
    current_user: CurrentUserDep,
    session: DBSessionDep,
) -> dict[str, str]:
    """Change user password."""
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password",
        )

    # Validate new password length
    if len(password_data.new_password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {settings.password_min_length} characters long",
        )

    # Update password
    current_user.hashed_password = get_password_hash(password_data.new_password)
    await session.commit()

    return {"message": "Password changed successfully"}
