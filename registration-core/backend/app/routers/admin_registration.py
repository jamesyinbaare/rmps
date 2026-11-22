"""Admin endpoints for registration management (schools, exams, pricing, catalogues, invoices)."""
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status, UploadFile, File, Form, BackgroundTasks, Body, Depends, Request
from fastapi.responses import StreamingResponse
import io
import zipfile
import re
from pathlib import Path
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete, insert, update, cast, String, type_coerce, or_
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
    ProgrammeType,
    ExamSeriesDefinition,
    Subject,
    SubjectType,
    programme_subjects,
    school_programmes,
    IndexNumberGenerationJob,
    IndexNumberGenerationJobStatus,
    RegistrationApplicationFee,
    SubjectPricing,
    RegistrationTieredPricing,
    ProgrammePricing,
    RegistrationType,
    Disability,
    ExamPricingModel,
    RegistrationCandidatePhoto,
    ExamLateRegistrationWindow,
    ExamKind,
)
from app.services.exam_response import exam_load_options, serialize_exam
from app.services.exam_kind_service import (
    normalize_exam_kind_flags,
    parse_exam_kind,
    sync_period_private_flag,
    validate_registration_type_for_exam,
)
from app.services.registration_cohorts import (
    candidate_type_filter_for_exam,
    school_mediated_type_filter,
    private_type_filter,
)
from app.services.exam_eligibility_service import (
    get_eligible_school_ids,
    get_exam_eligible_rows,
    replace_exam_eligible_schools,
    school_allows_free_tvet_for_exam,
)
from app.services.late_registration_service import (
    create_late_window,
    list_late_windows,
    revoke_late_window,
)
from app.services.programme_type_service import (
    assert_root_programme_type,
    replace_exam_enabled_types,
    validate_enabled_programme_type_ids,
)
from app.schemas.registration import (
    RegistrationExamCreate,
    RegistrationExamUpdate,
    RegistrationExamResponse,
    ExamEligibleSchoolsUpdate,
    LateRegistrationWindowCreate,
    LateRegistrationWindowResponse,
    LateRegistrationWindowSchoolItem,
    ExamRegistrationPeriodUpdate,
    ExamRegistrationPeriodResponse,
    IndexNumberGenerationJobResponse,
    SchoolProgressItem,
    CandidateListResponse,
    PhotoAlbumResponse,
    PhotoAlbumItem,
    RegistrationCandidatePhotoResponse,
    ExamStatisticsResponse,
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
from app.utils.school import check_school_profile_completion
from app.utils.registration import generate_unique_registration_number
from app.services.subject_selection import (
    normalize_exam_series,
    validate_subject_selections,
)
from app.models import RegistrationStatus
from app.services.registration_completeness import default_fee_payment_status
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
    ProgrammePricingResponse,
    ProgrammePricingCreate,
    ProgrammePricingBulkUpdate,
    ExamPricingResponse,
    ExamPricingModelResponse,
    ExamPricingModelCreate,
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
from app.services.programme_pricing_upload import (
    ProgrammePricingUploadParseError,
    ProgrammePricingUploadValidationError,
    parse_programme_pricing_row,
    parse_upload_file as parse_programme_pricing_upload_file,
    validate_required_columns as validate_programme_pricing_columns,
)
from app.services.subject_pricing_upload import (
    SubjectPricingUploadParseError,
    SubjectPricingUploadValidationError,
    parse_subject_pricing_row,
    parse_upload_file as parse_subject_pricing_upload_file,
    validate_required_columns as validate_subject_pricing_columns,
)
from app.services.template_generator import (
    generate_programme_template,
    generate_subject_template,
    generate_schedule_template,
    generate_subject_pricing_template,
    generate_programme_pricing_template,
)
from app.schemas.invoice import (
    SchoolInvoiceResponse,
    AdminSummaryInvoiceResponse,
    SchoolInvoiceItem,
    ExaminationInvoiceItem,
)
from app.services.school_invoice_service import (
    aggregate_candidates_by_examination,
    aggregate_candidates_by_school,
    generate_admin_invoice_pdf,
)
from app.services.timetable_service import generate_timetable_pdf
from app.schemas.timetable import TimetableDownloadFilter

router = APIRouter(prefix="/api/v1/admin", tags=["admin-registration"])

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

    # Candidate counts: school-mediated only (exclude private sitters at examination centers)
    candidate_counts_subq = (
        select(
            RegistrationCandidate.school_id,
            func.count(RegistrationCandidate.id).label("candidate_count")
        )
        .where(
            RegistrationCandidate.school_id.in_(school_ids),
            school_mediated_type_filter(),
        )
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

    # School statistics count school-mediated registrations only (not private sitters)
    school_type_filter = school_mediated_type_filter()

    # Count total candidates
    total_candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
        RegistrationCandidate.school_id == school_id,
        school_type_filter,
    )
    total_result = await session.execute(total_candidates_stmt)
    total_candidates = total_result.scalar_one() or 0

    # Count candidates by exam
    candidates_by_exam_stmt = (
        select(RegistrationCandidate.registration_exam_id, func.count(RegistrationCandidate.id))
        .where(
            RegistrationCandidate.school_id == school_id,
            school_type_filter,
        )
        .group_by(RegistrationCandidate.registration_exam_id)
    )
    exam_result = await session.execute(candidates_by_exam_stmt)
    candidates_by_exam = {str(row[0]): row[1] for row in exam_result.all()}

    # Count candidates by status
    candidates_by_status_stmt = (
        select(RegistrationCandidate.registration_status, func.count(RegistrationCandidate.id))
        .where(
            RegistrationCandidate.school_id == school_id,
            school_type_filter,
        )
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
        RegistrationCandidate.school_id == school_id,
        school_type_filter,
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
            raw_status = status.upper()
            legacy_status_map = {
                "PENDING": RegistrationStatus.INCOMPLETE,
                "REJECTED": RegistrationStatus.INCOMPLETE,
                "APPROVED": RegistrationStatus.COMPLETE,
            }
            status_enum = legacy_status_map.get(raw_status) or RegistrationStatus(raw_status)
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
    stmt = stmt.options(
        selectinload(RegistrationCandidate.subject_selections),
        selectinload(RegistrationCandidate.exam).selectinload(RegistrationExam.registration_period)
    )

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

    # Update profile fields if provided
    if school_update.email is not None:
        school.email = school_update.email
    if school_update.phone is not None:
        school.phone = school_update.phone
    if school_update.digital_address is not None:
        school.digital_address = school_update.digital_address
    if school_update.post_office_address is not None:
        school.post_office_address = school_update.post_office_address
    if school_update.is_private is not None:
        school.is_private = school_update.is_private
    if school_update.principal_name is not None:
        school.principal_name = school_update.principal_name
    if school_update.principal_email is not None:
        school.principal_email = school_update.principal_email
    if school_update.principal_phone is not None:
        school.principal_phone = school_update.principal_phone

    # Automatically calculate and set profile completion status
    school.profile_completed = check_school_profile_completion(school)

    await session.commit()
    await session.refresh(school)

    return SchoolDetailResponse.model_validate(school)


@router.post("/exams", response_model=RegistrationExamResponse, status_code=status.HTTP_201_CREATED)
async def create_exam(
    exam_data: RegistrationExamCreate, session: DBSessionDep, current_user: SystemAdminDep
) -> RegistrationExamResponse:
    """Create a new exam with registration period, root programme type, series, and enablement."""
    try:
        start_date = exam_data.registration_period.registration_start_date
        end_date = exam_data.registration_period.registration_end_date

        if start_date.tzinfo is not None:
            start_date = start_date.astimezone(timezone.utc).replace(tzinfo=None)
        if end_date.tzinfo is not None:
            end_date = end_date.astimezone(timezone.utc).replace(tzinfo=None)

        if end_date <= start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration end date must be after start date",
            )

        try:
            root_type = await assert_root_programme_type(session, exam_data.programme_type_id)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        series = await session.get(ExamSeriesDefinition, exam_data.exam_series_id)
        if not series or not series.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Exam series not found or inactive",
            )

        enabled_ids = exam_data.enabled_programme_type_ids or [root_type.id]
        try:
            enabled_ids = await validate_enabled_programme_type_ids(
                session, root_type.id, enabled_ids
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        dup_stmt = select(RegistrationExam).where(
            RegistrationExam.programme_type_id == exam_data.programme_type_id,
            RegistrationExam.exam_series_id == exam_data.exam_series_id,
            RegistrationExam.year == exam_data.year,
        )
        existing = (await session.execute(dup_stmt)).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Exam with programme type '{root_type.name}', series '{series.short_name}', "
                    f"and year {exam_data.year} already exists"
                ),
            )

        exam_kind, allows_referral, allows_private = normalize_exam_kind_flags(
            parse_exam_kind(exam_data.exam_kind),
            exam_data.allows_referral_registration,
        )

        registration_period = ExamRegistrationPeriod(
            registration_start_date=start_date,
            registration_end_date=end_date,
            is_active=True,
            allows_bulk_registration=exam_data.registration_period.allows_bulk_registration,
            allows_private_registration=allows_private,
        )
        session.add(registration_period)
        await session.flush()

        new_exam = RegistrationExam(
            exam_id_main_system=exam_data.exam_id_main_system,
            programme_type_id=root_type.id,
            exam_series_id=series.id,
            exam_type=root_type.name,
            exam_series=series.short_name,
            year=exam_data.year,
            description=exam_data.description,
            exam_kind=exam_kind,
            allows_referral_registration=allows_referral,
            registration_period_id=registration_period.id,
            pricing_model_preference=exam_data.pricing_model_preference,
        )
        session.add(new_exam)
        await session.flush()
        await replace_exam_enabled_types(session, new_exam, enabled_ids)
        await session.commit()

        stmt = (
            select(RegistrationExam)
            .where(RegistrationExam.id == new_exam.id)
            .options(*exam_load_options())
        )
        new_exam = (await session.execute(stmt)).scalar_one()
        return serialize_exam(new_exam)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating exam: {e}", exc_info=True)
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create exam: {str(e)}",
        )


@router.get("/exams", response_model=list[RegistrationExamResponse])
async def list_exams(session: DBSessionDep, current_user: SystemAdminDep) -> list[RegistrationExamResponse]:
    """List all exams (for admin dashboard) with candidate counts."""
    stmt = (
        select(RegistrationExam)
        .options(*exam_load_options())
        .order_by(RegistrationExam.year.desc(), RegistrationExam.exam_type, RegistrationExam.exam_series)
    )
    result = await session.execute(stmt)
    exams = result.scalars().unique().all()

    exam_responses = []
    for exam in exams:
        type_filter = candidate_type_filter_for_exam(exam)
        total_candidates = (
            await session.execute(
                select(func.count(RegistrationCandidate.id)).where(
                    RegistrationCandidate.registration_exam_id == exam.id,
                    type_filter,
                )
            )
        ).scalar() or 0
        approved_candidates = (
            await session.execute(
                select(func.count(RegistrationCandidate.id)).where(
                    RegistrationCandidate.registration_exam_id == exam.id,
                    RegistrationCandidate.registration_status == RegistrationStatus.COMPLETE,
                    type_filter,
                )
            )
        ).scalar() or 0
        exam_responses.append(
            serialize_exam(
                exam,
                candidate_count=total_candidates,
                approved_candidates=approved_candidates,
            )
        )
    return exam_responses


@router.get("/exams/active", response_model=list[RegistrationExamResponse])
async def list_active_exams(session: DBSessionDep, current_user: SystemAdminDep) -> list[RegistrationExamResponse]:
    """List active examinations with registration statistics."""
    # Get current time in UTC, then convert to naive datetime for database comparison
    now_aware = datetime.now(timezone.utc)
    now = now_aware.replace(tzinfo=None)  # Convert to naive datetime for database

    # Query exams with active registration periods
    stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .where(
            ExamRegistrationPeriod.is_active == True,
            ExamRegistrationPeriod.registration_start_date <= now,
            ExamRegistrationPeriod.registration_end_date >= now,
        )
        .options(*exam_load_options())
        .order_by(RegistrationExam.year.desc(), RegistrationExam.exam_type, RegistrationExam.exam_series)
    )
    result = await session.execute(stmt)
    exams = result.scalars().unique().all()

    exam_responses = []
    for exam in exams:
        type_filter = candidate_type_filter_for_exam(exam)
        total_candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
            RegistrationCandidate.registration_exam_id == exam.id,
            type_filter,
        )
        total_candidates = (await session.execute(total_candidates_stmt)).scalar() or 0

        approved_candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
            RegistrationCandidate.registration_exam_id == exam.id,
            RegistrationCandidate.registration_status == RegistrationStatus.COMPLETE,
            type_filter,
        )
        approved_candidates = (await session.execute(approved_candidates_stmt)).scalar() or 0

        exam_responses.append(
            serialize_exam(
                exam,
                candidate_count=total_candidates,
                approved_candidates=approved_candidates,
            )
        )

    return exam_responses


@router.get("/exams/{exam_id}", response_model=RegistrationExamResponse)
async def get_exam(exam_id: int, session: DBSessionDep, current_user: SystemAdminDep) -> RegistrationExamResponse:
    """Get exam details."""
    stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(*exam_load_options())
    )
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    type_filter = candidate_type_filter_for_exam(exam)
    index_numbers_count_stmt = select(func.count(RegistrationCandidate.id)).where(
        RegistrationCandidate.registration_exam_id == exam_id,
        RegistrationCandidate.index_number.isnot(None),
        RegistrationCandidate.index_number != "",
        type_filter,
    )
    index_numbers_count = (await session.execute(index_numbers_count_stmt)).scalar() or 0

    candidate_count_stmt = select(func.count(RegistrationCandidate.id)).where(
        RegistrationCandidate.registration_exam_id == exam_id,
        type_filter,
    )
    candidate_count = (await session.execute(candidate_count_stmt)).scalar() or 0

    return serialize_exam(
        exam,
        candidate_count=candidate_count,
        has_index_numbers=index_numbers_count > 0,
    )


