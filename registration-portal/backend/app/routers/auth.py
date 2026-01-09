from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

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
from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import (
    ExamRegistrationPeriod,
    PortalUser,
    RefreshToken,
    RegistrationCandidate,
    RegistrationExam,
    RegistrationStatus,
    RegistrationSubjectSelection,
    Role,
    School,
    Subject,
)
from app.schemas.auth import (
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
from app.services.subject_selection import (
    auto_select_subjects_for_programme,
    get_programme_subjects_for_registration,
    normalize_exam_series,
    validate_subject_selections,
)
from app.utils.registration import generate_unique_registration_number

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
async def register(user_data: PublicUserCreate, session: DBSessionDep) -> UserResponse:
    """Public registration endpoint. Unauthenticated users can only create PublicUser accounts."""
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

    # Create new user - always PublicUser for public registration
    hashed_password = get_password_hash(user_data.password)
    new_user = PortalUser(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        role=Role.PublicUser,  # Always PublicUser for unauthenticated registration
        is_active=True,
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    # Cache the new user
    set_cached_user(new_user)

    return UserResponse.model_validate(new_user)


@router.post("/register-private", response_model=PrivateUserRegistrationResponse, status_code=status.HTTP_201_CREATED)
async def register_private_user(
    registration_data: PrivateUserRegistrationRequest, session: DBSessionDep
) -> PrivateUserRegistrationResponse:
    """Dedicated endpoint for private user registration with exam and candidate data."""
    # Check if user already exists
    stmt = select(PortalUser).where(PortalUser.email == registration_data.email)
    result = await session.execute(stmt)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Validate password length
    if len(registration_data.password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {settings.password_min_length} characters long",
        )

    # Validate exam exists and registration is open for private candidates
    exam_stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .where(RegistrationExam.id == registration_data.exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    now = datetime.utcnow()
    if (
        not exam.registration_period.is_active
        or exam.registration_period.registration_start_date > now
        or exam.registration_period.registration_end_date < now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Registration period is not open"
        )

    if not exam.registration_period.allows_private_registration:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This exam does not allow private candidate registration",
        )

    # Validate school is a private examination center
    school_stmt = select(School).where(
        School.id == registration_data.school_id,
        School.is_active.is_(True),
        School.is_private_examination_center.is_(True),
    )
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()

    if not school:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected school is not available as an examination center for private candidates",
        )

    # Validate programme if provided
    programme_id = registration_data.programme_id
    if programme_id:
        from app.models import Programme

        programme_stmt = select(Programme).where(Programme.id == programme_id)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if not programme:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Validate subject selection
    if not programme_id and not registration_data.subject_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one subject must be selected when no programme is selected",
        )

    # Create user account
    hashed_password = get_password_hash(registration_data.password)
    new_user = PortalUser(
        email=registration_data.email,
        hashed_password=hashed_password,
        full_name=registration_data.full_name,
        role=Role.PublicUser,
        is_active=True,
    )
    session.add(new_user)
    await session.flush()

    # Generate unique registration number
    registration_number = await generate_unique_registration_number(session, registration_data.exam_id)

    # Create registration candidate
    new_candidate = RegistrationCandidate(
        registration_exam_id=registration_data.exam_id,
        school_id=registration_data.school_id,
        portal_user_id=new_user.id,
        name=registration_data.name,
        registration_number=registration_number,
        date_of_birth=registration_data.date_of_birth,
        gender=registration_data.gender,
        programme_id=programme_id,
        contact_email=registration_data.contact_email,
        contact_phone=registration_data.contact_phone,
        address=registration_data.address,
        national_id=registration_data.national_id,
        registration_status=RegistrationStatus.PENDING,
    )
    session.add(new_candidate)
    await session.flush()

    # Handle subject selections
    selected_subject_ids: list[int] = []

    if programme_id:
        # Auto-select compulsory core subjects only (not optional core subjects)
        auto_selected = await auto_select_subjects_for_programme(session, programme_id, None)
        selected_subject_ids.extend(auto_selected)

        # For MAY/JUNE: Auto-select ALL elective subjects (they are compulsory)
        normalized_series = normalize_exam_series(exam.exam_series)
        is_may_june = normalized_series == "MAY/JUNE"
        if is_may_june:
            subjects_info = await get_programme_subjects_for_registration(session, programme_id)
            selected_subject_ids.extend(subjects_info["electives"])

    # Add user-selected subjects (including optional core subjects or manual selections)
    if registration_data.subject_ids:
        selected_subject_ids.extend(registration_data.subject_ids)

    # Remove duplicates
    selected_subject_ids = list(set(selected_subject_ids))

    # Validate subject selections if programme is provided
    if programme_id and selected_subject_ids:
        is_valid, validation_errors = await validate_subject_selections(
            session, programme_id, selected_subject_ids, exam.exam_series
        )
        if not is_valid:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Subject selections do not meet programme requirements: {'; '.join(validation_errors)}",
            )

    # Create subject selections
    for subject_id in selected_subject_ids:
        subject_stmt = select(Subject).where(Subject.id == subject_id)
        subject_result = await session.execute(subject_stmt)
        subject = subject_result.scalar_one_or_none()
        if not subject:
            continue

        subject_selection = RegistrationSubjectSelection(
            registration_candidate_id=new_candidate.id,
            subject_id=subject_id,
            subject_code=subject.code,
            subject_name=subject.name,
        )
        session.add(subject_selection)

    await session.flush()

    # Create authentication tokens
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(new_user.id), "email": new_user.email}, expires_delta=access_token_expires
    )

    refresh_token_plain = create_refresh_token()
    refresh_token_hashed = hash_refresh_token(refresh_token_plain)
    refresh_token_expires = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)

    refresh_token_db = RefreshToken(
        user_id=new_user.id,
        token=refresh_token_hashed,
        expires_at=refresh_token_expires,
    )
    session.add(refresh_token_db)

    await session.commit()
    await session.refresh(new_candidate, ["subject_selections"])

    # Cache the new user
    set_cached_user(new_user)

    # Build response
    candidate_dict = {
        "id": new_candidate.id,
        "registration_exam_id": new_candidate.registration_exam_id,
        "school_id": new_candidate.school_id,
        "name": new_candidate.name,
        "registration_number": new_candidate.registration_number,
        "index_number": new_candidate.index_number,
        "date_of_birth": new_candidate.date_of_birth,
        "gender": new_candidate.gender,
        "programme_code": None,
        "programme_id": new_candidate.programme_id,
        "contact_email": new_candidate.contact_email,
        "contact_phone": new_candidate.contact_phone,
        "address": new_candidate.address,
        "national_id": new_candidate.national_id,
        "registration_status": new_candidate.registration_status,
        "registration_date": new_candidate.registration_date,
        "subject_selections": [
            {
                "id": sel.id,
                "subject_id": sel.subject_id,
                "subject_code": sel.subject_code,
                "subject_name": sel.subject_name,
                "series": sel.series,
                "created_at": sel.created_at,
            }
            for sel in (new_candidate.subject_selections or [])
        ],
        "created_at": new_candidate.created_at,
        "updated_at": new_candidate.updated_at,
    }

    return PrivateUserRegistrationResponse(
        user=UserResponse.model_validate(new_user),
        registration=candidate_dict,
        token=Token(
            access_token=access_token,
            refresh_token=refresh_token_plain,
            token_type="bearer",
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
