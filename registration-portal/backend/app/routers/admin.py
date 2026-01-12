"""Admin endpoints for system administrators."""
import logging
from datetime import datetime, timezone
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status, UploadFile, File, Form, BackgroundTasks, Body, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete, insert, update, cast, String, type_coerce
from sqlalchemy.orm import selectinload

from app.dependencies.auth import CurrentUserDep, SystemAdminDep, AdminDep
from app.dependencies.permissions import PermissionChecker
from app.dependencies.database import DBSessionDep
from app.models import (
    PortalUser,
    Role,
    RegistrationExam,
    ExamRegistrationPeriod,
    RegistrationCandidate,
    RegistrationSubjectSelection,
    RegistrationExport,
    ExportStatus,
    School,
    ExaminationSchedule,
    Programme,
    Subject,
    SubjectType,
    programme_subjects,
    school_programmes,
    IndexNumberGenerationJob,
    IndexNumberGenerationJobStatus,
    RegistrationApplicationFee,
    SubjectPricing,
    RegistrationTieredPricing,
)
from app.schemas.registration import (
    RegistrationExamCreate,
    RegistrationExamUpdate,
    RegistrationExamResponse,
    ExamRegistrationPeriodUpdate,
    ExamRegistrationPeriodResponse,
    IndexNumberGenerationJobResponse,
    SchoolProgressItem,
    CandidateListResponse,
)
from app.schemas.user import (
    SchoolAdminUserCreate,
    AdminUserCreate,
    UserPasswordReset,
    UserUpdate,
    UserResponse,
    UserListResponse,
)
from app.schemas.school import (
    SchoolResponse,
    SchoolDetailResponse,
    SchoolUpdate,
    SchoolStatisticsResponse,
    SchoolListResponse,
    SchoolCreate,
    BulkUploadResponse,
    BulkUploadError,
)
from app.models import RegistrationStatus
import csv
import io
import pandas as pd
from sqlalchemy import and_
from app.schemas.schedule import (
    ExaminationScheduleCreate,
    ExaminationScheduleUpdate,
    ExaminationScheduleResponse,
    ExaminationScheduleBulkUploadResponse,
    ExaminationScheduleBulkUploadError,
)
from app.services.index_slip_service import generate_index_slip_pdf
from app.services.photo_storage import PhotoStorageService
from app.core.security import get_password_hash
from app.core.cache import invalidate_user_cache
from app.config import settings
from app.schemas.programme import (
    ProgrammeCreate,
    ProgrammeUpdate,
    ProgrammeResponse,
    ProgrammeListResponse,
    ProgrammeSubjectAssociation,
    ProgrammeSubjectAssociationCreate,
    ProgrammeSubjectAssociationUpdate,
    ProgrammeSubjectRequirements,
    ProgrammeSubjectResponse,
    ProgrammeBulkUploadResponse,
    ProgrammeBulkUploadError,
    SubjectChoiceGroup,
)
from app.schemas.subject import (
    SubjectCreate,
    SubjectUpdate,
    SubjectResponse,
    SubjectListResponse,
    SubjectBulkUploadResponse,
    SubjectBulkUploadError,
)
from app.schemas.pricing import (
    ApplicationFeeResponse,
    ApplicationFeeCreate,
    SubjectPricingResponse,
    SubjectPricingCreate,
    SubjectPricingBulkUpdate,
    TieredPricingResponse,
    TieredPricingCreate,
    TieredPricingBulkUpdate,
    ExamPricingResponse,
    ImportPricingRequest,
)
from app.services.programme_upload import (
    ProgrammeUploadParseError,
    ProgrammeUploadValidationError,
    parse_programme_row,
    parse_upload_file as parse_programme_upload_file,
    validate_required_columns as validate_programme_columns,
)
from app.services.subject_upload import (
    SubjectUploadParseError,
    SubjectUploadValidationError,
    parse_subject_row,
    parse_upload_file as parse_subject_upload_file,
    validate_required_columns as validate_subject_columns,
)
from app.services.schedule_upload import (
    ScheduleUploadParseError,
    ScheduleUploadValidationError,
    parse_schedule_row,
    parse_upload_file as parse_schedule_upload_file,
    validate_required_columns as validate_schedule_columns,
)
from app.services.template_generator import generate_programme_template, generate_subject_template, generate_schedule_template
from app.schemas.result import (
    CandidateResultBulkPublish,
    CandidateResultBulkPublishResponse,
    CandidateResultResponse,
    CandidateResultUpdate,
    ResultBlockCreate,
    ResultBlockResponse,
    PublishResultsFilterRequest,
)
from app.models import CandidateResult, ResultBlock, ResultBlockType, Grade
from app.services.result_service import (
    upload_results_bulk,
    publish_results_bulk,
    unpublish_results_bulk,
    publish_exam_results,
    unpublish_exam_results,
    create_result_block,
    check_result_blocks,
    get_candidate_results,
    unblock_result,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

logger = logging.getLogger(__name__)


@router.post("/school-admin-users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_school_admin_user(
    user_data: SchoolAdminUserCreate, session: DBSessionDep, current_user: SystemAdminDep
) -> UserResponse:
    """Create a coordinator account (system admin only)."""
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
        role=Role.SchoolAdmin,
        school_id=user_data.school_id,
        is_active=True,
        created_by_user_id=current_user.id,
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    # Reload with school relationship to get school name
    stmt_with_school = select(PortalUser).options(selectinload(PortalUser.school)).where(PortalUser.id == new_user.id)
    result_with_school = await session.execute(stmt_with_school)
    user_with_school = result_with_school.scalar_one()

    user_dict = {
        "id": user_with_school.id,
        "email": user_with_school.email,
        "full_name": user_with_school.full_name,
        "role": user_with_school.role,
        "school_id": user_with_school.school_id,
        "school_name": user_with_school.school.name if user_with_school.school else None,
        "is_active": user_with_school.is_active,
        "created_at": user_with_school.created_at,
        "updated_at": user_with_school.updated_at,
    }
    return UserResponse(**user_dict)


@router.get("/school-admin-users", response_model=list[UserResponse])
async def list_school_admin_users(session: DBSessionDep, current_user: SystemAdminDep) -> list[UserResponse]:
    """List all coordinators. SystemAdmin only."""
    stmt = select(PortalUser).options(selectinload(PortalUser.school)).where(PortalUser.role == Role.SchoolAdmin)
    result = await session.execute(stmt)
    users = result.scalars().all()

    user_responses = []
    for user in users:
        user_dict = {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "school_id": user.school_id,
            "school_name": user.school.name if user.school else None,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
        }
        user_responses.append(UserResponse(**user_dict))

    return user_responses


@router.get("/school-staff-users", response_model=list[UserResponse])
async def list_school_staff_users(session: DBSessionDep, current_user: SystemAdminDep) -> list[UserResponse]:
    """List all SchoolStaff users. SystemAdmin only."""
    stmt = select(PortalUser).options(selectinload(PortalUser.school)).where(PortalUser.role == Role.SchoolStaff)
    result = await session.execute(stmt)
    users = result.scalars().all()

    user_responses = []
    for user in users:
        user_dict = {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "school_id": user.school_id,
            "school_name": user.school.name if user.school else None,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
        }
        user_responses.append(UserResponse(**user_dict))

    return user_responses


@router.get("/public-users", response_model=list[UserResponse])
async def list_public_users(session: DBSessionDep, current_user: SystemAdminDep) -> list[UserResponse]:
    """List all PublicUser accounts. SystemAdmin only."""
    stmt = select(PortalUser).options(selectinload(PortalUser.school)).where(PortalUser.role == Role.PublicUser)
    result = await session.execute(stmt)
    users = result.scalars().all()

    user_responses = []
    for user in users:
        user_dict = {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "school_id": user.school_id,
            "school_name": user.school.name if user.school else None,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
        }
        user_responses.append(UserResponse(**user_dict))

    return user_responses


@router.get("/users", response_model=UserListResponse)
async def list_users(
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(PermissionChecker("user_management.view"))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: Role | None = Query(None, description="Filter by role"),
    is_active: bool | None = Query(None, description="Filter by active status"),
    search: str | None = Query(None, description="Search by email or full name"),
) -> UserListResponse:
    """List all users with filters. Requires user_management.view permission.

    By default, excludes PublicUser and SchoolStaff roles from results.
    If role parameter is explicitly set to PublicUser or SchoolStaff, bypasses the exclusion.
    """
    offset = (page - 1) * page_size

    # Build base query conditions
    # If role is explicitly PublicUser or SchoolStaff, allow it; otherwise exclude these roles
    base_conditions = []
    if role is None or (role != Role.PublicUser and role != Role.SchoolStaff):
        base_conditions.extend([
            PortalUser.role != Role.SchoolStaff,
            PortalUser.role != Role.PublicUser,
        ])

    stmt = select(PortalUser).options(selectinload(PortalUser.school))
    if base_conditions:
        stmt = stmt.where(and_(*base_conditions))

    # Apply filters
    if role is not None:
        stmt = stmt.where(PortalUser.role == role)
    if is_active is not None:
        stmt = stmt.where(PortalUser.is_active == is_active)
    if search:
        search_pattern = f"%{search}%"
        stmt = stmt.where(
            (PortalUser.email.ilike(search_pattern)) | (PortalUser.full_name.ilike(search_pattern))
        )

    # Get total count (rebuild query without eager loading for performance)
    # Rebuild base conditions for count query (same logic as main query)
    count_base_conditions = []
    if role is None or (role != Role.PublicUser and role != Role.SchoolStaff):
        count_base_conditions.extend([
            PortalUser.role != Role.SchoolStaff,
            PortalUser.role != Role.PublicUser,
        ])

    count_conditions = count_base_conditions.copy()
    if role is not None:
        count_conditions.append(PortalUser.role == role)
    if is_active is not None:
        count_conditions.append(PortalUser.is_active == is_active)
    if search:
        search_pattern = f"%{search}%"
        count_conditions.append(
            (PortalUser.email.ilike(search_pattern)) | (PortalUser.full_name.ilike(search_pattern))
        )

    count_stmt = select(func.count(PortalUser.id))
    if count_conditions:
        count_stmt = count_stmt.where(and_(*count_conditions))
    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    # Apply pagination and ordering
    stmt = stmt.order_by(PortalUser.created_at.desc()).offset(offset).limit(page_size)
    result = await session.execute(stmt)
    users = result.scalars().all()

    # Create user responses with school name
    user_responses = []
    for user in users:
        user_dict = {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "school_id": user.school_id,
            "school_name": user.school.name if user.school else None,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
        }
        user_responses.append(UserResponse(**user_dict))

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return UserListResponse(
        items=user_responses,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_admin_user(
    user_data: AdminUserCreate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> UserResponse:
    """Create an admin user. SystemAdmin only.

    Cannot create User or PublicUser roles (those are reserved for self-registration).
    """
    # Check if user already exists
    stmt = select(PortalUser).where(PortalUser.email == user_data.email)
    result = await session.execute(stmt)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Validate school exists if school_id is provided
    if user_data.school_id is not None:
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
        role=user_data.role,
        school_id=user_data.school_id,
        is_active=True,
        created_by_user_id=current_user.id,
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    # Reload with school relationship to get school name
    stmt_with_school = select(PortalUser).options(selectinload(PortalUser.school)).where(PortalUser.id == new_user.id)
    result_with_school = await session.execute(stmt_with_school)
    user_with_school = result_with_school.scalar_one()

    user_dict = {
        "id": user_with_school.id,
        "email": user_with_school.email,
        "full_name": user_with_school.full_name,
        "role": user_with_school.role,
        "school_id": user_with_school.school_id,
        "school_name": user_with_school.school.name if user_with_school.school else None,
        "is_active": user_with_school.is_active,
        "created_at": user_with_school.created_at,
        "updated_at": user_with_school.updated_at,
    }
    return UserResponse(**user_dict)


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_admin_user(
    user_id: UUID,
    user_update: UserUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> UserResponse:
    """Update a user (deactivate/activate, update name). SystemAdmin only.

    Prevents SystemAdmin from deactivating themselves.
    """
    stmt = select(PortalUser).where(PortalUser.id == user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent SystemAdmin from deactivating themselves
    if user_id == current_user.id and user_update.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate yourself",
        )

    # Update fields if provided
    if user_update.full_name is not None:
        user.full_name = user_update.full_name
    if user_update.is_active is not None:
        user.is_active = user_update.is_active

    await session.commit()
    await session.refresh(user)

    # Reload with school relationship to get school name
    stmt_with_school = select(PortalUser).options(selectinload(PortalUser.school)).where(PortalUser.id == user.id)
    result_with_school = await session.execute(stmt_with_school)
    user_with_school = result_with_school.scalar_one()

    # Invalidate cache
    invalidate_user_cache(user_id=user_with_school.id, email=user_with_school.email)

    user_dict = {
        "id": user_with_school.id,
        "email": user_with_school.email,
        "full_name": user_with_school.full_name,
        "role": user_with_school.role,
        "school_id": user_with_school.school_id,
        "school_name": user_with_school.school.name if user_with_school.school else None,
        "is_active": user_with_school.is_active,
        "created_at": user_with_school.created_at,
        "updated_at": user_with_school.updated_at,
    }
    return UserResponse(**user_dict)


@router.post("/users/bulk-upload", response_model=BulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_school_admin_users(
    file: UploadFile = File(...),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> BulkUploadResponse:
    """Bulk upload school admin users via CSV or Excel file.

    Expected columns:
    - Full_name: User's full name
    - email_address: User's email address
    - school_code: School code to associate the user with
    - password: User's password (minimum 8 characters)
    """
    # Read file content
    file_content = await file.read()
    filename = file.filename or "unknown"

    # Parse file
    try:
        if filename.endswith('.csv'):
            # Try different encodings
            try:
                text_content = file_content.decode('utf-8')
            except UnicodeDecodeError:
                text_content = file_content.decode('latin-1')

            csv_reader = csv.DictReader(io.StringIO(text_content))
            rows = list(csv_reader)

            if not rows:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="CSV file is empty or has no data rows"
                )

            # Convert to DataFrame for easier processing
            df = pd.DataFrame(rows)
        elif filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(file_content), engine='openpyxl')
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be CSV or Excel format (.csv, .xlsx, .xls)"
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error parsing file: {str(exc)}"
        )

    if df.empty:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty or contains no data"
        )

    # Normalize column names (strip whitespace, handle case insensitivity)
    df.columns = df.columns.str.strip()
    column_mapping = {col.lower(): col for col in df.columns}

    # Required columns
    required_columns = {
        'full_name': ['full_name', 'full name', 'name'],
        'email_address': ['email_address', 'email address', 'email'],
        'school_code': ['school_code', 'school code', 'school'],
        'password': ['password', 'pwd'],
    }

    missing_columns = []
    column_map = {}

    for key, possible_names in required_columns.items():
        found = False
        for name in possible_names:
            if name.lower() in column_mapping:
                column_map[key] = column_mapping[name.lower()]
                found = True
                break
        if not found:
            missing_columns.append(key)

    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required columns: {', '.join(missing_columns)}. Found columns: {', '.join(df.columns.tolist())}"
        )

    successful = 0
    failed = 0
    errors: list[BulkUploadError] = []

    # Track emails within the batch for duplicate detection
    batch_emails: set[str] = set()

    for idx, row in df.iterrows():
        row_number = int(idx) + 2  # +2 because Excel/CSV is 1-indexed and has header
        try:
            # Extract values using mapped column names
            full_name = str(row[column_map['full_name']]).strip() if pd.notna(row[column_map['full_name']]) else ""
            email_address = str(row[column_map['email_address']]).strip().lower() if pd.notna(row[column_map['email_address']]) else ""
            school_code = str(row[column_map['school_code']]).strip() if pd.notna(row[column_map['school_code']]) else ""
            password = str(row[column_map['password']]).strip() if pd.notna(row[column_map['password']]) else ""

            # Validate required fields
            if not full_name:
                raise ValueError("Full_name is required")
            if not email_address:
                raise ValueError("email_address is required")
            if not school_code:
                raise ValueError("school_code is required")
            if not password:
                raise ValueError("password is required")

            # Validate email format
            if '@' not in email_address or '.' not in email_address.split('@')[-1]:
                raise ValueError(f"Invalid email format: {email_address}")

            # Validate password length
            if len(password) < settings.password_min_length:
                raise ValueError(f"Password must be at least {settings.password_min_length} characters long")

            # Validate full name length
            if len(full_name) > 255:
                raise ValueError("Full_name must be 255 characters or less")

            # Check for duplicate email in batch
            if email_address in batch_emails:
                raise ValueError(f"Duplicate email in upload file: {email_address}")

            # Check if user already exists
            user_stmt = select(PortalUser).where(PortalUser.email == email_address)
            user_result = await session.execute(user_stmt)
            existing_user = user_result.scalar_one_or_none()

            if existing_user:
                raise ValueError(f"User with email '{email_address}' already exists")

            # Look up school by code
            school_stmt = select(School).where(School.code == school_code)
            school_result = await session.execute(school_stmt)
            school = school_result.scalar_one_or_none()

            if not school:
                raise ValueError(f"School with code '{school_code}' not found")

            # Create user
            hashed_password = get_password_hash(password)
            new_user = PortalUser(
                email=email_address,
                hashed_password=hashed_password,
                full_name=full_name,
                role=Role.SchoolAdmin,
                school_id=school.id,
                is_active=True,
                created_by_user_id=current_user.id,
            )

            session.add(new_user)
            batch_emails.add(email_address)
            successful += 1

        except Exception as e:
            failed += 1
            errors.append(BulkUploadError(
                row_number=row_number,
                error_message=str(e),
                field=None
            ))

    # Commit all successful users
    try:
        await session.commit()
    except Exception as e:
        # Rollback on commit error
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error committing users: {str(e)}"
        )

    return BulkUploadResponse(
        total_rows=len(df),
        successful=successful,
        failed=failed,
        errors=errors
    )


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_user_password(
    user_id: UUID,
    password_reset: UserPasswordReset,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> None:
    """Reset user password. SystemAdmin only."""
    stmt = select(PortalUser).where(PortalUser.id == user_id)
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


@router.get("/schools", response_model=SchoolListResponse)
async def list_schools(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, description="Search by name or code"),
    is_active: bool | None = Query(None, description="Filter by active status"),
) -> SchoolListResponse:
    """List schools with pagination, search, and filtering."""
    # Build base query
    stmt = select(School)

    # Build count query with same filters
    count_stmt = select(func.count(School.id))

    # Apply filters
    if search:
        search_filter = (School.name.ilike(f"%{search}%")) | (School.code.ilike(f"%{search}%"))
        stmt = stmt.where(search_filter)
        count_stmt = count_stmt.where(search_filter)

    if is_active is not None:
        stmt = stmt.where(School.is_active == is_active)
        count_stmt = count_stmt.where(School.is_active == is_active)

    # Get total count
    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    # Apply pagination and ordering
    offset = (page - 1) * page_size
    stmt = stmt.order_by(School.name).offset(offset).limit(page_size)

    result = await session.execute(stmt)
    schools = result.scalars().all()

    if not schools:
        total_pages = (total + page_size - 1) // page_size
        return SchoolListResponse(
            items=[],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    # Get counts for all schools in one query using subqueries
    school_ids = [school.id for school in schools]

    # Admin counts subquery
    admin_counts_subq = (
        select(
            PortalUser.school_id,
            func.count(PortalUser.id).label("admin_count")
        )
        .where(
            PortalUser.school_id.in_(school_ids),
            PortalUser.role == Role.SchoolAdmin,
            PortalUser.is_active == True,
        )
        .group_by(PortalUser.school_id)
        .subquery()
    )

    # Candidate counts subquery
    candidate_counts_subq = (
        select(
            RegistrationCandidate.school_id,
            func.count(RegistrationCandidate.id).label("candidate_count")
        )
        .where(RegistrationCandidate.school_id.in_(school_ids))
        .group_by(RegistrationCandidate.school_id)
        .subquery()
    )

    # Join to get counts
    counts_stmt = (
        select(
            School.id,
            func.coalesce(admin_counts_subq.c.admin_count, 0).label("admin_count"),
            func.coalesce(candidate_counts_subq.c.candidate_count, 0).label("candidate_count"),
        )
        .select_from(School)
        .outerjoin(admin_counts_subq, School.id == admin_counts_subq.c.school_id)
        .outerjoin(candidate_counts_subq, School.id == candidate_counts_subq.c.school_id)
        .where(School.id.in_(school_ids))
    )

    counts_result = await session.execute(counts_stmt)
    counts_map = {row.id: {"admin_count": row.admin_count, "candidate_count": row.candidate_count} for row in counts_result.all()}

    # Build response items
    school_items = []
    for school in schools:
        counts = counts_map.get(school.id, {"admin_count": 0, "candidate_count": 0})
        school_dict = {
            "id": school.id,
            "code": school.code,
            "name": school.name,
            "is_active": school.is_active,
            "is_private_examination_center": school.is_private_examination_center,
            "admin_count": counts["admin_count"],
            "candidate_count": counts["candidate_count"],
        }
        school_items.append(SchoolResponse.model_validate(school_dict))

    total_pages = (total + page_size - 1) // page_size

    return SchoolListResponse(
        items=school_items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/schools/simple", response_model=list[dict])
async def list_schools_simple(session: DBSessionDep, current_user: SystemAdminDep) -> list[dict]:
    """List all schools (for dropdown when creating coordinators)."""
    stmt = select(School).where(School.is_active == True).order_by(School.name)
    result = await session.execute(stmt)
    schools = result.scalars().all()

    return [{"id": school.id, "code": school.code, "name": school.name} for school in schools]


@router.post("/schools", response_model=SchoolDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_school(
    school_data: SchoolCreate, session: DBSessionDep, current_user: SystemAdminDep
) -> SchoolDetailResponse:
    """Create a new school."""
    # Check if school code already exists
    stmt = select(School).where(School.code == school_data.code)
    result = await session.execute(stmt)
    existing_school = result.scalar_one_or_none()

    if existing_school:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"School with code '{school_data.code}' already exists",
        )

    # Create new school
    new_school = School(
        code=school_data.code,
        name=school_data.name,
        is_active=True,
        is_private_examination_center=school_data.is_private_examination_center,
    )

    session.add(new_school)
    await session.commit()
    await session.refresh(new_school)

    return SchoolDetailResponse.model_validate(new_school)


@router.post("/schools/bulk", response_model=BulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_schools(
    file: UploadFile = File(...),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> BulkUploadResponse:
    """Bulk upload schools via CSV file."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are supported"
        )

    # Read file content
    contents = await file.read()
    try:
        text_contents = contents.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be UTF-8 encoded"
        )

    # Parse CSV
    csv_reader = csv.DictReader(io.StringIO(text_contents))
    rows = list(csv_reader)

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is empty or has no data rows"
        )

    # Validate headers
    required_headers = {'code', 'name'}
    if not required_headers.issubset(set(rows[0].keys())):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV must have headers: {', '.join(required_headers)}"
        )

    # Find programmes column (comma-separated programme codes)
    # Look for columns that might contain programme codes
    programmes_column = None
    possible_names = ['programme_codes', 'programmes', 'programme_list', 'programme_code']
    for name in possible_names:
        if name.lower() in [col.lower() for col in rows[0].keys()]:
            # Find the actual column name (case-insensitive match)
            for col in rows[0].keys():
                if col.lower() == name.lower():
                    programmes_column = col
                    break
            if programmes_column:
                break

    # Fallback: check for any column starting with "programme" (case-insensitive)
    if not programmes_column:
        for col in rows[0].keys():
            col_lower = col.lower().strip()
            if col_lower == "programme" or col_lower.startswith("programme_"):
                programmes_column = col
                break

    successful = 0
    failed = 0
    errors = []

    for row_num, row in enumerate(rows, start=2):  # Start at 2 (1 is header)
        try:
            code = row.get('code', '').strip()
            name = row.get('name', '').strip()

            # Validate required fields
            if not code:
                raise ValueError("Code is required")
            if not name:
                raise ValueError("Name is required")
            if len(code) > 6:
                raise ValueError("Code must be 6 characters or less")
            if len(name) > 255:
                raise ValueError("Name must be 255 characters or less")

            # Check if school code already exists
            stmt = select(School).where(School.code == code)
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing:
                raise ValueError(f"School with code '{code}' already exists")

            # Parse programme codes from comma-separated column
            programme_codes = []
            if programmes_column:
                programmes_str = row.get(programmes_column, '').strip()
                if programmes_str and programmes_str.lower() != 'nan':
                    # Split by comma and trim whitespace from each value
                    programme_codes = [
                        pc.strip()
                        for pc in programmes_str.split(',')
                        if pc.strip()
                    ]

            # Validate and collect programme IDs
            valid_programme_ids: list[int] = []
            invalid_programme_codes: list[str] = []

            if programme_codes:
                for programme_code in programme_codes:
                    programme_stmt = select(Programme).where(Programme.code == programme_code)
                    programme_result = await session.execute(programme_stmt)
                    programme = programme_result.scalar_one_or_none()
                    if programme:
                        valid_programme_ids.append(programme.id)
                    else:
                        invalid_programme_codes.append(programme_code)

            # If there are invalid programme codes, record error but continue with school creation
            if invalid_programme_codes:
                errors.append(BulkUploadError(
                    row_number=row_num,
                    error_message=f"Programme codes not found: {', '.join(invalid_programme_codes)}",
                    field="programme_codes"
                ))
                # Note: We continue to create the school even if some programme codes are invalid

            # Create school
            # Check for is_private_examination_center in CSV (optional field)
            is_private_exam_center = False
            if 'is_private_examination_center' in row:
                exam_center_value = str(row.get('is_private_examination_center', '')).strip().lower()
                is_private_exam_center = exam_center_value in ('true', '1', 'yes', 'y')

            new_school = School(
                code=code,
                name=name,
                is_active=True,
                is_private_examination_center=is_private_exam_center,
            )
            session.add(new_school)
            await session.flush()  # Flush to get ID but don't commit yet

            # Create school-programme associations for valid programmes
            for programme_id in valid_programme_ids:
                # Check if association already exists (shouldn't for new school, but check anyway)
                assoc_stmt = select(school_programmes).where(
                    school_programmes.c.school_id == new_school.id,
                    school_programmes.c.programme_id == programme_id,
                )
                assoc_result = await session.execute(assoc_stmt)
                existing_assoc = assoc_result.first()
                if not existing_assoc:
                    await session.execute(
                        insert(school_programmes).values(
                            school_id=new_school.id,
                            programme_id=programme_id
                        )
                    )

            successful += 1

        except Exception as e:
            failed += 1
            errors.append(BulkUploadError(
                row_number=row_num,
                error_message=str(e),
                field=None
            ))

    # Commit all successful schools
    try:
        await session.commit()
    except Exception as e:
        # Rollback on commit error
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error committing schools: {str(e)}"
        )

    return BulkUploadResponse(
        total_rows=len(rows),
        successful=successful,
        failed=failed,
        errors=errors
    )


@router.get("/schools/{school_id}", response_model=SchoolDetailResponse)
async def get_school(school_id: int, session: DBSessionDep, current_user: SystemAdminDep) -> SchoolDetailResponse:
    """Get school details."""
    stmt = select(School).where(School.id == school_id)
    result = await session.execute(stmt)
    school = result.scalar_one_or_none()

    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    return SchoolDetailResponse.model_validate(school)


@router.get("/schools/{school_id}/statistics", response_model=SchoolStatisticsResponse)
async def get_school_statistics(
    school_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> SchoolStatisticsResponse:
    """Get school statistics."""
    # Verify school exists
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()

    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Count total candidates
    total_candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
        RegistrationCandidate.school_id == school_id
    )
    total_result = await session.execute(total_candidates_stmt)
    total_candidates = total_result.scalar_one() or 0

    # Count candidates by exam
    candidates_by_exam_stmt = (
        select(RegistrationCandidate.registration_exam_id, func.count(RegistrationCandidate.id))
        .where(RegistrationCandidate.school_id == school_id)
        .group_by(RegistrationCandidate.registration_exam_id)
    )
    exam_result = await session.execute(candidates_by_exam_stmt)
    candidates_by_exam = {str(row[0]): row[1] for row in exam_result.all()}

    # Count candidates by status
    candidates_by_status_stmt = (
        select(RegistrationCandidate.registration_status, func.count(RegistrationCandidate.id))
        .where(RegistrationCandidate.school_id == school_id)
        .group_by(RegistrationCandidate.registration_status)
    )
    status_result = await session.execute(candidates_by_status_stmt)
    candidates_by_status = {row[0].value: row[1] for row in status_result.all()}

    # Count active admin users
    active_admins_stmt = select(func.count(PortalUser.id)).where(
        PortalUser.school_id == school_id,
        PortalUser.role == Role.SchoolAdmin,
        PortalUser.is_active == True,
    )
    admins_result = await session.execute(active_admins_stmt)
    active_admin_count = admins_result.scalar_one() or 0

    # Count distinct exams
    total_exams_stmt = select(func.count(func.distinct(RegistrationCandidate.registration_exam_id))).where(
        RegistrationCandidate.school_id == school_id
    )
    exams_result = await session.execute(total_exams_stmt)
    total_exams = exams_result.scalar_one() or 0

    return SchoolStatisticsResponse(
        school_id=school.id,
        school_code=school.code,
        school_name=school.name,
        total_candidates=total_candidates,
        candidates_by_exam=candidates_by_exam,
        candidates_by_status=candidates_by_status,
        active_admin_count=active_admin_count,
        total_exams=total_exams,
    )


@router.get("/schools/{school_id}/admins", response_model=list[UserResponse])
async def get_school_admins(
    school_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> list[UserResponse]:
    """List all coordinators for a school."""
    # Verify school exists
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()

    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    stmt = select(PortalUser).where(
        PortalUser.school_id == school_id,
        PortalUser.role == Role.SchoolAdmin,
    )
    result = await session.execute(stmt)
    users = result.scalars().all()

    return [UserResponse.model_validate(user) for user in users]


@router.get("/schools/{school_id}/candidates", response_model=CandidateListResponse)
async def get_school_candidates(
    school_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int | None = Query(None, description="Filter by exam ID"),
    status: str | None = Query(None, description="Filter by registration status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
) -> CandidateListResponse:
    """List candidates for a school with pagination."""
    # Verify school exists
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()

    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Build query
    stmt = select(RegistrationCandidate).where(RegistrationCandidate.school_id == school_id)
    count_stmt = select(func.count(RegistrationCandidate.id)).where(
        RegistrationCandidate.school_id == school_id
    )

    if exam_id:
        stmt = stmt.where(RegistrationCandidate.registration_exam_id == exam_id)
        count_stmt = count_stmt.where(RegistrationCandidate.registration_exam_id == exam_id)

    if status:
        try:
            status_enum = RegistrationStatus(status.upper())
            stmt = stmt.where(RegistrationCandidate.registration_status == status_enum)
            count_stmt = count_stmt.where(RegistrationCandidate.registration_status == status_enum)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status: {status}")

    # Get total count
    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    # Apply pagination
    offset = (page - 1) * page_size
    stmt = stmt.order_by(RegistrationCandidate.created_at.desc()).offset(offset).limit(page_size)
    stmt = stmt.options(selectinload(RegistrationCandidate.exam))

    result = await session.execute(stmt)
    candidates = result.scalars().all()

    from app.schemas.registration import RegistrationCandidateResponse

    total_pages = (total + page_size - 1) // page_size

    return CandidateListResponse(
        items=[RegistrationCandidateResponse.model_validate(c) for c in candidates],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/schools/{school_id}/exams", response_model=list[dict])
async def get_school_exams(
    school_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> list[dict]:
    """List exams with registration counts for a school."""
    # Verify school exists
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()

    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Get distinct exams with counts
    exam_counts_stmt = (
        select(
            RegistrationExam.id,
            RegistrationExam.exam_type,
            RegistrationExam.exam_series,
            RegistrationExam.year,
            func.count(RegistrationCandidate.id).label("candidate_count"),
        )
        .join(
            RegistrationCandidate,
            RegistrationCandidate.registration_exam_id == RegistrationExam.id,
        )
        .where(RegistrationCandidate.school_id == school_id)
        .group_by(
            RegistrationExam.id,
            RegistrationExam.exam_type,
            RegistrationExam.exam_series,
            RegistrationExam.year,
        )
        .order_by(RegistrationExam.year.desc(), RegistrationExam.exam_type)
    )

    result = await session.execute(exam_counts_stmt)
    exams = result.all()

    return [
        {
            "exam_id": row.id,
            "exam_type": row.exam_type,
            "exam_series": row.exam_series,
            "year": row.year,
            "candidate_count": row.candidate_count,
        }
        for row in exams
    ]


@router.put("/schools/{school_id}", response_model=SchoolDetailResponse)
async def update_school(
    school_id: int,
    school_update: SchoolUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> SchoolDetailResponse:
    """Update school details."""
    stmt = select(School).where(School.id == school_id)
    result = await session.execute(stmt)
    school = result.scalar_one_or_none()

    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Update fields if provided
    if school_update.name is not None:
        school.name = school_update.name
    if school_update.is_active is not None:
        school.is_active = school_update.is_active
    if school_update.is_private_examination_center is not None:
        school.is_private_examination_center = school_update.is_private_examination_center

    await session.commit()
    await session.refresh(school)

    return SchoolDetailResponse.model_validate(school)


@router.post("/exams", response_model=RegistrationExamResponse, status_code=status.HTTP_201_CREATED)
async def create_exam(
    exam_data: RegistrationExamCreate, session: DBSessionDep, current_user: SystemAdminDep
) -> RegistrationExamResponse:
    """Create a new exam with registration period."""
    try:
        # Ensure dates are timezone-naive for database storage
        start_date = exam_data.registration_period.registration_start_date
        end_date = exam_data.registration_period.registration_end_date

        # Convert to UTC and remove timezone info if timezone-aware
        if start_date.tzinfo is not None:
            start_date = start_date.astimezone(timezone.utc).replace(tzinfo=None)
        if end_date.tzinfo is not None:
            end_date = end_date.astimezone(timezone.utc).replace(tzinfo=None)

        # Validate registration dates
        if end_date <= start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration end date must be after start date",
            )

        # Check for duplicate exams (same exam_type, series, year)
        stmt = select(RegistrationExam).where(
            RegistrationExam.exam_type == exam_data.exam_type,
            RegistrationExam.exam_series == exam_data.exam_series,
            RegistrationExam.year == exam_data.year,
        )
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Exam with type '{exam_data.exam_type}', series '{exam_data.exam_series}', and year {exam_data.year} already exists",
            )

        # Create registration period
        registration_period = ExamRegistrationPeriod(
            registration_start_date=start_date,
            registration_end_date=end_date,
            is_active=True,
            allows_bulk_registration=exam_data.registration_period.allows_bulk_registration,
            allows_private_registration=exam_data.registration_period.allows_private_registration,
        )
        session.add(registration_period)
        await session.flush()

        # Create exam
        new_exam = RegistrationExam(
            exam_id_main_system=exam_data.exam_id_main_system,
            exam_type=exam_data.exam_type,
            exam_series=exam_data.exam_series,
            year=exam_data.year,
            description=exam_data.description,
            registration_period_id=registration_period.id,
            pricing_model_preference=exam_data.pricing_model_preference or "auto",
        )
        session.add(new_exam)
        await session.commit()
        await session.refresh(new_exam, ["registration_period"])

        return RegistrationExamResponse.model_validate(new_exam)
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create exam: {str(e)}",
        )


@router.get("/exams", response_model=list[RegistrationExamResponse])
async def list_exams(session: DBSessionDep, current_user: SystemAdminDep) -> list[RegistrationExamResponse]:
    """List all exams (for admin dashboard)."""
    stmt = (
        select(RegistrationExam)
        .options(selectinload(RegistrationExam.registration_period))
        .order_by(RegistrationExam.year.desc(), RegistrationExam.exam_type, RegistrationExam.exam_series)
    )
    result = await session.execute(stmt)
    exams = result.scalars().all()

    return [RegistrationExamResponse.model_validate(exam) for exam in exams]


@router.get("/exams/{exam_id}", response_model=RegistrationExamResponse)
async def get_exam(exam_id: int, session: DBSessionDep, current_user: SystemAdminDep) -> RegistrationExamResponse:
    """Get exam details."""
    stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Check if any candidates have index numbers generated
    index_numbers_count_stmt = select(func.count(RegistrationCandidate.id)).where(
        RegistrationCandidate.registration_exam_id == exam_id,
        RegistrationCandidate.index_number.isnot(None),
        RegistrationCandidate.index_number != "",
    )
    index_numbers_result = await session.execute(index_numbers_count_stmt)
    index_numbers_count = index_numbers_result.scalar() or 0

    exam_response = RegistrationExamResponse.model_validate(exam)
    exam_response.has_index_numbers = index_numbers_count > 0

    return exam_response


@router.put("/exams/{exam_id}", response_model=RegistrationExamResponse)
async def update_exam(
    exam_id: int,
    exam_update: RegistrationExamUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> RegistrationExamResponse:
    """Update exam details."""
    stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Update fields if provided
    if exam_update.exam_id_main_system is not None:
        exam.exam_id_main_system = exam_update.exam_id_main_system
    if exam_update.exam_type is not None:
        exam.exam_type = exam_update.exam_type
    if exam_update.exam_series is not None:
        exam.exam_series = exam_update.exam_series
    if exam_update.year is not None:
        exam.year = exam_update.year
    if exam_update.description is not None:
        exam.description = exam_update.description
    if exam_update.pricing_model_preference is not None:
        exam.pricing_model_preference = exam_update.pricing_model_preference

    await session.commit()
    await session.refresh(exam, ["registration_period"])

    return RegistrationExamResponse.model_validate(exam)


@router.delete("/exams/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exam(exam_id: int, session: DBSessionDep, current_user: SystemAdminDep) -> None:
    """Delete an exam (with validation to prevent deletion if candidates exist)."""
    stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Check if there are any candidates registered for this exam
    candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
        RegistrationCandidate.registration_exam_id == exam_id
    )
    candidates_result = await session.execute(candidates_stmt)
    candidate_count = candidates_result.scalar_one()

    if candidate_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete exam with {candidate_count} registered candidate(s). Please remove candidates first.",
        )

    # Delete exam (registration period will be cascade deleted)
    await session.delete(exam)
    await session.commit()



# Pricing Management Endpoints

@router.get("/exams/{exam_id}/pricing", response_model=ExamPricingResponse)
async def get_exam_pricing(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ExamPricingResponse:
    """Get all pricing for an exam."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Get application fee
    app_fee_stmt = select(RegistrationApplicationFee).where(
        RegistrationApplicationFee.exam_id == exam_id
    )
    app_fee_result = await session.execute(app_fee_stmt)
    application_fee = app_fee_result.scalar_one_or_none()

    # Get subject pricing with subject details
    subject_pricing_stmt = (
        select(SubjectPricing)
        .where(SubjectPricing.exam_id == exam_id)
        .options(selectinload(SubjectPricing.subject))
        .order_by(SubjectPricing.subject_id)
    )
    subject_pricing_result = await session.execute(subject_pricing_stmt)
    subject_pricing_list = subject_pricing_result.scalars().all()

    # Get tiered pricing
    tiered_pricing_stmt = select(RegistrationTieredPricing).where(
        RegistrationTieredPricing.exam_id == exam_id
    ).order_by(RegistrationTieredPricing.min_subjects)
    tiered_pricing_result = await session.execute(tiered_pricing_stmt)
    tiered_pricing_list = tiered_pricing_result.scalars().all()

    return ExamPricingResponse(
        exam_id=exam_id,
        application_fee=ApplicationFeeResponse.model_validate(application_fee) if application_fee else None,
        subject_pricing=[SubjectPricingResponse.model_validate(sp) for sp in subject_pricing_list],
        tiered_pricing=[TieredPricingResponse.model_validate(tp) for tp in tiered_pricing_list],
    )


@router.get("/exams/{exam_id}/pricing/application-fee", response_model=ApplicationFeeResponse)
async def get_application_fee(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ApplicationFeeResponse:
    """Get application fee for an exam."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    stmt = select(RegistrationApplicationFee).where(
        RegistrationApplicationFee.exam_id == exam_id
    )
    result = await session.execute(stmt)
    app_fee = result.scalar_one_or_none()

    if not app_fee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application fee not found")

    return ApplicationFeeResponse.model_validate(app_fee)


@router.post("/exams/{exam_id}/pricing/application-fee", response_model=ApplicationFeeResponse)
async def create_or_update_application_fee(
    exam_id: int,
    fee_data: ApplicationFeeCreate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ApplicationFeeResponse:
    """Create or update application fee for an exam."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Check if application fee exists
    existing_stmt = select(RegistrationApplicationFee).where(
        RegistrationApplicationFee.exam_id == exam_id
    )
    existing_result = await session.execute(existing_stmt)
    existing_fee = existing_result.scalar_one_or_none()

    if existing_fee:
        # Update existing
        existing_fee.fee = fee_data.fee
        existing_fee.currency = fee_data.currency
        existing_fee.is_active = fee_data.is_active
        await session.commit()
        await session.refresh(existing_fee)
        return ApplicationFeeResponse.model_validate(existing_fee)
    else:
        # Create new
        new_fee = RegistrationApplicationFee(
            exam_id=exam_id,
            fee=fee_data.fee,
            currency=fee_data.currency,
            is_active=fee_data.is_active,
        )
        session.add(new_fee)
        await session.commit()
        await session.refresh(new_fee)
        return ApplicationFeeResponse.model_validate(new_fee)


@router.delete("/exams/{exam_id}/pricing/application-fee", status_code=status.HTTP_204_NO_CONTENT)
async def delete_application_fee(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> None:
    """Delete application fee for an exam."""
    stmt = select(RegistrationApplicationFee).where(
        RegistrationApplicationFee.exam_id == exam_id
    )
    result = await session.execute(stmt)
    app_fee = result.scalar_one_or_none()

    if not app_fee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application fee not found")

    await session.delete(app_fee)
    await session.commit()


@router.get("/exams/{exam_id}/pricing/subjects", response_model=list[SubjectPricingResponse])
async def get_subject_pricing(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> list[SubjectPricingResponse]:
    """Get subject pricing for an exam."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    stmt = (
        select(SubjectPricing)
        .where(SubjectPricing.exam_id == exam_id)
        .options(selectinload(SubjectPricing.subject))
        .order_by(SubjectPricing.subject_id)
    )
    result = await session.execute(stmt)
    pricing_list = result.scalars().all()

    return [SubjectPricingResponse.model_validate(p) for p in pricing_list]


@router.post("/exams/{exam_id}/pricing/subjects", response_model=list[SubjectPricingResponse])
async def create_or_update_subject_pricing(
    exam_id: int,
    pricing_data: SubjectPricingBulkUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> list[SubjectPricingResponse]:
    """Create or update subject pricing for an exam (bulk operation)."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Validate all subjects exist
    subject_ids = [p.subject_id for p in pricing_data.pricing]
    subjects_stmt = select(Subject).where(Subject.id.in_(subject_ids))
    subjects_result = await session.execute(subjects_stmt)
    existing_subjects = {s.id for s in subjects_result.scalars().all()}

    missing_subjects = set(subject_ids) - existing_subjects
    if missing_subjects:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Subjects not found: {', '.join(map(str, missing_subjects))}",
        )

    # Process each pricing entry
    updated_pricing = []
    for pricing_item in pricing_data.pricing:
        # Check if pricing exists
        existing_stmt = select(SubjectPricing).where(
            SubjectPricing.exam_id == exam_id,
            SubjectPricing.subject_id == pricing_item.subject_id,
        )
        existing_result = await session.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()

        if existing:
            # Update existing
            existing.price = pricing_item.price
            existing.currency = pricing_item.currency
            existing.is_active = pricing_item.is_active
            await session.flush()
            await session.refresh(existing, ["subject"])
            updated_pricing.append(existing)
        else:
            # Create new
            new_pricing = SubjectPricing(
                exam_id=exam_id,
                subject_id=pricing_item.subject_id,
                price=pricing_item.price,
                currency=pricing_item.currency,
                is_active=pricing_item.is_active,
            )
            session.add(new_pricing)
            await session.flush()
            await session.refresh(new_pricing, ["subject"])
            updated_pricing.append(new_pricing)

    await session.commit()
    return [SubjectPricingResponse.model_validate(p) for p in updated_pricing]


@router.delete("/exams/{exam_id}/pricing/subjects/{subject_pricing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject_pricing(
    exam_id: int,
    subject_pricing_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> None:
    """Delete subject pricing."""
    stmt = select(SubjectPricing).where(
        SubjectPricing.id == subject_pricing_id,
        SubjectPricing.exam_id == exam_id,
    )
    result = await session.execute(stmt)
    subject_pricing = result.scalar_one_or_none()

    if not subject_pricing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject pricing not found")

    await session.delete(subject_pricing)
    await session.commit()


@router.get("/exams/{exam_id}/pricing/tiered", response_model=list[TieredPricingResponse])
async def get_tiered_pricing(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> list[TieredPricingResponse]:
    """Get tiered pricing for an exam."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    stmt = select(RegistrationTieredPricing).where(
        RegistrationTieredPricing.exam_id == exam_id
    ).order_by(RegistrationTieredPricing.min_subjects)
    result = await session.execute(stmt)
    pricing_list = result.scalars().all()

    return [TieredPricingResponse.model_validate(p) for p in pricing_list]


@router.post("/exams/{exam_id}/pricing/tiered", response_model=list[TieredPricingResponse])
async def create_or_update_tiered_pricing(
    exam_id: int,
    pricing_data: TieredPricingBulkUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> list[TieredPricingResponse]:
    """Create or update tiered pricing for an exam (bulk operation)."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Validate no overlapping ranges
    tiers = pricing_data.pricing
    for i, tier1 in enumerate(tiers):
        for tier2 in tiers[i + 1:]:
            # Check for overlap
            min1, max1 = tier1.min_subjects, tier1.max_subjects or float('inf')
            min2, max2 = tier2.min_subjects, tier2.max_subjects or float('inf')
            if not (max1 < min2 or max2 < min1):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Tiered pricing ranges overlap: ({tier1.min_subjects}-{tier1.max_subjects or '∞'}) and ({tier2.min_subjects}-{tier2.max_subjects or '∞'})",
                )

    # Delete existing tiered pricing for this exam
    delete_stmt = delete(RegistrationTieredPricing).where(
        RegistrationTieredPricing.exam_id == exam_id
    )
    await session.execute(delete_stmt)

    # Create new tiered pricing
    created_pricing = []
    for tier_item in tiers:
        new_tier = RegistrationTieredPricing(
            exam_id=exam_id,
            min_subjects=tier_item.min_subjects,
            max_subjects=tier_item.max_subjects,
            price=tier_item.price,
            currency=tier_item.currency,
            is_active=tier_item.is_active,
        )
        session.add(new_tier)
        await session.flush()
        created_pricing.append(new_tier)

    await session.commit()
    return [TieredPricingResponse.model_validate(p) for p in created_pricing]


@router.delete("/exams/{exam_id}/pricing/tiered/{tiered_pricing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tiered_pricing(
    exam_id: int,
    tiered_pricing_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> None:
    """Delete tiered pricing."""
    stmt = select(RegistrationTieredPricing).where(
        RegistrationTieredPricing.id == tiered_pricing_id,
        RegistrationTieredPricing.exam_id == exam_id,
    )
    result = await session.execute(stmt)
    tiered_pricing = result.scalar_one_or_none()

    if not tiered_pricing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tiered pricing not found")

    await session.delete(tiered_pricing)
    await session.commit()


@router.post("/exams/{exam_id}/pricing/import", status_code=status.HTTP_200_OK)
async def import_exam_pricing(
    exam_id: int,
    import_data: ImportPricingRequest,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> dict:
    """Import pricing from another exam."""
    # Verify target exam exists
    target_exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    target_exam_result = await session.execute(target_exam_stmt)
    target_exam = target_exam_result.scalar_one_or_none()

    if not target_exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target exam not found")

    # Verify source exam exists
    source_exam_stmt = select(RegistrationExam).where(RegistrationExam.id == import_data.source_exam_id)
    source_exam_result = await session.execute(source_exam_stmt)
    source_exam = source_exam_result.scalar_one_or_none()

    if not source_exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source exam not found")

    if exam_id == import_data.source_exam_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot import pricing from the same exam",
        )

    imported_count = 0

    try:
        # Import application fee
        if import_data.import_application_fee:
            source_fee_stmt = select(RegistrationApplicationFee).where(
                RegistrationApplicationFee.exam_id == import_data.source_exam_id
            )
            source_fee_result = await session.execute(source_fee_stmt)
            source_fee = source_fee_result.scalar_one_or_none()

            if source_fee:
                # Delete existing application fee for target exam
                delete_fee_stmt = delete(RegistrationApplicationFee).where(
                    RegistrationApplicationFee.exam_id == exam_id
                )
                await session.execute(delete_fee_stmt)

                # Create new application fee
                new_fee = RegistrationApplicationFee(
                    exam_id=exam_id,
                    fee=source_fee.fee,
                    currency=source_fee.currency,
                    is_active=source_fee.is_active,
                )
                session.add(new_fee)
                imported_count += 1

        # Import subject pricing
        if import_data.import_subject_pricing:
            source_subject_pricing_stmt = select(SubjectPricing).where(
                SubjectPricing.exam_id == import_data.source_exam_id
            )
            source_subject_pricing_result = await session.execute(source_subject_pricing_stmt)
            source_subject_pricing_list = source_subject_pricing_result.scalars().all()

            if source_subject_pricing_list:
                # Delete existing subject pricing for target exam
                delete_subject_stmt = delete(SubjectPricing).where(
                    SubjectPricing.exam_id == exam_id
                )
                await session.execute(delete_subject_stmt)

                # Create new subject pricing
                for source_sp in source_subject_pricing_list:
                    new_sp = SubjectPricing(
                        exam_id=exam_id,
                        subject_id=source_sp.subject_id,
                        price=source_sp.price,
                        currency=source_sp.currency,
                        is_active=source_sp.is_active,
                    )
                    session.add(new_sp)
                imported_count += len(source_subject_pricing_list)

        # Import tiered pricing
        if import_data.import_tiered_pricing:
            source_tiered_stmt = select(RegistrationTieredPricing).where(
                RegistrationTieredPricing.exam_id == import_data.source_exam_id
            )
            source_tiered_result = await session.execute(source_tiered_stmt)
            source_tiered_list = source_tiered_result.scalars().all()

            if source_tiered_list:
                # Delete existing tiered pricing for target exam
                delete_tiered_stmt = delete(RegistrationTieredPricing).where(
                    RegistrationTieredPricing.exam_id == exam_id
                )
                await session.execute(delete_tiered_stmt)

                # Create new tiered pricing
                for source_tp in source_tiered_list:
                    new_tp = RegistrationTieredPricing(
                        exam_id=exam_id,
                        min_subjects=source_tp.min_subjects,
                        max_subjects=source_tp.max_subjects,
                        price=source_tp.price,
                        currency=source_tp.currency,
                        is_active=source_tp.is_active,
                    )
                    session.add(new_tp)
                imported_count += len(source_tiered_list)

        await session.commit()
        return {"message": "Pricing imported successfully", "items_imported": imported_count}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error importing pricing: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to import pricing: {str(e)}",
        )


@router.get("/exams/{exam_id}/candidates/export")
async def export_candidates(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> StreamingResponse:
    """Export registered candidates data as Excel file."""
    # Verify exam exists
    stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Query candidates with all necessary relationships
    candidates_stmt = (
        select(RegistrationCandidate)
        .where(RegistrationCandidate.registration_exam_id == exam_id)
        .options(
            selectinload(RegistrationCandidate.school),
            selectinload(RegistrationCandidate.programme),
            selectinload(RegistrationCandidate.subject_selections).selectinload(RegistrationSubjectSelection.subject),
        )
    )
    candidates_result = await session.execute(candidates_stmt)
    candidates = candidates_result.scalars().all()

    # Build data for export
    rows = []
    for candidate in candidates:
        # Get school code
        school_code = candidate.school.code if candidate.school else ""

        # Get programme code
        programme_code = candidate.programme_code or (candidate.programme.code if candidate.programme else "")

        # Get subject original codes (comma-separated)
        subject_original_codes = []
        if candidate.subject_selections:
            for selection in candidate.subject_selections:
                if selection.subject and selection.subject.original_code:
                    subject_original_codes.append(selection.subject.original_code)
        subject_original_codes_str = ",".join(sorted(subject_original_codes))

        # Format date of birth
        dob = candidate.date_of_birth.isoformat() if candidate.date_of_birth else ""

        rows.append({
            "registration_number": candidate.registration_number,
            "index_number": candidate.index_number or "",
            "school_code": school_code,
            "programme_code": programme_code,
            "name": candidate.name,
            "dob": dob,
            "subject_original_codes": subject_original_codes_str,
        })

    # Create DataFrame
    df = pd.DataFrame(rows)

    # If no candidates, return empty Excel file
    if df.empty:
        output = io.BytesIO()
        df_empty = pd.DataFrame(columns=["registration_number", "index_number", "school_code", "programme_code", "name", "dob", "subject_original_codes"])
        df_empty.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        filename = f"exam_{exam_id}_candidates_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return StreamingResponse(
            io.BytesIO(output.read()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    # Sort by school_code, then by index_number
    # Convert index_number to numeric for proper numeric sorting (non-numeric values become NaN and sort to end)
    df['_sort_index_numeric'] = pd.to_numeric(df['index_number'], errors='coerce')
    # Sort by school_code first, then by numeric index_number, then by string index_number for non-numeric values
    df = df.sort_values(
        by=['school_code', '_sort_index_numeric', 'index_number'],
        ascending=[True, True, True],
        na_position='last'
    )
    # Drop temporary sorting column
    df = df.drop(columns=['_sort_index_numeric'])

    # Generate Excel file
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Candidates")
    output.seek(0)

    filename = f"exam_{exam_id}_candidates_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.put("/exams/{exam_id}/registration-period", response_model=ExamRegistrationPeriodResponse)
async def update_registration_period(
    exam_id: int,
    period_update: ExamRegistrationPeriodUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ExamRegistrationPeriodResponse:
    """Extend or update registration period for an exam."""
    # Get exam with registration period
    stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    registration_period = exam.registration_period
    if not registration_period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Registration period not found for this exam"
        )

    # Update fields
    update_data = period_update.model_dump(exclude_unset=True)

    # Handle date updates with timezone conversion
    if "registration_start_date" in update_data and update_data["registration_start_date"]:
        start_date = update_data["registration_start_date"]
        if start_date.tzinfo is not None:
            start_date = start_date.astimezone(timezone.utc).replace(tzinfo=None)
        registration_period.registration_start_date = start_date

    if "registration_end_date" in update_data and update_data["registration_end_date"]:
        end_date = update_data["registration_end_date"]
        if end_date.tzinfo is not None:
            end_date = end_date.astimezone(timezone.utc).replace(tzinfo=None)
        registration_period.registration_end_date = end_date

        # If end_date is extended to the future and period was inactive, set is_active=True
        new_end_date = registration_period.registration_end_date
        now = datetime.utcnow()
        # If the new end date is in the future and the period was inactive, activate it
        if new_end_date > now and not registration_period.is_active and "is_active" not in update_data:
            registration_period.is_active = True

    if "is_active" in update_data:
        registration_period.is_active = update_data["is_active"]
    if "allows_bulk_registration" in update_data:
        registration_period.allows_bulk_registration = update_data["allows_bulk_registration"]
    if "allows_private_registration" in update_data:
        registration_period.allows_private_registration = update_data["allows_private_registration"]

    # Validate dates
    if registration_period.registration_end_date <= registration_period.registration_start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration end date must be after start date",
        )

    await session.commit()
    await session.refresh(registration_period)

    return ExamRegistrationPeriodResponse.model_validate(registration_period)


@router.post("/exams/{exam_id}/registration-period/close", response_model=ExamRegistrationPeriodResponse)
async def close_registration_period(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ExamRegistrationPeriodResponse:
    """Close registration period for an exam."""
    # Get exam with registration period
    stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    registration_period = exam.registration_period
    if not registration_period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Registration period not found for this exam"
        )

    # Close registration: set is_active=False and end_date to current time
    registration_period.is_active = False
    registration_period.registration_end_date = datetime.utcnow()

    await session.commit()
    await session.refresh(registration_period)

    return ExamRegistrationPeriodResponse.model_validate(registration_period)


async def _process_index_numbers_background(job_id: int) -> None:
    """Background task to process index number generation school by school."""
    from app.dependencies.database import get_sessionmanager
    import logging

    logger = logging.getLogger(__name__)

    sessionmanager = get_sessionmanager()
    async with sessionmanager.session() as session:
        try:
            # Get job record
            job_stmt = select(IndexNumberGenerationJob).where(IndexNumberGenerationJob.id == job_id)
            job_result = await session.execute(job_stmt)
            job = job_result.scalar_one_or_none()

            if not job:
                logger.error(f"Job {job_id} not found")
                return

            exam_id = job.exam_id
            replace_existing = job.replace_existing

            # Update job status to processing
            job.status = IndexNumberGenerationJobStatus.PROCESSING
            job.updated_at = datetime.utcnow()
            await session.commit()

            # Verify exam exists
            exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
            exam_result = await session.execute(exam_stmt)
            exam = exam_result.scalar_one_or_none()

            if not exam:
                job.status = IndexNumberGenerationJobStatus.FAILED
                job.error_message = "Exam not found"
                job.completed_at = datetime.utcnow()
                await session.commit()
                return

            # Build query based on replace_existing flag
            candidates_stmt = (
                select(RegistrationCandidate, School)
                .join(School, RegistrationCandidate.school_id == School.id)
                .where(RegistrationCandidate.registration_exam_id == exam_id)
                .options(selectinload(RegistrationCandidate.school))
            )

            if not replace_existing:
                # Only get candidates without index numbers
                candidates_stmt = candidates_stmt.where(RegistrationCandidate.index_number.is_(None))

            candidates_result = await session.execute(candidates_stmt)
            candidate_rows = candidates_result.all()

            if not candidate_rows:
                job.status = IndexNumberGenerationJobStatus.COMPLETED
                job.progress_current = 0
                job.progress_total = 0
                job.completed_at = datetime.utcnow()
                await session.commit()
                return

            # Group candidates by school
            candidates_by_school: dict[int, list[RegistrationCandidate]] = {}
            school_map: dict[int, School] = {}

            for candidate, school in candidate_rows:
                if candidate.school_id:
                    if candidate.school_id not in candidates_by_school:
                        candidates_by_school[candidate.school_id] = []
                        school_map[candidate.school_id] = school
                    candidates_by_school[candidate.school_id].append(candidate)

            # Initialize school progress tracking
            total_candidates = len(candidate_rows)
            job.progress_total = total_candidates
            school_progress_list = []

            for school_id in candidates_by_school.keys():
                school = school_map[school_id]
                school_progress_list.append({
                    "school_id": school_id,
                    "school_code": school.code,
                    "school_name": school.name,
                    "processed": 0,
                    "total": len(candidates_by_school[school_id]),
                    "status": "pending"
                })

            job.school_progress = school_progress_list
            await session.commit()

            # Process each school sequentially
            for idx, (school_id, candidates) in enumerate(candidates_by_school.items()):
                school = school_map[school_id]

                # Update current school being processed
                job.current_school_id = school_id
                job.current_school_name = school.name

                # Update school progress status to processing
                # Need to create new list with new dicts to trigger SQLAlchemy change detection for JSON column
                if job.school_progress:
                    school_progress_updated = [dict(sp) for sp in job.school_progress]
                    for sp in school_progress_updated:
                        if sp["school_id"] == school_id:
                            sp["status"] = "processing"
                            break
                    job.school_progress = school_progress_updated

                await session.commit()

                # Get last 5 digits of school code
                school_code = school.code
                if len(school_code) >= 5:
                    last_5_digits = school_code[-5:]
                else:
                    # Pad with zeros if school code is shorter than 5 characters
                    last_5_digits = school_code.zfill(5)

                # Sort candidates alphabetically by name (case-insensitive)
                candidates_sorted = sorted(candidates, key=lambda c: c.name.lower())

                # Generate index numbers starting from {last_5_digits}01000
                base_number = 1000  # Starting from 01000
                for candidate in candidates_sorted:
                    index_number = f"{last_5_digits}{base_number:05d}"
                    candidate.index_number = index_number
                    base_number += 1

                # Update progress
                job.progress_current += len(candidates_sorted)

                # Update school progress
                # Need to create new list with new dicts to trigger SQLAlchemy change detection for JSON column
                if job.school_progress:
                    school_progress_updated = [dict(sp) for sp in job.school_progress]
                    for sp in school_progress_updated:
                        if sp["school_id"] == school_id:
                            sp["processed"] = len(candidates_sorted)
                            sp["status"] = "completed"
                            break
                    job.school_progress = school_progress_updated

                # Commit after each school to ensure progress is saved
                await session.commit()

            # Mark job as completed
            job.status = IndexNumberGenerationJobStatus.COMPLETED
            job.current_school_id = None
            job.current_school_name = None
            job.completed_at = datetime.utcnow()
            await session.commit()

        except Exception as e:
            logger.error(f"Error in background index number generation for job {job_id}: {e}", exc_info=True)
            await session.rollback()
            # Try to update job status to failed
            try:
                job_stmt = select(IndexNumberGenerationJob).where(IndexNumberGenerationJob.id == job_id)
                job_result = await session.execute(job_stmt)
                job = job_result.scalar_one_or_none()
                if job:
                    job.status = IndexNumberGenerationJobStatus.FAILED
                    job.error_message = str(e)
                    job.completed_at = datetime.utcnow()
                    await session.commit()
            except Exception as update_error:
                logger.error(f"Error updating job status: {update_error}", exc_info=True)


@router.post("/exams/{exam_id}/generate-index-numbers")
async def generate_index_numbers(
    exam_id: int,
    background_tasks: BackgroundTasks,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    replace_existing: bool = Query(False, description="If True, regenerate index numbers for all candidates, replacing existing ones"),
) -> dict:
    """Generate index numbers for candidates in an exam (queued, processes school by school)."""
    # Verify exam exists
    stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Check if a job already exists for this exam (upsert)
    existing_job_stmt = select(IndexNumberGenerationJob).where(
        IndexNumberGenerationJob.exam_id == exam_id
    ).order_by(IndexNumberGenerationJob.created_at.desc())
    existing_job_result = await session.execute(existing_job_stmt)
    existing_job = existing_job_result.scalar_one_or_none()

    if existing_job:
        # Update existing job
        existing_job.status = IndexNumberGenerationJobStatus.PENDING
        existing_job.replace_existing = replace_existing
        existing_job.progress_current = 0
        existing_job.progress_total = 0
        existing_job.current_school_id = None
        existing_job.current_school_name = None
        existing_job.school_progress = None
        existing_job.error_message = None
        existing_job.completed_at = None
        existing_job.created_by_user_id = current_user.id
        existing_job.created_at = datetime.utcnow()
        existing_job.updated_at = datetime.utcnow()
        job = existing_job
    else:
        # Create new job record
        job = IndexNumberGenerationJob(
            exam_id=exam_id,
            status=IndexNumberGenerationJobStatus.PENDING,
            replace_existing=replace_existing,
            created_by_user_id=current_user.id,
        )
        session.add(job)

    await session.commit()
    await session.refresh(job)

    # Add background task to process index numbers
    background_tasks.add_task(_process_index_numbers_background, job.id)

    mode_text = "all candidates (replacing existing ones)" if replace_existing else "candidates without index numbers"
    return {
        "job_id": job.id,
        "exam_id": exam_id,
        "message": f"Index number generation has been queued and will be processed school by school in the background for {mode_text}",
    }


@router.get("/exams/{exam_id}/generate-index-numbers/status/{job_id}", response_model=IndexNumberGenerationJobResponse)
async def get_index_number_generation_status(
    exam_id: int,
    job_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> IndexNumberGenerationJobResponse:
    """Get the status of an index number generation job."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Get job
    job_stmt = select(IndexNumberGenerationJob).where(
        IndexNumberGenerationJob.id == job_id,
        IndexNumberGenerationJob.exam_id == exam_id,
    )
    job_result = await session.execute(job_stmt)
    job = job_result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    # Convert school_progress JSON to list of SchoolProgressItem if needed
    school_progress_list = None
    if job.school_progress:
        school_progress_list = [SchoolProgressItem.model_validate(sp) for sp in job.school_progress]

    return IndexNumberGenerationJobResponse(
        id=job.id,
        exam_id=job.exam_id,
        status=job.status.value,
        replace_existing=job.replace_existing,
        progress_current=job.progress_current,
        progress_total=job.progress_total,
        current_school_id=job.current_school_id,
        current_school_name=job.current_school_name,
        school_progress=school_progress_list,
        error_message=job.error_message,
        created_by_user_id=str(job.created_by_user_id) if job.created_by_user_id else None,
        created_at=job.created_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
    )


@router.get("/exams/{exam_id}/generate-index-numbers/status", response_model=IndexNumberGenerationJobResponse | None)
async def get_latest_index_number_generation_status(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> IndexNumberGenerationJobResponse | None:
    """Get the latest index number generation job status for an exam."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Get latest job for this exam
    job_stmt = select(IndexNumberGenerationJob).where(
        IndexNumberGenerationJob.exam_id == exam_id
    ).order_by(IndexNumberGenerationJob.created_at.desc())
    job_result = await session.execute(job_stmt)
    job = job_result.scalar_one_or_none()

    if not job:
        return None

    # Convert school_progress JSON to list of SchoolProgressItem if needed
    school_progress_list = None
    if job.school_progress:
        school_progress_list = [SchoolProgressItem.model_validate(sp) for sp in job.school_progress]

    return IndexNumberGenerationJobResponse(
        id=job.id,
        exam_id=job.exam_id,
        status=job.status.value,
        replace_existing=job.replace_existing,
        progress_current=job.progress_current,
        progress_total=job.progress_total,
        current_school_id=job.current_school_id,
        current_school_name=job.current_school_name,
        school_progress=school_progress_list,
        error_message=job.error_message,
        created_by_user_id=str(job.created_by_user_id) if job.created_by_user_id else None,
        created_at=job.created_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
    )


# Examination Schedule Management Endpoints

@router.post("/exams/{exam_id}/schedules", response_model=ExaminationScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_examination_schedule(
    exam_id: int,
    schedule_data: ExaminationScheduleCreate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ExaminationScheduleResponse:
    """Create an examination schedule for an exam."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Lookup subject by original_code
    subject_stmt = select(Subject).where(Subject.original_code == schedule_data.original_code)
    subject_result = await session.execute(subject_stmt)
    subject = subject_result.scalar_one_or_none()

    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Subject with original_code '{schedule_data.original_code}' not found",
        )

    # Check for duplicate schedule (same subject code)
    existing_stmt = select(ExaminationSchedule).where(
        ExaminationSchedule.registration_exam_id == exam_id,
        ExaminationSchedule.subject_code == subject.code,
    )
    existing_result = await session.execute(existing_stmt)
    existing = existing_result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Schedule for subject {subject.code} already exists for this exam",
        )

    # Create schedule
    new_schedule = ExaminationSchedule(
        registration_exam_id=exam_id,
        subject_code=subject.code,
        subject_name=subject.name,
        examination_date=schedule_data.examination_date,
        examination_time=schedule_data.examination_time,
        examination_end_time=schedule_data.examination_end_time,
        papers=schedule_data.papers,
        venue=schedule_data.venue,
        duration_minutes=schedule_data.duration_minutes,
        instructions=schedule_data.instructions,
    )

    session.add(new_schedule)
    await session.commit()
    await session.refresh(new_schedule)

    return ExaminationScheduleResponse.model_validate(new_schedule)


@router.get("/exams/{exam_id}/schedules", response_model=list[ExaminationScheduleResponse])
async def list_examination_schedules(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> list[ExaminationScheduleResponse]:
    """List all examination schedules for an exam."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Get schedules
    schedules_stmt = select(ExaminationSchedule).where(
        ExaminationSchedule.registration_exam_id == exam_id
    ).order_by(ExaminationSchedule.examination_date, ExaminationSchedule.examination_time)
    schedules_result = await session.execute(schedules_stmt)
    schedules = schedules_result.scalars().all()

    return [ExaminationScheduleResponse.model_validate(schedule) for schedule in schedules]


@router.get("/exams/{exam_id}/schedules/template")
async def download_schedule_template(
    exam_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> StreamingResponse:
    """Download schedule upload template prepopulated with subjects."""
    try:
        template_bytes = await generate_schedule_template(session)
        return StreamingResponse(
            iter([template_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=schedule_upload_template.xlsx"},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}",
        )


@router.get("/exams/{exam_id}/schedules/{schedule_id}", response_model=ExaminationScheduleResponse)
async def get_examination_schedule(
    exam_id: int,
    schedule_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ExaminationScheduleResponse:
    """Get a specific examination schedule."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Get schedule
    schedule_stmt = select(ExaminationSchedule).where(
        ExaminationSchedule.id == schedule_id,
        ExaminationSchedule.registration_exam_id == exam_id,
    )
    schedule_result = await session.execute(schedule_stmt)
    schedule = schedule_result.scalar_one_or_none()

    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    return ExaminationScheduleResponse.model_validate(schedule)


@router.put("/exams/{exam_id}/schedules/{schedule_id}", response_model=ExaminationScheduleResponse)
async def update_examination_schedule(
    exam_id: int,
    schedule_id: int,
    schedule_update: ExaminationScheduleUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ExaminationScheduleResponse:
    """Update an examination schedule."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Get schedule
    schedule_stmt = select(ExaminationSchedule).where(
        ExaminationSchedule.id == schedule_id,
        ExaminationSchedule.registration_exam_id == exam_id,
    )
    schedule_result = await session.execute(schedule_stmt)
    schedule = schedule_result.scalar_one_or_none()

    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    # Check for duplicate if subject_code is being changed
    if schedule_update.subject_code is not None and schedule_update.subject_code != schedule.subject_code:
        existing_stmt = select(ExaminationSchedule).where(
            ExaminationSchedule.registration_exam_id == exam_id,
            ExaminationSchedule.subject_code == schedule_update.subject_code,
            ExaminationSchedule.id != schedule_id,
        )
        existing_result = await session.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()

        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Schedule for subject {schedule_update.subject_code} already exists for this exam",
            )

    # Update fields
    if schedule_update.subject_code is not None:
        schedule.subject_code = schedule_update.subject_code
    if schedule_update.subject_name is not None:
        schedule.subject_name = schedule_update.subject_name
    if schedule_update.examination_date is not None:
        schedule.examination_date = schedule_update.examination_date
    if schedule_update.examination_time is not None:
        schedule.examination_time = schedule_update.examination_time
    if schedule_update.examination_end_time is not None:
        schedule.examination_end_time = schedule_update.examination_end_time
    if schedule_update.papers is not None:
        schedule.papers = schedule_update.papers
    if schedule_update.venue is not None:
        schedule.venue = schedule_update.venue
    if schedule_update.duration_minutes is not None:
        schedule.duration_minutes = schedule_update.duration_minutes
    if schedule_update.instructions is not None:
        schedule.instructions = schedule_update.instructions

    await session.commit()
    await session.refresh(schedule)

    return ExaminationScheduleResponse.model_validate(schedule)


@router.delete("/exams/{exam_id}/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_examination_schedule(
    exam_id: int,
    schedule_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> None:
    """Delete an examination schedule."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Get schedule
    schedule_stmt = select(ExaminationSchedule).where(
        ExaminationSchedule.id == schedule_id,
        ExaminationSchedule.registration_exam_id == exam_id,
    )
    schedule_result = await session.execute(schedule_stmt)
    schedule = schedule_result.scalar_one_or_none()

    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    await session.delete(schedule)
    await session.commit()


@router.post("/exams/{exam_id}/schedules/bulk-upload", response_model=ExaminationScheduleBulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_schedules(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    file: UploadFile = File(...),
) -> ExaminationScheduleBulkUploadResponse:
    """Bulk upload schedules from Excel or CSV file."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Read file content
    file_content = await file.read()

    # Parse file
    try:
        df = parse_schedule_upload_file(file_content, file.filename or "unknown")
        validate_schedule_columns(df)
    except (ScheduleUploadParseError, ScheduleUploadValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Process each row
    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[ExaminationScheduleBulkUploadError] = []

    for idx, row in df.iterrows():
        row_number = int(idx) + 2  # +2 because Excel rows are 1-indexed and header is row 1
        try:
            # Parse row data
            schedule_data = parse_schedule_row(row)

            # Validate required fields
            if not schedule_data["original_code"]:
                errors.append(
                    ExaminationScheduleBulkUploadError(
                        row_number=row_number, error_message="original_code is required", field="original_code"
                    )
                )
                failed += 1
                continue

            if not schedule_data["subject_name"]:
                errors.append(
                    ExaminationScheduleBulkUploadError(
                        row_number=row_number, error_message="subject_name is required", field="subject_name"
                    )
                )
                failed += 1
                continue

            if not schedule_data["examination_date"]:
                errors.append(
                    ExaminationScheduleBulkUploadError(
                        row_number=row_number, error_message="examination_date is required", field="examination_date"
                    )
                )
                failed += 1
                continue

            if not schedule_data["examination_time"]:
                errors.append(
                    ExaminationScheduleBulkUploadError(
                        row_number=row_number, error_message="examination_time is required", field="examination_time"
                    )
                )
                failed += 1
                continue

            # Lookup subject by original_code
            subject_stmt = select(Subject).where(Subject.original_code == schedule_data["original_code"])
            subject_result = await session.execute(subject_stmt)
            subject = subject_result.scalar_one_or_none()

            if not subject:
                errors.append(
                    ExaminationScheduleBulkUploadError(
                        row_number=row_number,
                        error_message=f"Subject with original_code '{schedule_data['original_code']}' not found",
                        field="original_code",
                    )
                )
                failed += 1
                continue

            # Check for duplicate schedule (same subject code)
            existing_stmt = select(ExaminationSchedule).where(
                ExaminationSchedule.registration_exam_id == exam_id,
                ExaminationSchedule.subject_code == subject.code,
            )
            existing_result = await session.execute(existing_stmt)
            existing = existing_result.scalar_one_or_none()

            if existing:
                errors.append(
                    ExaminationScheduleBulkUploadError(
                        row_number=row_number,
                        error_message=f"Schedule for subject {subject.code} already exists for this exam",
                        field="original_code",
                    )
                )
                failed += 1
                continue

            # Build papers array from paper1/paper2 flags
            papers = []
            if schedule_data["paper1"]:
                paper1_entry = {"paper": 1}
                if schedule_data["paper1_start_time"]:
                    paper1_entry["start_time"] = schedule_data["paper1_start_time"].strftime("%H:%M:%S")
                if schedule_data["paper1_end_time"]:
                    paper1_entry["end_time"] = schedule_data["paper1_end_time"].strftime("%H:%M:%S")
                papers.append(paper1_entry)

            if schedule_data["paper2"]:
                paper2_entry = {"paper": 2}
                if schedule_data["paper2_start_time"]:
                    paper2_entry["start_time"] = schedule_data["paper2_start_time"].strftime("%H:%M:%S")
                if schedule_data["paper2_end_time"]:
                    paper2_entry["end_time"] = schedule_data["paper2_end_time"].strftime("%H:%M:%S")
                papers.append(paper2_entry)

            # If no papers specified, default to paper 1
            if not papers:
                papers = [{"paper": 1}]

            # Create schedule
            new_schedule = ExaminationSchedule(
                registration_exam_id=exam_id,
                subject_code=subject.code,
                subject_name=subject.name,
                examination_date=schedule_data["examination_date"],
                examination_time=schedule_data["examination_time"],
                examination_end_time=schedule_data.get("examination_end_time"),
                papers=papers,
                venue=schedule_data.get("venue"),
                duration_minutes=schedule_data.get("duration_minutes"),
                instructions=schedule_data.get("instructions"),
            )
            session.add(new_schedule)
            await session.flush()  # Flush to get ID but don't commit yet
            successful += 1

        except Exception as e:
            errors.append(
                ExaminationScheduleBulkUploadError(
                    row_number=row_number,
                    error_message=f"Error processing row: {str(e)}",
                    field=None,
                )
            )
            failed += 1
            continue

    # Commit all successful additions
    if successful > 0:
        await session.commit()

    return ExaminationScheduleBulkUploadResponse(
        total_rows=total_rows,
        successful=successful,
        failed=failed,
        errors=errors,
    )


# Programme Management Endpoints

@router.post("/programmes", response_model=ProgrammeResponse, status_code=status.HTTP_201_CREATED)
async def create_programme(
    programme: ProgrammeCreate, session: DBSessionDep, current_user: SystemAdminDep
) -> ProgrammeResponse:
    """Create a new programme."""
    # Check if code already exists
    stmt = select(Programme).where(Programme.code == programme.code)
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Programme with code {programme.code} already exists"
        )

    db_programme = Programme(code=programme.code, name=programme.name)
    session.add(db_programme)
    await session.commit()
    await session.refresh(db_programme)
    return ProgrammeResponse.model_validate(db_programme)


@router.get("/programmes", response_model=ProgrammeListResponse)
async def list_programmes(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> ProgrammeListResponse:
    """List programmes with pagination."""
    offset = (page - 1) * page_size

    # Get total count
    count_stmt = select(func.count(Programme.id))
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get programmes
    stmt = select(Programme).offset(offset).limit(page_size).order_by(Programme.code)
    result = await session.execute(stmt)
    programmes = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return ProgrammeListResponse(
        items=[ProgrammeResponse.model_validate(programme) for programme in programmes],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/programmes/template")
async def download_programme_template(current_user: SystemAdminDep) -> StreamingResponse:
    """Download Excel template for programme upload."""
    try:
        template_bytes = generate_programme_template()
        return StreamingResponse(
            iter([template_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename=programme_upload_template.xlsx'},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}",
        )


@router.get("/programmes/{programme_id}", response_model=ProgrammeResponse)
async def get_programme(
    programme_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> ProgrammeResponse:
    """Get programme details."""
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")
    return ProgrammeResponse.model_validate(programme)


@router.put("/programmes/{programme_id}", response_model=ProgrammeResponse)
async def update_programme(
    programme_id: int, programme_update: ProgrammeUpdate, session: DBSessionDep, current_user: SystemAdminDep
) -> ProgrammeResponse:
    """Update programme."""
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Check if code already exists (if updating code)
    if programme_update.code is not None and programme_update.code != programme.code:
        code_stmt = select(Programme).where(Programme.code == programme_update.code)
        code_result = await session.execute(code_stmt)
        existing = code_result.scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Programme with code {programme_update.code} already exists",
            )

    # Get fields that were actually provided in the update
    update_data = programme_update.model_dump(exclude_unset=True)

    if "name" in update_data:
        programme.name = programme_update.name
    if "code" in update_data:
        programme.code = programme_update.code

    await session.commit()
    await session.refresh(programme)
    return ProgrammeResponse.model_validate(programme)


@router.delete("/programmes/{programme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_programme(
    programme_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> None:
    """Delete programme."""
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    await session.delete(programme)
    await session.commit()


@router.post("/programmes/bulk-upload", response_model=ProgrammeBulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_programmes(
    session: DBSessionDep, current_user: SystemAdminDep, file: UploadFile = File(...)
) -> ProgrammeBulkUploadResponse:
    """Bulk upload programmes from Excel or CSV file."""
    # Read file content
    file_content = await file.read()

    # Parse file
    try:
        df = parse_programme_upload_file(file_content, file.filename or "unknown")
        validate_programme_columns(df)
    except (ProgrammeUploadParseError, ProgrammeUploadValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Process each row
    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[ProgrammeBulkUploadError] = []

    for idx, row in df.iterrows():
        row_number = int(idx) + 2  # +2 because Excel rows are 1-indexed and header is row 1
        try:
            # Parse row data
            programme_data = parse_programme_row(row)

            # Validate required fields
            if not programme_data["code"]:
                errors.append(
                    ProgrammeBulkUploadError(
                        row_number=row_number, error_message="Code is required", field="code"
                    )
                )
                failed += 1
                continue

            if not programme_data["name"]:
                errors.append(
                    ProgrammeBulkUploadError(
                        row_number=row_number, error_message="Name is required", field="name"
                    )
                )
                failed += 1
                continue

            # Check if programme with code already exists
            existing_stmt = select(Programme).where(Programme.code == programme_data["code"])
            existing_result = await session.execute(existing_stmt)
            existing = existing_result.scalar_one_or_none()
            if existing:
                errors.append(
                    ProgrammeBulkUploadError(
                        row_number=row_number,
                        error_message=f"Programme with code '{programme_data['code']}' already exists",
                        field="code",
                    )
                )
                failed += 1
                continue

            # Create programme
            db_programme = Programme(
                code=programme_data["code"],
                name=programme_data["name"],
            )
            session.add(db_programme)
            await session.flush()  # Flush to get ID but don't commit yet
            successful += 1

        except Exception as e:
            errors.append(
                ProgrammeBulkUploadError(
                    row_number=row_number,
                    error_message=f"Unexpected error: {str(e)}",
                    field=None,
                )
            )
            failed += 1
            continue

    # Commit all successful inserts
    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to commit programmes: {str(e)}",
        )

    return ProgrammeBulkUploadResponse(
        total_rows=total_rows, successful=successful, failed=failed, errors=errors
    )


# Programme-Subject Association Endpoints

@router.get("/programmes/{programme_id}/subjects", response_model=list[ProgrammeSubjectResponse])
async def list_programme_subjects(
    programme_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> list[ProgrammeSubjectResponse]:
    """List subjects for a programme."""
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Get subjects via association
    subject_stmt = (
        select(
            Subject,
            programme_subjects.c.created_at,
            programme_subjects.c.is_compulsory,
            programme_subjects.c.choice_group_id,
        )
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .where(programme_subjects.c.programme_id == programme_id)
        .order_by(Subject.code)
    )
    subject_result = await session.execute(subject_stmt)
    subjects_data = subject_result.all()

    return [
        ProgrammeSubjectResponse(
            subject_id=subject.id,
            subject_code=subject.code,
            subject_name=subject.name,
            subject_type=subject.subject_type,
            is_compulsory=is_compulsory,
            choice_group_id=choice_group_id,
            created_at=created_at,
        )
        for subject, created_at, is_compulsory, choice_group_id in subjects_data
    ]


@router.get("/programmes/{programme_id}/subject-requirements", response_model=ProgrammeSubjectRequirements)
async def get_programme_subject_requirements(
    programme_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> ProgrammeSubjectRequirements:
    """Get all subject requirements for a programme (compulsory, optional groups, electives)."""
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Get all subjects for this programme
    subject_stmt = (
        select(
            Subject,
            programme_subjects.c.created_at,
            programme_subjects.c.is_compulsory,
            programme_subjects.c.choice_group_id,
        )
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .where(programme_subjects.c.programme_id == programme_id)
        .order_by(Subject.code)
    )
    subject_result = await session.execute(subject_stmt)
    subjects_data = subject_result.all()

    # Organize subjects into categories
    compulsory_core = []
    optional_core_by_group: dict[int, list[ProgrammeSubjectResponse]] = {}
    electives = []

    for subject, created_at, is_compulsory, choice_group_id in subjects_data:
        subject_response = ProgrammeSubjectResponse(
            subject_id=subject.id,
            subject_code=subject.code,
            subject_name=subject.name,
            subject_type=subject.subject_type,
            is_compulsory=is_compulsory,
            choice_group_id=choice_group_id,
            created_at=created_at,
        )

        if subject.subject_type == SubjectType.CORE:
            if is_compulsory is True:
                compulsory_core.append(subject_response)
            elif is_compulsory is False and choice_group_id is not None:
                if choice_group_id not in optional_core_by_group:
                    optional_core_by_group[choice_group_id] = []
                optional_core_by_group[choice_group_id].append(subject_response)
        elif subject.subject_type == SubjectType.ELECTIVE:
            electives.append(subject_response)

    # Convert optional core groups to SubjectChoiceGroup list
    optional_core_groups = [
        SubjectChoiceGroup(choice_group_id=group_id, subjects=subjects)
        for group_id, subjects in sorted(optional_core_by_group.items())
    ]

    return ProgrammeSubjectRequirements(
        compulsory_core=compulsory_core,
        optional_core_groups=optional_core_groups,
        electives=electives,
    )


@router.post(
    "/programmes/{programme_id}/subjects/{subject_id}",
    response_model=ProgrammeSubjectAssociation,
    status_code=status.HTTP_201_CREATED,
)
async def associate_subject_with_programme(
    programme_id: int,
    subject_id: int,
    association_data: ProgrammeSubjectAssociationCreate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ProgrammeSubjectAssociation:
    """Associate a subject with a programme."""
    # Check programme exists
    programme_stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(programme_stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Check subject exists
    subject_stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(subject_stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    # Validate: is_compulsory should only be set for CORE subjects
    if association_data.is_compulsory is not None and subject.subject_type != SubjectType.CORE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="is_compulsory can only be set for CORE subjects. For ELECTIVE subjects, it should be NULL.",
        )

    # Validate: choice_group_id should only be set for optional CORE subjects
    if association_data.choice_group_id is not None:
        if subject.subject_type != SubjectType.CORE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="choice_group_id can only be set for CORE subjects.",
            )
        if association_data.is_compulsory is True:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="choice_group_id can only be set for optional core subjects (is_compulsory=False).",
            )

    # Check if association already exists
    assoc_stmt = select(programme_subjects).where(
        programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Subject already associated with programme"
        )

    # Create association
    await session.execute(
        insert(programme_subjects).values(
            programme_id=programme_id,
            subject_id=subject_id,
            is_compulsory=association_data.is_compulsory,
            choice_group_id=association_data.choice_group_id,
        )
    )
    await session.commit()

    return ProgrammeSubjectAssociation(
        programme_id=programme_id,
        subject_id=subject_id,
        subject_type=subject.subject_type,
        is_compulsory=association_data.is_compulsory,
        choice_group_id=association_data.choice_group_id,
    )


@router.put(
    "/programmes/{programme_id}/subjects/{subject_id}",
    response_model=ProgrammeSubjectAssociation,
)
async def update_programme_subject_association(
    programme_id: int,
    subject_id: int,
    association_update: ProgrammeSubjectAssociationUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ProgrammeSubjectAssociation:
    """Update the programme-subject association (is_compulsory and choice_group_id)."""
    # Check association exists
    assoc_stmt = select(programme_subjects).where(
        programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject association not found")

    # Check subject exists
    subject_stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(subject_stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    # Validate: is_compulsory should only be set for CORE subjects
    if association_update.is_compulsory is not None and subject.subject_type != SubjectType.CORE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="is_compulsory can only be set for CORE subjects. For ELECTIVE subjects, it should be NULL.",
        )

    # Validate: choice_group_id should only be set for optional CORE subjects
    if association_update.choice_group_id is not None:
        if subject.subject_type != SubjectType.CORE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="choice_group_id can only be set for CORE subjects.",
            )
        # Check if is_compulsory is being set to True (conflict)
        if association_update.is_compulsory is True:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="choice_group_id can only be set for optional core subjects (is_compulsory=False).",
            )
        # Check existing is_compulsory value if not being updated
        if association_update.is_compulsory is None and existing.is_compulsory is True:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="choice_group_id can only be set for optional core subjects (is_compulsory=False).",
            )

    # Update association
    update_values = {}
    if association_update.is_compulsory is not None:
        update_values["is_compulsory"] = association_update.is_compulsory
    if association_update.choice_group_id is not None:
        update_values["choice_group_id"] = association_update.choice_group_id

    if update_values:
        await session.execute(
            update(programme_subjects)
            .where(
                programme_subjects.c.programme_id == programme_id,
                programme_subjects.c.subject_id == subject_id,
            )
            .values(**update_values)
        )
        await session.commit()

    # Get updated association
    assoc_stmt = select(programme_subjects).where(
        programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    updated = result.first()

    return ProgrammeSubjectAssociation(
        programme_id=programme_id,
        subject_id=subject_id,
        subject_type=subject.subject_type,
        is_compulsory=updated.is_compulsory if updated else None,
        choice_group_id=updated.choice_group_id if updated else None,
    )


@router.delete("/programmes/{programme_id}/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subject_association(
    programme_id: int, subject_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> None:
    """Remove subject association from programme."""
    # Check association exists
    assoc_stmt = select(programme_subjects).where(
        programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject association not found")

    await session.execute(
        delete(programme_subjects).where(
            programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
        )
    )
    await session.commit()


# Subject Management Endpoints

@router.post("/subjects", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def create_subject(
    subject: SubjectCreate, session: DBSessionDep, current_user: SystemAdminDep
) -> SubjectResponse:
    """Create a new subject."""
    # Check if code already exists
    stmt = select(Subject).where(Subject.code == subject.code)
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Subject with code {subject.code} already exists"
        )

    # Check if original_code already exists (if provided)
    if subject.original_code:
        original_code_stmt = select(Subject).where(Subject.original_code == subject.original_code)
        original_code_result = await session.execute(original_code_stmt)
        existing_original = original_code_result.scalar_one_or_none()
        if existing_original:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Subject with original_code {subject.original_code} already exists"
            )

    db_subject = Subject(
        code=subject.code,
        original_code=subject.original_code,
        name=subject.name,
        subject_type=subject.subject_type,
    )
    session.add(db_subject)
    await session.commit()
    await session.refresh(db_subject)
    return SubjectResponse.model_validate(db_subject)


@router.get("/subjects", response_model=SubjectListResponse)
async def list_subjects(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> SubjectListResponse:
    """List subjects with pagination."""
    offset = (page - 1) * page_size

    # Get total count
    count_stmt = select(func.count(Subject.id))
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get subjects
    stmt = select(Subject).offset(offset).limit(page_size).order_by(Subject.code)
    result = await session.execute(stmt)
    subjects = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return SubjectListResponse(
        items=[SubjectResponse.model_validate(subject) for subject in subjects],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/subjects/template")
async def download_subject_template(current_user: SystemAdminDep) -> StreamingResponse:
    """Download Excel template for subject upload."""
    try:
        template_bytes = generate_subject_template()
        return StreamingResponse(
            iter([template_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename=subject_upload_template.xlsx'},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}",
        )


@router.get("/subjects/{subject_id}", response_model=SubjectResponse)
async def get_subject(
    subject_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> SubjectResponse:
    """Get subject details."""
    stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
    return SubjectResponse.model_validate(subject)


@router.put("/subjects/{subject_id}", response_model=SubjectResponse)
async def update_subject(
    subject_id: int, subject_update: SubjectUpdate, session: DBSessionDep, current_user: SystemAdminDep
) -> SubjectResponse:
    """Update subject."""
    stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    # Check if code already exists (if updating code)
    if subject_update.code is not None and subject_update.code != subject.code:
        code_stmt = select(Subject).where(Subject.code == subject_update.code)
        code_result = await session.execute(code_stmt)
        existing = code_result.scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Subject with code {subject_update.code} already exists",
            )

    # Check if original_code already exists (if updating original_code)
    if subject_update.original_code is not None and subject_update.original_code != subject.original_code:
        if subject_update.original_code:  # Only check if not None and not empty
            original_code_stmt = select(Subject).where(Subject.original_code == subject_update.original_code)
            original_code_result = await session.execute(original_code_stmt)
            existing_original = original_code_result.scalar_one_or_none()
            if existing_original:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Subject with original_code {subject_update.original_code} already exists",
                )

    # Get fields that were actually provided in the update
    update_data = subject_update.model_dump(exclude_unset=True)

    if "name" in update_data:
        subject.name = subject_update.name
    if "code" in update_data:
        subject.code = subject_update.code
    if "original_code" in update_data:
        subject.original_code = subject_update.original_code
    if "subject_type" in update_data:
        subject.subject_type = subject_update.subject_type

    await session.commit()
    await session.refresh(subject)
    return SubjectResponse.model_validate(subject)


@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject(
    subject_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> None:
    """Delete subject."""
    stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    await session.delete(subject)
    await session.commit()


@router.post("/subjects/bulk-upload", response_model=SubjectBulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_subjects(
    session: DBSessionDep, current_user: SystemAdminDep, file: UploadFile = File(...)
) -> SubjectBulkUploadResponse:
    """Bulk upload subjects from Excel or CSV file."""
    # Read file content
    file_content = await file.read()

    # Parse file
    try:
        df = parse_subject_upload_file(file_content, file.filename or "unknown")
        validate_subject_columns(df)
    except (SubjectUploadParseError, SubjectUploadValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Process each row
    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[SubjectBulkUploadError] = []
    # Track codes within the batch for duplicate detection
    batch_codes: set[str] = set()

    for idx, row in df.iterrows():
        row_number = int(idx) + 2  # +2 because Excel rows are 1-indexed and header is row 1
        try:
            # Parse row data
            subject_data = parse_subject_row(row)

            # Validate required fields
            if not subject_data["code"]:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number, error_message="Code is required", field="code"
                    )
                )
                failed += 1
                continue

            if not subject_data["name"]:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number, error_message="Name is required", field="name"
                    )
                )
                failed += 1
                continue

            if not subject_data["subject_type"]:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number,
                        error_message="Subject type is required and must be CORE or ELECTIVE",
                        field="subject_type",
                    )
                )
                failed += 1
                continue

            # Check if subject with code already exists in database
            existing_stmt = select(Subject).where(Subject.code == subject_data["code"])
            existing_result = await session.execute(existing_stmt)
            existing = existing_result.scalar_one_or_none()
            if existing:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number,
                        error_message=f"Subject with code '{subject_data['code']}' already exists",
                        field="code",
                    )
                )
                failed += 1
                continue

            # Check for duplicates within the batch
            if subject_data["code"] in batch_codes:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number,
                        error_message=f"Duplicate code '{subject_data['code']}' found in upload file",
                        field="code",
                    )
                )
                failed += 1
                continue

            # Validate programme_code if provided
            programme = None
            programme_code = subject_data.get("programme_code")
            # Ensure programme_code is a valid string (not None, not empty, not NaN)
            if programme_code and isinstance(programme_code, str) and programme_code.strip():
                # Lookup programme by code
                programme_stmt = select(Programme).where(Programme.code == programme_code.strip())
                programme_result = await session.execute(programme_stmt)
                programme = programme_result.scalar_one_or_none()
                if not programme:
                    errors.append(
                        SubjectBulkUploadError(
                            row_number=row_number,
                            error_message=f"Programme with code '{programme_code}' not found",
                            field="programme_code",
                        )
                    )
                    failed += 1
                    continue

            # Create subject
            db_subject = Subject(
                code=subject_data["code"],
                original_code=subject_data.get("original_code"),
                name=subject_data["name"],
                subject_type=subject_data["subject_type"],
            )
            session.add(db_subject)
            await session.flush()  # Flush to get ID but don't commit yet

            # Determine is_compulsory and choice_group_id based on subject type and choice_group_id
            is_compulsory = None
            choice_group_id = None

            if subject_data["subject_type"] == SubjectType.CORE:
                # If choice_group_id is provided, it's an optional core subject
                parsed_choice_group_id = subject_data.get("choice_group_id")
                if parsed_choice_group_id is not None:
                    # Validate choice_group_id is a positive integer
                    if isinstance(parsed_choice_group_id, int) and parsed_choice_group_id > 0:
                        is_compulsory = False
                        choice_group_id = parsed_choice_group_id
                    else:
                        # Invalid choice_group_id - treat as compulsory but log warning
                        # This shouldn't happen if parsing is correct, but handle gracefully
                        errors.append(
                            SubjectBulkUploadError(
                                row_number=row_number,
                                error_message=f"Invalid choice_group_id '{parsed_choice_group_id}' for core subject. Must be a positive integer.",
                                field="choice_group_id",
                            )
                        )
                        failed += 1
                        continue
                else:
                    # Default to compulsory if no choice_group_id
                    is_compulsory = True

            # For CORE subjects: if choice_group_id is specified, add to ALL programmes
            # This ensures that subjects with the same choice_group_id are consistently
            # applied across all programmes
            if subject_data["subject_type"] == SubjectType.CORE:
                # Get all programmes
                all_programmes_stmt = select(Programme)
                all_programmes_result = await session.execute(all_programmes_stmt)
                all_programmes = all_programmes_result.scalars().all()

                for prog in all_programmes:
                    # Check if association already exists
                    assoc_stmt = select(programme_subjects).where(
                        programme_subjects.c.programme_id == prog.id,
                        programme_subjects.c.subject_id == db_subject.id,
                    )
                    assoc_result = await session.execute(assoc_stmt)
                    existing_assoc = assoc_result.first()
                    if not existing_assoc:
                        # Create association with the determined is_compulsory and choice_group_id
                        await session.execute(
                            insert(programme_subjects).values(
                                programme_id=prog.id,
                                subject_id=db_subject.id,
                                is_compulsory=is_compulsory,
                                choice_group_id=choice_group_id,
                            )
                        )
            elif programme:
                # For ELECTIVE subjects: only link to programme if programme_code was provided
                # Check if association already exists
                assoc_stmt = select(programme_subjects).where(
                    programme_subjects.c.programme_id == programme.id,
                    programme_subjects.c.subject_id == db_subject.id,
                )
                assoc_result = await session.execute(assoc_stmt)
                existing_assoc = assoc_result.first()
                if not existing_assoc:
                    # Create association (electives don't have is_compulsory or choice_group_id)
                    await session.execute(
                        insert(programme_subjects).values(
                            programme_id=programme.id,
                            subject_id=db_subject.id,
                            is_compulsory=None,
                            choice_group_id=None,
                        )
                    )

            # Track codes in batch for duplicate detection
            batch_codes.add(subject_data["code"])
            successful += 1

        except Exception as e:
            errors.append(
                SubjectBulkUploadError(
                    row_number=row_number,
                    error_message=f"Unexpected error: {str(e)}",
                    field=None,
                )
            )
            failed += 1
            continue

    # Commit all successful inserts
    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to commit subjects: {str(e)}",
        )

    return SubjectBulkUploadResponse(
        total_rows=total_rows, successful=successful, failed=failed, errors=errors
    )


# Results Management Endpoints

@router.post("/results/publish", response_model=CandidateResultBulkPublishResponse, status_code=status.HTTP_200_OK)
async def bulk_publish_results(
    publish_data: CandidateResultBulkPublish,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> CandidateResultBulkPublishResponse:
    """Bulk publish results for an exam (creates CandidateResult records)."""
    try:
        result = await publish_results_bulk(
            session=session,
            exam_id=publish_data.exam_id,
            results=[r.model_dump() for r in publish_data.results],
            published_by_user_id=current_user.id,
        )
        return CandidateResultBulkPublishResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to publish results: {str(e)}",
        )


@router.post("/results/upload", response_model=CandidateResultBulkPublishResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_results(
    exam_id: int = Form(...),
    file: UploadFile = File(...),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> CandidateResultBulkPublishResponse:
    """Bulk upload results from Excel file (creates CandidateResult records without publishing them)."""
    # Read file content
    file_content = await file.read()
    filename = file.filename or "unknown"

    # Verify file format
    if not filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be Excel format (.xlsx or .xls)"
        )

    # Parse Excel file
    try:
        df = pd.read_excel(io.BytesIO(file_content), engine='openpyxl')
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error parsing Excel file: {str(e)}"
        )

    if df.empty:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Excel file is empty or contains no data"
        )

    # Normalize column names (strip whitespace, handle case insensitivity)
    df.columns = df.columns.str.strip()
    column_mapping = {col.lower(): col for col in df.columns}

    # Required columns
    required_columns = ['registration_number', 'subject_code', 'grade']
    missing_columns = []
    for req_col in required_columns:
        if req_col.lower() not in column_mapping:
            missing_columns.append(req_col)

    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required columns: {', '.join(missing_columns)}"
        )

    # Convert DataFrame to list of result dictionaries
    results = []
    for idx, row in df.iterrows():
        registration_number = str(row[column_mapping['registration_number']]).strip() if pd.notna(row[column_mapping['registration_number']]) else None
        subject_code = str(row[column_mapping['subject_code']]).strip() if pd.notna(row[column_mapping['subject_code']]) else None
        grade_str = str(row[column_mapping['grade']]).strip() if pd.notna(row[column_mapping['grade']]) else None

        # Optional index_number
        index_number = None
        if 'index_number' in column_mapping:
            index_number_val = row[column_mapping['index_number']]
            if pd.notna(index_number_val):
                index_number = str(index_number_val).strip()

        if not registration_number or not subject_code or not grade_str:
            continue  # Skip rows with missing required data

        results.append({
            "registration_number": registration_number,
            "subject_code": subject_code,
            "grade": grade_str,
            "index_number": index_number,
        })

    if not results:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid results found in Excel file"
        )

    # Call upload_results_bulk service
    try:
        result = await upload_results_bulk(
            session=session,
            exam_id=exam_id,
            results=results,
            uploaded_by_user_id=current_user.id,
        )
        return CandidateResultBulkPublishResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload results: {str(e)}",
        )


@router.post("/results/exams/{exam_id}/publish", response_model=RegistrationExamResponse, status_code=status.HTTP_200_OK)
async def publish_exam_results_endpoint(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> RegistrationExamResponse:
    """Mark exam as published (allows candidates to view results)."""
    try:
        exam = await publish_exam_results(session, exam_id, current_user.id)
        return RegistrationExamResponse.model_validate(exam)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to publish exam: {str(e)}",
        )


@router.post("/results/exams/{exam_id}/publish-results", response_model=CandidateResultBulkPublishResponse, status_code=status.HTTP_200_OK)
async def publish_results_for_exam(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    filter_data: PublishResultsFilterRequest | None = Body(None),
) -> CandidateResultBulkPublishResponse:
    """Publish uploaded results for an exam with optional filters (all, by school, by subject, or combinations).

    If no filter_data is provided (or empty body), publishes all unpublished results for the exam.
    If filter_data is provided, publishes only results matching the filters (school_ids and/or subject_ids).
    """
    try:
        school_ids = filter_data.school_ids if filter_data else None
        subject_ids = filter_data.subject_ids if filter_data else None

        result = await publish_results_bulk(
            session=session,
            exam_id=exam_id,
            published_by_user_id=current_user.id,
            school_ids=school_ids,
            subject_ids=subject_ids,
        )
        return CandidateResultBulkPublishResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to publish results: {str(e)}",
        )


@router.post("/results/exams/{exam_id}/unpublish-results", response_model=CandidateResultBulkPublishResponse, status_code=status.HTTP_200_OK)
async def unpublish_results_for_exam(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    filter_data: PublishResultsFilterRequest | None = Body(None),
) -> CandidateResultBulkPublishResponse:
    """Unpublish results for an exam with optional filters (all, by school, by subject, or combinations).

    If no filter_data is provided (or empty body), unpublishes all published results for the exam.
    If filter_data is provided, unpublishes only results matching the filters (school_ids and/or subject_ids).
    """
    try:
        school_ids = filter_data.school_ids if filter_data else None
        subject_ids = filter_data.subject_ids if filter_data else None

        result = await unpublish_results_bulk(
            session=session,
            exam_id=exam_id,
            school_ids=school_ids,
            subject_ids=subject_ids,
        )
        return CandidateResultBulkPublishResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unpublish results: {str(e)}",
        )


@router.post("/results/exams/{exam_id}/unpublish", response_model=RegistrationExamResponse, status_code=status.HTTP_200_OK)
async def unpublish_exam_results_endpoint(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> RegistrationExamResponse:
    """Unpublish exam results (prevents candidates from viewing)."""
    try:
        exam = await unpublish_exam_results(session, exam_id)
        # Ensure registration_period is loaded
        await session.refresh(exam, ["registration_period"])
        return RegistrationExamResponse.model_validate(exam)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        import traceback
        error_detail = str(e)
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unpublish exam: {error_detail}",
        )


@router.get("/results/{exam_id}", response_model=list[CandidateResultResponse])
async def list_exam_results(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    candidate_id: int | None = Query(None, description="Filter by candidate ID"),
    subject_id: int | None = Query(None, description="Filter by subject ID"),
    school_id: int | None = Query(None, description="Filter by school ID"),
) -> list[CandidateResultResponse]:
    """List all results for an exam (with optional filters)."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Build query
    stmt = (
        select(CandidateResult)
        .join(RegistrationCandidate, CandidateResult.registration_candidate_id == RegistrationCandidate.id)
        .join(Subject, CandidateResult.subject_id == Subject.id)
        .where(CandidateResult.registration_exam_id == exam_id)
        .options(
            selectinload(CandidateResult.candidate),
            selectinload(CandidateResult.subject),
        )
    )

    if candidate_id:
        stmt = stmt.where(CandidateResult.registration_candidate_id == candidate_id)
    if subject_id:
        stmt = stmt.where(CandidateResult.subject_id == subject_id)
    if school_id:
        stmt = stmt.where(RegistrationCandidate.school_id == school_id)

    result = await session.execute(stmt)
    results = result.scalars().all()

    # Build response
    response_list = []
    for r in results:
        response_list.append(
            CandidateResultResponse(
                id=r.id,
                registration_candidate_id=r.registration_candidate_id,
                subject_id=r.subject_id,
                subject_code=r.subject.code,
                subject_name=r.subject.name,
                registration_exam_id=r.registration_exam_id,
                exam_type=exam.exam_type,
                exam_series=exam.exam_series,
                exam_year=exam.year,
                grade=r.grade,
                is_published=r.is_published,
                published_at=r.published_at,
                published_by_user_id=r.published_by_user_id,
                candidate_name=r.candidate.name,
                candidate_index_number=r.candidate.index_number,
                candidate_registration_number=r.candidate.registration_number,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
        )

    return response_list


@router.put("/results/{result_id}", response_model=CandidateResultResponse)
async def update_result(
    result_id: int,
    update_data: CandidateResultUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> CandidateResultResponse:
    """Update individual result (can unblock by changing BLOCKED to regular grade)."""
    result_stmt = select(CandidateResult).where(CandidateResult.id == result_id)
    result = await session.execute(result_stmt)
    candidate_result = result.scalar_one_or_none()

    if not candidate_result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found")

    # Update grade if provided
    if update_data.grade is not None:
        # If unblocking (changing from BLOCKED to regular grade)
        if candidate_result.grade == Grade.BLOCKED and update_data.grade != Grade.BLOCKED:
            candidate_result = await unblock_result(session, result_id, update_data.grade, current_user.id)
        else:
            candidate_result.grade = update_data.grade
            candidate_result.published_by_user_id = current_user.id
            candidate_result.updated_at = datetime.utcnow()

    await session.commit()
    await session.refresh(candidate_result)

    # Get related data for response
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == candidate_result.registration_exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one()

    subject_stmt = select(Subject).where(Subject.id == candidate_result.subject_id)
    subject_result = await session.execute(subject_stmt)
    subject = subject_result.scalar_one()

    return CandidateResultResponse(
        id=candidate_result.id,
        registration_candidate_id=candidate_result.registration_candidate_id,
        subject_id=candidate_result.subject_id,
        subject_code=subject.code,
        subject_name=subject.name,
        registration_exam_id=candidate_result.registration_exam_id,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        exam_year=exam.year,
        grade=candidate_result.grade,
        is_published=candidate_result.is_published,
        published_at=candidate_result.published_at,
        published_by_user_id=candidate_result.published_by_user_id,
        candidate_name=candidate_result.candidate.name,
        candidate_index_number=candidate_result.candidate.index_number,
        candidate_registration_number=candidate_result.candidate.registration_number,
        created_at=candidate_result.created_at,
        updated_at=candidate_result.updated_at,
    )


@router.post("/results/blocks", response_model=ResultBlockResponse, status_code=status.HTTP_201_CREATED)
async def create_result_block_endpoint(
    block_data: ResultBlockCreate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ResultBlockResponse:
    """Create result block (administrative blocking - prevents viewing)."""
    try:
        block = await create_result_block(
            session=session,
            block_type=block_data.block_type,
            exam_id=block_data.registration_exam_id,
            blocked_by_user_id=current_user.id,
            candidate_id=block_data.registration_candidate_id,
            school_id=block_data.school_id,
            subject_id=block_data.subject_id,
            reason=block_data.reason,
        )

        # Get related data for response
        exam_stmt = select(RegistrationExam).where(RegistrationExam.id == block.registration_exam_id)
        exam_result = await session.execute(exam_stmt)
        exam = exam_result.scalar_one()

        response_data = {
            "id": block.id,
            "block_type": block.block_type,
            "registration_exam_id": block.registration_exam_id,
            "exam_type": exam.exam_type,
            "exam_series": exam.exam_series,
            "exam_year": exam.year,
            "registration_candidate_id": block.registration_candidate_id,
            "candidate_name": None,
            "candidate_registration_number": None,
            "school_id": block.school_id,
            "school_name": None,
            "school_code": None,
            "subject_id": block.subject_id,
            "subject_code": None,
            "subject_name": None,
            "is_active": block.is_active,
            "blocked_by_user_id": block.blocked_by_user_id,
            "blocked_by_user_name": current_user.full_name,
            "reason": block.reason,
            "created_at": block.created_at,
            "updated_at": block.updated_at,
        }

        if block.registration_candidate_id:
            candidate_stmt = select(RegistrationCandidate).where(
                RegistrationCandidate.id == block.registration_candidate_id
            )
            candidate_result = await session.execute(candidate_stmt)
            candidate = candidate_result.scalar_one()
            response_data["candidate_name"] = candidate.name
            response_data["candidate_registration_number"] = candidate.registration_number

        if block.school_id:
            school_stmt = select(School).where(School.id == block.school_id)
            school_result = await session.execute(school_stmt)
            school = school_result.scalar_one()
            response_data["school_name"] = school.name
            response_data["school_code"] = school.code

        if block.subject_id:
            subject_stmt = select(Subject).where(Subject.id == block.subject_id)
            subject_result = await session.execute(subject_stmt)
            subject = subject_result.scalar_one()
            response_data["subject_code"] = subject.code
            response_data["subject_name"] = subject.name

        return ResultBlockResponse(**response_data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create block: {str(e)}",
        )


@router.get("/results/blocks", response_model=list[ResultBlockResponse])
async def list_result_blocks(
    request: Request,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
) -> list[ResultBlockResponse]:
    """List result blocks."""
    # Parse exam_id from raw query parameters to handle empty strings properly
    # This bypasses FastAPI's automatic validation which fails on empty strings
    exam_id_int: int | None = None
    raw_exam_id = request.query_params.get("exam_id")
    if raw_exam_id is not None and raw_exam_id.strip() != "":
        try:
            exam_id_int = int(raw_exam_id.strip())
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="exam_id must be a valid integer",
            )

    # Use left join to handle cases where exam might not exist (data integrity issues)
    stmt = (
        select(ResultBlock)
        .outerjoin(RegistrationExam, ResultBlock.registration_exam_id == RegistrationExam.id)
        .options(
            selectinload(ResultBlock.exam),
            selectinload(ResultBlock.candidate),
            selectinload(ResultBlock.school),
            selectinload(ResultBlock.subject),
            selectinload(ResultBlock.blocked_by),
        )
    )

    if exam_id_int:
        stmt = stmt.where(ResultBlock.registration_exam_id == exam_id_int)
    if is_active is not None:
        stmt = stmt.where(ResultBlock.is_active == is_active)

    result = await session.execute(stmt)
    blocks = result.scalars().all()

    response_list = []
    for block in blocks:
        # Handle case where exam might not exist (shouldn't happen, but be defensive)
        if not block.exam:
            # Skip blocks with missing exams (data integrity issue)
            continue

        response_data = {
            "id": block.id,
            "block_type": block.block_type,
            "registration_exam_id": block.registration_exam_id,
            "exam_type": block.exam.exam_type,
            "exam_series": block.exam.exam_series,
            "exam_year": block.exam.year,
            "registration_candidate_id": block.registration_candidate_id,
            "candidate_name": None,
            "candidate_registration_number": None,
            "school_id": block.school_id,
            "school_name": None,
            "school_code": None,
            "subject_id": block.subject_id,
            "subject_code": None,
            "subject_name": None,
            "is_active": block.is_active,
            "blocked_by_user_id": block.blocked_by_user_id,
            "blocked_by_user_name": block.blocked_by.full_name if block.blocked_by else "Unknown",
            "reason": block.reason,
            "created_at": block.created_at,
            "updated_at": block.updated_at,
        }

        if block.candidate:
            response_data["candidate_name"] = block.candidate.name
            response_data["candidate_registration_number"] = block.candidate.registration_number

        if block.school:
            response_data["school_name"] = block.school.name
            response_data["school_code"] = block.school.code

        if block.subject:
            response_data["subject_code"] = block.subject.code
            response_data["subject_name"] = block.subject.name

        response_list.append(ResultBlockResponse(**response_data))

    return response_list


@router.delete("/results/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_result_block(
    block_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> None:
    """Remove block (deactivate)."""
    block_stmt = select(ResultBlock).where(ResultBlock.id == block_id)
    block_result = await session.execute(block_stmt)
    block = block_result.scalar_one_or_none()

    if not block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")

    block.is_active = False
    block.updated_at = datetime.utcnow()

    await session.commit()


# Certificate Request Endpoints

@router.get("/certificate-requests", status_code=status.HTTP_200_OK)
async def list_certificate_requests(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    status_filter: str | None = Query(None, description="Filter by status"),
    status_min: str | None = Query(None, description="Minimum workflow status (includes this status and all later workflow statuses)"),
    request_type: str | None = Query(None, description="Filter by request type (certificate/attestation/confirmation/verification)"),
    assigned_to: str | None = Query(None, description="Filter by assigned user ID"),
    priority: str | None = Query(None, description="Filter by priority (low/medium/high/urgent)"),
    service_type: str | None = Query(None, description="Filter by service type (standard/express)"),
    view: str | None = Query(None, description="List view: active|completed|cancelled|all"),
    include_bulk_confirmations: bool = Query(False, description="Include bulk confirmation requests in results"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    """
    List certificate requests with filters (System Admin).

    Returns Certificate/Attestation requests and confirmation requests.
    When filtering by confirmation/verification types, confirmation requests are automatically included.
    """
    from app.schemas.certificate import (
        CertificateRequestResponse,
        CertificateConfirmationRequestResponse,
        InvoiceResponse,
        PaymentResponse,
    )
    from app.models import (
        CertificateRequest,
        CertificateConfirmationRequest,
        RequestStatus,
        CertificateRequestType,
        TicketPriority,
        ServiceType,
    )
    from sqlalchemy import and_, or_, case
    from uuid import UUID

    status_rank: dict[str, int] = {
        RequestStatus.CANCELLED.value: -1,
        RequestStatus.PENDING_PAYMENT.value: 1,
        RequestStatus.PAID.value: 2,
        RequestStatus.IN_PROCESS.value: 3,
        RequestStatus.READY_FOR_DISPATCH.value: 4,
        RequestStatus.DISPATCHED.value: 5,
        RequestStatus.RECEIVED.value: 6,
        RequestStatus.COMPLETED.value: 7,
    }

    # Determine if we should include confirmation requests
    should_include_confirmations = include_bulk_confirmations  # Parameter name kept for backward compatibility
    if request_type:
        type_lower = request_type.lower().strip()
        if type_lower in ("confirmation", "verification"):
            should_include_confirmations = True

    # Query certificate requests (excluding confirmation/verification if showing bulk)
    stmt = select(CertificateRequest).options(
        selectinload(CertificateRequest.examination_center),
        selectinload(CertificateRequest.assigned_to),
    )

    conditions = []

    # If including confirmation requests and filtering by confirmation/verification, exclude them from certificate requests
    if should_include_confirmations and request_type:
        type_lower = request_type.lower().strip()
        if type_lower in ("confirmation", "verification"):
            # Exclude confirmation/verification from CertificateRequest (they're in CertificateConfirmationRequest)
            conditions.append(
                ~cast(CertificateRequest.request_type, String).in_(["confirmation", "verification"])
            )

    # Exact status filter
    if status_filter and status_filter.strip():
        status_lower = status_filter.lower().strip()
        valid_statuses = [s.value for s in RequestStatus]
        if status_lower not in valid_statuses:
            valid_values = ', '.join(valid_statuses)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status filter: {status_filter}. Valid values: {valid_values}",
            )
        conditions.append(cast(CertificateRequest.status, String).ilike(status_lower))

    # Minimum workflow status filter (paid => paid + above)
    if status_min and status_min.strip():
        status_min_lower = status_min.lower().strip()
        if status_min_lower not in status_rank:
            valid_values = ", ".join(status_rank.keys())
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status_min: {status_min}. Valid values: {valid_values}",
            )
        if status_min_lower == RequestStatus.CANCELLED.value:
            conditions.append(cast(CertificateRequest.status, String).ilike(RequestStatus.CANCELLED.value))
        else:
            threshold = status_rank[status_min_lower]
            allowed_statuses = [s for s, r in status_rank.items() if r >= threshold]
            conditions.append(cast(CertificateRequest.status, String).in_(allowed_statuses))

    if request_type and request_type.strip():
        type_lower = request_type.lower().strip()
        valid_types = [t.value for t in CertificateRequestType]
        if type_lower not in valid_types:
            valid_values = ', '.join(valid_types)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid request_type filter: {request_type}. Valid values: {valid_values}",
            )
        # Only apply filter if not filtering for confirmation/verification (those are in bulk table)
        if type_lower not in ("confirmation", "verification"):
            conditions.append(cast(CertificateRequest.request_type, String).ilike(type_lower))

    if assigned_to and assigned_to.strip():
        try:
            assigned_to_uuid = UUID(assigned_to.strip())
            conditions.append(CertificateRequest.assigned_to_user_id == assigned_to_uuid)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid assigned_to user ID format: {assigned_to}",
            )

    if priority and priority.strip():
        priority_lower = priority.lower().strip()
        valid_priorities = [p.value for p in TicketPriority]
        if priority_lower not in valid_priorities:
            valid_values = ', '.join(valid_priorities)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid priority filter: {priority}. Valid values: {valid_values}",
            )
        conditions.append(cast(CertificateRequest.priority, String).ilike(priority_lower))

    if service_type and service_type.strip():
        service_type_lower = service_type.lower().strip()
        valid_service_types = [s.value for s in ServiceType]
        if service_type_lower not in valid_service_types:
            valid_values = ', '.join(valid_service_types)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid service_type filter: {service_type}. Valid values: {valid_values}",
            )
        conditions.append(cast(CertificateRequest.service_type, String).ilike(service_type_lower))

    # Apply view filter for certificate requests
    if view:
        view_lower = view.strip().lower()
        if view_lower == "active":
            conditions.append(~cast(CertificateRequest.status, String).in_([RequestStatus.COMPLETED.value, RequestStatus.CANCELLED.value]))
        elif view_lower == "completed":
            conditions.append(cast(CertificateRequest.status, String).ilike(RequestStatus.COMPLETED.value))
        elif view_lower == "cancelled":
            conditions.append(cast(CertificateRequest.status, String).ilike(RequestStatus.CANCELLED.value))
        elif view_lower == "my_tickets":
            conditions.append(CertificateRequest.assigned_to_user_id == current_user.id)
        elif view_lower == "all":
            pass
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid view. Must be: active, completed, cancelled, my_tickets, or all")

    if conditions:
        stmt = stmt.where(and_(*conditions))

    # Get total count for certificate requests
    count_stmt = select(func.count(CertificateRequest.id))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    total_result = await session.execute(count_stmt)
    cert_request_total = total_result.scalar() or 0

    rank_case_cert = case(
        *[(cast(CertificateRequest.status, String) == s, r) for s, r in status_rank.items()],
        else_=999,
    )

    # If including confirmation requests, also query and merge them
    cert_requests: list[CertificateRequest] = []
    conf_requests: list[CertificateConfirmationRequest] = []

    prefetch = page * page_size
    stmt = stmt.order_by(rank_case_cert.desc(), CertificateRequest.created_at.desc()).limit(prefetch)
    result = await session.execute(stmt)
    cert_requests = list(result.scalars().all())

    if should_include_confirmations:
        # Query confirmation requests (unified model)
        conf_stmt = select(CertificateConfirmationRequest).options(
            selectinload(CertificateConfirmationRequest.invoice),
            selectinload(CertificateConfirmationRequest.payment),
            selectinload(CertificateConfirmationRequest.assigned_to),
        )

        conf_conditions = []

        # Filter by request type if specified
        if request_type:
            type_lower = request_type.lower().strip()
            if type_lower in ("confirmation", "verification"):
                conf_conditions.append(cast(CertificateConfirmationRequest.request_type, String).ilike(type_lower))

        # Apply same filters as certificate requests
        if status_filter and status_filter.strip():
            status_lower = status_filter.lower().strip()
            conf_conditions.append(cast(CertificateConfirmationRequest.status, String).ilike(status_lower))

        if status_min and status_min.strip():
            status_min_lower = status_min.lower().strip()
            if status_min_lower not in status_rank:
                pass
            elif status_min_lower == RequestStatus.CANCELLED.value:
                conf_conditions.append(cast(CertificateConfirmationRequest.status, String).ilike(RequestStatus.CANCELLED.value))
            else:
                threshold = status_rank[status_min_lower]
                allowed_statuses = [s for s, r in status_rank.items() if r >= threshold]
                conf_conditions.append(cast(CertificateConfirmationRequest.status, String).in_(allowed_statuses))

        if assigned_to and assigned_to.strip():
            try:
                assigned_to_uuid = UUID(assigned_to.strip())
                conf_conditions.append(CertificateConfirmationRequest.assigned_to_user_id == assigned_to_uuid)
            except ValueError:
                pass

        if priority and priority.strip():
            priority_lower = priority.lower().strip()
            conf_conditions.append(cast(CertificateConfirmationRequest.priority, String).ilike(priority_lower))

        if service_type and service_type.strip():
            service_type_lower = service_type.lower().strip()
            conf_conditions.append(cast(CertificateConfirmationRequest.service_type, String).ilike(service_type_lower))

        # Apply view filter for confirmation requests
        if view:
            view_lower = view.strip().lower()
            if view_lower == "active":
                conf_conditions.append(~cast(CertificateConfirmationRequest.status, String).in_([RequestStatus.COMPLETED.value, RequestStatus.CANCELLED.value]))
            elif view_lower == "completed":
                conf_conditions.append(cast(CertificateConfirmationRequest.status, String).ilike(RequestStatus.COMPLETED.value))
            elif view_lower == "cancelled":
                conf_conditions.append(cast(CertificateConfirmationRequest.status, String).ilike(RequestStatus.CANCELLED.value))
            elif view_lower == "my_tickets":
                conf_conditions.append(CertificateConfirmationRequest.assigned_to_user_id == current_user.id)
            elif view_lower == "all":
                pass

        if conf_conditions:
            conf_stmt = conf_stmt.where(and_(*conf_conditions))

        # Get confirmation request count
        conf_count_stmt = select(func.count(CertificateConfirmationRequest.id))
        if conf_conditions:
            conf_count_stmt = conf_count_stmt.where(and_(*conf_conditions))
        conf_total_result = await session.execute(conf_count_stmt)
        conf_total = conf_total_result.scalar() or 0

        rank_case_conf = case(
            *[(cast(CertificateConfirmationRequest.status, String) == s, r) for s, r in status_rank.items()],
            else_=999,
        )
        conf_stmt = conf_stmt.order_by(rank_case_conf.desc(), CertificateConfirmationRequest.created_at.desc()).limit(prefetch)
        conf_result = await session.execute(conf_stmt)
        conf_requests = list(conf_result.scalars().all())

        total = cert_request_total + conf_total
    else:
        total = cert_request_total

    # Global merge ordering (rank desc, created_at desc) across both models
    def _rank_of(status_val: str) -> int:
        return status_rank.get(status_val, 999)

    merged: list[tuple[int, datetime, str, object]] = []
    for r in cert_requests:
        merged.append((_rank_of(r.status.value), r.created_at, "certificate_request", r))
    for r in conf_requests:
        merged.append((_rank_of(r.status.value), r.created_at, "certificate_confirmation_request", r))

    merged.sort(key=lambda x: (x[0], x[1]), reverse=True)
    start = (page - 1) * page_size
    end = start + page_size
    page_slice = merged[start:end]

    items: list[dict] = []
    for _, __, ticket_type_val, obj in page_slice:
        if ticket_type_val == "certificate_request":
            req = obj  # type: ignore[assignment]
            item = CertificateRequestResponse.model_validate(req)
            if getattr(req, "examination_center", None):
                item.examination_center_name = req.examination_center.name
            items.append(item.model_dump())
        else:
            conf_req = obj  # type: ignore[assignment]
            conf_item = CertificateConfirmationRequestResponse.model_validate(conf_req)
            conf_dict = conf_item.model_dump()
            is_bulk = (
                len(conf_req.certificate_details) > 1
                if isinstance(conf_req.certificate_details, list)
                else False
            )
            conf_dict["_type"] = "bulk_confirmation" if is_bulk else "certificate_confirmation"
            items.append(conf_dict)

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/certificate-requests/statistics", status_code=status.HTTP_200_OK)
async def get_certificate_request_statistics(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    period: str | None = Query(None, description="Period: last_week, last_month, last_year, or custom"),
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD) for custom range"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD) for custom range"),
) -> dict:
    """Get statistics about certificate requests (System Admin).

    Returns:
        - total: Total number of requests (both CertificateRequest and CertificateConfirmationRequest)
        - pending_payment: Number of requests with status pending_payment
        - completed: Number of requests with status completed
    """
    from app.models import CertificateRequest, CertificateConfirmationRequest, RequestStatus
    from sqlalchemy import func, cast, String
    from datetime import datetime, timedelta

    # Calculate date range based on period if provided
    start_dt = None
    end_dt = None
    if period:
        today = datetime.utcnow().date()
        if period == "last_week":
            start_dt = datetime.combine(today - timedelta(days=7), datetime.min.time())
            end_dt = datetime.utcnow()
        elif period == "last_month":
            start_dt = datetime.combine(today - timedelta(days=30), datetime.min.time())
            end_dt = datetime.utcnow()
        elif period == "last_year":
            start_dt = datetime.combine(today - timedelta(days=365), datetime.min.time())
            end_dt = datetime.utcnow()
        elif period == "custom":
            if start_date:
                try:
                    start_dt = datetime.fromisoformat(start_date)
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid start_date format. Use YYYY-MM-DD",
                    )
            if end_date:
                try:
                    end_dt = datetime.fromisoformat(end_date)
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid end_date format. Use YYYY-MM-DD",
                    )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid period. Must be: last_week, last_month, last_year, or custom",
            )
    else:
        # If custom dates provided without period, use them
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid start_date format. Use YYYY-MM-DD",
                )
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid end_date format. Use YYYY-MM-DD",
                )

    # Build date filter conditions
    date_conditions_cert = []
    date_conditions_conf = []
    if start_dt:
        date_conditions_cert.append(CertificateRequest.created_at >= start_dt)
        date_conditions_conf.append(CertificateConfirmationRequest.created_at >= start_dt)
    if end_dt:
        date_conditions_cert.append(CertificateRequest.created_at <= end_dt)
        date_conditions_conf.append(CertificateConfirmationRequest.created_at <= end_dt)

    # Get total count (both CertificateRequest and CertificateConfirmationRequest)
    total_cert_stmt = select(func.count(CertificateRequest.id))
    if date_conditions_cert:
        total_cert_stmt = total_cert_stmt.where(and_(*date_conditions_cert))
    total_cert_result = await session.execute(total_cert_stmt)
    total_cert = total_cert_result.scalar() or 0

    total_conf_stmt = select(func.count(CertificateConfirmationRequest.id))
    if date_conditions_conf:
        total_conf_stmt = total_conf_stmt.where(and_(*date_conditions_conf))
    total_conf_result = await session.execute(total_conf_stmt)
    total_conf = total_conf_result.scalar() or 0

    total = total_cert + total_conf

    # Get pending_payment count
    pending_cert_stmt = select(func.count(CertificateRequest.id)).where(
        cast(CertificateRequest.status, String).ilike(RequestStatus.PENDING_PAYMENT.value)
    )
    if date_conditions_cert:
        pending_cert_stmt = pending_cert_stmt.where(and_(*date_conditions_cert))
    pending_cert_result = await session.execute(pending_cert_stmt)
    pending_cert = pending_cert_result.scalar() or 0

    pending_conf_stmt = select(func.count(CertificateConfirmationRequest.id)).where(
        cast(CertificateConfirmationRequest.status, String).ilike(RequestStatus.PENDING_PAYMENT.value)
    )
    if date_conditions_conf:
        pending_conf_stmt = pending_conf_stmt.where(and_(*date_conditions_conf))
    pending_conf_result = await session.execute(pending_conf_stmt)
    pending_conf = pending_conf_result.scalar() or 0

    pending_payment = pending_cert + pending_conf

    # Get completed count
    completed_cert_stmt = select(func.count(CertificateRequest.id)).where(
        cast(CertificateRequest.status, String).ilike(RequestStatus.COMPLETED.value)
    )
    if date_conditions_cert:
        completed_cert_stmt = completed_cert_stmt.where(and_(*date_conditions_cert))
    completed_cert_result = await session.execute(completed_cert_stmt)
    completed_cert = completed_cert_result.scalar() or 0

    completed_conf_stmt = select(func.count(CertificateConfirmationRequest.id)).where(
        cast(CertificateConfirmationRequest.status, String).ilike(RequestStatus.COMPLETED.value)
    )
    if date_conditions_conf:
        completed_conf_stmt = completed_conf_stmt.where(and_(*date_conditions_conf))
    completed_conf_result = await session.execute(completed_conf_stmt)
    completed_conf = completed_conf_result.scalar() or 0

    completed = completed_cert + completed_conf

    return {
        "total": total,
        "pending_payment": pending_payment,
        "completed": completed,
    }


@router.get("/certificate-confirmations/{confirmation_id}", status_code=status.HTTP_200_OK)
async def get_certificate_confirmation(
    confirmation_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> dict:
    """Get certificate confirmation request with all certificate details."""
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id
    from app.schemas.certificate import CertificateConfirmationRequestResponse, InvoiceResponse, PaymentResponse
    from app.models import Invoice, Payment

    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate confirmation request not found",
        )

    # Load relationships
    from app.models import CertificateConfirmationRequest
    stmt = select(CertificateConfirmationRequest).where(
        CertificateConfirmationRequest.id == confirmation_id
    ).options(
        selectinload(CertificateConfirmationRequest.invoice),
        selectinload(CertificateConfirmationRequest.payment),
        selectinload(CertificateConfirmationRequest.assigned_to),
        selectinload(CertificateConfirmationRequest.processed_by),
        selectinload(CertificateConfirmationRequest.dispatched_by),
    )
    result = await session.execute(stmt)
    confirmation_request = result.scalar_one_or_none()

    if not confirmation_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate confirmation request not found",
        )

    # Build response
    response = CertificateConfirmationRequestResponse.model_validate(confirmation_request)

    # Add invoice if exists
    if confirmation_request.invoice:
        response.invoice = InvoiceResponse.model_validate(confirmation_request.invoice)

    # Add payment if exists
    if confirmation_request.payment:
        response.payment = PaymentResponse.model_validate(confirmation_request.payment)

    return response.model_dump()


@router.get("/certificate-requests/{request_id}", status_code=status.HTTP_200_OK)
async def get_certificate_request(
    request_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> dict:
    """Get certificate request details (System Admin)."""
    from app.schemas.certificate import CertificateRequestResponse
    from app.services.certificate_service import get_certificate_request_by_id

    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate request not found",
        )

    response = CertificateRequestResponse.model_validate(request)
    if request.examination_center:
        response.examination_center_name = request.examination_center.name

    return response.model_dump()


@router.get("/certificate-requests/{request_id}/pdf", status_code=status.HTTP_200_OK)
async def download_certificate_request_pdf(
    request_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> StreamingResponse:
    """Download certificate request details as PDF (System Admin)."""
    from app.services.certificate_service import get_certificate_request_by_id
    from app.services.certificate_pdf_service import generate_certificate_request_pdf
    from app.services.certificate_file_storage import CertificateFileStorageService
    from app.models import Invoice, Payment
    from sqlalchemy import select

    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate request not found",
        )

    # Ensure examination_center is loaded
    if request.examination_center_id:
        from app.models import School
        school_stmt = select(School).where(School.id == request.examination_center_id)
        school_result = await session.execute(school_stmt)
        school = school_result.scalar_one_or_none()
        if school:
            request.examination_center = school

    # Get invoice if exists
    invoice = None
    if request.id:
        invoice_stmt = select(Invoice).where(Invoice.certificate_request_id == request.id)
        invoice_result = await session.execute(invoice_stmt)
        invoice = invoice_result.scalar_one_or_none()

    # Get payment if exists
    payment = None
    if request.payment_id:
        payment_stmt = select(Payment).where(Payment.id == request.payment_id)
        payment_result = await session.execute(payment_stmt)
        payment = payment_result.scalar_one_or_none()

    # Retrieve photo and ID scan files
    photo_data = None
    id_scan_data = None
    file_storage = CertificateFileStorageService()

    try:
        if request.photograph_file_path:
            photo_data = await file_storage.retrieve(request.photograph_file_path)
    except Exception as e:
        logger.warning(f"Could not retrieve photo for request {request_id}: {e}")

    try:
        if request.national_id_file_path:
            id_scan_data = await file_storage.retrieve(request.national_id_file_path)
    except Exception as e:
        logger.warning(f"Could not retrieve ID scan for request {request_id}: {e}")

    # Retrieve certificate and candidate photo files if available (for confirmation/verification)
    certificate_data = None
    candidate_photo_data = None
    try:
        if request.certificate_file_path:
            certificate_data = await file_storage.retrieve(request.certificate_file_path)
    except Exception as e:
        logger.warning(f"Could not retrieve certificate scan for request {request_id}: {e}")

    try:
        if request.candidate_photograph_file_path:
            candidate_photo_data = await file_storage.retrieve(request.candidate_photograph_file_path)
    except Exception as e:
        logger.warning(f"Could not retrieve candidate photo for request {request_id}: {e}")

    # Generate PDF
    try:
        pdf_bytes = await generate_certificate_request_pdf(
            request,
            invoice,
            payment,
            photo_data=photo_data,
            id_scan_data=id_scan_data,
            certificate_data=certificate_data,
            candidate_photo_data=candidate_photo_data,
        )
    except Exception as e:
        logger.error(f"Failed to generate PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PDF document",
        )

    filename = f"certificate_request_{request.request_number}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# Bulk Certificate Confirmation PDF Endpoints

@router.get("/certificate-confirmations/{confirmation_id}/details.pdf", status_code=status.HTTP_200_OK)
async def download_confirmation_details_pdf(
    confirmation_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> StreamingResponse:
    """Download certificate confirmation/verification request details as a PDF (generated on demand; not saved)."""
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id
    from app.services.bulk_certificate_confirmation_pdf_service import generate_bulk_certificate_confirmation_pdf
    from app.models import Invoice, Payment, CertificateConfirmationRequest
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate confirmation request not found",
        )

    # Load relationships
    stmt = (
        select(CertificateConfirmationRequest)
        .where(CertificateConfirmationRequest.id == confirmation_id)
        .options(
            selectinload(CertificateConfirmationRequest.invoice),
            selectinload(CertificateConfirmationRequest.payment),
        )
    )
    result = await session.execute(stmt)
    confirmation_request = result.scalar_one_or_none()
    if not confirmation_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate confirmation request not found",
        )

    invoice = confirmation_request.invoice
    if not invoice and confirmation_request.invoice_id:
        invoice_result = await session.execute(select(Invoice).where(Invoice.id == confirmation_request.invoice_id))
        invoice = invoice_result.scalar_one_or_none()

    payment = confirmation_request.payment
    if not payment and confirmation_request.payment_id:
        payment_result = await session.execute(select(Payment).where(Payment.id == confirmation_request.payment_id))
        payment = payment_result.scalar_one_or_none()

    certificate_details = (
        confirmation_request.certificate_details
        if isinstance(confirmation_request.certificate_details, list)
        else []
    )

    try:
        pdf_bytes = await generate_bulk_certificate_confirmation_pdf(
            confirmation_request,
            invoice=invoice,
            payment=payment,
            certificate_details=certificate_details,
        )
    except Exception as e:
        logger.error(f"Failed to generate confirmation details PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PDF document",
        )

    filename = f"confirmation_details_{confirmation_request.request_number}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.post("/certificate-confirmations/{confirmation_id}/generate-pdf", status_code=status.HTTP_200_OK)
async def generate_confirmation_pdf(
    confirmation_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> dict:
    """Generate certificate confirmation PDF from template."""
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id
    from app.services.bulk_certificate_confirmation_pdf_service import (
        generate_bulk_certificate_confirmation_pdf,
        save_bulk_confirmation_pdf,
    )
    from app.models import Invoice, Payment
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate confirmation request not found",
        )

    # Load relationships
    from app.models import CertificateConfirmationRequest
    stmt = select(CertificateConfirmationRequest).where(
        CertificateConfirmationRequest.id == confirmation_id
    ).options(
        selectinload(CertificateConfirmationRequest.invoice),
        selectinload(CertificateConfirmationRequest.payment),
    )
    result = await session.execute(stmt)
    confirmation_request = result.scalar_one_or_none()

    if not confirmation_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate confirmation request not found",
        )

    # Get invoice if not loaded
    invoice = confirmation_request.invoice
    if not invoice and confirmation_request.invoice_id:
        invoice_stmt = select(Invoice).where(Invoice.id == confirmation_request.invoice_id)
        invoice_result = await session.execute(invoice_stmt)
        invoice = invoice_result.scalar_one_or_none()

    # Get payment if not loaded
    payment = confirmation_request.payment
    if not payment and confirmation_request.payment_id:
        payment_stmt = select(Payment).where(Payment.id == confirmation_request.payment_id)
        payment_result = await session.execute(payment_stmt)
        payment = payment_result.scalar_one_or_none()

    # Get certificate details from JSON field
    certificate_details = confirmation_request.certificate_details if isinstance(confirmation_request.certificate_details, list) else []

    # Generate PDF
    try:
        pdf_bytes = await generate_bulk_certificate_confirmation_pdf(
            confirmation_request,
            invoice=invoice,
            payment=payment,
            certificate_details=certificate_details,
        )
    except Exception as e:
        logger.error(f"Failed to generate bulk confirmation PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PDF document",
        )

    # Save PDF
    try:
        file_path = await save_bulk_confirmation_pdf(
            confirmation_request,
            pdf_bytes,
            generated_by_user_id=str(current_user.id),
        )
        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.error(f"Failed to save confirmation PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save PDF document",
        )

    return {
        "message": "PDF generated successfully",
        "file_path": file_path,
        "pdf_generated_at": confirmation_request.pdf_generated_at.isoformat() if confirmation_request.pdf_generated_at else None,
    }


@router.post("/certificate-confirmations/{confirmation_id}/upload-pdf", status_code=status.HTTP_200_OK)
async def upload_confirmation_pdf(
    confirmation_id: int,
    pdf_file: UploadFile = File(...),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> dict:
    """Upload certificate confirmation PDF file."""
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id
    from app.services.bulk_certificate_confirmation_pdf_service import save_bulk_confirmation_pdf
    from app.services.certificate_file_storage import CertificateFileStorageService

    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate confirmation request not found",
        )

    # Validate file type
    if pdf_file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a PDF",
        )

    # Read file content
    pdf_bytes = await pdf_file.read()

    # Validate file size (max 50MB)
    max_size = 50 * 1024 * 1024  # 50MB
    if len(pdf_bytes) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {max_size / (1024 * 1024)}MB",
        )

    # Save PDF
    try:
        file_path = await save_bulk_confirmation_pdf(
            confirmation_request,
            pdf_bytes,
            generated_by_user_id=str(current_user.id),
        )
        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.error(f"Failed to upload confirmation PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload PDF document",
        )

    return {
        "message": "PDF uploaded successfully",
        "file_path": file_path,
        "pdf_generated_at": confirmation_request.pdf_generated_at.isoformat() if confirmation_request.pdf_generated_at else None,
    }


@router.get("/certificate-confirmations/{confirmation_id}/pdf", status_code=status.HTTP_200_OK)
async def download_confirmation_pdf(
    confirmation_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> StreamingResponse:
    """Download certificate confirmation PDF (Admin)."""
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id
    from app.services.certificate_file_storage import CertificateFileStorageService

    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate confirmation request not found",
        )

    if not confirmation_request.pdf_file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not found. Please generate or upload a PDF first.",
        )

    # Retrieve PDF from storage
    file_storage = CertificateFileStorageService()
    try:
        pdf_bytes = await file_storage.retrieve(confirmation_request.pdf_file_path)
    except Exception as e:
        logger.error(f"Failed to retrieve confirmation PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve PDF document",
        )

    filename = f"confirmation_{confirmation_request.request_number}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/certificate-confirmations/{confirmation_id}/response/upload", status_code=status.HTTP_200_OK)
async def upload_confirmation_response(
    confirmation_id: int,
    response_file: UploadFile = File(...),
    response_notes: str | None = Form(None),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> dict:
    """Upload an admin response file for a certificate confirmation/verification request."""
    from datetime import datetime
    from app.models import CertificateConfirmationRequest, RequestStatus, TicketActivity, TicketActivityType
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id, update_confirmation_request_status
    from app.services.certificate_file_storage import CertificateFileStorageService

    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")

    if confirmation_request.status in (RequestStatus.PENDING_PAYMENT, RequestStatus.CANCELLED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot respond to this request in status: {confirmation_request.status.value}",
        )

    # Read file content
    file_bytes = await response_file.read()

    # Validate file size (max 50MB)
    max_size = 50 * 1024 * 1024  # 50MB
    if len(file_bytes) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {max_size / (1024 * 1024)}MB",
        )

    # Basic content-type allowlist (still allow unknown/empty types)
    allowed_types = {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/jpg",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain",
    }
    if response_file.content_type and response_file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {response_file.content_type}",
        )

    # Save response file
    storage = CertificateFileStorageService()
    filename = response_file.filename or f"confirmation_response_{confirmation_request.request_number}"
    try:
        response_path, _ = await storage.save_response_file(file_bytes, filename, confirmation_request.id)
    except Exception as e:
        logger.error(f"Failed to save response file: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save response file")

    # Update response metadata
    confirmation_request.response_file_path = response_path
    confirmation_request.response_file_name = filename
    confirmation_request.response_mime_type = response_file.content_type or "application/octet-stream"
    confirmation_request.response_source = "upload"
    confirmation_request.responded_at = datetime.utcnow()
    confirmation_request.responded_by_user_id = current_user.id
    confirmation_request.response_notes = response_notes

    # Mark as completed + audit trail
    await update_confirmation_request_status(
        session=session,
        confirmation_request=confirmation_request,
        status=RequestStatus.COMPLETED,
        user_id=str(current_user.id),
        notes=response_notes or f"Response uploaded: {filename}",
    )

    session.add(
        TicketActivity(
            ticket_type="certificate_confirmation_request",
            ticket_id=confirmation_request.id,
            activity_type=TicketActivityType.NOTE,
            user_id=current_user.id,
            comment=f"Response uploaded: {filename}",
        )
    )

    try:
        await session.commit()
        await session.refresh(confirmation_request)
    except Exception as e:
        await session.rollback()
        logger.error(f"Failed to commit response upload: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save response")

    return {
        "message": "Response uploaded successfully",
        "confirmation_id": confirmation_request.id,
        "request_number": confirmation_request.request_number,
        "response_file_name": confirmation_request.response_file_name,
        "responded_at": confirmation_request.responded_at.isoformat() if confirmation_request.responded_at else None,
    }


@router.post("/certificate-confirmations/{confirmation_id}/response/generate", status_code=status.HTTP_200_OK)
async def generate_confirmation_response(
    confirmation_id: int,
    payload: dict = Body(...),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> dict:
    """Generate an admin response PDF from a template and store it as the request response."""
    from datetime import datetime
    from app.models import CertificateConfirmationRequest, Invoice, Payment, RequestStatus, TicketActivity, TicketActivityType
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id, update_confirmation_request_status
    from app.services.certificate_confirmation_response_pdf_service import generate_confirmation_response_pdf
    from app.services.certificate_file_storage import CertificateFileStorageService
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")

    if confirmation_request.status in (RequestStatus.PENDING_PAYMENT, RequestStatus.CANCELLED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot respond to this request in status: {confirmation_request.status.value}",
        )

    # Check if response is signed - cannot modify signed responses
    if confirmation_request.response_signed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify response. Response has been signed and is locked.",
        )

    # Check if response is signed - cannot modify signed responses
    if confirmation_request.response_signed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify response. Response has been signed and is locked.",
        )

    # Load relationships (invoice/payment) for template context
    stmt = (
        select(CertificateConfirmationRequest)
        .where(CertificateConfirmationRequest.id == confirmation_id)
        .options(
            selectinload(CertificateConfirmationRequest.invoice),
            selectinload(CertificateConfirmationRequest.payment),
        )
    )
    result = await session.execute(stmt)
    confirmation_request = result.scalar_one_or_none()
    if not confirmation_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")

    invoice = confirmation_request.invoice
    if not invoice and confirmation_request.invoice_id:
        invoice_result = await session.execute(select(Invoice).where(Invoice.id == confirmation_request.invoice_id))
        invoice = invoice_result.scalar_one_or_none()

    payment = confirmation_request.payment
    if not payment and confirmation_request.payment_id:
        payment_result = await session.execute(select(Payment).where(Payment.id == confirmation_request.payment_id))
        payment = payment_result.scalar_one_or_none()

    # Generate PDF
    try:
        pdf_bytes = await generate_confirmation_response_pdf(
            confirmation_request,
            invoice=invoice,
            payment=payment,
            response_payload=payload,
        )
    except Exception as e:
        logger.error(f"Failed to generate confirmation response PDF: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to generate response PDF")

    # Save response file
    storage = CertificateFileStorageService()
    filename = f"confirmation_response_{confirmation_request.request_number}.pdf"
    try:
        response_path, _ = await storage.save_response_file(pdf_bytes, filename, confirmation_request.id)
    except Exception as e:
        logger.error(f"Failed to save generated response file: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save response file")

    # Store response reference number (separate from request_number)
    # If provided in payload, use it; otherwise default to request_number
    response_reference_number = payload.get("reference_number")
    if response_reference_number and response_reference_number.strip():
        confirmation_request.response_reference_number = response_reference_number.strip()
    else:
        confirmation_request.response_reference_number = confirmation_request.request_number

    confirmation_request.response_file_path = response_path
    confirmation_request.response_file_name = filename
    confirmation_request.response_mime_type = "application/pdf"
    confirmation_request.response_source = "template"
    confirmation_request.responded_at = datetime.utcnow()
    confirmation_request.responded_by_user_id = current_user.id
    confirmation_request.response_payload = payload

    await update_confirmation_request_status(
        session=session,
        confirmation_request=confirmation_request,
        status=RequestStatus.COMPLETED,
        user_id=str(current_user.id),
        notes="Response generated from template",
    )

    session.add(
        TicketActivity(
            ticket_type="certificate_confirmation_request",
            ticket_id=confirmation_request.id,
            activity_type=TicketActivityType.NOTE,
            user_id=current_user.id,
            comment="Response generated from template",
        )
    )

    try:
        await session.commit()
        await session.refresh(confirmation_request)
    except Exception as e:
        await session.rollback()
        logger.error(f"Failed to commit response generation: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save response")

    return {
        "message": "Response generated successfully",
        "confirmation_id": confirmation_request.id,
        "request_number": confirmation_request.request_number,
        "response_file_name": confirmation_request.response_file_name,
        "responded_at": confirmation_request.responded_at.isoformat() if confirmation_request.responded_at else None,
    }


@router.get("/certificate-confirmations/{confirmation_id}/response", status_code=status.HTTP_200_OK)
async def download_confirmation_response(
    confirmation_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> StreamingResponse:
    """Download stored admin response file for a confirmation/verification request (Admin)."""
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id
    from app.services.certificate_file_storage import CertificateFileStorageService

    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")

    if not confirmation_request.response_file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Response not found for this request")

    storage = CertificateFileStorageService()
    try:
        file_bytes = await storage.retrieve(confirmation_request.response_file_path)
    except Exception as e:
        logger.error(f"Failed to retrieve response file: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve response file")

    filename = confirmation_request.response_file_name or f"confirmation_response_{confirmation_request.request_number}"
    media_type = confirmation_request.response_mime_type or "application/octet-stream"
    return StreamingResponse(
        iter([file_bytes]),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/certificate-confirmations/{confirmation_id}/response/sign", status_code=status.HTTP_200_OK)
async def sign_confirmation_response(
    confirmation_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> dict:
    """Sign a confirmation response to lock it from modification and digitally sign the PDF."""
    from datetime import datetime
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id
    from app.services.certificate_file_storage import CertificateFileStorageService
    from app.services.pdf_signing_service import sign_pdf, PdfSigningError, CertificateLoadError
    from app.models import TicketActivity, TicketActivityType
    from pypdf import PdfReader

    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")

    if not confirmation_request.response_file_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot sign response. No response file exists for this request.",
        )

    if confirmation_request.response_signed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Response has already been signed.",
        )

    # Load the PDF file
    storage = CertificateFileStorageService()
    try:
        pdf_bytes = await storage.retrieve(confirmation_request.response_file_path)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Response PDF file not found in storage.",
        )
    except Exception as e:
        logger.error(f"Failed to load PDF file: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load response PDF file.",
        )

    # Check if PDF is already signed (has signature field)
    try:
        pdf_reader = PdfReader(pdf_bytes)
        if pdf_reader.metadata and "/SigFlags" in pdf_reader.trailer.get("/Root", {}).get("/AcroForm", {}):
            # PDF may already have signature field
            logger.warning(f"PDF for confirmation {confirmation_id} may already have signature field")
    except Exception:
        # If we can't read the PDF, continue anyway - signing will fail with better error
        pass

    # Check if PDF signing is enabled and configured
    from app.config import settings

    pdf_signing_enabled = getattr(settings, "pdf_signing_enabled", False)
    pdf_signing_certificate_path = getattr(settings, "pdf_signing_certificate_path", "")

    # Sign the PDF digitally if enabled and configured
    signer_name = current_user.full_name or "System Administrator"
    signer_title = None  # Could be extracted from user model if available

    if pdf_signing_enabled:
        if not pdf_signing_certificate_path:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "PDF signing is enabled but certificate is not configured. "
                    "Please set PDF_SIGNING_CERTIFICATE_PATH environment variable. "
                    "Alternatively, set PDF_SIGNING_ENABLED=false to disable PDF signing."
                ),
            )

        try:
            signed_pdf_bytes = sign_pdf(pdf_bytes, signer_name, signer_title)
        except CertificateLoadError as e:
            logger.error(f"Certificate loading error: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to load signing certificate: {str(e)}. Please check PDF signing configuration.",
            )
        except PdfSigningError as e:
            logger.error(f"PDF signing error: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to sign PDF: {str(e)}",
            )
        except Exception as e:
            logger.error(f"Unexpected error during PDF signing: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An unexpected error occurred while signing the PDF.",
            )

        # Save the signed PDF (replace the existing file)
        try:
            # Backup the original filename
            original_filename = confirmation_request.response_file_name or f"confirmation_response_{confirmation_request.request_number}.pdf"

            # Save signed PDF with same filename (replaces original)
            signed_file_path, signed_checksum = await storage.save_response_file(
                signed_pdf_bytes, original_filename, confirmation_request.id
            )

            # Update the response_file_path to point to the signed version
            confirmation_request.response_file_path = signed_file_path
            signing_comment = "Response signed and locked (PDF digitally signed)"
        except Exception as e:
            logger.error(f"Failed to save signed PDF: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save signed PDF file.",
            )
    else:
        # PDF signing is disabled - just mark as signed in database without signing PDF
        logger.info(f"PDF signing is disabled. Marking response as signed without PDF signing for confirmation {confirmation_id}")
        signing_comment = "Response signed and locked"

    # Update database: mark as signed
    confirmation_request.response_signed = True
    confirmation_request.response_signed_at = datetime.utcnow()
    confirmation_request.response_signed_by_user_id = current_user.id

    # Create activity record
    session.add(
        TicketActivity(
            ticket_type="certificate_confirmation_request",
            ticket_id=confirmation_request.id,
            activity_type=TicketActivityType.NOTE,
            user_id=current_user.id,
            comment=signing_comment,
        )
    )

    try:
        await session.commit()
        await session.refresh(confirmation_request)
    except Exception as e:
        await session.rollback()
        logger.error(f"Failed to update database after signing: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to sign response")

    return {
        "message": "Response signed successfully",
        "confirmation_id": confirmation_request.id,
        "request_number": confirmation_request.request_number,
        "response_signed": True,
        "response_signed_at": confirmation_request.response_signed_at.isoformat() if confirmation_request.response_signed_at else None,
        "response_signed_by_user_id": str(confirmation_request.response_signed_by_user_id) if confirmation_request.response_signed_by_user_id else None,
    }


@router.get("/pdf-signing/certificate/validate", status_code=status.HTTP_200_OK)
async def validate_signing_certificate(
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> dict:
    """Validate the configured PDF signing certificate."""
    from app.services.pdf_signing_service import get_certificate_info, validate_certificate

    try:
        # Validate certificate
        validation_result = validate_certificate()

        # Get certificate information
        try:
            cert_info = get_certificate_info()
        except Exception as e:
            logger.warning(f"Could not get certificate info: {e}")
            cert_info = None

        return {
            "valid": validation_result["valid"],
            "errors": validation_result["errors"],
            "warnings": validation_result["warnings"],
            "certificate_info": cert_info,
            "validation_info": validation_result["info"],
        }
    except Exception as e:
        logger.error(f"Error validating certificate: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to validate certificate: {str(e)}",
        )


@router.post("/certificate-confirmations/{confirmation_id}/response/revoke", status_code=status.HTTP_200_OK)
async def revoke_confirmation_response(
    confirmation_id: int,
    revocation_reason: str = Body(..., embed=True, description="Reason for revoking the response"),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> dict:
    """Revoke a signed confirmation response (System Admin). Once revoked, requesters can no longer view or download the response. Requires a reason."""
    from datetime import datetime
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id
    from app.models import TicketActivity, TicketActivityType

    if not revocation_reason or not revocation_reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Revocation reason is required.",
        )

    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")

    if not confirmation_request.response_file_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot revoke response. No response file exists for this request.",
        )

    if not confirmation_request.response_signed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot revoke response. Response must be signed before it can be revoked.",
        )

    if confirmation_request.response_revoked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Response has already been revoked.",
        )

    # Revoke the response and clear signed status
    confirmation_request.response_revoked = True
    confirmation_request.response_revoked_at = datetime.utcnow()
    confirmation_request.response_revoked_by_user_id = current_user.id
    confirmation_request.response_revocation_reason = revocation_reason.strip()
    # Remove signed and locked status when revoked
    confirmation_request.response_signed = False
    confirmation_request.response_signed_at = None
    confirmation_request.response_signed_by_user_id = None

    # Create activity record
    session.add(
        TicketActivity(
            ticket_type="certificate_confirmation_request",
            ticket_id=confirmation_request.id,
            activity_type=TicketActivityType.NOTE,
            user_id=current_user.id,
            comment=f"Response revoked - requester access removed. Reason: {revocation_reason.strip()}",
        )
    )

    try:
        await session.commit()
        await session.refresh(confirmation_request)
    except Exception as e:
        await session.rollback()
        logger.error(f"Failed to revoke response: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to revoke response")

    return {
        "message": "Response revoked successfully",
        "confirmation_id": confirmation_request.id,
        "request_number": confirmation_request.request_number,
        "response_revoked": True,
        "response_revoked_at": confirmation_request.response_revoked_at.isoformat() if confirmation_request.response_revoked_at else None,
        "response_revoked_by_user_id": str(confirmation_request.response_revoked_by_user_id) if confirmation_request.response_revoked_by_user_id else None,
        "response_revocation_reason": confirmation_request.response_revocation_reason,
    }


@router.post("/certificate-confirmations/{confirmation_id}/response/unrevoke", status_code=status.HTTP_200_OK)
async def unrevoke_confirmation_response(
    confirmation_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> dict:
    """Unrevoke a revoked confirmation response (System Admin). This allows the response to be signed again and made available to requesters."""
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id
    from app.models import TicketActivity, TicketActivityType

    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")

    if not confirmation_request.response_revoked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Response is not revoked. Only revoked responses can be unrevoked.",
        )

    # Unrevoke the response
    confirmation_request.response_revoked = False
    confirmation_request.response_revoked_at = None
    confirmation_request.response_revoked_by_user_id = None
    confirmation_request.response_revocation_reason = None
    # Note: We don't automatically re-sign the response. Admin needs to sign it again after corrections

    # Create activity record
    session.add(
        TicketActivity(
            ticket_type="certificate_confirmation_request",
            ticket_id=confirmation_request.id,
            activity_type=TicketActivityType.NOTE,
            user_id=current_user.id,
            comment="Response unrevoked - corrections made, ready for re-signing",
        )
    )

    try:
        await session.commit()
        await session.refresh(confirmation_request)
    except Exception as e:
        await session.rollback()
        logger.error(f"Failed to unrevoke response: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to unrevoke response")

    return {
        "message": "Response unrevoked successfully. The response can now be signed again after corrections.",
        "confirmation_id": confirmation_request.id,
        "request_number": confirmation_request.request_number,
        "response_revoked": False,
    }


@router.post("/certificate-requests/{request_id}/begin-process", status_code=status.HTTP_200_OK)
async def begin_process_certificate_request(
    request_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    ticket_type: str | None = Query(
        None,
        description="Optional ticket type override: 'certificate_request' or 'certificate_confirmation_request'",
    ),
) -> dict:
    """Begin processing a certificate request (System Admin)."""
    from app.schemas.certificate import CertificateRequestResponse
    from app.services.certificate_service import begin_processing

    try:
        # If explicitly asked, route to the right model/service.
        if ticket_type and ticket_type.strip().lower() == "certificate_confirmation_request":
            from app.schemas.certificate import CertificateConfirmationRequestResponse
            from app.services.certificate_confirmation_service import begin_processing_confirmation

            req = await begin_processing_confirmation(session, request_id, str(current_user.id))
            await session.commit()
            await session.refresh(req)
            return CertificateConfirmationRequestResponse.model_validate(req).model_dump()

        # Auto-detect confirmation requests (single or bulk): if a confirmation exists with this ID,
        # prefer it (admin UI often uses the unified /certificate-requests routes for mixed lists).
        from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id, begin_processing_confirmation
        from app.models import CertificateConfirmationRequest
        from sqlalchemy.orm import selectinload

        conf = await get_certificate_confirmation_by_id(session, request_id)
        if conf:
            # Any confirmation request (single or bulk) should use the confirmation service
            from app.schemas.certificate import CertificateConfirmationRequestResponse

            req = await begin_processing_confirmation(session, request_id, str(current_user.id))
            await session.commit()

            # Reload with relationships for proper serialization
            stmt = select(CertificateConfirmationRequest).where(
                CertificateConfirmationRequest.id == request_id
            ).options(
                selectinload(CertificateConfirmationRequest.invoice),
                selectinload(CertificateConfirmationRequest.payment),
            )
            result = await session.execute(stmt)
            req = result.scalar_one_or_none()
            if not req:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Confirmation request not found after processing")

            return CertificateConfirmationRequestResponse.model_validate(req).model_dump()

        # Default: normal certificate/attestation request
        request = await begin_processing(session, request_id, str(current_user.id))
        await session.commit()
        await session.refresh(request)

        response = CertificateRequestResponse.model_validate(request)
        if request.examination_center:
            response.examination_center_name = request.examination_center.name

        return response.model_dump()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to begin processing: {str(e)}",
        )


@router.post("/certificate-confirmations/{confirmation_id}/begin-process", status_code=status.HTTP_200_OK)
async def begin_process_confirmation_request(
    confirmation_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> dict:
    """Begin processing a confirmation/verification request (System Admin)."""
    from app.schemas.certificate import CertificateConfirmationRequestResponse
    from app.services.certificate_confirmation_service import begin_processing_confirmation
    from app.models import CertificateConfirmationRequest
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    try:
        await begin_processing_confirmation(session, confirmation_id, str(current_user.id))
        await session.commit()

        # Reload with relationships to avoid async lazy-load (MissingGreenlet) during Pydantic validation
        stmt = (
            select(CertificateConfirmationRequest)
            .where(CertificateConfirmationRequest.id == confirmation_id)
            .options(
                selectinload(CertificateConfirmationRequest.invoice),
                selectinload(CertificateConfirmationRequest.payment),
            )
        )
        result = await session.execute(stmt)
        req = result.scalar_one_or_none()
        if not req:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")

        return CertificateConfirmationRequestResponse.model_validate(req).model_dump()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to begin processing: {str(e)}",
        )


@router.post("/certificate-requests/{request_id}/send-to-dispatch", status_code=status.HTTP_200_OK)
async def send_to_dispatch(
    request_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    ticket_type: str | None = Query(
        None,
        description="Optional ticket type override: 'certificate_request' or 'certificate_confirmation_request'",
    ),
) -> dict:
    """Mark certificate request as ready for dispatch (System Admin)."""
    from app.schemas.certificate import CertificateRequestResponse
    from app.services.certificate_service import send_to_dispatch

    try:
        if ticket_type and ticket_type.strip().lower() == "certificate_confirmation_request":
            from app.models import CertificateConfirmationRequest
            from app.schemas.certificate import CertificateConfirmationRequestResponse
            from app.services.certificate_confirmation_service import send_confirmation_to_dispatch
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload

            await send_confirmation_to_dispatch(session, request_id, str(current_user.id))
            await session.commit()

            stmt = (
                select(CertificateConfirmationRequest)
                .where(CertificateConfirmationRequest.id == request_id)
                .options(
                    selectinload(CertificateConfirmationRequest.invoice),
                    selectinload(CertificateConfirmationRequest.payment),
                )
            )
            result = await session.execute(stmt)
            req = result.scalar_one_or_none()
            if not req:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")
            return CertificateConfirmationRequestResponse.model_validate(req).model_dump()

        # Auto-detect confirmation requests by ID and route them
        from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id, send_confirmation_to_dispatch
        conf = await get_certificate_confirmation_by_id(session, request_id)
        if conf:
            from app.models import CertificateConfirmationRequest
            from app.schemas.certificate import CertificateConfirmationRequestResponse
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload

            await send_confirmation_to_dispatch(session, request_id, str(current_user.id))
            await session.commit()

            stmt = (
                select(CertificateConfirmationRequest)
                .where(CertificateConfirmationRequest.id == request_id)
                .options(
                    selectinload(CertificateConfirmationRequest.invoice),
                    selectinload(CertificateConfirmationRequest.payment),
                )
            )
            result = await session.execute(stmt)
            req = result.scalar_one_or_none()
            if not req:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")
            return CertificateConfirmationRequestResponse.model_validate(req).model_dump()

        request = await send_to_dispatch(session, request_id, str(current_user.id))
        await session.commit()
        await session.refresh(request)

        response = CertificateRequestResponse.model_validate(request)
        if request.examination_center:
            response.examination_center_name = request.examination_center.name

        return response.model_dump()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send to dispatch: {str(e)}",
        )


@router.post("/certificate-confirmations/{confirmation_id}/send-to-dispatch", status_code=status.HTTP_200_OK)
async def send_confirmation_to_dispatch_admin(
    confirmation_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> dict:
    """Mark confirmation/verification request as ready for dispatch (System Admin)."""
    from app.models import CertificateConfirmationRequest
    from app.schemas.certificate import CertificateConfirmationRequestResponse
    from app.services.certificate_confirmation_service import send_confirmation_to_dispatch
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    try:
        await send_confirmation_to_dispatch(session, confirmation_id, str(current_user.id))
        await session.commit()

        stmt = (
            select(CertificateConfirmationRequest)
            .where(CertificateConfirmationRequest.id == confirmation_id)
            .options(
                selectinload(CertificateConfirmationRequest.invoice),
                selectinload(CertificateConfirmationRequest.payment),
            )
        )
        result = await session.execute(stmt)
        req = result.scalar_one_or_none()
        if not req:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")
        return CertificateConfirmationRequestResponse.model_validate(req).model_dump()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send to dispatch: {str(e)}",
        )


@router.put("/certificate-requests/{request_id}", status_code=status.HTTP_200_OK)
async def update_certificate_request(
    request_id: int,
    update_data: dict = Body(...),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> dict:
    """Update certificate request or confirmation request (System Admin)."""
    from app.schemas.certificate import CertificateRequestResponse, CertificateConfirmationRequestResponse
    from app.services.certificate_service import get_certificate_request_by_id, update_request_status
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id, update_confirmation_request_status
    from app.models import RequestStatus, TicketPriority, CertificateConfirmationRequest
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from uuid import UUID

    # Auto-detect confirmation requests
    conf = await get_certificate_confirmation_by_id(session, request_id)
    if conf:
        # Update confirmation request
        if "status" in update_data:
            try:
                new_status = RequestStatus(update_data["status"])
                await update_confirmation_request_status(
                    session=session,
                    confirmation_request=conf,
                    status=new_status,
                    user_id=str(current_user.id) if current_user else None,
                    notes=update_data.get("notes"),
                )
            except ValueError as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status: {update_data['status']}",
                )

        if "tracking_number" in update_data:
            conf.tracking_number = update_data["tracking_number"]

        if "notes" in update_data and "status" not in update_data:
            conf.notes = update_data["notes"]

        if "assigned_to_user_id" in update_data:
            assigned_to = update_data["assigned_to_user_id"]
            if assigned_to:
                try:
                    conf.assigned_to_user_id = UUID(assigned_to)
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid assigned_to_user_id format",
                    )
            else:
                conf.assigned_to_user_id = None

        if "priority" in update_data:
            try:
                conf.priority = TicketPriority(update_data["priority"])
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid priority: {update_data['priority']}",
                )

        await session.commit()

        # Re-query with eager loading for serialization
        stmt = (
            select(CertificateConfirmationRequest)
            .where(CertificateConfirmationRequest.id == request_id)
            .options(
                selectinload(CertificateConfirmationRequest.invoice),
                selectinload(CertificateConfirmationRequest.payment),
            )
        )
        result = await session.execute(stmt)
        req = result.scalar_one_or_none()
        if not req:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Confirmation request not found")
        return CertificateConfirmationRequestResponse.model_validate(req).model_dump()

    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate request not found",
        )

    # Update status with history tracking
    if "status" in update_data:
        try:
            new_status = RequestStatus(update_data["status"])
            await update_request_status(
                session,
                request_id,
                new_status,
                user_id=str(current_user.id) if current_user else None,
                notes=update_data.get("notes"),
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {update_data['status']}",
            )

    if "tracking_number" in update_data:
        request.tracking_number = update_data["tracking_number"]

    if "notes" in update_data and "status" not in update_data:
        request.notes = update_data["notes"]

    if "assigned_to_user_id" in update_data:
        assigned_to = update_data["assigned_to_user_id"]
        if assigned_to:
            try:
                request.assigned_to_user_id = UUID(assigned_to)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid assigned_to_user_id format",
                )
        else:
            request.assigned_to_user_id = None

    if "priority" in update_data:
        try:
            request.priority = TicketPriority(update_data["priority"])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid priority: {update_data['priority']}",
            )

    await session.commit()
    await session.refresh(request)

    response = CertificateRequestResponse.model_validate(request)
    if request.examination_center:
        response.examination_center_name = request.examination_center.name

    return response.model_dump()


# Ticket Management Endpoints

@router.post("/certificate-requests/{request_id}/assign", status_code=status.HTTP_200_OK)
async def assign_ticket(
    request_id: int,
    assignment_data: dict = Body(...),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> dict:
    """Assign ticket to a user (System Admin). Supports both certificate requests and confirmation requests."""
    from app.schemas.certificate import CertificateRequestResponse, CertificateConfirmationRequestResponse
    from app.services.certificate_service import assign_ticket, get_certificate_request_by_id
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id, assign_confirmation_ticket
    from app.models import CertificateConfirmationRequest
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    assigned_to_user_id = assignment_data.get("assigned_to_user_id")
    if not assigned_to_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="assigned_to_user_id is required",
        )

    # Auto-detect confirmation requests
    conf = await get_certificate_confirmation_by_id(session, request_id)
    if conf:
        try:
            req = await assign_confirmation_ticket(
                session,
                request_id,
                str(current_user.id) if current_user else None,
                assigned_to_user_id,
            )
            await session.commit()

            stmt = (
                select(CertificateConfirmationRequest)
                .where(CertificateConfirmationRequest.id == request_id)
                .options(
                    selectinload(CertificateConfirmationRequest.invoice),
                    selectinload(CertificateConfirmationRequest.payment),
                )
            )
            result = await session.execute(stmt)
            req = result.scalar_one_or_none()
            if not req:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Confirmation request not found")
            return CertificateConfirmationRequestResponse.model_validate(req).model_dump()
        except ValueError as e:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except Exception as e:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to assign ticket: {str(e)}",
            )

    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate request not found",
        )

    try:
        request = await assign_ticket(
            session,
            request_id,
            str(current_user.id) if current_user else None,
            assigned_to_user_id,
        )
        await session.commit()
        await session.refresh(request)

        response = CertificateRequestResponse.model_validate(request)
        if request.examination_center:
            response.examination_center_name = request.examination_center.name

        return response.model_dump()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assign ticket: {str(e)}",
        )


@router.post("/certificate-requests/{request_id}/unassign", status_code=status.HTTP_200_OK)
async def unassign_ticket(
    request_id: int,
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> dict:
    """Unassign ticket (System Admin). Supports both certificate requests and confirmation requests."""
    from app.schemas.certificate import CertificateRequestResponse, CertificateConfirmationRequestResponse
    from app.services.certificate_service import unassign_ticket, get_certificate_request_by_id
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id, unassign_confirmation_ticket
    from app.models import CertificateConfirmationRequest
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    # Auto-detect confirmation requests
    conf = await get_certificate_confirmation_by_id(session, request_id)
    if conf:
        try:
            req = await unassign_confirmation_ticket(
                session,
                request_id,
                str(current_user.id) if current_user else None,
            )
            await session.commit()

            stmt = (
                select(CertificateConfirmationRequest)
                .where(CertificateConfirmationRequest.id == request_id)
                .options(
                    selectinload(CertificateConfirmationRequest.invoice),
                    selectinload(CertificateConfirmationRequest.payment),
                )
            )
            result = await session.execute(stmt)
            req = result.scalar_one_or_none()
            if not req:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Confirmation request not found")
            return CertificateConfirmationRequestResponse.model_validate(req).model_dump()
        except ValueError as e:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except Exception as e:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to unassign ticket: {str(e)}",
            )

    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate request not found",
        )

    try:
        request = await unassign_ticket(
            session,
            request_id,
            str(current_user.id) if current_user else None,
        )
        await session.commit()
        await session.refresh(request)

        response = CertificateRequestResponse.model_validate(request)
        if request.examination_center:
            response.examination_center_name = request.examination_center.name

        return response.model_dump()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unassign ticket: {str(e)}",
        )


@router.post("/certificate-requests/{request_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_ticket_comment(
    request_id: int,
    comment_data: dict = Body(...),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> dict:
    """Add a comment to a ticket (System Admin). Supports both certificate requests and confirmation requests."""
    from app.schemas.certificate import TicketActivityResponse
    from app.services.certificate_service import add_ticket_comment
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id, add_confirmation_comment

    comment = comment_data.get("comment")
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="comment is required",
        )

    # Auto-detect confirmation requests
    conf = await get_certificate_confirmation_by_id(session, request_id)
    if conf:
        try:
            activity = await add_confirmation_comment(
                session,
                request_id,
                str(current_user.id) if current_user else None,
                comment,
            )
            await session.commit()
            await session.refresh(activity)

            response = TicketActivityResponse.model_validate(activity)
            if activity.user:
                response.user_name = activity.user.full_name

            return response.model_dump()
        except ValueError as e:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except Exception as e:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to add comment: {str(e)}",
            )

    try:
        activity = await add_ticket_comment(
            session,
            request_id,
            str(current_user.id) if current_user else None,
            comment,
        )
        await session.commit()
        await session.refresh(activity)

        response = TicketActivityResponse.model_validate(activity)
        if activity.user:
            response.user_name = activity.user.full_name

        return response.model_dump()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add comment: {str(e)}",
        )


@router.get("/certificate-requests/{request_id}/activities", status_code=status.HTTP_200_OK)
async def get_ticket_activities(
    request_id: int,
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
    limit: int = Query(100, ge=1, le=500),
    ticket_type: str | None = Query(None, description="Ticket type: 'certificate_request' or 'certificate_confirmation_request'"),
) -> dict:
    """Get activity feed for a ticket (System Admin). Supports both certificate requests and confirmation requests."""
    from app.schemas.certificate import TicketActivityResponse
    from app.services.certificate_service import get_ticket_activities, get_certificate_request_by_id
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id
    from app.models import TicketActivity, CertificateRequest, CertificateConfirmationRequest
    from sqlalchemy import select, and_
    from sqlalchemy.orm import selectinload

    # Determine ticket type
    if not ticket_type:
        # Try to find the request to determine type
        cert_request = await get_certificate_request_by_id(session, request_id)
        if cert_request:
            ticket_type = "certificate_request"
        else:
            conf_request = await get_certificate_confirmation_by_id(session, request_id)
            if conf_request:
                ticket_type = "certificate_confirmation_request"
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Request not found",
                )
    elif ticket_type not in ("certificate_request", "certificate_confirmation_request"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ticket_type. Must be 'certificate_request' or 'certificate_confirmation_request'",
        )

    # Verify request exists
    if ticket_type == "certificate_request":
        request = await get_certificate_request_by_id(session, request_id)
        if not request:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Certificate request not found",
            )
        # Use existing service function which filters by ticket_type
        activities = await get_ticket_activities(session, request_id, limit)
    else:
        # Confirmation request
        request = await get_certificate_confirmation_by_id(session, request_id)
        if not request:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Certificate confirmation request not found",
            )
        # Query activities for confirmation request
        stmt = (
            select(TicketActivity)
            .where(
                and_(
                    TicketActivity.ticket_id == request_id,
                    TicketActivity.ticket_type == "certificate_confirmation_request"
                )
            )
            .options(
                selectinload(TicketActivity.user),
            )
            .order_by(TicketActivity.created_at.desc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        activities = list(result.scalars().all())

    items = []
    for activity in activities:
        item = TicketActivityResponse.model_validate(activity)
        if activity.user:
            item.user_name = activity.user.full_name
        items.append(item.model_dump())

    return {"items": items, "total": len(items)}


@router.get("/certificate-requests/{request_id}/status-history", status_code=status.HTTP_200_OK)
async def get_ticket_status_history(
    request_id: int,
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
    limit: int = Query(100, ge=1, le=500),
) -> dict:
    """Get status transition history for a ticket (System Admin). Supports both certificate requests and confirmation requests."""
    from app.schemas.certificate import TicketStatusHistoryResponse
    from app.services.certificate_service import get_ticket_status_history, get_certificate_request_by_id
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id
    from app.models import TicketStatusHistory
    from sqlalchemy import select, and_
    from sqlalchemy.orm import selectinload

    # Auto-detect confirmation requests
    conf = await get_certificate_confirmation_by_id(session, request_id)
    if conf:
        stmt = (
            select(TicketStatusHistory)
            .where(
                and_(
                    TicketStatusHistory.ticket_id == request_id,
                    TicketStatusHistory.ticket_type == "certificate_confirmation_request"
                )
            )
            .options(
                selectinload(TicketStatusHistory.changed_by),
            )
            .order_by(TicketStatusHistory.created_at.desc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        history = list(result.scalars().all())
    else:
        request = await get_certificate_request_by_id(session, request_id)
        if not request:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Certificate request not found",
            )
        history = await get_ticket_status_history(session, request_id, limit)

    items = []
    for entry in history:
        item = TicketStatusHistoryResponse.model_validate(entry)
        if entry.changed_by:
            item.changed_by_name = entry.changed_by.full_name
        items.append(item.model_dump())

    return {"items": items, "total": len(items)}


# Dispatch Endpoints (Admin staff)

@router.get("/dispatch/certificate-requests", status_code=status.HTTP_200_OK)
async def list_dispatch_requests(
    session: DBSessionDep,
    current_user: AdminDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    """List certificate requests ready for dispatch (Admin)."""
    from app.schemas.certificate import CertificateRequestListResponse, CertificateRequestResponse
    from app.models import CertificateRequest, RequestStatus

    # Database column is VARCHAR, use cast and ilike for case-insensitive comparison
    stmt = (
        select(CertificateRequest)
        .where(cast(CertificateRequest.status, String).ilike(RequestStatus.READY_FOR_DISPATCH.value))
        .options(
            selectinload(CertificateRequest.examination_center),
        )
        .order_by(CertificateRequest.created_at.desc())
    )

    # Get total count
    count_stmt = select(func.count(CertificateRequest.id)).where(
        cast(CertificateRequest.status, String).ilike(RequestStatus.READY_FOR_DISPATCH.value)
    )
    total_result = await session.execute(count_stmt)
    total = total_result.scalar() or 0

    # Paginate
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await session.execute(stmt)
    requests = list(result.scalars().all())

    items = []
    for req in requests:
        item = CertificateRequestResponse.model_validate(req)
        if req.examination_center:
            item.examination_center_name = req.examination_center.name
        items.append(item.model_dump())

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return CertificateRequestListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    ).model_dump()


@router.post("/dispatch/certificate-requests/{request_id}/dispatch", status_code=status.HTTP_200_OK)
async def dispatch_certificate_request(
    request_id: int,
    dispatch_data: dict | None = Body(None),
    session: DBSessionDep = None,
    current_user: AdminDep = None,
) -> dict:
    """Dispatch a certificate request or confirmation request (Admin)."""
    from app.schemas.certificate import CertificateRequestResponse, CertificateConfirmationRequestResponse
    from app.services.certificate_service import dispatch_request
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id, dispatch_confirmation_request
    from app.models import CertificateConfirmationRequest
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    try:
        tracking_number = dispatch_data.get("tracking_number") if dispatch_data else None

        # Auto-detect confirmation requests
        conf = await get_certificate_confirmation_by_id(session, request_id)
        if conf:
            req = await dispatch_confirmation_request(session, request_id, str(current_user.id), tracking_number)
            await session.commit()

            stmt = (
                select(CertificateConfirmationRequest)
                .where(CertificateConfirmationRequest.id == request_id)
                .options(
                    selectinload(CertificateConfirmationRequest.invoice),
                    selectinload(CertificateConfirmationRequest.payment),
                )
            )
            result = await session.execute(stmt)
            req = result.scalar_one_or_none()
            if not req:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Confirmation request not found")
            return CertificateConfirmationRequestResponse.model_validate(req).model_dump()

        request = await dispatch_request(session, request_id, str(current_user.id), tracking_number)
        await session.commit()
        await session.refresh(request)

        response = CertificateRequestResponse.model_validate(request)
        if request.examination_center:
            response.examination_center_name = request.examination_center.name

        return response.model_dump()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to dispatch request: {str(e)}",
        )


@router.post("/dispatch/certificate-requests/{request_id}/complete", status_code=status.HTTP_200_OK)
async def complete_certificate_request(
    request_id: int,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Mark certificate request or confirmation request as completed (Admin)."""
    from app.schemas.certificate import CertificateRequestResponse, CertificateConfirmationRequestResponse
    from app.services.certificate_service import complete_request
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id, complete_confirmation_request
    from app.models import CertificateConfirmationRequest
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    try:
        # Auto-detect confirmation requests
        conf = await get_certificate_confirmation_by_id(session, request_id)
        if conf:
            req = await complete_confirmation_request(session, request_id, str(current_user.id))
            await session.commit()

            stmt = (
                select(CertificateConfirmationRequest)
                .where(CertificateConfirmationRequest.id == request_id)
                .options(
                    selectinload(CertificateConfirmationRequest.invoice),
                    selectinload(CertificateConfirmationRequest.payment),
                )
            )
            result = await session.execute(stmt)
            req = result.scalar_one_or_none()
            if not req:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Confirmation request not found")
            return CertificateConfirmationRequestResponse.model_validate(req).model_dump()

        request = await complete_request(session, request_id, str(current_user.id))
        await session.commit()
        await session.refresh(request)

        response = CertificateRequestResponse.model_validate(request)
        if request.examination_center:
            response.examination_center_name = request.examination_center.name

        return response.model_dump()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to complete request: {str(e)}",
        )


@router.post("/dispatch/certificate-requests/{request_id}/mark-received", status_code=status.HTTP_200_OK)
async def mark_received(
    request_id: int,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Mark certificate request or confirmation request as received (Admin)."""
    from app.schemas.certificate import CertificateRequestResponse, CertificateConfirmationRequestResponse
    from app.services.certificate_service import mark_received
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id, mark_confirmation_received
    from app.models import CertificateConfirmationRequest
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    try:
        # Auto-detect confirmation requests
        conf = await get_certificate_confirmation_by_id(session, request_id)
        if conf:
            req = await mark_confirmation_received(session, request_id, str(current_user.id))
            await session.commit()

            stmt = (
                select(CertificateConfirmationRequest)
                .where(CertificateConfirmationRequest.id == request_id)
                .options(
                    selectinload(CertificateConfirmationRequest.invoice),
                    selectinload(CertificateConfirmationRequest.payment),
                )
            )
            result = await session.execute(stmt)
            req = result.scalar_one_or_none()
            if not req:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Confirmation request not found")
            return CertificateConfirmationRequestResponse.model_validate(req).model_dump()

        request = await mark_received(session, request_id, str(current_user.id))
        await session.commit()
        await session.refresh(request)

        response = CertificateRequestResponse.model_validate(request)
        if request.examination_center:
            response.examination_center_name = request.examination_center.name

        return response.model_dump()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to mark as received: {str(e)}",
        )


@router.post("/certificate-requests/{request_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_certificate_request(
    request_id: int,
    cancel_data: dict | None = Body(None),
    session: DBSessionDep = None,
    current_user: AdminDep = None,
) -> dict:
    """Cancel a certificate request or confirmation request (Admin)."""
    from app.schemas.certificate import CertificateRequestResponse, CertificateConfirmationRequestResponse
    from app.services.certificate_service import cancel_request
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id, cancel_confirmation_request
    from app.models import CertificateConfirmationRequest
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    try:
        reason = cancel_data.get("reason") if cancel_data else None

        # Auto-detect confirmation requests
        conf = await get_certificate_confirmation_by_id(session, request_id)
        if conf:
            req = await cancel_confirmation_request(session, request_id, str(current_user.id), reason)
            await session.commit()

            stmt = (
                select(CertificateConfirmationRequest)
                .where(CertificateConfirmationRequest.id == request_id)
                .options(
                    selectinload(CertificateConfirmationRequest.invoice),
                    selectinload(CertificateConfirmationRequest.payment),
                )
            )
            result = await session.execute(stmt)
            req = result.scalar_one_or_none()
            if not req:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Confirmation request not found")
            return CertificateConfirmationRequestResponse.model_validate(req).model_dump()

        request = await cancel_request(session, request_id, str(current_user.id), reason)
        await session.commit()
        await session.refresh(request)

        response = CertificateRequestResponse.model_validate(request)
        if request.examination_center:
            response.examination_center_name = request.examination_center.name

        return response.model_dump()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel request: {str(e)}",
        )


@router.post("/certificate-requests/{request_id}/resend-payment-link", status_code=status.HTTP_200_OK)
async def resend_payment_link(
    request_id: int,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Resend payment link for a certificate request (Admin)."""
    from app.schemas.certificate import PaymentInitializeResponse
    from app.services.certificate_service import get_certificate_request_by_id
    from app.services.payment_service import initialize_payment
    from app.models import Invoice, Payment, PaymentStatus, RequestStatus
    from decimal import Decimal

    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate request not found",
        )

    if request.status != RequestStatus.PENDING_PAYMENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Request must be in PENDING_PAYMENT status. Current status: {request.status.value}",
        )

    # Get invoice
    invoice_stmt = select(Invoice).where(Invoice.certificate_request_id == request.id)
    invoice_result = await session.execute(invoice_stmt)
    invoice = invoice_result.scalar_one_or_none()

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invoice not found for this request",
        )

    if invoice.status == "paid":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invoice is already paid",
        )

    try:
        # Check if there's an existing pending payment
        if request.payment_id:
            payment_stmt = select(Payment).where(Payment.id == request.payment_id)
            payment_result = await session.execute(payment_stmt)
            existing_payment = payment_result.scalar_one_or_none()

            # If payment exists and is still pending, return existing link
            if existing_payment and existing_payment.status == PaymentStatus.PENDING and existing_payment.paystack_authorization_url:
                return {
                    "payment_id": existing_payment.id,
                    "authorization_url": existing_payment.paystack_authorization_url,
                    "paystack_reference": existing_payment.paystack_reference,
                    "message": "Existing payment link retrieved",
                }

        # Create a new payment
        result = await initialize_payment(
            session,
            invoice,
            Decimal(str(invoice.amount)),
            email=request.contact_email,
            metadata={"request_number": request.request_number},
        )
        await session.flush()

        # Update request with payment_id
        request.payment_id = result["payment_id"]
        await session.commit()

        return {
            "payment_id": result["payment_id"],
            "authorization_url": result["authorization_url"],
            "paystack_reference": result["paystack_reference"],
            "message": "New payment link generated",
        }

    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        logger.error(f"Error resending payment link: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resend payment link: {str(e)}",
        )


@router.post("/payments/{payment_id}/reconcile", status_code=status.HTTP_200_OK)
async def reconcile_payment(
    payment_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> dict:
    """
    Manually verify and reconcile a payment with Paystack (Admin).
    This endpoint verifies the payment status with Paystack and updates the database accordingly.
    """
    from app.services.payment_service import verify_payment
    from app.models import Payment, Invoice, PaymentStatus, RequestStatus
    from app.services.certificate_service import update_request_status, get_certificate_request_by_id
    from app.services.certificate_confirmation_service import (
        get_certificate_confirmation_by_id,
        update_confirmation_request_status,
    )
    from datetime import datetime, timezone
    from sqlalchemy import select

    # Get payment
    payment_stmt = select(Payment).where(Payment.id == payment_id)
    payment_result = await session.execute(payment_stmt)
    payment = payment_result.scalar_one_or_none()

    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found",
        )

    if not payment.paystack_reference:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment does not have a Paystack reference",
        )

    try:
        # Verify payment with Paystack
        paystack_response = await verify_payment(session, payment.paystack_reference)

        if not paystack_response.get("status"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Paystack verification failed: {paystack_response.get('message', 'Unknown error')}",
            )

        paystack_data = paystack_response.get("data", {})
        paystack_status = paystack_data.get("status")

        # Update payment status based on Paystack response
        if paystack_status == "success":
            payment.status = PaymentStatus.SUCCESS
            payment.paystack_response = paystack_response
            # Use paid_at from Paystack if available, otherwise use current time
            paid_at_str = paystack_data.get("paid_at")
            if paid_at_str:
                try:
                    from dateutil import parser
                    parsed_date = parser.parse(paid_at_str)
                    # Convert to UTC and make it naive (database expects TIMESTAMP WITHOUT TIME ZONE)
                    if parsed_date.tzinfo is not None:
                        parsed_date = parsed_date.astimezone(timezone.utc).replace(tzinfo=None)
                    payment.paid_at = parsed_date
                except Exception:
                    payment.paid_at = datetime.utcnow()
            else:
                payment.paid_at = datetime.utcnow()

            # Update invoice status
            if payment.invoice_id:
                invoice_stmt = select(Invoice).where(Invoice.id == payment.invoice_id)
                invoice_result = await session.execute(invoice_stmt)
                invoice = invoice_result.scalar_one_or_none()
                if invoice:
                    invoice.status = "paid"
                    invoice.paid_at = payment.paid_at

            # Update request status
            if payment.certificate_request_id:
                request = await get_certificate_request_by_id(session, payment.certificate_request_id)
                if request and request.status != RequestStatus.PAID:
                    await update_request_status(
                        session,
                        payment.certificate_request_id,
                        RequestStatus.PAID,
                        user_id=str(current_user.id),
                        notes=f"Payment reconciled by admin {current_user.email}",
                    )

            elif payment.certificate_confirmation_request_id:
                confirmation_request = await get_certificate_confirmation_by_id(
                    session, payment.certificate_confirmation_request_id
                )
                if confirmation_request and confirmation_request.status != RequestStatus.PAID:
                    await update_confirmation_request_status(
                        session,
                        confirmation_request,
                        RequestStatus.PAID,
                        user_id=str(current_user.id),
                        notes=f"Payment reconciled by admin {current_user.email}",
                    )

            await session.commit()
            logger.info(f"Payment {payment_id} reconciled successfully by admin {current_user.email}")

            return {
                "message": "Payment reconciled successfully",
                "payment_id": payment.id,
                "status": payment.status.value,
                "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
            }

        elif paystack_status == "failed":
            payment.status = PaymentStatus.FAILED
            payment.paystack_response = paystack_response
            await session.commit()

            return {
                "message": "Payment verified as failed",
                "payment_id": payment.id,
                "status": payment.status.value,
            }

        else:
            # Payment is still pending
            return {
                "message": f"Payment is still {paystack_status}",
                "payment_id": payment.id,
                "status": payment.status.value,
                "paystack_status": paystack_status,
            }

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error(f"Error reconciling payment {payment_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reconcile payment: {str(e)}",
        )


@router.post("/payments/reconcile-by-reference", status_code=status.HTTP_200_OK)
async def reconcile_payment_by_reference(
    reference: str = Query(..., description="Paystack transaction reference or invoice number"),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> dict:
    """
    Reconcile a payment by Paystack reference or invoice number (Admin).
    Finds the payment by reference or invoice number and verifies it with Paystack.
    """
    from app.models import Payment, Invoice
    from sqlalchemy import select, or_

    # Check if it's an invoice number (starts with INV-)
    if reference.upper().startswith("INV-"):
        # Find invoice by invoice number
        invoice_stmt = select(Invoice).where(Invoice.invoice_number == reference.upper())
        invoice_result = await session.execute(invoice_stmt)
        invoice = invoice_result.scalar_one_or_none()

        if not invoice:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Invoice not found for invoice number: {reference}",
            )

        # Find payment by invoice_id
        payment_stmt = select(Payment).where(Payment.invoice_id == invoice.id)
        payment_result = await session.execute(payment_stmt)
        payment = payment_result.scalar_one_or_none()

        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Payment not found for invoice number: {reference}",
            )
    else:
        # Find payment by Paystack reference
        payment_stmt = select(Payment).where(Payment.paystack_reference == reference)
        payment_result = await session.execute(payment_stmt)
        payment = payment_result.scalar_one_or_none()

        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Payment not found for Paystack reference: {reference}",
            )

    # Call the reconcile endpoint
    return await reconcile_payment(payment.id, session, current_user)


@router.get("/payments/pending-reconciliation", status_code=status.HTTP_200_OK)
async def list_pending_payments(
    hours: int = Query(24, ge=1, le=168, description="Hours since payment creation to consider for reconciliation"),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> dict:
    """
    List payments that might need reconciliation (Admin).
    Returns payments that are still pending but were created more than X hours ago.
    """
    from app.models import Payment, PaymentStatus, Invoice, CertificateRequest, CertificateConfirmationRequest
    from sqlalchemy import select, and_
    from datetime import datetime, timedelta
    from sqlalchemy.orm import selectinload

    cutoff_time = datetime.utcnow() - timedelta(hours=hours)

    # Find pending payments older than cutoff
    stmt = (
        select(Payment)
        .where(
            and_(
                Payment.status == PaymentStatus.PENDING,
                Payment.created_at < cutoff_time,
                Payment.paystack_reference.isnot(None),
            )
        )
        .options(
            selectinload(Payment.invoice),
            selectinload(Payment.certificate_request),
            selectinload(Payment.certificate_confirmation_request),
        )
        .order_by(Payment.created_at.desc())
        .limit(100)
    )

    result = await session.execute(stmt)
    payments = result.scalars().all()

    payment_list = []
    for payment in payments:
        request_number = None
        request_type = None
        if payment.certificate_request_id and payment.certificate_request:
            request_number = payment.certificate_request.request_number
            request_type = "certificate_request"
        elif payment.certificate_confirmation_request_id and payment.certificate_confirmation_request:
            request_number = payment.certificate_confirmation_request.request_number
            request_type = "certificate_confirmation_request"

        payment_list.append({
            "payment_id": payment.id,
            "paystack_reference": payment.paystack_reference,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "status": payment.status.value,
            "created_at": payment.created_at.isoformat(),
            "request_number": request_number,
            "request_type": request_type,
            "invoice_id": payment.invoice_id,
            "invoice_status": payment.invoice.status if payment.invoice else None,
        })

    return {
        "count": len(payment_list),
        "payments": payment_list,
        "cutoff_time": cutoff_time.isoformat(),
    }


# Reporting Endpoints

@router.get("/certificate-requests/reports/summary")
async def get_certificate_request_summary(
    session: DBSessionDep,
    current_user: AdminDep,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    period: str | None = Query(None, description="Period: weekly, monthly, yearly"),
) -> dict:
    """Get summary statistics for certificate requests (System Admin and Admin)."""
    from app.services.reporting_service import get_request_statistics
    from datetime import timedelta

    # Calculate date range based on period if provided
    start_dt = None
    end_dt = None
    if period:
        today = datetime.utcnow().date()
        if period == "weekly":
            start_dt = datetime.combine(today - timedelta(days=7), datetime.min.time())
            end_dt = datetime.utcnow()
        elif period == "monthly":
            start_dt = datetime.combine(today - timedelta(days=30), datetime.min.time())
            end_dt = datetime.utcnow()
        elif period == "yearly":
            start_dt = datetime.combine(datetime(today.year, 1, 1).date(), datetime.min.time())
            end_dt = datetime.utcnow()
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid period. Must be: weekly, monthly, or yearly",
            )
    else:
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid start_date format. Use YYYY-MM-DD",
                )
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid end_date format. Use YYYY-MM-DD",
                )

    try:
        stats = await get_request_statistics(session, start_dt, end_dt)
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate statistics: {str(e)}",
        )


@router.get("/certificate-requests/reports/statistics")
async def get_certificate_request_statistics(
    session: DBSessionDep,
    current_user: AdminDep,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
) -> dict:
    """Get detailed statistics with breakdowns (System Admin and Admin)."""
    from app.services.reporting_service import get_request_statistics

    start_dt = None
    end_dt = None
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid start_date format. Use YYYY-MM-DD",
            )
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid end_date format. Use YYYY-MM-DD",
            )

    try:
        stats = await get_request_statistics(session, start_dt, end_dt)
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate statistics: {str(e)}",
        )


