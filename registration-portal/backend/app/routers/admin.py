"""Admin endpoints for system administrators."""
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, delete, insert, update
from sqlalchemy.orm import selectinload

from app.dependencies.auth import CurrentUserDep, SystemAdminDep
from app.dependencies.database import DBSessionDep
from app.models import (
    PortalUser,
    PortalUserType,
    RegistrationExam,
    ExamRegistrationPeriod,
    RegistrationCandidate,
    RegistrationExport,
    ExportStatus,
    School,
    ExaminationSchedule,
    Programme,
    Subject,
    SubjectType,
    programme_subjects,
    school_programmes,
)
from app.schemas.registration import (
    RegistrationExamCreate,
    RegistrationExamUpdate,
    RegistrationExamResponse,
    ExamRegistrationPeriodUpdate,
)
from app.schemas.user import SchoolAdminUserCreate, UserResponse, UserListResponse
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
from app.schemas.schedule import (
    ExaminationScheduleCreate,
    ExaminationScheduleUpdate,
    ExaminationScheduleResponse,
)
from app.core.security import get_password_hash
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
from app.services.template_generator import generate_programme_template, generate_subject_template

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


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
        user_type=PortalUserType.SCHOOL_ADMIN,
        school_id=user_data.school_id,
        is_active=True,
        created_by_user_id=current_user.id,
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    return UserResponse.model_validate(new_user)


@router.get("/school-admin-users", response_model=list[UserResponse])
async def list_school_admin_users(session: DBSessionDep, current_user: SystemAdminDep) -> list[UserResponse]:
    """List all coordinators."""
    stmt = select(PortalUser).where(PortalUser.user_type == PortalUserType.SCHOOL_ADMIN)
    result = await session.execute(stmt)
    users = result.scalars().all()

    return [UserResponse.model_validate(user) for user in users]


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
            PortalUser.user_type == PortalUserType.SCHOOL_ADMIN,
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
            new_school = School(
                code=code,
                name=name,
                is_active=True,
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
        PortalUser.user_type == PortalUserType.SCHOOL_ADMIN,
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
        PortalUser.user_type == PortalUserType.SCHOOL_ADMIN,
    )
    result = await session.execute(stmt)
    users = result.scalars().all()

    return [UserResponse.model_validate(user) for user in users]


@router.get("/schools/{school_id}/candidates", response_model=list[dict])
async def get_school_candidates(
    school_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    exam_id: int | None = Query(None, description="Filter by exam ID"),
    status: str | None = Query(None, description="Filter by registration status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
) -> dict:
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

    return {
        "items": [RegistrationCandidateResponse.model_validate(c) for c in candidates],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


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

    return RegistrationExamResponse.model_validate(exam)


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
