from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.dependencies.database import DBSessionDep
from app.models import (
    Candidate,
    Exam,
    ExamRegistration,
    ExamSubject,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
)
from app.schemas.candidate import (
    CandidateCreate,
    CandidateListResponse,
    CandidateResponse,
    CandidateUpdate,
    ExamRegistrationResponse,
    SubjectRegistrationCreate,
    SubjectRegistrationResponse,
    SubjectScoreResponse,
)

router = APIRouter(prefix="/api/v1/candidates", tags=["candidates"])


# Candidate Management Endpoints


@router.post("", response_model=CandidateResponse, status_code=status.HTTP_201_CREATED)
async def create_candidate(candidate: CandidateCreate, session: DBSessionDep) -> CandidateResponse:
    """Create a new candidate."""
    # Check if school exists
    school_stmt = select(School).where(School.id == candidate.school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Check if index_number already exists
    index_stmt = select(Candidate).where(Candidate.index_number == candidate.index_number)
    index_result = await session.execute(index_stmt)
    existing = index_result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Candidate with index number {candidate.index_number} already exists",
        )

    db_candidate = Candidate(
        school_id=candidate.school_id,
        name=candidate.name,
        index_number=candidate.index_number,
    )
    session.add(db_candidate)
    await session.commit()
    await session.refresh(db_candidate)
    return CandidateResponse.model_validate(db_candidate)


@router.get("", response_model=CandidateListResponse)
async def list_candidates(
    session: DBSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    school_id: int | None = Query(None),
) -> CandidateListResponse:
    """List candidates with pagination and optional school filter."""
    offset = (page - 1) * page_size

    # Build query with optional school filter
    base_stmt = select(Candidate)
    if school_id is not None:
        base_stmt = base_stmt.where(Candidate.school_id == school_id)

    # Get total count
    count_stmt = select(func.count(Candidate.id))
    if school_id is not None:
        count_stmt = count_stmt.where(Candidate.school_id == school_id)
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get candidates
    stmt = base_stmt.offset(offset).limit(page_size).order_by(Candidate.index_number)
    result = await session.execute(stmt)
    candidates = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return CandidateListResponse(
        items=[CandidateResponse.model_validate(candidate) for candidate in candidates],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{candidate_id}", response_model=CandidateResponse)
async def get_candidate(candidate_id: int, session: DBSessionDep) -> CandidateResponse:
    """Get candidate details."""
    stmt = select(Candidate).where(Candidate.id == candidate_id)
    result = await session.execute(stmt)
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    return CandidateResponse.model_validate(candidate)


@router.put("/{candidate_id}", response_model=CandidateResponse)
async def update_candidate(
    candidate_id: int, candidate_update: CandidateUpdate, session: DBSessionDep
) -> CandidateResponse:
    """Update candidate."""
    stmt = select(Candidate).where(Candidate.id == candidate_id)
    result = await session.execute(stmt)
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # Check if school exists (if updating school_id)
    if candidate_update.school_id is not None:
        school_stmt = select(School).where(School.id == candidate_update.school_id)
        school_result = await session.execute(school_stmt)
        school = school_result.scalar_one_or_none()
        if not school:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Check if index_number already exists (if updating index_number)
    if candidate_update.index_number is not None and candidate_update.index_number != candidate.index_number:
        index_stmt = select(Candidate).where(Candidate.index_number == candidate_update.index_number)
        index_result = await session.execute(index_stmt)
        existing = index_result.scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Candidate with index number {candidate_update.index_number} already exists",
            )

    if candidate_update.school_id is not None:
        candidate.school_id = candidate_update.school_id
    if candidate_update.name is not None:
        candidate.name = candidate_update.name
    if candidate_update.index_number is not None:
        candidate.index_number = candidate_update.index_number

    await session.commit()
    await session.refresh(candidate)
    return CandidateResponse.model_validate(candidate)


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_candidate(candidate_id: int, session: DBSessionDep) -> None:
    """Delete candidate."""
    stmt = select(Candidate).where(Candidate.id == candidate_id)
    result = await session.execute(stmt)
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    await session.delete(candidate)
    await session.commit()


# Exam Registration Endpoints


