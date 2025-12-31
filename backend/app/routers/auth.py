from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.config import settings
from app.core.cache import get_cached_user_by_email, invalidate_user_cache, set_cached_user
from app.core.security import create_access_token, get_password_hash, verify_password
from app.dependencies.auth import CurrentUserDep, RegistrarDep
from app.dependencies.database import DBSessionDep
from app.models import User
from app.schemas.auth import Token, UserCreate, UserLogin, UserResponse
from app.schemas.user import UserPasswordChange, UserSelfUpdate

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


@router.post("/login", response_model=Token, status_code=status.HTTP_200_OK)
async def login(user_credentials: UserLogin, session: DBSessionDep) -> Token:
    """Authenticate user and return JWT token."""
    # Try to get user from cache first
    user = get_cached_user_by_email(user_credentials.email)

    # If not in cache, query database
    if user is None:
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

    # Update last_login
    user.last_login = datetime.utcnow()
    await session.commit()

    # Update cache with fresh user data
    set_cached_user(user)

    # Create access token
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email}, expires_delta=access_token_expires
    )

    return Token(access_token=access_token, token_type="bearer")


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate, session: DBSessionDep, current_user: RegistrarDep
) -> UserResponse:
    """Register a new user. Requires Registrar or higher role.

    Users can only create users with equal or lower privilege (higher role values).
    """
    # Prevent creating users with higher privilege than current user
    if user_data.role < current_user.role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot create users with higher privileges than your own",
        )

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

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        role=user_data.role,
        is_active=True,
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    # Cache the new user
    set_cached_user(new_user)

    return UserResponse.model_validate(new_user)


@router.get("/me", response_model=UserResponse, status_code=status.HTTP_200_OK)
async def get_current_user_info(current_user: CurrentUserDep) -> UserResponse:
    """Get current authenticated user information."""
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse, status_code=status.HTTP_200_OK)
async def update_current_user(
    user_update: UserSelfUpdate,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> UserResponse:
    """Update current user's own profile (name only)."""
    # Ensure the user is attached to the session (in case it came from cache)
    # Merge will attach the object to the session if it's not already attached
    user = await session.merge(current_user)

    # Update full_name
    user.full_name = user_update.full_name
    await session.commit()
    await session.refresh(user)

    # Invalidate cache
    invalidate_user_cache(user_id=user.id, email=user.email)

    return UserResponse.model_validate(user)


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_current_user_password(
    password_change: UserPasswordChange,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> None:
    """Change current user's own password. Requires current password verification."""
    # Verify current password
    if not verify_password(password_change.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    # Validate new password length
    if len(password_change.new_password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {settings.password_min_length} characters long",
        )

    # Update password
    current_user.hashed_password = get_password_hash(password_change.new_password)
    await session.commit()

    # Invalidate cache
    invalidate_user_cache(user_id=current_user.id, email=current_user.email)