@router.get("/exams/{exam_id}/statistics", response_model=ExamStatisticsResponse)
async def get_exam_statistics(
    exam_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> ExamStatisticsResponse:
    """Get detailed statistics for an examination."""
    # Verify exam exists
    exam_stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    type_filter = candidate_type_filter_for_exam(exam)

    # Count total candidates for this exam kind
    total_candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
        RegistrationCandidate.registration_exam_id == exam_id,
        type_filter,
    )
    total_result = await session.execute(total_candidates_stmt)
    total_candidates = total_result.scalar() or 0

    # Count approved candidates
    approved_candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
        RegistrationCandidate.registration_exam_id == exam_id,
        RegistrationCandidate.registration_status == RegistrationStatus.COMPLETE,
        type_filter,
    )
    approved_result = await session.execute(approved_candidates_stmt)
    approved_candidates = approved_result.scalar() or 0

    # Calculate completion percentage
    completion_percentage = (approved_candidates / total_candidates * 100.0) if total_candidates > 0 else 0.0

    # Count distinct schools / examination centers for this exam kind
    schools_count_stmt = (
        select(func.count(func.distinct(RegistrationCandidate.school_id)))
        .where(
            RegistrationCandidate.registration_exam_id == exam_id,
            RegistrationCandidate.school_id.isnot(None),
            type_filter,
        )
    )
    schools_result = await session.execute(schools_count_stmt)
    schools_count = schools_result.scalar() or 0

    # Calculate days to end
    now = datetime.now(timezone.utc)
    end_date = exam.registration_period.registration_end_date
    if end_date:
        # Ensure end_date is timezone-aware
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        days_to_end = (end_date - now).days
        # Only return positive days, otherwise return None
        days_to_end = days_to_end if days_to_end > 0 else None
    else:
        days_to_end = None

    return ExamStatisticsResponse(
        total_candidates=total_candidates,
        approved_candidates=approved_candidates,
        completion_percentage=round(completion_percentage, 2),
        schools_count=schools_count,
        days_to_end=days_to_end,
    )


@router.get("/exams/{exam_id}/schools", response_model=list[dict])
async def get_exam_schools(
    exam_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> list[dict]:
    """Get list of schools with candidate counts for an examination."""
    # Verify exam exists
    exam_stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    type_filter = candidate_type_filter_for_exam(exam)
    # Get schools / centers with candidate counts for this exam kind
    schools_stmt = (
        select(
            School.id,
            School.name,
            School.code,
            func.count(RegistrationCandidate.id).label("candidate_count"),
        )
        .join(
            RegistrationCandidate,
            RegistrationCandidate.school_id == School.id,
        )
        .where(
            RegistrationCandidate.registration_exam_id == exam_id,
            RegistrationCandidate.school_id.isnot(None),
            type_filter,
        )
        .group_by(School.id, School.name, School.code)
        .order_by(School.name)
    )

    result = await session.execute(schools_stmt)
    schools = result.all()

    from app.services.registration_expectations import get_expected_totals_for_exam_schools

    school_ids = [row.id for row in schools]
    expected_map = await get_expected_totals_for_exam_schools(session, exam_id, school_ids)

    return [
        {
            "id": row.id,
            "name": row.name,
            "code": row.code,
            "candidate_count": row.candidate_count,
            "expected_total": expected_map.get(row.id),
            "actual_total": row.candidate_count,
        }
        for row in schools
    ]


@router.get("/exams/{exam_id}/eligible-schools", response_model=list[SchoolResponse])
async def list_exam_eligible_schools(
    exam_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> list[SchoolResponse]:
    """List schools currently eligible to register for this examination."""
    exam = (
        await session.execute(select(RegistrationExam).where(RegistrationExam.id == exam_id))
    ).scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    rows = await get_exam_eligible_rows(session, exam_id)
    if not rows:
        return []

    free_tvet_by_school = {row.school_id: bool(row.allows_free_tvet) for row in rows}
    school_ids = list(free_tvet_by_school.keys())
    schools = (
        await session.execute(
            select(School).where(School.id.in_(school_ids)).order_by(School.code)
        )
    ).scalars().all()
    responses: list[SchoolResponse] = []
    for school in schools:
        payload = SchoolResponse.model_validate(school).model_dump()
        payload["allows_free_tvet"] = free_tvet_by_school.get(school.id, False)
        responses.append(SchoolResponse.model_validate(payload))
    return responses


@router.put("/exams/{exam_id}/eligible-schools", response_model=list[SchoolResponse])
async def update_exam_eligible_schools(
    exam_id: int,
    body: ExamEligibleSchoolsUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> list[SchoolResponse]:
    """Replace the set of schools eligible to register for this examination (strict opt-in)."""
    exam = (
        await session.execute(select(RegistrationExam).where(RegistrationExam.id == exam_id))
    ).scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    try:
        await replace_exam_eligible_schools(
            session,
            exam,
            body.school_ids,
            free_tvet_school_ids=body.free_tvet_school_ids,
        )
        await session.commit()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    return await list_exam_eligible_schools(exam_id, session, current_user)


def _serialize_late_window(window: ExamLateRegistrationWindow) -> LateRegistrationWindowResponse:
    schools = [
        LateRegistrationWindowSchoolItem(
            school_id=row.school_id,
            school_code=row.school.code if row.school else "",
            school_name=row.school.name if row.school else "",
        )
        for row in (window.schools or [])
    ]
    applies_to_all = len(schools) == 0
    return LateRegistrationWindowResponse(
        id=window.id,
        exam_id=window.exam_id,
        starts_at=window.starts_at,
        ends_at=window.ends_at,
        is_active=window.is_active,
        note=window.note,
        applies_to_all_eligible=applies_to_all,
        schools=schools,
        school_count=0 if applies_to_all else len(schools),
        created_by_user_id=str(window.created_by_user_id) if window.created_by_user_id else None,
        created_at=window.created_at,
        updated_at=window.updated_at,
    )


@router.get("/exams/{exam_id}/late-windows", response_model=list[LateRegistrationWindowResponse])
async def get_exam_late_windows(
    exam_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> list[LateRegistrationWindowResponse]:
    """List late registration windows for an examination."""
    exam = (
        await session.execute(select(RegistrationExam).where(RegistrationExam.id == exam_id))
    ).scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    windows = await list_late_windows(session, exam_id)
    return [_serialize_late_window(w) for w in windows]


@router.post(
    "/exams/{exam_id}/late-windows",
    response_model=LateRegistrationWindowResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_exam_late_window(
    exam_id: int,
    body: LateRegistrationWindowCreate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> LateRegistrationWindowResponse:
    """Open a late registration window for all eligible schools or a selected subset."""
    exam = (
        await session.execute(select(RegistrationExam).where(RegistrationExam.id == exam_id))
    ).scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    try:
        window = await create_late_window(
            session,
            exam,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            school_ids=body.school_ids,
            note=body.note,
            created_by_user_id=current_user.id,
        )
        await session.commit()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    return _serialize_late_window(window)


@router.post(
    "/exams/{exam_id}/late-windows/{window_id}/revoke",
    response_model=LateRegistrationWindowResponse,
)
async def revoke_exam_late_window(
    exam_id: int,
    window_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> LateRegistrationWindowResponse:
    """Revoke a late registration window (sets is_active=False)."""
    try:
        window = await revoke_late_window(session, exam_id, window_id)
        await session.commit()
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    return _serialize_late_window(window)


@router.get("/exams/{exam_id}/programmes", response_model=list[dict])
async def get_exam_programmes(
    exam_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> list[dict]:
    """Get list of programmes with candidate counts for an examination across all schools."""
    # Verify exam exists
    exam_stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Get programmes with candidate counts for this exam across all schools
    # First, get distinct programmes that have candidates for this exam
    programmes_stmt = (
        select(Programme)
        .join(
            RegistrationCandidate,
            RegistrationCandidate.programme_id == Programme.id,
        )
        .where(
            RegistrationCandidate.registration_exam_id == exam_id,
            RegistrationCandidate.programme_id.isnot(None),
        )
        .distinct()
        .order_by(Programme.code)
    )

    programmes_result = await session.execute(programmes_stmt)
    programmes = programmes_result.scalars().all()

    # For each programme, count total and completed candidates
    programmes_summary = []
    for programme in programmes:
        # Count total candidates for this programme
        total_candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
            RegistrationCandidate.registration_exam_id == exam_id,
            RegistrationCandidate.programme_id == programme.id
        )
        total_result = await session.execute(total_candidates_stmt)
        total_prog_candidates = total_result.scalar_one() or 0

        # Count approved (completed) candidates for this programme
        completed_candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
            RegistrationCandidate.registration_exam_id == exam_id,
            RegistrationCandidate.programme_id == programme.id,
            RegistrationCandidate.registration_status == RegistrationStatus.COMPLETE
        )
        completed_result = await session.execute(completed_candidates_stmt)
        completed_candidates = completed_result.scalar_one() or 0

        programmes_summary.append({
            "id": programme.id,
            "code": programme.code,
            "name": programme.name,
            "total_candidates": total_prog_candidates,
            "completed_candidates": completed_candidates,
        })

    return programmes_summary


@router.put("/exams/{exam_id}", response_model=RegistrationExamResponse)
async def update_exam(
    exam_id: int,
    exam_update: RegistrationExamUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> RegistrationExamResponse:
    """Update exam details, series, and enabled programme types."""
    stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(*exam_load_options())
    )
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    is_updating_identity = (
        exam_update.programme_type_id is not None
        or exam_update.exam_series_id is not None
        or exam_update.year is not None
    )
    is_updating_kind = exam_update.exam_kind is not None

    if is_updating_identity or is_updating_kind:
        candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
            RegistrationCandidate.registration_exam_id == exam_id
        )
        candidate_count = (await session.execute(candidates_stmt)).scalar_one()
        if candidate_count > 0:
            locked = "programme type, year, or series"
            if is_updating_kind and not is_updating_identity:
                locked = "examination kind"
            elif is_updating_kind:
                locked = "programme type, year, series, or examination kind"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot update {locked}. There are "
                    f"{candidate_count} registered candidate(s) for this examination."
                ),
            )

    if exam_update.programme_type_id is not None:
        try:
            root_type = await assert_root_programme_type(session, exam_update.programme_type_id)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        exam.programme_type_id = root_type.id
        exam.exam_type = root_type.name

    if exam_update.exam_series_id is not None:
        series = await session.get(ExamSeriesDefinition, exam_update.exam_series_id)
        if not series or not series.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Exam series not found or inactive",
            )
        exam.exam_series_id = series.id
        exam.exam_series = series.short_name

    if exam_update.year is not None:
        exam.year = exam_update.year

    # Uniqueness check after identity changes
    if is_updating_identity and exam.programme_type_id and exam.exam_series_id:
        dup_stmt = select(RegistrationExam).where(
            RegistrationExam.programme_type_id == exam.programme_type_id,
            RegistrationExam.exam_series_id == exam.exam_series_id,
            RegistrationExam.year == exam.year,
            RegistrationExam.id != exam.id,
        )
        if (await session.execute(dup_stmt)).scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An exam with this programme type, series, and year already exists",
            )

    if exam_update.enabled_programme_type_ids is not None:
        root_id = exam.programme_type_id
        if root_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Exam has no programme type; cannot update enablement",
            )
        try:
            enabled_ids = await validate_enabled_programme_type_ids(
                session, root_id, exam_update.enabled_programme_type_ids
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        # Block disabling a type that already has candidates for this exam
        current_enabled = {e.programme_type_id for e in exam.enabled_programme_types}
        removing = current_enabled - set(enabled_ids)
        if removing:
            in_use_stmt = (
                select(Programme.programme_type_id, func.count(RegistrationCandidate.id))
                .join(RegistrationCandidate, RegistrationCandidate.programme_id == Programme.id)
                .where(
                    RegistrationCandidate.registration_exam_id == exam_id,
                    Programme.programme_type_id.in_(removing),
                )
                .group_by(Programme.programme_type_id)
            )
            in_use = (await session.execute(in_use_stmt)).all()
            if in_use:
                ids = [row[0] for row in in_use]
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Cannot disable programme type(s) {ids}: candidates are already "
                        "registered under programmes of those types"
                    ),
                )
        await replace_exam_enabled_types(session, exam, enabled_ids)

    if exam_update.exam_id_main_system is not None:
        exam.exam_id_main_system = exam_update.exam_id_main_system
    if exam_update.description is not None:
        exam.description = exam_update.description
    if exam_update.pricing_model_preference is not None:
        exam.pricing_model_preference = exam_update.pricing_model_preference

    if exam_update.exam_kind is not None or exam_update.allows_referral_registration is not None:
        current_kind = parse_exam_kind(exam_update.exam_kind) if exam_update.exam_kind is not None else exam.exam_kind
        referral_input = (
            exam_update.allows_referral_registration
            if exam_update.allows_referral_registration is not None
            else exam.allows_referral_registration
        )
        exam_kind, allows_referral, _ = normalize_exam_kind_flags(current_kind, referral_input)
        exam.exam_kind = exam_kind
        exam.allows_referral_registration = allows_referral
        sync_period_private_flag(exam)

    # Keep denormalized fields in sync if relationships already loaded with new IDs
    if exam.programme_type_id and (exam.programme_type is None or exam.programme_type.id != exam.programme_type_id):
        pt = await session.get(ProgrammeType, exam.programme_type_id)
        if pt:
            exam.exam_type = pt.name
    if exam.exam_series_id and (
        exam.series_definition is None or exam.series_definition.id != exam.exam_series_id
    ):
        series = await session.get(ExamSeriesDefinition, exam.exam_series_id)
        if series:
            exam.exam_series = series.short_name

    await session.commit()

    stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(*exam_load_options())
    )
    exam = (await session.execute(stmt)).scalar_one()
    return serialize_exam(exam)


