import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.cache import get_cached_user_by_email, invalidate_user_cache, set_cached_user
from app.core.rate_limit import check_rate_limit
from app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import (
    ExamRegistrationPeriod,
    PasswordSetupPurpose,
    PortalUser,
    RefreshToken,
    RegistrationCandidate,
    RegistrationExam,
    RegistrationStatus,
    RegistrationSubjectSelection,
    RegistrationType,
    Role,
    School,
    Subject,
)
from app.schemas.auth import (
    ForgotPasswordRequest,
    PasswordSetupRequest,
    PasswordSetupValidateResponse,
    PrivateUserRegistrationRequest,
    PrivateUserRegistrationResponse,
    PublicUserCreate,
    RefreshTokenRequest,
    Token,
    TokenRefreshResponse,
    UserLogin,
    UserResponse,
    UserPasswordChange,
    UserSelfUpdate,
)
from app.services.password_setup_service import (
    consume_password_setup_token,
    generate_unusable_password_hash,
    issue_and_send_password_setup,
    revoke_user_refresh_tokens,
    validate_password_setup_token,
)
from app.utils.username import normalize_email
from app.services.subject_selection import validate_subject_selections
from app.services.registration_completeness import default_fee_payment_status
from app.utils.registration import generate_unique_registration_number

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
logger = logging.getLogger(__name__)

# Constant-time equalization when the account does not exist
_DUMMY_PASSWORD_HASH = get_password_hash("timing-equalization-unused")


def _auth_client_rate_key(request: Request, suffix: str) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    ip = (forwarded.split(",")[0].strip() if forwarded else None) or (
        request.client.host if request.client else "unknown"
    )
    return f"auth:{suffix}:{ip}"


@router.post("/login", response_model=Token, status_code=status.HTTP_200_OK)
async def login(
    user_credentials: UserLogin,
    request: Request,
    session: DBSessionDep,
) -> Token:
    """Authenticate user and return JWT token. Identifier may be email or username."""
    identifier = user_credentials.email.strip()
    if not check_rate_limit(
        _auth_client_rate_key(request, "login"),
        limit=settings.login_rate_limit_per_minute,
    ) or not check_rate_limit(
        f"auth:login-id:{identifier.lower()[:128]}",
        limit=settings.login_rate_limit_per_minute,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later.",
        )

    user: PortalUser | None = None

    if "@" in identifier:
        email = identifier.lower()
        user = get_cached_user_by_email(email)
        if user is None:
            result = await session.execute(select(PortalUser).where(PortalUser.email == email))
            user = result.scalar_one_or_none()
        if user is None:
            result = await session.execute(
                select(PortalUser).where(PortalUser.username == email)
            )
            user = result.scalar_one_or_none()
    else:
        username = identifier.lower()
        result = await session.execute(
            select(PortalUser).where(PortalUser.username == username)
        )
        user = result.scalar_one_or_none()

    password_ok = verify_password(
        user_credentials.password,
        user.hashed_password if user is not None else _DUMMY_PASSWORD_HASH,
    )
    # Inactive accounts use the same 401 as bad credentials (no enumeration)
    if user is None or not password_ok or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email/username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from app.services.refresh_token_service import store_refresh_token

    # Update last_login
    user.last_login = datetime.utcnow()
    await session.flush()

    # Update cache with fresh user data
    set_cached_user(user)

    # Create access token
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email}, expires_delta=access_token_expires
    )

    refresh_token_plain = await store_refresh_token(session, user.id)
    await session.commit()

    return Token(
        access_token=access_token,
        refresh_token=refresh_token_plain,
        token_type="bearer",
    )


@router.post("/register", status_code=status.HTTP_204_NO_CONTENT)
async def register(
    user_data: PublicUserCreate,
    request: Request,
    session: DBSessionDep,
) -> None:
    """Public registration: create PublicUser and email an INVITE set-password link.

    Always returns 204 (no account enumeration for email/username collisions).
    """
    if not check_rate_limit(
        _auth_client_rate_key(request, "register"),
        limit=settings.register_rate_limit_per_minute,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )

    email = normalize_email(str(user_data.email))
    username = user_data.username  # already validated/normalized by schema

    existing_email = (
        await session.execute(select(PortalUser).where(PortalUser.email == email))
    ).scalar_one_or_none()
    existing_username = (
        await session.execute(select(PortalUser).where(PortalUser.username == username))
    ).scalar_one_or_none()
    if existing_email is not None or existing_username is not None:
        logger.info(
            "Public register skipped (collision) email_taken=%s username_taken=%s",
            existing_email is not None,
            existing_username is not None,
        )
        return None

    new_user = PortalUser(
        email=email,
        username=username,
        hashed_password=generate_unusable_password_hash(),
        full_name=username,
        role=Role.PublicUser,
        is_active=True,
    )

    session.add(new_user)
    await session.flush()
    sent = await issue_and_send_password_setup(
        session, new_user, purpose=PasswordSetupPurpose.INVITE
    )

    from app.services import account_audit

    await account_audit.record_account_event(
        session,
        action=account_audit.USER_CREATED,
        target_user_id=new_user.id,
        metadata={"role": "PublicUser", "invite_sent": sent},
    )
    if sent:
        await account_audit.record_account_event(
            session,
            action=account_audit.INVITE_SENT,
            target_user_id=new_user.id,
        )
        set_cached_user(new_user)
    else:
        logger.warning("Invite email failed for new public user_id=%s", new_user.id)
    await session.commit()
    return None