@router.post(
    "/{candidate_id}/exams/{exam_id}/register",
    response_model=ExamRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_candidate_for_exam(
    candidate_id: int, exam_id: int, session: DBSessionDep
) -> ExamRegistrationResponse:
    """Register a candidate for an exam."""
    # Check candidate exists
    candidate_stmt = select(Candidate).where(Candidate.id == candidate_id)
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # Check exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Check if registration already exists
    existing_stmt = select(ExamRegistration).where(
        ExamRegistration.candidate_id == candidate_id, ExamRegistration.exam_id == exam_id
    )
    existing_result = await session.execute(existing_stmt)
    existing = existing_result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Candidate is already registered for this exam"
        )

    # Create exam registration
    db_exam_registration = ExamRegistration(candidate_id=candidate_id, exam_id=exam_id)
    session.add(db_exam_registration)
    await session.commit()
    await session.refresh(db_exam_registration)

    return ExamRegistrationResponse(
        id=db_exam_registration.id,
        candidate_id=db_exam_registration.candidate_id,
        exam_id=db_exam_registration.exam_id,
        exam_name=exam.name,
        exam_year=exam.year,
        exam_series=exam.series,
        created_at=db_exam_registration.created_at,
        updated_at=db_exam_registration.updated_at,
    )


@router.get("/{candidate_id}/exams", response_model=list[ExamRegistrationResponse])
async def list_candidate_exam_registrations(candidate_id: int, session: DBSessionDep) -> list[ExamRegistrationResponse]:
    """List all exam registrations for a candidate."""
    # Check candidate exists
    candidate_stmt = select(Candidate).where(Candidate.id == candidate_id)
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # Get exam registrations with exam details
    exam_reg_stmt = (
        select(ExamRegistration, Exam)
        .join(Exam, ExamRegistration.exam_id == Exam.id)
        .where(ExamRegistration.candidate_id == candidate_id)
        .order_by(Exam.year.desc(), Exam.created_at.desc())
    )
    exam_reg_result = await session.execute(exam_reg_stmt)
    exam_registrations = exam_reg_result.all()

    return [
        ExamRegistrationResponse(
            id=exam_reg.id,
            candidate_id=exam_reg.candidate_id,
            exam_id=exam_reg.exam_id,
            exam_name=exam.name,
            exam_year=exam.year,
            exam_series=exam.series,
            created_at=exam_reg.created_at,
            updated_at=exam_reg.updated_at,
        )
        for exam_reg, exam in exam_registrations
    ]


@router.get("/{candidate_id}/exams/{exam_id}", response_model=ExamRegistrationResponse)
async def get_candidate_exam_registration(
    candidate_id: int, exam_id: int, session: DBSessionDep
) -> ExamRegistrationResponse:
    """Get specific exam registration details."""
    # Check candidate exists
    candidate_stmt = select(Candidate).where(Candidate.id == candidate_id)
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # Get exam registration with exam details
    exam_reg_stmt = (
        select(ExamRegistration, Exam)
        .join(Exam, ExamRegistration.exam_id == Exam.id)
        .where(ExamRegistration.candidate_id == candidate_id, ExamRegistration.exam_id == exam_id)
    )
    exam_reg_result = await session.execute(exam_reg_stmt)
    exam_reg_data = exam_reg_result.first()
    if not exam_reg_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam registration not found")

    exam_reg, exam = exam_reg_data

    return ExamRegistrationResponse(
        id=exam_reg.id,
        candidate_id=exam_reg.candidate_id,
        exam_id=exam_reg.exam_id,
        exam_name=exam.name,
        exam_year=exam.year,
        exam_series=exam.series,
        created_at=exam_reg.created_at,
        updated_at=exam_reg.updated_at,
    )


# Subject Registration Endpoints