@router.delete("/exams/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exam(exam_id: int, session: DBSessionDep, current_user: SystemAdminDep) -> None:
    """Delete an exam (with validation to prevent deletion if registration has started or candidates exist)."""
    stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Check if registration has started
    now = datetime.utcnow()
    registration_started = exam.registration_period.registration_start_date <= now

    # Check if there are any candidates registered for this exam
    candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
        RegistrationCandidate.registration_exam_id == exam_id
    )
    candidates_result = await session.execute(candidates_stmt)
    candidate_count = candidates_result.scalar_one()

    # Allow deletion only if: registration has not started OR nobody has registered
    if registration_started and candidate_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete exam. Registration has started and there are {candidate_count} registered candidate(s).",
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

    # Get application fee (prefer "all types" fee, otherwise get first one)
    # First try to get the "all types" fee (registration_type is NULL)
    app_fee_stmt = select(RegistrationApplicationFee).where(
        and_(
            RegistrationApplicationFee.exam_id == exam_id,
            RegistrationApplicationFee.registration_type.is_(None)
        )
    )
    app_fee_result = await session.execute(app_fee_stmt)
    application_fee = app_fee_result.scalar_one_or_none()

    # If no "all types" fee exists, get the first one (for backward compatibility)
    if not application_fee:
        app_fee_stmt = select(RegistrationApplicationFee).where(
            RegistrationApplicationFee.exam_id == exam_id
        ).limit(1)
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

    # Get programme pricing with programme details
    programme_pricing_stmt = (
        select(ProgrammePricing)
        .where(ProgrammePricing.exam_id == exam_id)
        .options(selectinload(ProgrammePricing.programme))
        .order_by(ProgrammePricing.programme_id)
    )
    programme_pricing_result = await session.execute(programme_pricing_stmt)
    programme_pricing_list = programme_pricing_result.scalars().all()

    # Get pricing models (handle case where table doesn't exist yet)
    pricing_models_list = []
    try:
        pricing_models_stmt = select(ExamPricingModel).where(
            ExamPricingModel.exam_id == exam_id
        ).order_by(ExamPricingModel.registration_type)
        pricing_models_result = await session.execute(pricing_models_stmt)
        pricing_models_list = pricing_models_result.scalars().all()
    except Exception as e:
        # Table might not exist yet if migration hasn't been run
        # Log the error but continue with empty list
        logging.warning(f"Could not load pricing models (table may not exist): {str(e)}")

    return ExamPricingResponse(
        exam_id=exam_id,
        application_fee=ApplicationFeeResponse.model_validate(application_fee) if application_fee else None,
        subject_pricing=[SubjectPricingResponse.model_validate(sp) for sp in subject_pricing_list],
        tiered_pricing=[TieredPricingResponse.model_validate(tp) for tp in tiered_pricing_list],
        programme_pricing=[ProgrammePricingResponse.model_validate(pp) for pp in programme_pricing_list],
        pricing_models=[ExamPricingModelResponse.model_validate(pm) for pm in pricing_models_list],
    )


@router.get("/exams/{exam_id}/pricing/application-fee", response_model=ApplicationFeeResponse)
async def get_application_fee(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    registration_type: str | None = Query(None),
) -> ApplicationFeeResponse:
    """Get application fee for an exam and registration type."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    stmt = select(RegistrationApplicationFee).where(
        and_(
            RegistrationApplicationFee.exam_id == exam_id,
            RegistrationApplicationFee.registration_type == registration_type if registration_type else RegistrationApplicationFee.registration_type.is_(None)
        )
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

    # Convert registration_type string to enum if provided
    registration_type_enum = None
    if fee_data.registration_type:
        try:
            registration_type_enum = RegistrationType(fee_data.registration_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid registration_type: {fee_data.registration_type}. Must be one of: fee_paying, free_tvet, private, referral"
            )

    # Check if application fee exists
    existing_stmt = select(RegistrationApplicationFee).where(
        and_(
            RegistrationApplicationFee.exam_id == exam_id,
            RegistrationApplicationFee.registration_type == registration_type_enum
        )
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
            registration_type=registration_type_enum,
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
    registration_type: str | None = Query(None),
) -> None:
    """Delete application fee for an exam and registration type."""
    registration_type_enum = None
    if registration_type:
        try:
            registration_type_enum = RegistrationType(registration_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid registration_type: {registration_type}. Must be one of: fee_paying, free_tvet, private, referral"
            )

    stmt = select(RegistrationApplicationFee).where(
        and_(
            RegistrationApplicationFee.exam_id == exam_id,
            RegistrationApplicationFee.registration_type == registration_type_enum
        )
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
    registration_type: str | None = Query(None),
) -> list[SubjectPricingResponse]:
    """Get subject pricing for an exam, optionally filtered by registration type."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    registration_type_enum = None
    if registration_type:
        try:
            registration_type_enum = RegistrationType(registration_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid registration_type: {registration_type}. Must be one of: fee_paying, free_tvet, private, referral"
            )

    conditions = [SubjectPricing.exam_id == exam_id]
    if registration_type_enum is not None:
        conditions.append(SubjectPricing.registration_type == registration_type_enum)

    stmt = (
        select(SubjectPricing)
        .where(and_(*conditions))
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
        # Convert registration_type string to enum if provided
        registration_type_enum = None
        if pricing_item.registration_type:
            try:
                registration_type_enum = RegistrationType(pricing_item.registration_type)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid registration_type: {pricing_item.registration_type}. Must be one of: fee_paying, free_tvet, private, referral"
                )

        # Check if pricing exists
        existing_stmt = select(SubjectPricing).where(
            and_(
                SubjectPricing.exam_id == exam_id,
                SubjectPricing.subject_id == pricing_item.subject_id,
                SubjectPricing.registration_type == registration_type_enum
            )
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
                registration_type=registration_type_enum,
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


@router.post("/exams/{exam_id}/pricing/subjects/upload", response_model=list[SubjectPricingResponse])
async def upload_subject_pricing(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    file: UploadFile = File(...),
) -> list[SubjectPricingResponse]:
    """Upload subject pricing from Excel or CSV file."""
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
        df = parse_subject_pricing_upload_file(file_content, file.filename or "unknown")
        validate_subject_pricing_columns(df)
    except (SubjectPricingUploadParseError, SubjectPricingUploadValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Get all subjects to create a lookup map by original_code (fallback to code)
    subjects_stmt = select(Subject)
    subjects_result = await session.execute(subjects_stmt)
    all_subjects = subjects_result.scalars().all()
    subjects_by_original_code = {}
    subjects_by_code = {}
    for subject in all_subjects:
        if subject.original_code:
            subjects_by_original_code[subject.original_code] = subject
        subjects_by_code[subject.code] = subject

    # Process each row
    errors: list[str] = []
    pricing_to_save: list[SubjectPricingCreate] = []

    for idx, row in df.iterrows():
        row_number = int(idx) + 2  # +2 because Excel rows are 1-indexed and header is row 1
        try:
            # Parse row data
            pricing_data = parse_subject_pricing_row(row)

            # Validate required fields
            if not pricing_data["original_code"]:
                errors.append(f"Row {row_number}: Original code is required")
                continue

            if pricing_data["price"] is None or pricing_data["price"] <= 0:
                errors.append(f"Row {row_number}: Valid price (greater than 0) is required")
                continue

            # Lookup subject by original_code (fallback to code)
            subject = subjects_by_original_code.get(pricing_data["original_code"])
            if not subject:
                subject = subjects_by_code.get(pricing_data["original_code"])
            if not subject:
                errors.append(f"Row {row_number}: Subject with original_code/code '{pricing_data['original_code']}' not found")
                continue

            pricing_to_save.append(
                SubjectPricingCreate(
                    subject_id=subject.id,
                    price=Decimal(str(pricing_data["price"])),
                    currency="GHS",
                    is_active=True,
                )
            )
        except Exception as e:
            errors.append(f"Row {row_number}: {str(e)}")
            continue

    if not pricing_to_save:
        error_message = "No valid pricing data found in file"
        if errors:
            error_message += f". Errors encountered:\n" + "\n".join(errors[:10])
            if len(errors) > 10:
                error_message += f"\n... and {len(errors) - 10} more errors"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_message,
        )

    # If there are errors but also valid data, log warnings but continue
    if errors:
        logging.warning(f"Subject pricing upload for exam {exam_id} completed with {len(errors)} errors: {', '.join(errors[:5])}")

    # Create or update pricing using bulk update
    from app.schemas.pricing import SubjectPricingBulkUpdate
    bulk_update = SubjectPricingBulkUpdate(pricing=pricing_to_save)

    # Verify all subjects exist (already done above)
    subject_ids = [p.subject_id for p in pricing_to_save]
    existing_subjects = {s.id for s in all_subjects}
    missing_subjects = set(subject_ids) - existing_subjects
    if missing_subjects:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Subjects not found: {', '.join(map(str, missing_subjects))}",
        )

    # Create or update pricing
    updated_pricing = []
    for pricing_item in bulk_update.pricing:
        existing_stmt = select(SubjectPricing).where(
            SubjectPricing.exam_id == exam_id,
            SubjectPricing.subject_id == pricing_item.subject_id,
        )
        existing_result = await session.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()

        if existing:
            existing.price = pricing_item.price
            existing.currency = pricing_item.currency
            existing.is_active = pricing_item.is_active
            updated_pricing.append(existing)
        else:
            new_pricing = SubjectPricing(
                exam_id=exam_id,
                subject_id=pricing_item.subject_id,
                price=pricing_item.price,
                currency=pricing_item.currency,
                is_active=pricing_item.is_active,
            )
            session.add(new_pricing)
            updated_pricing.append(new_pricing)

    await session.commit()

    # Refresh all updated pricing with subject relationship
    for pricing in updated_pricing:
        await session.refresh(pricing, ["subject"])

    return [SubjectPricingResponse.model_validate(p) for p in updated_pricing]


@router.get("/exams/{exam_id}/pricing/subjects/template")
async def download_subject_pricing_template(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> StreamingResponse:
    """Download Excel template for subject pricing upload."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    try:
        template_bytes = await generate_subject_pricing_template(session, exam_id)
        return StreamingResponse(
            io.BytesIO(template_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="subject_pricing_template_{exam_id}.xlsx"'},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}",
        )


@router.get("/exams/{exam_id}/pricing/tiered", response_model=list[TieredPricingResponse])
async def get_tiered_pricing(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    registration_type: str | None = Query(None),
) -> list[TieredPricingResponse]:
    """Get tiered pricing for an exam, optionally filtered by registration type."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    registration_type_enum = None
    if registration_type:
        try:
            registration_type_enum = RegistrationType(registration_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid registration_type: {registration_type}. Must be one of: fee_paying, free_tvet, private, referral"
            )

    conditions = [RegistrationTieredPricing.exam_id == exam_id]
    if registration_type_enum is not None:
        conditions.append(RegistrationTieredPricing.registration_type == registration_type_enum)

    stmt = select(RegistrationTieredPricing).where(
        and_(*conditions)
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

    # Validate no overlapping ranges (per registration_type)
    tiers = pricing_data.pricing
    # Group tiers by registration_type for overlap checking
    tiers_by_reg_type: dict[str | None, list] = {}
    for tier in tiers:
        reg_type = tier.registration_type
        if reg_type not in tiers_by_reg_type:
            tiers_by_reg_type[reg_type] = []
        tiers_by_reg_type[reg_type].append(tier)

    for reg_type, type_tiers in tiers_by_reg_type.items():
        for i, tier1 in enumerate(type_tiers):
            for tier2 in type_tiers[i + 1:]:
                # Check for overlap
                min1, max1 = tier1.min_subjects, tier1.max_subjects or float('inf')
                min2, max2 = tier2.min_subjects, tier2.max_subjects or float('inf')
                if not (max1 < min2 or max2 < min1):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Tiered pricing ranges overlap for registration_type={reg_type}: ({tier1.min_subjects}-{tier1.max_subjects or '∞'}) and ({tier2.min_subjects}-{tier2.max_subjects or '∞'})",
                    )

    # Delete existing tiered pricing for this exam (all registration types)
    delete_stmt = delete(RegistrationTieredPricing).where(
        RegistrationTieredPricing.exam_id == exam_id
    )
    await session.execute(delete_stmt)

    # Create new tiered pricing
    created_pricing = []
    for tier_item in tiers:
        # Convert registration_type string to enum if provided
        registration_type_enum = None
        if tier_item.registration_type:
            try:
                registration_type_enum = RegistrationType(tier_item.registration_type)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid registration_type: {tier_item.registration_type}. Must be one of: fee_paying, free_tvet, private, referral"
                )

        new_tier = RegistrationTieredPricing(
            exam_id=exam_id,
            registration_type=registration_type_enum,
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


@router.get("/exams/{exam_id}/pricing/programmes", response_model=list[ProgrammePricingResponse])
async def get_programme_pricing(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    registration_type: str | None = Query(None),
) -> list[ProgrammePricingResponse]:
    """Get programme pricing for an exam, optionally filtered by registration type."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    registration_type_enum = None
    if registration_type:
        try:
            registration_type_enum = RegistrationType(registration_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid registration_type: {registration_type}. Must be one of: fee_paying, free_tvet, private, referral"
            )

    conditions = [ProgrammePricing.exam_id == exam_id]
    if registration_type_enum is not None:
        conditions.append(ProgrammePricing.registration_type == registration_type_enum)

    stmt = (
        select(ProgrammePricing)
        .where(and_(*conditions))
        .options(selectinload(ProgrammePricing.programme))
        .order_by(ProgrammePricing.programme_id)
    )
    result = await session.execute(stmt)
    pricing_list = result.scalars().all()

    return [ProgrammePricingResponse.model_validate(p) for p in pricing_list]


@router.post("/exams/{exam_id}/pricing/programmes", response_model=list[ProgrammePricingResponse])
async def create_or_update_programme_pricing(
    exam_id: int,
    pricing_data: ProgrammePricingBulkUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> list[ProgrammePricingResponse]:
    """Create or update programme pricing for an exam (bulk operation)."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Verify all programmes exist
    programme_ids = [p.programme_id for p in pricing_data.pricing]
    programmes_stmt = select(Programme).where(Programme.id.in_(programme_ids))
    programmes_result = await session.execute(programmes_stmt)
    existing_programmes = {p.id for p in programmes_result.scalars().all()}

    missing_programmes = set(programme_ids) - existing_programmes
    if missing_programmes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Programmes not found: {', '.join(map(str, missing_programmes))}",
        )

    # Create or update pricing
    updated_pricing = []
    for pricing_item in pricing_data.pricing:
        # Convert registration_type string to enum if provided
        registration_type_enum = None
        if pricing_item.registration_type:
            try:
                registration_type_enum = RegistrationType(pricing_item.registration_type)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid registration_type: {pricing_item.registration_type}. Must be one of: fee_paying, free_tvet, private, referral"
                )

        existing_stmt = select(ProgrammePricing).where(
            and_(
                ProgrammePricing.exam_id == exam_id,
                ProgrammePricing.programme_id == pricing_item.programme_id,
                ProgrammePricing.registration_type == registration_type_enum
            )
        )
        existing_result = await session.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()

        if existing:
            existing.price = pricing_item.price
            existing.currency = pricing_item.currency
            existing.is_active = pricing_item.is_active
            updated_pricing.append(existing)
        else:
            new_pricing = ProgrammePricing(
                exam_id=exam_id,
                programme_id=pricing_item.programme_id,
                registration_type=registration_type_enum,
                price=pricing_item.price,
                currency=pricing_item.currency,
                is_active=pricing_item.is_active,
            )
            session.add(new_pricing)
            updated_pricing.append(new_pricing)

    await session.commit()

    # Refresh all updated pricing with programme relationship
    for pricing in updated_pricing:
        await session.refresh(pricing, ["programme"])

    return [ProgrammePricingResponse.model_validate(p) for p in updated_pricing]