@router.post("/register-private", response_model=PrivateUserRegistrationResponse, status_code=status.HTTP_201_CREATED)
async def register_private_user(
    registration_data: PrivateUserRegistrationRequest, session: DBSessionDep
) -> PrivateUserRegistrationResponse:
    """Deprecated one-shot private registration. Use POST /register then dashboard flows."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "This endpoint is deprecated. Create an account via POST /api/v1/auth/register, "
            "set your password from the invite email, then register for exams in the private portal."
        ),
    )


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


def _client_rate_key(request: Request, suffix: str) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    ip = (forwarded.split(",")[0].strip() if forwarded else None) or (
        request.client.host if request.client else "unknown"
    )
    return f"password-setup:{suffix}:{ip}"


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    session: DBSessionDep,
) -> None:
    """Request a password reset email. Always returns 204 (no account enumeration)."""
    if not check_rate_limit(
        _client_rate_key(request, "forgot"),
        limit=settings.password_setup_rate_limit_per_minute,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )

    email = str(payload.email).strip().lower()
    user = (
        await session.execute(
            select(PortalUser).where(PortalUser.email == email)
        )
    ).scalar_one_or_none()

    if user is not None and user.is_active:
        sent = await issue_and_send_password_setup(
            session, user, purpose=PasswordSetupPurpose.RESET
        )
        await session.commit()
        if not sent:
            logger.warning("Forgot-password email failed for user_id=%s", user.id)


@router.get(
    "/password-setup/validate",
    response_model=PasswordSetupValidateResponse,
    status_code=status.HTTP_200_OK,
)
async def validate_password_setup(
    request: Request,
    session: DBSessionDep,
    token: str = Query(..., min_length=1),
) -> PasswordSetupValidateResponse:
    """Check whether a set-password token is usable. Errors are intentionally generic."""
    if not check_rate_limit(
        _client_rate_key(request, "validate"),
        limit=settings.password_setup_rate_limit_per_minute,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
    valid = await validate_password_setup_token(session, token)
    return PasswordSetupValidateResponse(valid=valid)


@router.post("/password-setup", status_code=status.HTTP_204_NO_CONTENT)
async def complete_password_setup(
    payload: PasswordSetupRequest,
    request: Request,
    session: DBSessionDep,
) -> None:
    """Set password using a one-time invite/reset token."""
    if not check_rate_limit(
        _client_rate_key(request, "consume"),
        limit=settings.password_setup_rate_limit_per_minute,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )

    try:
        user = await consume_password_setup_token(
            session, payload.token, payload.new_password
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired link",
        )

    await session.commit()


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

    from app.services import account_audit
    from app.services.password_policy import validate_password_policy

    try:
        validate_password_policy(
            password_change.new_password,
            email=current_user.email,
            username=getattr(current_user, "username", None),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    # Update password and kill existing sessions
    current_user.hashed_password = get_password_hash(password_change.new_password)
    await revoke_user_refresh_tokens(session, current_user.id)
    await account_audit.record_account_event(
        session,
        action=account_audit.PASSWORD_CHANGED,
        target_user_id=current_user.id,
        actor_user_id=current_user.id,
    )
    await session.commit()

    # Invalidate cache
    invalidate_user_cache(user_id=current_user.id, email=current_user.email)


@router.post("/refresh", response_model=TokenRefreshResponse, status_code=status.HTTP_200_OK)
async def refresh_token(refresh_request: RefreshTokenRequest, session: DBSessionDep) -> TokenRefreshResponse:
    """Refresh access token using refresh token. Implements token rotation + reuse detection."""
    from app.services.refresh_token_service import (
        find_refresh_token,
        handle_refresh_reuse,
        rotate_refresh_token,
    )

    plain = refresh_request.refresh_token
    refresh_token_db = await find_refresh_token(session, plain, include_revoked=False)

    if refresh_token_db is None:
        reused = await handle_refresh_reuse(session, plain)
        if reused is not None and reused.revoked_at is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token reuse detected. All sessions revoked.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if refresh_token_db.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_stmt = select(PortalUser).where(PortalUser.id == refresh_token_db.user_id)
    user_result = await session.execute(user_stmt)
    user = user_result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email}, expires_delta=access_token_expires
    )
    new_refresh_token_plain = await rotate_refresh_token(session, refresh_token_db, user.id)
    await session.commit()

    return TokenRefreshResponse(
        access_token=access_token,
        refresh_token=new_refresh_token_plain,
        token_type="bearer",
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(refresh_request: RefreshTokenRequest, session: DBSessionDep) -> None:
    """Logout and revoke refresh token."""
    from app.services.refresh_token_service import find_refresh_token

    refresh_token_db = await find_refresh_token(
        session, refresh_request.refresh_token, include_revoked=False
    )
    if refresh_token_db:
        refresh_token_db.revoked_at = datetime.utcnow()
        await session.commit()


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(session: DBSessionDep, current_user: CurrentUserDep) -> None:
    """Revoke all refresh tokens for the current user."""
    await revoke_user_refresh_tokens(session, current_user.id)
    await session.commit()
    invalidate_user_cache(user_id=current_user.id, email=current_user.email)
