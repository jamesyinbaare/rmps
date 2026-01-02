"""Admin endpoints for system administrators."""
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status, UploadFile, File
from sqlalchemy import select, func
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

            # Create school
            new_school = School(
                code=code,
                name=name,
                is_active=True,
            )
            session.add(new_school)
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