@router.get("/certificate-requests/reports/export")
async def export_certificate_requests(
    session: DBSessionDep,
    current_user: AdminDep,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
) -> StreamingResponse:
    """Export certificate request data as CSV (System Admin and Admin)."""
    from app.services.reporting_service import export_request_data
    import csv
    import io

    start_dt = None
    end_dt = None
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid start_date format. Use YYYY-MM-DD",
            )
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid end_date format. Use YYYY-MM-DD",
            )

    try:
        data = await export_request_data(session, start_dt, end_dt)

        # Generate CSV
        output = io.StringIO()
        if data:
            writer = csv.DictWriter(output, fieldnames=data[0].keys())
            writer.writeheader()
            writer.writerows(data)

        csv_bytes = output.getvalue().encode("utf-8")
        filename = f"certificate_requests_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"

        return StreamingResponse(
            iter([csv_bytes]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export data: {str(e)}",
        )


# -------------------------
# Manual Status Change (Unified)
# -------------------------
class ManualStatusChangePayload(BaseModel):
    new_status: str = Field(..., description="New status to set")
    reason: str = Field(..., min_length=3, description="Reason for manual status change")
    ticket_type: str | None = Field(
        None,
        description="Optional ticket type override: 'certificate_request' or 'certificate_confirmation_request'",
    )


@router.post("/tickets/{ticket_id}/manual-status", status_code=status.HTTP_200_OK)
async def manual_status_change(
    ticket_id: int,
    payload: ManualStatusChangePayload = Body(...),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> dict:
    """
    Manually change ticket status after Begin Process with limited transitions.
    Auto-detects ticket type unless overridden by payload.ticket_type.
    """
    from app.models import RequestStatus, CertificateConfirmationRequest
    from app.schemas.certificate import (
        CertificateRequestResponse,
        CertificateConfirmationRequestResponse,
    )
    from app.services.certificate_service import (
        get_certificate_request_by_id,
        set_status_manual,
    )
    from app.services.certificate_confirmation_service import (
        get_certificate_confirmation_by_id,
        set_confirmation_status_manual,
    )
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    try:
        try:
            new_status = RequestStatus(payload.new_status)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid new_status: {payload.new_status}",
            )

        # Respect explicit type if provided
        if payload.ticket_type and payload.ticket_type.strip().lower() in (
            "certificate_confirmation_request",
            "confirmation",
        ):
            # Confirmation path
            req = await set_confirmation_status_manual(
                session=session,
                confirmation_id=ticket_id,
                new_status=new_status,
                user_id=str(current_user.id),
                reason=payload.reason,
            )
            await session.commit()

            # Eager-load invoice/payment to avoid lazy loading during serialization
            stmt = (
                select(CertificateConfirmationRequest)
                .where(CertificateConfirmationRequest.id == ticket_id)
                .options(
                    selectinload(CertificateConfirmationRequest.invoice),
                    selectinload(CertificateConfirmationRequest.payment),
                )
            )
            result = await session.execute(stmt)
            req = result.scalar_one_or_none()
            if not req:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Certificate confirmation request not found",
                )
            return CertificateConfirmationRequestResponse.model_validate(req).model_dump()

        # Auto-detect: if confirmation exists, use that
        conf = await get_certificate_confirmation_by_id(session, ticket_id)
        if conf:
            req = await set_confirmation_status_manual(
                session=session,
                confirmation_id=ticket_id,
                new_status=new_status,
                user_id=str(current_user.id),
                reason=payload.reason,
            )
            await session.commit()

            stmt = (
                select(CertificateConfirmationRequest)
                .where(CertificateConfirmationRequest.id == ticket_id)
                .options(
                    selectinload(CertificateConfirmationRequest.invoice),
                    selectinload(CertificateConfirmationRequest.payment),
                )
            )
            result = await session.execute(stmt)
            req = result.scalar_one_or_none()
            if not req:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Certificate confirmation request not found",
                )
            return CertificateConfirmationRequestResponse.model_validate(req).model_dump()

        # Fall back to certificate request
        cert = await get_certificate_request_by_id(session, ticket_id)
        if not cert:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ticket not found",
            )
        cert = await set_status_manual(
            session=session,
            request_id=ticket_id,
            new_status=new_status,
            user_id=str(current_user.id),
            reason=payload.reason,
        )
        await session.commit()
        await session.refresh(cert)
        return CertificateRequestResponse.model_validate(cert).model_dump()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except HTTPException:
        # pass through
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to change status: {str(e)}",
        )
