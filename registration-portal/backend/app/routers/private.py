"""Private registration endpoints for individual users."""
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import (
    PortalUserType,
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
    RegistrationExamResponse,
)
from app.schemas.schedule import TimetableResponse, TimetableEntry
from app.utils.registration import generate_unique_registration_number

router = APIRouter(prefix="/api/v1/private", tags=["private"])


@router.get("/exams", response_model=list[RegistrationExamResponse])
async def list_available_exams(session: DBSessionDep, current_user: CurrentUserDep) -> list[RegistrationExamResponse]:
    """List available exams for private registration."""
    if current_user.user_type != PortalUserType.PRIVATE_USER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    now = datetime.utcnow()

    stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .where(
            ExamRegistrationPeriod.is_active == True,
            ExamRegistrationPeriod.allows_private_registration == True,
            ExamRegistrationPeriod.registration_start_date <= now,
            ExamRegistrationPeriod.registration_end_date >= now,
        )
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exams = result.scalars().all()

    return [RegistrationExamResponse.model_validate(exam) for exam in exams]


@router.post("/register", response_model=RegistrationCandidateResponse, status_code=status.HTTP_201_CREATED)
async def register_self(
    candidate_data: RegistrationCandidateCreate,
    exam_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> RegistrationCandidateResponse:
    """Register self for an exam."""
    if current_user.user_type != PortalUserType.PRIVATE_USER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

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

    # Check if user already registered for this exam
    existing_stmt = select(RegistrationCandidate).where(
        RegistrationCandidate.portal_user_id == current_user.id,
        RegistrationCandidate.registration_exam_id == exam_id,
    )
    existing_result = await session.execute(existing_stmt)
    existing = existing_result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="You are already registered for this exam"
        )

    # Generate unique registration number
    registration_number = await generate_unique_registration_number(session, exam_id)

    # Create candidate (no school_id for private registrations)
    new_candidate = RegistrationCandidate(
        registration_exam_id=exam_id,
        school_id=None,
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


@router.get("/registrations", response_model=list[RegistrationCandidateResponse])
async def list_own_registrations(
    session: DBSessionDep, current_user: CurrentUserDep
) -> list[RegistrationCandidateResponse]:
    """List own registrations."""
    if current_user.user_type != PortalUserType.PRIVATE_USER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    stmt = (
        select(RegistrationCandidate)
        .where(RegistrationCandidate.portal_user_id == current_user.id)
        .options(selectinload(RegistrationCandidate.subject_selections))
    )
    result = await session.execute(stmt)
    candidates = result.scalars().all()

    return [RegistrationCandidateResponse.model_validate(candidate) for candidate in candidates]


# Placeholder for other endpoints
# - GET /registrations/{id}
# - PUT /registrations/{id}
# - DELETE /registrations/{id}
# - GET /registrations/{id}/timetable
# - GET /timetables
# - GET /timetables/{exam_id}/download