@router.delete("/exams/{exam_id}/pricing/programmes/{programme_pricing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_programme_pricing(
    exam_id: int,
    programme_pricing_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> None:
    """Delete programme pricing."""
    stmt = select(ProgrammePricing).where(
        ProgrammePricing.id == programme_pricing_id,
        ProgrammePricing.exam_id == exam_id,
    )
    result = await session.execute(stmt)
    programme_pricing = result.scalar_one_or_none()

    if not programme_pricing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme pricing not found")

    await session.delete(programme_pricing)
    await session.commit()


@router.get("/exams/{exam_id}/pricing/programmes/template")
async def download_programme_pricing_template(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> StreamingResponse:
    """Download Excel template for programme pricing upload."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    try:
        template_bytes = await generate_programme_pricing_template(session, exam_id)
        return StreamingResponse(
            io.BytesIO(template_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="programme_pricing_template_{exam_id}.xlsx"'},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}",
        )


@router.post("/exams/{exam_id}/pricing/programmes/upload", response_model=list[ProgrammePricingResponse])
async def upload_programme_pricing(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    file: UploadFile = File(...),
) -> list[ProgrammePricingResponse]:
    """Upload programme pricing from Excel or CSV file."""
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
        df = parse_programme_pricing_upload_file(file_content, file.filename or "unknown")
        validate_programme_pricing_columns(df)
    except (ProgrammePricingUploadParseError, ProgrammePricingUploadValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Get all programmes to create a lookup map by code
    programmes_stmt = select(Programme)
    programmes_result = await session.execute(programmes_stmt)
    all_programmes = programmes_result.scalars().all()
    programmes_by_code = {p.code: p for p in all_programmes}

    # Process each row
    errors: list[str] = []
    pricing_to_save: list[ProgrammePricingCreate] = []

    for idx, row in df.iterrows():
        row_number = int(idx) + 2  # +2 because Excel rows are 1-indexed and header is row 1
        try:
            # Parse row data
            pricing_data = parse_programme_pricing_row(row)

            # Validate required fields
            if not pricing_data["programme_code"]:
                errors.append(f"Row {row_number}: Programme code is required")
                continue

            if pricing_data["price"] is None or pricing_data["price"] <= 0:
                errors.append(f"Row {row_number}: Valid price (greater than 0) is required")
                continue

            # Lookup programme by code
            programme = programmes_by_code.get(pricing_data["programme_code"])
            if not programme:
                errors.append(f"Row {row_number}: Programme with code '{pricing_data['programme_code']}' not found")
                continue

            pricing_to_save.append(
                ProgrammePricingCreate(
                    programme_id=programme.id,
                    price=Decimal(str(pricing_data["price"])),
                    currency="GHS",
                    is_active=True,
                )
            )
        except Exception as e:
            errors.append(f"Row {row_number}: {str(e)}")
            continue

    if not pricing_to_save:
        error_message = "No valid pricing data found in file"
        if errors:
            error_message += f". Errors encountered:\n" + "\n".join(errors[:10])
            if len(errors) > 10:
                error_message += f"\n... and {len(errors) - 10} more errors"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_message,
        )

    # If there are errors but also valid data, log warnings but continue
    if errors:
        logging.warning(f"Programme pricing upload for exam {exam_id} completed with {len(errors)} errors: {', '.join(errors[:5])}")

    # Create or update pricing using bulk update
    from app.schemas.pricing import ProgrammePricingBulkUpdate
    bulk_update = ProgrammePricingBulkUpdate(pricing=pricing_to_save)

    # Use existing bulk update logic
    # Verify all programmes exist (already done above)
    programme_ids = [p.programme_id for p in pricing_to_save]
    existing_programmes = {p.id for p in all_programmes}
    missing_programmes = set(programme_ids) - existing_programmes
    if missing_programmes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Programmes not found: {', '.join(map(str, missing_programmes))}",
        )

    # Create or update pricing
    updated_pricing = []
    for pricing_item in bulk_update.pricing:
        existing_stmt = select(ProgrammePricing).where(
            ProgrammePricing.exam_id == exam_id,
            ProgrammePricing.programme_id == pricing_item.programme_id,
        )
        existing_result = await session.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()

        if existing:
            existing.price = pricing_item.price
            existing.currency = pricing_item.currency
            existing.is_active = pricing_item.is_active
            updated_pricing.append(existing)
        else:
            new_pricing = ProgrammePricing(
                exam_id=exam_id,
                programme_id=pricing_item.programme_id,
                price=pricing_item.price,
                currency=pricing_item.currency,
                is_active=pricing_item.is_active,
            )
            session.add(new_pricing)
            updated_pricing.append(new_pricing)

    await session.commit()

    # Refresh all updated pricing with programme relationship
    for pricing in updated_pricing:
        await session.refresh(pricing, ["programme"])

    return [ProgrammePricingResponse.model_validate(p) for p in updated_pricing]


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
        # Import application fees (all registration types)
        if import_data.import_application_fee:
            source_fees_stmt = select(RegistrationApplicationFee).where(
                RegistrationApplicationFee.exam_id == import_data.source_exam_id
            )
            source_fees_result = await session.execute(source_fees_stmt)
            source_fees_list = source_fees_result.scalars().all()

            if source_fees_list:
                # Delete existing application fees for target exam
                delete_fee_stmt = delete(RegistrationApplicationFee).where(
                    RegistrationApplicationFee.exam_id == exam_id
                )
                await session.execute(delete_fee_stmt)

                # Create new application fees (preserving registration_type)
                for source_fee in source_fees_list:
                    new_fee = RegistrationApplicationFee(
                        exam_id=exam_id,
                        registration_type=source_fee.registration_type,
                        fee=source_fee.fee,
                        currency=source_fee.currency,
                        is_active=source_fee.is_active,
                    )
                    session.add(new_fee)
                imported_count += len(source_fees_list)

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

                # Create new subject pricing (preserving registration_type)
                for source_sp in source_subject_pricing_list:
                    new_sp = SubjectPricing(
                        exam_id=exam_id,
                        subject_id=source_sp.subject_id,
                        registration_type=source_sp.registration_type,
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

                # Create new tiered pricing (preserving registration_type)
                for source_tp in source_tiered_list:
                    new_tp = RegistrationTieredPricing(
                        exam_id=exam_id,
                        registration_type=source_tp.registration_type,
                        min_subjects=source_tp.min_subjects,
                        max_subjects=source_tp.max_subjects,
                        price=source_tp.price,
                        currency=source_tp.currency,
                        is_active=source_tp.is_active,
                    )
                    session.add(new_tp)
                imported_count += len(source_tiered_list)

        # Import programme pricing
        if import_data.import_programme_pricing:
            source_programme_pricing_stmt = select(ProgrammePricing).where(
                ProgrammePricing.exam_id == import_data.source_exam_id
            )
            source_programme_pricing_result = await session.execute(source_programme_pricing_stmt)
            source_programme_pricing_list = source_programme_pricing_result.scalars().all()

            if source_programme_pricing_list:
                # Delete existing programme pricing for target exam
                delete_programme_stmt = delete(ProgrammePricing).where(
                    ProgrammePricing.exam_id == exam_id
                )
                await session.execute(delete_programme_stmt)

                # Create new programme pricing (preserving registration_type)
                for source_pp in source_programme_pricing_list:
                    new_pp = ProgrammePricing(
                        exam_id=exam_id,
                        programme_id=source_pp.programme_id,
                        registration_type=source_pp.registration_type,
                        price=source_pp.price,
                        currency=source_pp.currency,
                        is_active=source_pp.is_active,
                    )
                    session.add(new_pp)
                imported_count += len(source_programme_pricing_list)

        # Import pricing models
        if import_data.import_pricing_models:
            try:
                source_pricing_models_stmt = select(ExamPricingModel).where(
                    ExamPricingModel.exam_id == import_data.source_exam_id
                )
                source_pricing_models_result = await session.execute(source_pricing_models_stmt)
                source_pricing_models_list = source_pricing_models_result.scalars().all()

                if source_pricing_models_list:
                    # Delete existing pricing models for target exam
                    delete_models_stmt = delete(ExamPricingModel).where(
                        ExamPricingModel.exam_id == exam_id
                    )
                    await session.execute(delete_models_stmt)

                    # Create new pricing models (preserving registration_type)
                    for source_pm in source_pricing_models_list:
                        new_pm = ExamPricingModel(
                            exam_id=exam_id,
                            registration_type=source_pm.registration_type,
                            pricing_model_preference=source_pm.pricing_model_preference,
                        )
                        session.add(new_pm)
                    imported_count += len(source_pricing_models_list)
            except Exception as e:
                # Table might not exist yet - log warning but continue
                logging.warning(f"Could not import pricing models (table may not exist): {str(e)}")

        await session.commit()
        return {"message": "Pricing imported successfully", "items_imported": imported_count}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error importing pricing: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to import pricing: {str(e)}",
        )


@router.get("/exams/{exam_id}/pricing/models", response_model=list[ExamPricingModelResponse])
async def get_pricing_models(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> list[ExamPricingModelResponse]:
    """Get pricing models for an exam."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Handle case where table doesn't exist yet
    try:
        stmt = select(ExamPricingModel).where(
            ExamPricingModel.exam_id == exam_id
        ).order_by(ExamPricingModel.registration_type)
        result = await session.execute(stmt)
        pricing_models = result.scalars().all()
        return [ExamPricingModelResponse.model_validate(pm) for pm in pricing_models]
    except Exception as e:
        # Table might not exist yet if migration hasn't been run
        logging.warning(f"Could not load pricing models (table may not exist): {str(e)}")
        return []


@router.post("/exams/{exam_id}/pricing/models", response_model=ExamPricingModelResponse)
async def create_or_update_pricing_model(
    exam_id: int,
    model_data: ExamPricingModelCreate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ExamPricingModelResponse:
    """Create or update pricing model for an exam and registration type."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Validate pricing model
    valid_models = ["auto", "per_subject", "tiered", "per_programme"]
    if model_data.pricing_model_preference not in valid_models:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid pricing_model_preference. Must be one of: {', '.join(valid_models)}"
        )

    # Convert registration_type string to enum if provided
    registration_type_enum = None
    if model_data.registration_type:
        try:
            registration_type_enum = RegistrationType(model_data.registration_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid registration_type: {model_data.registration_type}. Must be one of: fee_paying, free_tvet, private, referral"
            )

    # Referral and private only support per_subject / tiered
    if (
        model_data.pricing_model_preference == "per_programme"
        and model_data.registration_type in ("referral", "private")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Per-programme pricing is not allowed for {model_data.registration_type}. "
                "Use per_subject or tiered instead."
            ),
        )

    # Handle case where table doesn't exist yet
    try:
        # Check if pricing model exists
        existing_stmt = select(ExamPricingModel).where(
            and_(
                ExamPricingModel.exam_id == exam_id,
                ExamPricingModel.registration_type == registration_type_enum
            )
        )
        existing_result = await session.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()

        if existing:
            # Update existing
            existing.pricing_model_preference = model_data.pricing_model_preference
            await session.commit()
            await session.refresh(existing)
            return ExamPricingModelResponse.model_validate(existing)
        else:
            # Create new
            new_model = ExamPricingModel(
                exam_id=exam_id,
                registration_type=registration_type_enum,
                pricing_model_preference=model_data.pricing_model_preference,
            )
            session.add(new_model)
            await session.commit()
            await session.refresh(new_model)
            return ExamPricingModelResponse.model_validate(new_model)
    except Exception as e:
        # Table might not exist yet
        if "does not exist" in str(e) or "UndefinedTableError" in str(type(e).__name__):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Pricing models table does not exist. Please run database migrations first."
            )
        raise


@router.delete("/exams/{exam_id}/pricing/models", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pricing_model(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    registration_type: str | None = Query(None),
) -> None:
    """Delete pricing model for an exam and registration type."""
    registration_type_enum = None
    if registration_type:
        try:
            registration_type_enum = RegistrationType(registration_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid registration_type: {registration_type}. Must be one of: fee_paying, free_tvet, private, referral"
            )

    try:
        stmt = select(ExamPricingModel).where(
            and_(
                ExamPricingModel.exam_id == exam_id,
                ExamPricingModel.registration_type == registration_type_enum
            )
        )
        result = await session.execute(stmt)
        pricing_model = result.scalar_one_or_none()

        if not pricing_model:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pricing model not found")

        await session.delete(pricing_model)
        await session.commit()
    except Exception as e:
        # Table might not exist yet
        if "does not exist" in str(e) or "UndefinedTableError" in str(type(e).__name__):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Pricing models table does not exist. Please run database migrations first."
            )
        raise


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

        # Format filename: {year}_{exam_series}_{exam_type}.xlsx
        # Sanitize exam fields
        exam_type_safe = (exam.exam_type or "").replace(" ", "_").replace("/", "_").replace("\\", "_")
        exam_series_safe = (exam.exam_series or "").replace("/", "_").replace("\\", "_") if exam.exam_series else ""
        # Build filename parts: {year}_{exam_series}_{exam_type}
        parts = [str(exam.year)]
        if exam_series_safe:
            parts.append(exam_series_safe)
        parts.append(exam_type_safe)
        filename = "_".join(parts) + ".xlsx"
        # Remove any double underscores and trailing underscores before the extension
        filename = filename.replace("__", "_").replace("_.xlsx", ".xlsx").replace("_.XLSX", ".XLSX")

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

    # Format filename: {year}_{exam_series}_{exam_type}.xlsx
    # Sanitize exam fields
    exam_type_safe = (exam.exam_type or "").replace(" ", "_").replace("/", "_").replace("\\", "_")
    exam_series_safe = (exam.exam_series or "").replace("/", "_").replace("\\", "_") if exam.exam_series else ""
    # Build filename parts: {year}_{exam_series}_{exam_type}
    parts = [str(exam.year)]
    if exam_series_safe:
        parts.append(exam_series_safe)
    parts.append(exam_type_safe)
    filename = "_".join(parts) + ".xlsx"
    # Remove any double underscores and trailing underscores before the extension
    filename = filename.replace("__", "_").replace("_.xlsx", ".xlsx").replace("_.XLSX", ".XLSX")

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exams/{exam_id}/candidates/import-template")
async def get_candidates_import_template(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
):
    """Return CSV template for admin candidate import. All columns are string headers with one example row."""
    stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    headers = [
        "firstname",
        "lastname",
        "othername",
        "registration_number",
        "index_number",
        "school_code",
        "programme_code",
        "registration_type",
        "subject_codes",
    ]
    example_row = [
        "John",
        "Doe",
        "",
        "",
        "",
        "",
        "1010",
        "free_tvet",
        "C701,C702",
    ]
    buf = io.StringIO()
    import csv as csv_module
    writer = csv_module.writer(buf)
    writer.writerow(headers)
    writer.writerow(example_row)
    filename = f"candidates_import_template_{exam.year}_{(exam.exam_series or '').replace('/', '_')}.csv"
    return StreamingResponse(
        iter([buf.getvalue().encode("utf-8")]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/exams/{exam_id}/candidates/import", response_model=BulkUploadResponse, status_code=status.HTTP_200_OK)
async def import_candidates(
    exam_id: int,
    file: UploadFile = File(...),
    default_registration_type: str | None = Form(None, description="Default registration type when row omits it"),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> BulkUploadResponse:
    """Admin import candidates via CSV or Excel. All columns are read as strings. Subject selection is validated by registration_type (private, referral, free_tvet). When school_code is omitted, registration_number must be provided and unique."""
    from dateutil import parser as date_parser

    stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    file_content = await file.read()
    filename = file.filename or "unknown"
    try:
        if filename.endswith(".csv"):
            try:
                text_content = file_content.decode("utf-8")
            except UnicodeDecodeError:
                text_content = file_content.decode("latin-1")
            df = pd.read_csv(io.StringIO(text_content), dtype=str)
            df = df.fillna("")
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_content), engine="openpyxl", dtype=str)
            df = df.fillna("")
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be CSV or Excel format (.csv, .xlsx, .xls)",
            )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Error parsing file: {str(exc)}")

    df.columns = df.columns.str.strip()
    column_mapping = {col.lower(): col for col in df.columns}
    has_name = "name" in column_mapping
    has_firstname = "firstname" in column_mapping
    has_lastname = "lastname" in column_mapping
    if not has_name and not (has_firstname and has_lastname):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing required columns: name (or firstname and lastname)",
        )

    normalized_series = normalize_exam_series(exam.exam_series)
    is_may_june = normalized_series == "MAY/JUNE"
    is_nov_dec = normalized_series == "NOV/DEC"

    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[BulkUploadError] = []

    def get_col(row_data: Any, key: str, default: str = "") -> str:
        """Get column value as string; always trim leading and trailing whitespace."""
        key_lower = key.lower()
        if key_lower in column_mapping:
            val = row_data[column_mapping[key_lower]]
            return "" if pd.isna(val) else str(val).strip()
        return default

    for idx, row in df.iterrows():
        row_number = int(idx) + 2

        firstname = get_col(row, "firstname")
        lastname = get_col(row, "lastname")
        # Othername: do not insert if missing or only whitespace (store None)
        _other = get_col(row, "othername")
        othername = _other if (_other and _other.strip()) else None
        if not firstname or not lastname:
            name = get_col(row, "name")
            if not name:
                errors.append(BulkUploadError(row_number=row_number, error_message="Name (or firstname and lastname) is required", field="name"))
                failed += 1
                continue
            parts = [p.strip() for p in name.split()]
            if len(parts) >= 2:
                firstname, lastname = parts[0], parts[1]
                othername = parts[2] if len(parts) >= 3 and parts[2] else None
            else:
                errors.append(BulkUploadError(row_number=row_number, error_message="Name must contain at least firstname and lastname", field="name"))
                failed += 1
                continue

        registration_number_str = get_col(row, "registration_number")
        index_number_str = get_col(row, "index_number") or None
        school_code_str = get_col(row, "school_code") or None
        programme_code_str = get_col(row, "programme_code") or None
        programme_id_str = get_col(row, "programme_id") or None
        registration_type_str = get_col(row, "registration_type") or default_registration_type
        if registration_type_str:
            registration_type_str = registration_type_str.strip().lower()

        date_of_birth = None
        dob_str = get_col(row, "date_of_birth") or get_col(row, "dob")
        if dob_str:
            try:
                date_of_birth = date_parser.parse(dob_str).date()
            except Exception:
                pass
        gender = get_col(row, "gender") or None
        contact_email = get_col(row, "contact_email") or get_col(row, "email") or None
        contact_phone = get_col(row, "contact_phone") or get_col(row, "phone") or None
        address = get_col(row, "address") or None
        national_id = get_col(row, "national_id") or None
        disability_str = get_col(row, "disability") or None
        disability = None
        if disability_str:
            try:
                disability = Disability(disability_str.strip())
            except ValueError:
                disability = None
        guardian_name = get_col(row, "guardian_name") or None
        guardian_phone = get_col(row, "guardian_phone") or None
        guardian_digital_address = get_col(row, "guardian_digital_address") or None
        guardian_national_id = get_col(row, "guardian_national_id") or None

        school_id = None
        allows_free_tvet_row: bool | None = None
        if school_code_str:
            school_stmt = select(School).where(School.code == school_code_str)
            school_result = await session.execute(school_stmt)
            school = school_result.scalar_one_or_none()
            if not school:
                errors.append(BulkUploadError(row_number=row_number, error_message=f"School with code '{school_code_str}' not found", field="school_code"))
                failed += 1
                continue
            school_id = school.id
            allows_free_tvet_row = await school_allows_free_tvet_for_exam(
                session, exam.id, school_id
            )

        try:
            if exam.exam_kind == ExamKind.PRIVATE or (
                hasattr(exam.exam_kind, "value") and exam.exam_kind.value == "private"
            ):
                default_type = RegistrationType.PRIVATE.value
            elif allows_free_tvet_row is True:
                default_type = RegistrationType.FREE_TVET.value
            else:
                default_type = RegistrationType.FEE_PAYING.value
            candidate_registration_type = validate_registration_type_for_exam(
                exam,
                registration_type_str or default_type,
                is_school_registration=True,
                allows_free_tvet=allows_free_tvet_row,
            )
        except HTTPException as exc:
            errors.append(
                BulkUploadError(
                    row_number=row_number,
                    error_message=str(exc.detail),
                    field="registration_type",
                )
            )
            failed += 1
            continue

        programme_id = None
        if programme_code_str:
            prog_stmt = select(Programme).where(Programme.code == programme_code_str)
            prog_result = await session.execute(prog_stmt)
            programme = prog_result.scalar_one_or_none()
            if not programme:
                errors.append(BulkUploadError(row_number=row_number, error_message=f"Programme with code '{programme_code_str}' not found", field="programme_code"))
                failed += 1
                continue
            programme_id = programme.id
        elif programme_id_str:
            try:
                pid = int(programme_id_str)
                prog_stmt = select(Programme).where(Programme.id == pid)
                prog_result = await session.execute(prog_stmt)
                programme = prog_result.scalar_one_or_none()
                if not programme:
                    errors.append(BulkUploadError(row_number=row_number, error_message=f"Programme with id '{programme_id_str}' not found", field="programme_id"))
                    failed += 1
                    continue
                programme_id = programme.id
            except ValueError:
                errors.append(BulkUploadError(row_number=row_number, error_message=f"Invalid programme_id: {programme_id_str}", field="programme_id"))
                failed += 1
                continue

        subject_codes_str = get_col(row, "subject_codes") or get_col(row, "subject codes")
        subject_ids_str = get_col(row, "subject_ids") or get_col(row, "subject ids")
        selected_subject_ids: list[int] = []
        if subject_codes_str:
            for code in [s.strip() for s in subject_codes_str.split(",") if s.strip()]:
                subj_stmt = select(Subject).where(Subject.original_code == code)
                subj_res = await session.execute(subj_stmt)
                subj = subj_res.scalar_one_or_none()
                if not subj:
                    subj_stmt = select(Subject).where(Subject.code == code)
                    subj_res = await session.execute(subj_stmt)
                    subj = subj_res.scalar_one_or_none()
                if subj:
                    selected_subject_ids.append(subj.id)
                else:
                    errors.append(BulkUploadError(row_number=row_number, error_message=f"Subject not found: {code}", field="subject_codes"))
                    failed += 1
                    continue
        if subject_ids_str:
            for part in subject_ids_str.split(","):
                part = part.strip()
                if not part:
                    continue
                try:
                    sid = int(part)
                    subj_stmt = select(Subject).where(Subject.id == sid)
                    subj_res = await session.execute(subj_stmt)
                    subj = subj_res.scalar_one_or_none()
                    if subj and subj.id not in selected_subject_ids:
                        selected_subject_ids.append(subj.id)
                except ValueError:
                    pass

        selected_subject_ids = list(set(selected_subject_ids))
        if selected_subject_ids and not programme_id:
            errors.append(BulkUploadError(row_number=row_number, error_message="programme_code or programme_id is required when subjects are provided", field="programme_code"))
            failed += 1
            continue

        if not programme_id:
            errors.append(BulkUploadError(
                row_number=row_number,
                error_message="programme_code or programme_id is required",
                field="programme_code",
            ))
            failed += 1
            continue

        is_valid, validation_errors = await validate_subject_selections(
            session,
            programme_id,
            selected_subject_ids,
            registration_type=candidate_registration_type,
        )
        if not is_valid:
            errors.append(BulkUploadError(
                row_number=row_number,
                error_message="; ".join(validation_errors),
                field="subjects",
            ))
            failed += 1
            continue

        if not school_id and not registration_number_str:
            errors.append(BulkUploadError(row_number=row_number, error_message="registration_number is required when school_code is not provided", field="registration_number"))
            failed += 1
            continue

        reg_num = None
        if registration_number_str:
            reg_num = registration_number_str.strip()
            check_stmt = select(RegistrationCandidate).where(RegistrationCandidate.registration_number == reg_num)
            check_result = await session.execute(check_stmt)
            if check_result.scalar_one_or_none():
                errors.append(BulkUploadError(row_number=row_number, error_message=f"registration_number '{reg_num}' already exists", field="registration_number"))
                failed += 1
                continue
        else:
            if not school_id:
                errors.append(BulkUploadError(row_number=row_number, error_message="registration_number is required when school_code is not provided", field="registration_number"))
                failed += 1
                continue
            try:
                reg_num = await generate_unique_registration_number(session, exam_id, school_id, candidate_registration_type)
            except (ValueError, RuntimeError) as e:
                errors.append(BulkUploadError(row_number=row_number, error_message=str(e), field="registration_number"))
                failed += 1
                continue

        index_number = index_number_str.strip() if index_number_str and index_number_str.strip() else None
        programme_code_for_candidate = programme_code_str or (None if not programme_id else None)
        if programme_id and not programme_code_for_candidate:
            prog_lookup = await session.get(Programme, programme_id)
            programme_code_for_candidate = prog_lookup.code if prog_lookup else None

        new_candidate = RegistrationCandidate(
            registration_exam_id=exam_id,
            school_id=school_id,
            portal_user_id=None,
            firstname=firstname,
            lastname=lastname,
            othername=othername,
            registration_number=reg_num,
            index_number=index_number,
            date_of_birth=date_of_birth,
            gender=gender,
            programme_code=programme_code_for_candidate,
            programme_id=programme_id,
            contact_email=contact_email,
            contact_phone=contact_phone,
            address=address,
            national_id=national_id,
            disability=disability,
            registration_type=candidate_registration_type,
            guardian_name=guardian_name,
            guardian_phone=guardian_phone,
            guardian_digital_address=guardian_digital_address,
            guardian_national_id=guardian_national_id,
            registration_status=RegistrationStatus.INCOMPLETE,
            fee_payment_status=default_fee_payment_status(candidate_registration_type),
        )
        session.add(new_candidate)
        await session.flush()
        for subject_id in selected_subject_ids:
            subj_stmt = select(Subject).where(Subject.id == subject_id)
            subj_res = await session.execute(subj_stmt)
            subj = subj_res.scalar_one_or_none()
            if subj:
                session.add(
                    RegistrationSubjectSelection(
                        registration_candidate_id=new_candidate.id,
                        subject_id=subj.id,
                        subject_code=subj.code,
                        subject_name=subj.name,
                    )
                )
        successful += 1

    await session.commit()
    return BulkUploadResponse(total_rows=total_rows, successful=successful, failed=failed, errors=errors)


@router.get("/candidates/photos/album", response_model=PhotoAlbumResponse)
async def get_admin_photo_album(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=10000),
    exam_id: int | None = Query(None, description="Filter by exam ID"),
    school_id: int | None = Query(None, description="Filter by school ID"),
    has_photo: bool | None = Query(None, description="Filter by presence of photo"),
) -> PhotoAlbumResponse:
    """Get photo album with pagination and filtering for system administrators."""
    offset = (page - 1) * page_size

    # Build base query for candidates
    base_stmt = select(RegistrationCandidate, School)
    base_stmt = base_stmt.join(School, RegistrationCandidate.school_id == School.id)

    # Apply filters
    if exam_id is not None:
        base_stmt = base_stmt.where(RegistrationCandidate.registration_exam_id == exam_id)

    if school_id is not None:
        base_stmt = base_stmt.where(RegistrationCandidate.school_id == school_id)

    # Get total count
    count_stmt = select(func.count(func.distinct(RegistrationCandidate.id)))
    if exam_id is not None:
        count_stmt = count_stmt.where(RegistrationCandidate.registration_exam_id == exam_id)
    if school_id is not None:
        count_stmt = count_stmt.where(RegistrationCandidate.school_id == school_id)
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # If has_photo filter is applied, we need to filter candidates
    if has_photo is not None:
        # Get all candidate IDs matching other filters
        all_candidates_stmt = select(RegistrationCandidate.id)
        if exam_id is not None:
            all_candidates_stmt = all_candidates_stmt.where(RegistrationCandidate.registration_exam_id == exam_id)
        if school_id is not None:
            all_candidates_stmt = all_candidates_stmt.where(RegistrationCandidate.school_id == school_id)

        all_candidates_result = await session.execute(all_candidates_stmt)
        all_candidate_ids = [row[0] for row in all_candidates_result.all()]

        # Filter by photo presence
        if has_photo:
            # Get candidates with photos
            photos_stmt = select(RegistrationCandidatePhoto.registration_candidate_id)
            if all_candidate_ids:
                photos_stmt = photos_stmt.where(RegistrationCandidatePhoto.registration_candidate_id.in_(all_candidate_ids))
            photos_result = await session.execute(photos_stmt)
            candidate_ids_with_photos = {row[0] for row in photos_result.all()}
            filtered_candidate_ids = [cid for cid in all_candidate_ids if cid in candidate_ids_with_photos]
        else:
            # Get candidates without photos
            photos_stmt = select(RegistrationCandidatePhoto.registration_candidate_id)
            if all_candidate_ids:
                photos_stmt = photos_stmt.where(RegistrationCandidatePhoto.registration_candidate_id.in_(all_candidate_ids))
            photos_result = await session.execute(photos_stmt)
            candidate_ids_with_photos = {row[0] for row in photos_result.all()}
            filtered_candidate_ids = [cid for cid in all_candidate_ids if cid not in candidate_ids_with_photos]

        # Update total and base query
        total = len(filtered_candidate_ids)
        if not filtered_candidate_ids:
            return PhotoAlbumResponse(
                items=[],
                total=0,
                page=page,
                page_size=page_size,
                total_pages=0,
            )

        base_stmt = base_stmt.where(RegistrationCandidate.id.in_(filtered_candidate_ids))

    # Get candidates
    stmt = base_stmt.offset(offset).limit(page_size).order_by(RegistrationCandidate.registration_number)
    result = await session.execute(stmt)
    candidate_school_pairs = result.all()

    # Build response items
    items: list[PhotoAlbumItem] = []
    for candidate, school in candidate_school_pairs:
        # Get photo for this candidate
        photo_stmt = select(RegistrationCandidatePhoto).where(
            RegistrationCandidatePhoto.registration_candidate_id == candidate.id
        )
        photo_result = await session.execute(photo_stmt)
        photo = photo_result.scalar_one_or_none()

        photo_response = RegistrationCandidatePhotoResponse.model_validate(photo) if photo else None

        items.append(
            PhotoAlbumItem(
                candidate_id=candidate.id,
                candidate_name=candidate.name,
                registration_number=candidate.registration_number,
                index_number=candidate.index_number,
                school_id=school.id if school else None,
                school_name=school.name if school else None,
                school_code=school.code if school else None,
                photo=photo_response,
            )
        )

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return PhotoAlbumResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


def sanitize_folder_name(name: str) -> str:
    """Remove special characters that could cause issues in file systems."""
    if not name:
        return ""
    # Remove or replace problematic characters: / \ : * ? " < > |
    # Replace spaces and other special chars with underscore
    sanitized = re.sub(r'[<>:"/\\|?*]', '', name)
    # Replace multiple spaces/underscores with single underscore
    sanitized = re.sub(r'[\s_]+', '_', sanitized)
    # Remove leading/trailing underscores
    sanitized = sanitized.strip('_')
    return sanitized


@router.get("/candidates/photos/export")
async def export_candidate_photos(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int = Query(..., description="Exam ID (required)"),
    school_id: int | None = Query(None, description="Filter by school ID"),
) -> StreamingResponse:
    """Export candidate photos as a ZIP file, named by registration number. Exam ID is required."""
    # Initialize photo storage service
    photo_storage_service = PhotoStorageService()

    # Build query for candidates with photos
    # exam_id is required, so we always filter by it
    base_stmt = (
        select(RegistrationCandidate, RegistrationCandidatePhoto, School, RegistrationExam)
        .join(RegistrationCandidatePhoto, RegistrationCandidate.id == RegistrationCandidatePhoto.registration_candidate_id)
        .join(School, RegistrationCandidate.school_id == School.id)
        .join(RegistrationExam, RegistrationCandidate.registration_exam_id == RegistrationExam.id)
        .where(RegistrationCandidate.registration_exam_id == exam_id)
    )

    # Apply school filter if provided
    if school_id is not None:
        base_stmt = base_stmt.where(RegistrationCandidate.school_id == school_id)

    # Execute query
    result = await session.execute(base_stmt)
    candidate_photo_school_exam_tuples = result.all()

    if not candidate_photo_school_exam_tuples:
        # Return empty ZIP if no photos found
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            pass
        zip_buffer.seek(0)

        # Get exam info for filename (exam_id is required)
        exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
        exam_result = await session.execute(exam_stmt)
        exam = exam_result.scalar_one_or_none()
        if exam:
            if exam.exam_series:
                filename = f"{exam.exam_type}_{exam.year}_{exam.exam_series}_photos.zip"
            else:
                filename = f"{exam.exam_type}_{exam.year}_photos.zip"
        else:
            filename = f"exam_{exam_id}_photos.zip"

        content_disposition = f'attachment; filename="{filename}"'
        return StreamingResponse(
            iter([zip_buffer.getvalue()]),
            media_type="application/zip",
            headers={
                "Content-Disposition": content_disposition,
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    # Create ZIP file in memory
    zip_buffer = io.BytesIO()
    logger = logging.getLogger(__name__)

    # Determine filename - exam_id is required, so we always use exam info
    # Use the exam from first result (all should have same exam if filtered)
    exam = candidate_photo_school_exam_tuples[0][3]
    if exam.exam_series:
        filename = f"{exam.exam_type}_{exam.year}_{exam.exam_series}_photos.zip"
    else:
        filename = f"{exam.exam_type}_{exam.year}_photos.zip"

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for candidate, photo, school, exam in candidate_photo_school_exam_tuples:
            try:
                # Retrieve photo file
                photo_content = await photo_storage_service.retrieve(photo.file_path)

                # Determine file extension
                file_ext = Path(photo.file_name).suffix
                if not file_ext:
                    # Try to determine from mime type
                    if photo.mime_type == "image/jpeg" or photo.mime_type == "image/jpg":
                        file_ext = ".jpg"
                    elif photo.mime_type == "image/png":
                        file_ext = ".png"
                    else:
                        file_ext = ".jpg"  # Default

                # Create filename using registration number
                photo_filename = f"{candidate.registration_number}{file_ext}"

                # Determine ZIP path
                if school_id is None:
                    # Organize by school folder: {school_code}-{school_name:20}
                    school_code_sanitized = sanitize_folder_name(school.code if school.code else "")
                    school_name_sanitized = sanitize_folder_name(school.name if school.name else "")
                    # Take first 20 characters of school name
                    school_name_short = school_name_sanitized[:20] if school_name_sanitized else "unknown"

                    if school_code_sanitized:
                        school_folder = f"{school_code_sanitized}-{school_name_short}"
                    else:
                        school_folder = school_name_short if school_name_short else "unknown"

                    zip_path = f"{school_folder}/{photo_filename}"
                else:
                    # Flat structure when school is filtered
                    zip_path = photo_filename

                # Add to ZIP
                zip_file.writestr(zip_path, photo_content)

            except Exception as e:
                # Log error but continue with other photos
                logger.warning(f"Failed to add photo for candidate {candidate.id} (registration {candidate.registration_number}): {e}")

    zip_buffer.seek(0)

    content_disposition = f'attachment; filename="{filename}"'
    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
        headers={
            "Content-Disposition": content_disposition,
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.get("/candidates/{candidate_id}/photos", response_model=RegistrationCandidatePhotoResponse | None)
async def get_admin_candidate_photo(
    candidate_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> RegistrationCandidatePhotoResponse | None:
    """Get candidate's photo metadata (returns single photo or null) for admin."""
    # Verify candidate exists
    candidate_stmt = select(RegistrationCandidate).where(RegistrationCandidate.id == candidate_id)
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # Get photo
    photo_stmt = select(RegistrationCandidatePhoto).where(
        RegistrationCandidatePhoto.registration_candidate_id == candidate_id
    )
    photo_result = await session.execute(photo_stmt)
    photo = photo_result.scalar_one_or_none()

    if not photo:
        return None

    return RegistrationCandidatePhotoResponse.model_validate(photo)


@router.get("/candidates/{candidate_id}/photos/file")
async def get_admin_candidate_photo_file(
    candidate_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> StreamingResponse:
    """Get photo file for admin."""
    # Verify candidate exists
    candidate_stmt = select(RegistrationCandidate).where(RegistrationCandidate.id == candidate_id)
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # Initialize photo storage service
    photo_storage_service = PhotoStorageService()

    # Get photo
    photo_stmt = select(RegistrationCandidatePhoto).where(
        RegistrationCandidatePhoto.registration_candidate_id == candidate_id
    )
    photo_result = await session.execute(photo_stmt)
    photo = photo_result.scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    # Retrieve file
    try:
        if not await photo_storage_service.exists(photo.file_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Photo file not found in storage"
            )
        file_content = await photo_storage_service.retrieve(photo.file_path)
    except HTTPException:
        raise
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Unexpected error retrieving photo file {photo.file_path}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to retrieve photo file: {str(e)}"
        )

    return StreamingResponse(
        iter([file_content]),
        media_type=photo.mime_type,
        headers={"Content-Disposition": f'inline; filename="{photo.file_name}"'},
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
    # Private portal access is derived from exam_kind; keep flag in sync
    sync_period_private_flag(exam)

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

    # Determine the subject_code to use (original_code if available, otherwise code)
    subject_code_to_store = subject.original_code if subject.original_code else subject.code

    # Check for duplicate schedule (same subject code - using original_code)
    existing_stmt = select(ExaminationSchedule).where(
        ExaminationSchedule.registration_exam_id == exam_id,
        ExaminationSchedule.subject_code == subject_code_to_store,
    )
    existing_result = await session.execute(existing_stmt)
    existing = existing_result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Schedule for subject {subject_code_to_store} already exists for this exam",
        )

    # Validate that all papers have required date and start_time
    for paper_entry in schedule_data.papers:
        if "date" not in paper_entry or "start_time" not in paper_entry:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each paper must have 'date' and 'start_time' fields",
            )

    # Create schedule - store original_code (or code if original_code is None)
    new_schedule = ExaminationSchedule(
        registration_exam_id=exam_id,
        subject_code=subject_code_to_store,
        subject_name=subject.name,
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
    )
    schedules_result = await session.execute(schedules_stmt)
    schedules = schedules_result.scalars().all()

    return [ExaminationScheduleResponse.model_validate(schedule) for schedule in schedules]


@router.get("/exams/{exam_id}/schedules/template")
async def download_schedule_template(
    exam_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> StreamingResponse:
    """Download schedule upload template prepopulated with subjects."""
    try:
        # Fetch exam information for filename
        exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
        exam_result = await session.execute(exam_stmt)
        exam = exam_result.scalar_one_or_none()

        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

        template_bytes = await generate_schedule_template(
            session,
            exam_year=exam.year,
            exam_series=exam.exam_series,
            exam_type=exam.exam_type,
        )

        # Generate filename: {exam_year}_{exam_series}_{exam_type}_timetable_template.xlsx
        filename = f"{exam.year}_{exam.exam_series}_{exam.exam_type}_timetable_template.xlsx"
        # Sanitize filename (remove invalid characters)
        filename = "".join(c for c in filename if c.isalnum() or c in ("_", "-", "."))

        return StreamingResponse(
            iter([template_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
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
    if schedule_update.papers is not None:
        # Validate that all papers have required date and start_time
        for paper_entry in schedule_update.papers:
            if "date" not in paper_entry or "start_time" not in paper_entry:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Each paper must have 'date' and 'start_time' fields",
                )
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
    override_existing: bool = Query(default=False, description="If true, update existing schedules; if false, skip them"),
) -> ExaminationScheduleBulkUploadResponse:
    """Bulk upload schedules from Excel or CSV file."""
    # Log the override_existing parameter for debugging
    logger = logging.getLogger(__name__)
    logger.info(f"Bulk upload schedules for exam_id={exam_id}, override_existing={override_existing} (type: {type(override_existing).__name__})")

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

            # Validate papers
            if "papers" not in schedule_data or not schedule_data["papers"]:
                errors.append(
                    ExaminationScheduleBulkUploadError(
                        row_number=row_number, error_message="At least one paper with date and start_time is required", field="papers"
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

            # Determine the subject_code to use (original_code from upload data)
            subject_code_to_store = schedule_data["original_code"]

            # Check for duplicate schedule (using original_code)
            existing_stmt = select(ExaminationSchedule).where(
                ExaminationSchedule.registration_exam_id == exam_id,
                ExaminationSchedule.subject_code == subject_code_to_store,
            )
            existing_result = await session.execute(existing_stmt)
            existing = existing_result.scalar_one_or_none()

            # Get papers from parsed data (already includes dates)
            papers = schedule_data["papers"]

            if existing:
                if override_existing:
                    # Update existing schedule
                    existing.papers = papers
                    existing.venue = schedule_data.get("venue")
                    existing.duration_minutes = schedule_data.get("duration_minutes")
                    existing.instructions = schedule_data.get("instructions")
                    # Update subject_name in case it changed
                    existing.subject_name = subject.name
                    existing.updated_at = datetime.utcnow()
                    await session.flush()
                    successful += 1
                else:
                    # Skip existing schedule
                    errors.append(
                        ExaminationScheduleBulkUploadError(
                            row_number=row_number,
                            error_message=f"Schedule for subject {subject_code_to_store} already exists for this exam",
                            field="original_code",
                        )
                    )
                    failed += 1
                continue

            # Create new schedule - store original_code
            new_schedule = ExaminationSchedule(
                registration_exam_id=exam_id,
                subject_code=subject_code_to_store,
                subject_name=subject.name,
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


# Timetable Download Endpoints

@router.get("/exams/{exam_id}/timetable")
async def download_exam_timetable(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL, description="Filter by subject type: ALL, CORE_ONLY, or ELECTIVE_ONLY"),
    merge_by_date: bool = Query(default=False, description="Merge subjects written on the same day"),
    orientation: str = Query(default="portrait", description="Page orientation: portrait or landscape"),
) -> StreamingResponse:
    """Download entire examination timetable."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    try:
        pdf_bytes = await generate_timetable_pdf(
            session,
            exam_id=exam_id,
            school_id=None,
            programme_id=None,
            subject_filter=subject_filter,
            merge_by_date=merge_by_date,
            orientation=orientation,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    # Generate filename: {exam_year}_{exam_series}_{exam_type}{subject_filter if not ALL}
    # Sanitize filename parts
    def sanitize_filename_part(text: str | None) -> str:
        """Sanitize a filename part by removing/replacing problematic characters."""
        if not text:
            return ""
        # Remove or replace problematic characters: / \ : * ? " < > |
        sanitized = re.sub(r'[<>:"/\\|?*]', '_', str(text))
        # Replace spaces with underscores
        sanitized = sanitized.replace(" ", "_")
        # Remove multiple consecutive underscores
        sanitized = re.sub(r'_+', '_', sanitized)
        # Remove leading/trailing underscores
        sanitized = sanitized.strip('_')
        return sanitized

    exam_year = str(exam.year)
    exam_series = sanitize_filename_part(exam.exam_series).upper() if exam.exam_series else ""
    exam_type_safe = sanitize_filename_part(exam.exam_type)

    # Build filename parts
    filename_parts = [exam_year]
    if exam_series:
        filename_parts.append(exam_series)
    filename_parts.append(exam_type_safe)

    # Add subject filter if not ALL
    if subject_filter != TimetableDownloadFilter.ALL:
        filename_parts.append(subject_filter.value)

    # Join parts and ensure we have at least one part
    if not filename_parts:
        filename = "timetable.pdf"
    else:
        filename = "_".join(filter(None, filename_parts)) + ".pdf"

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exams/{exam_id}/timetable/school/{school_id}")
async def download_school_timetable_admin(
    exam_id: int,
    school_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL, description="Filter by subject type: ALL, CORE_ONLY, or ELECTIVE_ONLY"),
    programme_id: int | None = Query(default=None, description="Optional programme ID to filter timetable"),
    merge_by_date: bool = Query(default=False, description="Merge subjects written on the same day"),
    orientation: str = Query(default="portrait", description="Page orientation: portrait or landscape"),
) -> StreamingResponse:
    """Download timetable for a specific school."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Verify school exists
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # If programme_id is provided, verify it exists and is associated with the school
    if programme_id:
        programme_stmt = select(Programme).where(Programme.id == programme_id)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if not programme:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

        # Verify programme is associated with school
        from app.models import school_programmes
        assoc_stmt = select(school_programmes).where(
            school_programmes.c.school_id == school_id,
            school_programmes.c.programme_id == programme_id
        )
        result = await session.execute(assoc_stmt)
        existing = result.first()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Programme is not associated with the school"
            )

    try:
        pdf_bytes = await generate_timetable_pdf(
            session,
            exam_id=exam_id,
            school_id=school_id,
            programme_id=programme_id,
            subject_filter=subject_filter,
            merge_by_date=merge_by_date,
            orientation=orientation,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    # Generate filename: {exam_year}_{exam_series}_{exam_type}{programme_name if selected}{subject_filter if not ALL}
    # Sanitize filename parts
    def sanitize_filename_part(text: str | None) -> str:
        """Sanitize a filename part by removing/replacing problematic characters."""
        if not text:
            return ""
        # Remove or replace problematic characters: / \ : * ? " < > |
        sanitized = re.sub(r'[<>:"/\\|?*]', '_', str(text))
        # Replace spaces with underscores
        sanitized = sanitized.replace(" ", "_")
        # Remove multiple consecutive underscores
        sanitized = re.sub(r'_+', '_', sanitized)
        # Remove leading/trailing underscores
        sanitized = sanitized.strip('_')
        return sanitized

    exam_year = str(exam.year)
    exam_series = sanitize_filename_part(exam.exam_series).upper() if exam.exam_series else ""
    exam_type_safe = sanitize_filename_part(exam.exam_type)

    # Build filename parts
    filename_parts = [exam_year]
    if exam_series:
        filename_parts.append(exam_series)
    filename_parts.append(exam_type_safe)

    # Add programme name if selected (programme already fetched above if programme_id is provided)
    if programme_id:
        # Re-fetch programme for filename generation
        programme_stmt = select(Programme).where(Programme.id == programme_id)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if programme:
            programme_name_safe = sanitize_filename_part(programme.name)
            if programme_name_safe:
                filename_parts.append(programme_name_safe)

    # Add subject filter if not ALL
    if subject_filter != TimetableDownloadFilter.ALL:
        filename_parts.append(subject_filter.value)

    # Join parts and ensure we have at least one part
    if not filename_parts:
        filename = "timetable.pdf"
    else:
        filename = "_".join(filter(None, filename_parts)) + ".pdf"

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exams/{exam_id}/timetable/school/{school_id}/preview")
async def preview_school_timetable_admin(
    exam_id: int,
    school_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL, description="Filter by subject type: ALL, CORE_ONLY, or ELECTIVE_ONLY"),
    programme_id: int | None = Query(default=None, description="Optional programme ID to filter timetable"),
) -> dict[str, Any]:
    """Preview timetable data (JSON) for a specific school."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Verify school exists
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # If programme_id is provided, verify it exists and is associated with the school
    if programme_id:
        programme_stmt = select(Programme).where(Programme.id == programme_id)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if not programme:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

        # Verify programme is associated with school
        from app.models import school_programmes
        assoc_stmt = select(school_programmes).where(
            school_programmes.c.school_id == school_id,
            school_programmes.c.programme_id == programme_id
        )
        result = await session.execute(assoc_stmt)
        existing = result.first()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Programme is not associated with the school"
            )

    # Import here to avoid circular dependency
    from app.models import ExaminationSchedule, Subject
    from app.schemas.schedule import TimetableEntry, TimetableResponse
    from app.services.timetable_service import (
        get_school_subject_codes,
        get_programme_subject_codes,
        filter_schedules_by_subject_type,
    )

    # Get all schedules for the exam
    schedules_stmt = select(ExaminationSchedule).where(
        ExaminationSchedule.registration_exam_id == exam_id
    ).order_by(ExaminationSchedule.examination_date, ExaminationSchedule.examination_time)
    schedules_result = await session.execute(schedules_stmt)
    all_schedules = schedules_result.scalars().all()

    # Build a map from schedule subject_code to Subject to get original_code for display
    schedule_subject_codes = {schedule.subject_code for schedule in all_schedules}
    subject_stmt = select(Subject.code, Subject.original_code).where(Subject.code.in_(schedule_subject_codes))
    subject_result = await session.execute(subject_stmt)
    code_to_original_code: dict[str, str] = {}
    for code, original_code in subject_result.all():
        if original_code:
            code_to_original_code[code] = original_code

    # Apply filters
    filtered_subject_codes: set[str] | None = None
    filtered_code_to_original_code: dict[str, str] = {}

    if programme_id:
        filtered_subject_codes, filtered_code_to_original_code = await get_programme_subject_codes(session, programme_id)
    else:
        filtered_subject_codes, filtered_code_to_original_code = await get_school_subject_codes(session, school_id)

    # Apply subject type filter
    if filtered_subject_codes is not None:
        filtered_subject_codes = await filter_schedules_by_subject_type(
            session, filtered_subject_codes, subject_filter
        )
        # Update the code_to_original_code map to only include filtered subjects
        filtered_code_to_original_code = {
            code: original_code for code, original_code in filtered_code_to_original_code.items()
            if code in filtered_subject_codes
        }
    elif subject_filter != TimetableDownloadFilter.ALL:
        # No school/programme filter, but need to filter by subject type
        all_subject_codes = {schedule.subject_code for schedule in all_schedules}
        filtered_subject_codes = await filter_schedules_by_subject_type(
            session, all_subject_codes, subject_filter
        )
        # Update the code_to_original_code map to only include filtered subjects
        filtered_code_to_original_code = {
            code: original_code for code, original_code in code_to_original_code.items()
            if code in filtered_subject_codes
        }
    else:
        filtered_code_to_original_code = code_to_original_code

    # Filter schedules
    if filtered_subject_codes:
        schedules = [s for s in all_schedules if s.subject_code in filtered_subject_codes]
    else:
        schedules = list(all_schedules)

    # Sort by date and time
    schedules.sort(key=lambda s: (s.examination_date, s.examination_time))

    # Convert to TimetableEntry, using original_code if available
    entries = [
        TimetableEntry(
            subject_code=filtered_code_to_original_code.get(schedule.subject_code, schedule.subject_code),
            subject_name=schedule.subject_name,
            examination_date=schedule.examination_date,
            examination_time=schedule.examination_time,
            examination_end_time=schedule.examination_end_time,
            venue=schedule.venue,
            duration_minutes=schedule.duration_minutes,
            instructions=schedule.instructions,
        )
        for schedule in schedules
    ]

    timetable_response = TimetableResponse(
        exam_id=exam.id,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series or "",
        year=exam.year,
        entries=entries,
    )

    return timetable_response.model_dump()


# Programme Management Endpoints

def _programme_response(programme: Programme, type_path: str | None = None) -> ProgrammeResponse:
    return ProgrammeResponse(
        id=programme.id,
        code=programme.code,
        name=programme.name,
        programme_type_id=programme.programme_type_id,
        programme_type_name=programme.programme_type.name if programme.programme_type else None,
        programme_type_path=type_path,
        created_at=programme.created_at,
        updated_at=programme.updated_at,
    )


@router.post("/programmes", response_model=ProgrammeResponse, status_code=status.HTTP_201_CREATED)
async def create_programme(
    programme: ProgrammeCreate, session: DBSessionDep, current_user: SystemAdminDep
) -> ProgrammeResponse:
    """Create a new programme."""
    stmt = select(Programme).where(Programme.code == programme.code)
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Programme with code {programme.code} already exists"
        )

    pt = await session.get(ProgrammeType, programme.programme_type_id)
    if not pt or not pt.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Programme type not found or inactive",
        )

    db_programme = Programme(
        code=programme.code,
        name=programme.name,
        programme_type_id=programme.programme_type_id,
    )
    session.add(db_programme)
    await session.commit()
    stmt = (
        select(Programme)
        .where(Programme.id == db_programme.id)
        .options(selectinload(Programme.programme_type))
    )
    db_programme = (await session.execute(stmt)).scalar_one()
    return _programme_response(db_programme)


@router.get("/programmes", response_model=ProgrammeListResponse)
async def list_programmes(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    programme_type_id: int | None = Query(None),
) -> ProgrammeListResponse:
    """List programmes with pagination."""
    offset = (page - 1) * page_size

    count_stmt = select(func.count(Programme.id))
    stmt = select(Programme).options(selectinload(Programme.programme_type)).order_by(Programme.code)
    if programme_type_id is not None:
        count_stmt = count_stmt.where(Programme.programme_type_id == programme_type_id)
        stmt = stmt.where(Programme.programme_type_id == programme_type_id)

    total = (await session.execute(count_stmt)).scalar() or 0
    programmes = (await session.execute(stmt.offset(offset).limit(page_size))).scalars().all()
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return ProgrammeListResponse(
        items=[_programme_response(programme) for programme in programmes],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/schools/{school_id}/programmes", response_model=list[ProgrammeResponse])
async def get_school_programmes(
    school_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> list[ProgrammeResponse]:
    """Get programmes associated with a specific school (admin endpoint)."""
    # Verify school exists
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Get programmes for this school
    from app.models import school_programmes
    programme_stmt = (
        select(Programme)
        .join(school_programmes, Programme.id == school_programmes.c.programme_id)
        .where(school_programmes.c.school_id == school_id)
        .order_by(Programme.code)
    )
    programme_result = await session.execute(programme_stmt)
    programmes = programme_result.scalars().all()

    return [ProgrammeResponse.model_validate(programme) for programme in programmes]


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
    stmt = (
        select(Programme)
        .where(Programme.id == programme_id)
        .options(selectinload(Programme.programme_type))
    )
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")
    return _programme_response(programme)


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

    if programme_update.code is not None and programme_update.code != programme.code:
        code_stmt = select(Programme).where(Programme.code == programme_update.code)
        existing = (await session.execute(code_stmt)).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Programme with code {programme_update.code} already exists",
            )

    update_data = programme_update.model_dump(exclude_unset=True)

    if "name" in update_data:
        programme.name = programme_update.name
    if "code" in update_data:
        programme.code = programme_update.code
    if "programme_type_id" in update_data and programme_update.programme_type_id is not None:
        pt = await session.get(ProgrammeType, programme_update.programme_type_id)
        if not pt or not pt.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Programme type not found or inactive",
            )
        programme.programme_type_id = programme_update.programme_type_id

    await session.commit()
    stmt = (
        select(Programme)
        .where(Programme.id == programme_id)
        .options(selectinload(Programme.programme_type))
    )
    programme = (await session.execute(stmt)).scalar_one()
    return _programme_response(programme)


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

            type_code = programme_data.get("programme_type_code") or "CERT_II"
            pt_stmt = select(ProgrammeType).where(ProgrammeType.code == type_code)
            pt = (await session.execute(pt_stmt)).scalar_one_or_none()
            if not pt:
                errors.append(
                    ProgrammeBulkUploadError(
                        row_number=row_number,
                        error_message=f"Unknown programme_type_code '{type_code}'",
                        field="programme_type_code",
                    )
                )
                failed += 1
                continue

            db_programme = Programme(
                code=programme_data["code"],
                name=programme_data["name"],
                programme_type_id=pt.id,
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


@router.get(
    "/programmes/{programme_id}/attachable-subjects",
    response_model=list[SubjectResponse],
)
async def list_attachable_subjects(
    programme_id: int, session: DBSessionDep, current_user: SystemAdminDep
) -> list[SubjectResponse]:
    """Subjects that can be attached to this programme.

    Returns CORE subjects plus subjects already linked to any programme of the
    same programme_type, excluding subjects already attached to this programme.
    If the programme has no programme_type_id, returns the full catalog minus attached.
    """
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    already_attached = select(programme_subjects.c.subject_id).where(
        programme_subjects.c.programme_id == programme_id
    )

    subject_stmt = select(Subject).where(Subject.id.notin_(already_attached))

    if programme.programme_type_id is not None:
        same_type_subject_ids = (
            select(programme_subjects.c.subject_id)
            .join(Programme, Programme.id == programme_subjects.c.programme_id)
            .where(Programme.programme_type_id == programme.programme_type_id)
        )
        subject_stmt = subject_stmt.where(
            or_(
                Subject.subject_type == SubjectType.CORE,
                Subject.id.in_(same_type_subject_ids),
            )
        )

    subject_stmt = subject_stmt.order_by(Subject.code)
    subjects = (await session.execute(subject_stmt)).scalars().all()
    return [SubjectResponse.model_validate(subject) for subject in subjects]


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

            # CORE subjects are catalog-only on upload; attach via programme UI.
            # Validate choice_group_id early if present (set on attach, not here).
            if subject_data["subject_type"] == SubjectType.CORE:
                parsed_choice_group_id = subject_data.get("choice_group_id")
                if parsed_choice_group_id is not None and not (
                    isinstance(parsed_choice_group_id, int) and parsed_choice_group_id > 0
                ):
                    errors.append(
                        SubjectBulkUploadError(
                            row_number=row_number,
                            error_message=f"Invalid choice_group_id '{parsed_choice_group_id}' for core subject. Must be a positive integer.",
                            field="choice_group_id",
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

            # ELECTIVE only: link to programme when programme_code was provided
            if subject_data["subject_type"] == SubjectType.ELECTIVE and programme:
                assoc_stmt = select(programme_subjects).where(
                    programme_subjects.c.programme_id == programme.id,
                    programme_subjects.c.subject_id == db_subject.id,
                )
                assoc_result = await session.execute(assoc_stmt)
                existing_assoc = assoc_result.first()
                if not existing_assoc:
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



# Invoice Generation Endpoints for System Admin

@router.get("/invoices/fee-paying/by-school", response_model=SchoolInvoiceResponse)
async def get_fee_paying_invoice_by_school(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
    school_id: int = Query(..., description="The school ID"),
) -> SchoolInvoiceResponse:
    """Generate invoice for fee-paying candidates for a specific school and examination."""
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    invoice_data = await aggregate_candidates_by_examination(
        session, school_id, exam_id, RegistrationType.FEE_PAYING.value
    )

    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    return SchoolInvoiceResponse(
        school_id=school.id,
        school_code=school.code,
        school_name=school.name,
        registration_type=RegistrationType.FEE_PAYING.value,
        examination=ExaminationInvoiceItem(
            exam_id=invoice_data["exam_id"],
            exam_type=invoice_data["exam_type"],
            exam_series=invoice_data["exam_series"],
            year=invoice_data["year"],
            candidate_count=invoice_data["candidate_count"],
            total_amount=invoice_data["total_amount"],
        ),
        generated_at=datetime.utcnow(),
    )


@router.get("/invoices/fee-paying/summary", response_model=AdminSummaryInvoiceResponse)
async def get_fee_paying_invoice_summary(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
) -> AdminSummaryInvoiceResponse:
    """Generate summary invoice for fee-paying candidates across all schools for an examination."""
    summary_data = await aggregate_candidates_by_school(
        session, exam_id, RegistrationType.FEE_PAYING.value
    )

    school_items = [
        SchoolInvoiceItem(
            school_id=school["school_id"],
            school_code=school["school_code"],
            school_name=school["school_name"],
            candidate_count=school["candidate_count"],
            total_amount=school["total_amount"],
        )
        for school in summary_data["schools"]
    ]

    return AdminSummaryInvoiceResponse(
        registration_type=RegistrationType.FEE_PAYING.value,
        examination=ExaminationInvoiceItem(
            exam_id=summary_data["exam_id"],
            exam_type=summary_data["exam_type"],
            exam_series=summary_data["exam_series"],
            year=summary_data["year"],
            candidate_count=summary_data["total_candidate_count"],
            total_amount=summary_data["total_amount"],
        ),
        schools=school_items,
        total_candidate_count=summary_data["total_candidate_count"],
        total_amount=summary_data["total_amount"],
        generated_at=datetime.utcnow(),
    )


@router.get("/invoices/fee-paying/by-school/pdf")
async def download_fee_paying_invoice_pdf_by_school(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
    school_id: int = Query(..., description="The school ID"),
) -> StreamingResponse:
    """Download PDF invoice for fee-paying candidates for a specific school."""
    try:
        pdf_bytes = await generate_admin_invoice_pdf(
            session,
            exam_id,
            RegistrationType.FEE_PAYING.value,
            school_id=school_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    filename = f"fee_paying_invoice_exam_{exam_id}_school_{school_id}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/invoices/fee-paying/summary/pdf")
async def download_fee_paying_invoice_summary_pdf(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
) -> StreamingResponse:
    """Download PDF summary invoice for fee-paying candidates across all schools."""
    try:
        pdf_bytes = await generate_admin_invoice_pdf(
            session,
            exam_id,
            RegistrationType.FEE_PAYING.value,
            school_id=None,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    filename = f"fee_paying_invoice_summary_exam_{exam_id}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/invoices/free-tvet/by-school", response_model=SchoolInvoiceResponse)
async def get_free_tvet_invoice_by_school(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
    school_id: int = Query(..., description="The school ID"),
) -> SchoolInvoiceResponse:
    """Generate invoice for free_tvet candidates for a specific school and examination."""
    # Get school
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Get aggregated data
    invoice_data = await aggregate_candidates_by_examination(
        session, school_id, exam_id, RegistrationType.FREE_TVET.value
    )

    # Get exam details
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    return SchoolInvoiceResponse(
        school_id=school.id,
        school_code=school.code,
        school_name=school.name,
        registration_type=RegistrationType.FREE_TVET.value,
        examination=ExaminationInvoiceItem(
            exam_id=invoice_data["exam_id"],
            exam_type=invoice_data["exam_type"],
            exam_series=invoice_data["exam_series"],
            year=invoice_data["year"],
            candidate_count=invoice_data["candidate_count"],
            total_amount=invoice_data["total_amount"],
        ),
        generated_at=datetime.utcnow(),
    )


@router.get("/invoices/referral/by-school", response_model=SchoolInvoiceResponse)
async def get_referral_invoice_by_school(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
    school_id: int = Query(..., description="The school ID"),
) -> SchoolInvoiceResponse:
    """Generate invoice for referral candidates for a specific school and examination."""
    # Get school
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Get aggregated data
    invoice_data = await aggregate_candidates_by_examination(
        session, school_id, exam_id, RegistrationType.REFERRAL.value
    )

    # Get exam details
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    return SchoolInvoiceResponse(
        school_id=school.id,
        school_code=school.code,
        school_name=school.name,
        registration_type=RegistrationType.REFERRAL.value,
        examination=ExaminationInvoiceItem(
            exam_id=invoice_data["exam_id"],
            exam_type=invoice_data["exam_type"],
            exam_series=invoice_data["exam_series"],
            year=invoice_data["year"],
            candidate_count=invoice_data["candidate_count"],
            total_amount=invoice_data["total_amount"],
        ),
        generated_at=datetime.utcnow(),
    )


@router.get("/invoices/free-tvet/summary", response_model=AdminSummaryInvoiceResponse)
async def get_free_tvet_invoice_summary(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
) -> AdminSummaryInvoiceResponse:
    """Generate summary invoice for free_tvet candidates across all schools for an examination."""
    # Get aggregated data
    summary_data = await aggregate_candidates_by_school(
        session, exam_id, RegistrationType.FREE_TVET.value
    )

    # Build school items
    school_items = [
        SchoolInvoiceItem(
            school_id=school["school_id"],
            school_code=school["school_code"],
            school_name=school["school_name"],
            candidate_count=school["candidate_count"],
            total_amount=school["total_amount"],
        )
        for school in summary_data["schools"]
    ]

    return AdminSummaryInvoiceResponse(
        registration_type=RegistrationType.FREE_TVET.value,
        examination=ExaminationInvoiceItem(
            exam_id=summary_data["exam_id"],
            exam_type=summary_data["exam_type"],
            exam_series=summary_data["exam_series"],
            year=summary_data["year"],
            candidate_count=summary_data["total_candidate_count"],
            total_amount=summary_data["total_amount"],
        ),
        schools=school_items,
        total_candidate_count=summary_data["total_candidate_count"],
        total_amount=summary_data["total_amount"],
        generated_at=datetime.utcnow(),
    )


@router.get("/invoices/referral/summary", response_model=AdminSummaryInvoiceResponse)
async def get_referral_invoice_summary(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
) -> AdminSummaryInvoiceResponse:
    """Generate summary invoice for referral candidates across all schools for an examination."""
    # Get aggregated data
    summary_data = await aggregate_candidates_by_school(
        session, exam_id, RegistrationType.REFERRAL.value
    )

    # Build school items
    school_items = [
        SchoolInvoiceItem(
            school_id=school["school_id"],
            school_code=school["school_code"],
            school_name=school["school_name"],
            candidate_count=school["candidate_count"],
            total_amount=school["total_amount"],
        )
        for school in summary_data["schools"]
    ]

    return AdminSummaryInvoiceResponse(
        registration_type=RegistrationType.REFERRAL.value,
        examination=ExaminationInvoiceItem(
            exam_id=summary_data["exam_id"],
            exam_type=summary_data["exam_type"],
            exam_series=summary_data["exam_series"],
            year=summary_data["year"],
            candidate_count=summary_data["total_candidate_count"],
            total_amount=summary_data["total_amount"],
        ),
        schools=school_items,
        total_candidate_count=summary_data["total_candidate_count"],
        total_amount=summary_data["total_amount"],
        generated_at=datetime.utcnow(),
    )


@router.get("/invoices/free-tvet/by-school/pdf")
async def download_free_tvet_invoice_pdf_by_school(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
    school_id: int = Query(..., description="The school ID"),
) -> StreamingResponse:
    """Download PDF invoice for free_tvet candidates for a specific school."""
    try:
        pdf_bytes = await generate_admin_invoice_pdf(
            session,
            exam_id,
            RegistrationType.FREE_TVET.value,
            school_id=school_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    filename = f"free_tvet_invoice_exam_{exam_id}_school_{school_id}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/invoices/referral/by-school/pdf")
async def download_referral_invoice_pdf_by_school(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
    school_id: int = Query(..., description="The school ID"),
) -> StreamingResponse:
    """Download PDF invoice for referral candidates for a specific school."""
    try:
        pdf_bytes = await generate_admin_invoice_pdf(
            session,
            exam_id,
            RegistrationType.REFERRAL.value,
            school_id=school_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    filename = f"referral_invoice_exam_{exam_id}_school_{school_id}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/invoices/free-tvet/summary/pdf")
async def download_free_tvet_invoice_summary_pdf(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
) -> StreamingResponse:
    """Download PDF summary invoice for free_tvet candidates across all schools."""
    try:
        pdf_bytes = await generate_admin_invoice_pdf(
            session,
            exam_id,
            RegistrationType.FREE_TVET.value,
            school_id=None,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    filename = f"free_tvet_invoice_summary_exam_{exam_id}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/invoices/referral/summary/pdf")
async def download_referral_invoice_summary_pdf(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
) -> StreamingResponse:
    """Download PDF summary invoice for referral candidates across all schools."""
    try:
        pdf_bytes = await generate_admin_invoice_pdf(
            session,
            exam_id,
            RegistrationType.REFERRAL.value,
            school_id=None,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    filename = f"referral_invoice_summary_exam_{exam_id}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
