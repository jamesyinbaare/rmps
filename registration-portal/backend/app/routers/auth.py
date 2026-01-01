from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.config import settings
from app.core.cache import get_cached_user_by_email, invalidate_user_cache, set_cached_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    hash_refresh_token,
    verify_password,
    verify_refresh_token_hash,
)
from app.dependencies.auth import CurrentUserDep, SystemAdminDep
from app.dependencies.database import DBSessionDep
from app.models import PortalUser, PortalUserType, RefreshToken
from app.schemas.auth import (
    RefreshTokenRequest,
    Token,
    TokenRefreshResponse,
    UserCreate,
    UserLogin,
    UserResponse,
    UserPasswordChange,
    UserSelfUpdate,
)

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


@router.post("/login", response_model=Token, status_code=status.HTTP_200_OK)
async def login(user_credentials: UserLogin, session: DBSessionDep) -> Token:
    """Authenticate user and return JWT token."""
    # Try to get user from cache first
    user = get_cached_user_by_email(user_credentials.email)

    # If not in cache, query database
    if user is None:
        stmt = select(PortalUser).where(PortalUser.email == user_credentials.email)
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
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email}, expires_delta=access_token_expires
    )

    # Create refresh token
    refresh_token_plain = create_refresh_token()
    refresh_token_hashed = hash_refresh_token(refresh_token_plain)
    refresh_token_expires = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)

    # Store refresh token in database
    refresh_token_db = RefreshToken(
        user_id=user.id,
        token=refresh_token_hashed,
        expires_at=refresh_token_expires,
    )
    session.add(refresh_token_db)
    await session.commit()

    return Token(
        access_token=access_token,
        refresh_token=refresh_token_plain,
        token_type="bearer",
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, session: DBSessionDep) -> UserResponse:
    """Public registration for private users only."""
    # Only allow PRIVATE_USER registration via public endpoint
    if user_data.user_type != PortalUserType.PRIVATE_USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is only for private user registration. Other user types must be created by administrators.",
        )

    # Check if user already exists
    stmt = select(PortalUser).where(PortalUser.email == user_data.email)
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
    new_user = PortalUser(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        user_type=PortalUserType.PRIVATE_USER,
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
    # Merge to attach to session
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


@router.post("/refresh", response_model=TokenRefreshResponse, status_code=status.HTTP_200_OK)
async def refresh_token(refresh_request: RefreshTokenRequest, session: DBSessionDep) -> TokenRefreshResponse:
    """Refresh access token using refresh token. Implements token rotation."""
    # Find refresh token in database (only non-revoked, non-expired tokens)
    stmt = select(RefreshToken).where(
        RefreshToken.expires_at > datetime.utcnow(),
        RefreshToken.revoked_at.is_(None),
    )
    result = await session.execute(stmt)
    all_tokens = result.scalars().all()

    # Find matching token by verifying hash
    refresh_token_db = None
    for token in all_tokens:
        if verify_refresh_token_hash(refresh_request.refresh_token, token.token):
            refresh_token_db = token
            break

    if not refresh_token_db:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if token is revoked
    if refresh_token_db.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if token is expired
    if refresh_token_db.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user
    user_stmt = select(PortalUser).where(PortalUser.id == refresh_token_db.user_id)
    user_result = await session.execute(user_stmt)
    user = user_result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Revoke old refresh token (token rotation)
    refresh_token_db.revoked_at = datetime.utcnow()

    # Create new access token
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email}, expires_delta=access_token_expires
    )

    # Create new refresh token (token rotation)
    new_refresh_token_plain = create_refresh_token()
    new_refresh_token_hashed = hash_refresh_token(new_refresh_token_plain)
    new_refresh_token_expires = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)

    # Store new refresh token
    new_refresh_token_db = RefreshToken(
        user_id=user.id,
        token=new_refresh_token_hashed,
        expires_at=new_refresh_token_expires,
        last_used_at=datetime.utcnow(),
    )
    session.add(new_refresh_token_db)

    # Update last_used_at on old token before revoking
    refresh_token_db.last_used_at = datetime.utcnow()

    await session.commit()

    return TokenRefreshResponse(
        access_token=access_token,
        refresh_token=new_refresh_token_plain,
        token_type="bearer",
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(refresh_request: RefreshTokenRequest, session: DBSessionDep) -> None:
    """Logout and revoke refresh token."""
    # Find refresh token in database (only non-revoked tokens)
    stmt = select(RefreshToken).where(RefreshToken.revoked_at.is_(None))
    result = await session.execute(stmt)
    all_tokens = result.scalars().all()

    # Find matching token by verifying hash
    refresh_token_db = None
    for token in all_tokens:
        if verify_refresh_token_hash(refresh_request.refresh_token, token.token):
            refresh_token_db = token
            break

    if refresh_token_db:
        # Revoke the refresh token
        refresh_token_db.revoked_at = datetime.utcnow()
        await session.commit()
