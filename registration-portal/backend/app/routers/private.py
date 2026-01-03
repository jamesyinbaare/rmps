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
    Subject,
    RegistrationSubjectSelection,
)
from app.schemas.registration import (
    RegistrationCandidateCreate,
    RegistrationCandidateUpdate,
    RegistrationCandidateResponse,
    RegistrationExamResponse,
)
from app.schemas.schedule import TimetableResponse, TimetableEntry
from app.utils.registration import generate_unique_registration_number
from app.services.subject_selection import (
    auto_select_subjects_for_programme,
    validate_subject_selections,
)

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

    # Get programme_id if programme_code is provided
    programme_id = candidate_data.programme_id
    if not programme_id and candidate_data.programme_code:
        from app.models import Programme
        programme_stmt = select(Programme).where(Programme.code == candidate_data.programme_code)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if programme:
            programme_id = programme.id

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
        programme_id=programme_id,
        contact_email=candidate_data.contact_email,
        contact_phone=candidate_data.contact_phone,
        address=candidate_data.address,
        national_id=candidate_data.national_id,
        registration_status=RegistrationStatus.PENDING,
    )
    session.add(new_candidate)
    await session.flush()

    # Add subject selections
    selected_subject_ids: list[int] = []

    if programme_id:
        # Auto-select compulsory core subjects only (not optional core subjects)
        auto_selected = await auto_select_subjects_for_programme(session, programme_id, None)
        selected_subject_ids.extend(auto_selected)

        # For MAY/JUNE: Auto-select ALL elective subjects (they are compulsory)
        from app.services.subject_selection import get_programme_subjects_for_registration, normalize_exam_series
        normalized_series = normalize_exam_series(exam.exam_series)
        is_may_june = normalized_series == "MAY/JUNE"
        if is_may_june:
            subjects_info = await get_programme_subjects_for_registration(session, programme_id)
            selected_subject_ids.extend(subjects_info["electives"])

    # Add any additional subjects from subject_ids (including optional core subjects selected by user)
    if candidate_data.subject_ids:
        selected_subject_ids.extend(candidate_data.subject_ids)

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

    await session.commit()
    await session.refresh(new_candidate, ["subject_selections"])

    # Build response with subject selections
    candidate_dict = {
        "id": new_candidate.id,
        "registration_exam_id": new_candidate.registration_exam_id,
        "school_id": new_candidate.school_id,
        "name": new_candidate.name,
        "registration_number": new_candidate.registration_number,
        "index_number": new_candidate.index_number,
        "date_of_birth": new_candidate.date_of_birth,
        "gender": new_candidate.gender,
        "programme_code": new_candidate.programme_code,
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
    return RegistrationCandidateResponse.model_validate(candidate_dict)


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