@router.post(
    "/{candidate_id}/exams/{exam_id}/subjects/{subject_id}",
    response_model=SubjectRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_subject_to_exam_registration(
    candidate_id: int,
    exam_id: int,
    subject_id: int,
    subject_registration: SubjectRegistrationCreate,
    session: DBSessionDep,
) -> SubjectRegistrationResponse:
    """Add a subject to an exam registration."""
    # Check exam registration exists
    exam_reg_stmt = (
        select(ExamRegistration, Exam)
        .join(Exam, ExamRegistration.exam_id == Exam.id)
        .where(ExamRegistration.candidate_id == candidate_id, ExamRegistration.exam_id == exam_id)
    )
    exam_reg_result = await session.execute(exam_reg_stmt)
    exam_reg_data = exam_reg_result.first()
    if not exam_reg_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam registration not found")

    exam_registration, exam = exam_reg_data

    # Check subject exists
    subject_stmt = select(Subject).where(Subject.id == subject_id)
    subject_result = await session.execute(subject_stmt)
    subject = subject_result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    # Validate that subject exists in exam's ExamSubject list
    exam_subject_stmt = select(ExamSubject).where(ExamSubject.exam_id == exam_id, ExamSubject.subject_id == subject_id)
    exam_subject_result = await session.execute(exam_subject_stmt)
    exam_subject = exam_subject_result.scalar_one_or_none()
    if not exam_subject:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Subject {subject.code} is not part of exam {exam.name}",
        )

    # Check if subject already registered
    existing_stmt = select(SubjectRegistration).where(
        SubjectRegistration.exam_registration_id == exam_registration.id,
        SubjectRegistration.subject_id == subject_id,
    )
    existing_result = await session.execute(existing_stmt)
    existing = existing_result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Subject is already registered for this exam registration"
        )

    # Validate series if provided
    if subject_registration.series is not None:
        if subject_registration.series < 1 or subject_registration.series > exam.number_of_series:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Series must be between 1 and {exam.number_of_series}",
            )

    # Create subject registration
    db_subject_registration = SubjectRegistration(
        exam_registration_id=exam_registration.id,
        subject_id=subject_id,
        series=subject_registration.series,
    )
    session.add(db_subject_registration)
    await session.flush()  # Flush to get the ID

    # Automatically create SubjectScore with default values
    db_subject_score = SubjectScore(
        subject_registration_id=db_subject_registration.id,
        mcq_raw_score=0.0,
        essay_raw_score=0.0,
        practical_raw_score=None,
        total_score=0.0,
    )
    session.add(db_subject_score)
    await session.commit()
    await session.refresh(db_subject_registration)
    await session.refresh(db_subject_score)

    # Load subject_score relationship
    subject_score_response = SubjectScoreResponse.model_validate(db_subject_score)

    return SubjectRegistrationResponse(
        id=db_subject_registration.id,
        exam_registration_id=db_subject_registration.exam_registration_id,
        subject_id=db_subject_registration.subject_id,
        subject_code=subject.code,
        subject_name=subject.name,
        series=db_subject_registration.series,
        created_at=db_subject_registration.created_at,
        updated_at=db_subject_registration.updated_at,
        subject_score=subject_score_response,
    )


@router.delete("/{candidate_id}/exams/{exam_id}/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subject_from_exam_registration(
    candidate_id: int, exam_id: int, subject_id: int, session: DBSessionDep
) -> None:
    """Remove subject from exam registration. SubjectScore will be automatically deleted via CASCADE."""
    # Check exam registration exists
    exam_reg_stmt = select(ExamRegistration).where(
        ExamRegistration.candidate_id == candidate_id, ExamRegistration.exam_id == exam_id
    )
    exam_reg_result = await session.execute(exam_reg_stmt)
    exam_registration = exam_reg_result.scalar_one_or_none()
    if not exam_registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam registration not found")

    # Check subject registration exists
    subject_reg_stmt = select(SubjectRegistration).where(
        SubjectRegistration.exam_registration_id == exam_registration.id,
        SubjectRegistration.subject_id == subject_id,
    )
    subject_reg_result = await session.execute(subject_reg_stmt)
    subject_registration = subject_reg_result.scalar_one_or_none()
    if not subject_registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject registration not found")

    # Delete subject registration (SubjectScore will be automatically deleted via CASCADE)
    await session.delete(subject_registration)
    await session.commit()


@router.get("/{candidate_id}/exams/{exam_id}/subjects", response_model=list[SubjectRegistrationResponse])
async def list_exam_registration_subjects(
    candidate_id: int, exam_id: int, session: DBSessionDep
) -> list[SubjectRegistrationResponse]:
    """List all subjects for an exam registration."""
    # Check exam registration exists
    exam_reg_stmt = select(ExamRegistration).where(
        ExamRegistration.candidate_id == candidate_id, ExamRegistration.exam_id == exam_id
    )
    exam_reg_result = await session.execute(exam_reg_stmt)
    exam_registration = exam_reg_result.scalar_one_or_none()
    if not exam_registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam registration not found")

    # Get subject registrations with subject details and scores
    subject_reg_stmt = (
        select(SubjectRegistration, Subject, SubjectScore)
        .join(Subject, SubjectRegistration.subject_id == Subject.id)
        .outerjoin(SubjectScore, SubjectRegistration.id == SubjectScore.subject_registration_id)
        .where(SubjectRegistration.exam_registration_id == exam_registration.id)
        .order_by(Subject.code)
    )
    subject_reg_result = await session.execute(subject_reg_stmt)
    subject_registrations = subject_reg_result.all()

    return [
        SubjectRegistrationResponse(
            id=subject_reg.id,
            exam_registration_id=subject_reg.exam_registration_id,
            subject_id=subject_reg.subject_id,
            subject_code=subject.code,
            subject_name=subject.name,
            series=subject_reg.series,
            created_at=subject_reg.created_at,
            updated_at=subject_reg.updated_at,
            subject_score=SubjectScoreResponse.model_validate(subject_score) if subject_score else None,
        )
        for subject_reg, subject, subject_score in subject_registrations
    ]
