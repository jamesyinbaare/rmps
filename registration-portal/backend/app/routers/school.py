"""School portal endpoints for school users."""
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, status, UploadFile, File
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SchoolUserWithSchoolDep, SchoolAdminDep
from app.dependencies.database import DBSessionDep
from app.models import (
    RegistrationExam,
    ExamRegistrationPeriod,
    RegistrationCandidate,
    RegistrationStatus,
    ExaminationSchedule,
)
from app.schemas.registration import (
    RegistrationCandidateCreate,
    RegistrationCandidateUpdate,
    RegistrationCandidateResponse,
    BulkUploadResponse,
    BulkUploadError,
    RegistrationExamResponse,
)
from app.schemas.schedule import TimetableResponse, TimetableEntry
from app.utils.registration import generate_unique_registration_number
from app.config import settings

router = APIRouter(prefix="/api/v1/school", tags=["school"])


@router.get("/exams", response_model=list[RegistrationExamResponse])
async def list_available_exams(
    session: DBSessionDep, current_user: SchoolUserWithSchoolDep
) -> list[RegistrationExamResponse]:
    """List available exams with open registration periods."""
    now = datetime.utcnow()

    stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .where(
            ExamRegistrationPeriod.is_active == True,
            ExamRegistrationPeriod.allows_bulk_registration == True,
            ExamRegistrationPeriod.registration_start_date <= now,
            ExamRegistrationPeriod.registration_end_date >= now,
        )
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exams = result.scalars().all()

    return [RegistrationExamResponse.model_validate(exam) for exam in exams]


@router.get("/candidates", response_model=list[RegistrationCandidateResponse])
async def list_candidates(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    exam_id: int | None = None,
) -> list[RegistrationCandidateResponse]:
    """List registered candidates for the school."""
    query = select(RegistrationCandidate).where(RegistrationCandidate.school_id == current_user.school_id)

    if exam_id:
        query = query.where(RegistrationCandidate.registration_exam_id == exam_id)

    query = query.options(selectinload(RegistrationCandidate.subject_selections))
    result = await session.execute(query)
    candidates = result.scalars().all()

    return [RegistrationCandidateResponse.model_validate(candidate) for candidate in candidates]


@router.post("/candidates", response_model=RegistrationCandidateResponse, status_code=status.HTTP_201_CREATED)
async def register_candidate(
    candidate_data: RegistrationCandidateCreate,
    exam_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> RegistrationCandidateResponse:
    """Register a single candidate (form submission)."""
    # Validate exam exists and registration is open
    exam_stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .where(RegistrationExam.id == exam_id)
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Registration period is not open")

    # Generate unique registration number
    registration_number = await generate_unique_registration_number(session, exam_id)

    # Create candidate
    new_candidate = RegistrationCandidate(
        registration_exam_id=exam_id,
        school_id=current_user.school_id,
        portal_user_id=current_user.id,
        name=candidate_data.name,
        registration_number=registration_number,
        date_of_birth=candidate_data.date_of_birth,
        gender=candidate_data.gender,
        programme_code=candidate_data.programme_code,
        contact_email=candidate_data.contact_email,
        contact_phone=candidate_data.contact_phone,
        address=candidate_data.address,
        national_id=candidate_data.national_id,
        registration_status=RegistrationStatus.PENDING,
    )
    session.add(new_candidate)
    await session.flush()

    # Add subject selections
    # TODO: Implement subject selection creation

    await session.commit()
    await session.refresh(new_candidate, ["subject_selections"])

    return RegistrationCandidateResponse.model_validate(new_candidate)


@router.post("/candidates/bulk", response_model=BulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_candidates(
    exam_id: int,
    file: UploadFile = File(...),
    session: DBSessionDep = None,
    current_user: SchoolUserWithSchoolDep = None,
) -> BulkUploadResponse:
    """Bulk upload candidates via CSV/Excel."""
    # TODO: Implement bulk upload processing
    # - Parse CSV/Excel file
    # - Validate data
    # - Create candidates
    # - Return success/failure report
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Bulk upload not yet implemented")


# Placeholder for other endpoints
# - GET /candidates/{id}
# - PUT /candidates/{id}
# - DELETE /candidates/{id}
# - GET /exams/{id}/timetable
# - GET /timetables
# - GET /timetables/{exam_id}/download
# - POST /users (school admin only)
# - GET /users
# - PUT /users/{id}
# - DELETE /users/{id}
# - POST /candidates/{id}/photos/bulk
