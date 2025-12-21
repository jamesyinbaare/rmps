from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select

from app.dependencies.database import DBSessionDep
from app.models import (
    Candidate,
    Exam,
    ExamRegistration,
    ExamSeries,
    ExamSubject,
    Programme,
    programme_subjects,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
    SubjectType,
)
from app.schemas.candidate import (
    CandidateBulkUploadError,
    CandidateBulkUploadResponse,
    CandidateCreate,
    CandidateListResponse,
    CandidateResponse,
    CandidateUpdate,
    ExamRegistrationResponse,
    SubjectRegistrationCreate,
    SubjectRegistrationResponse,
    SubjectRequirementsValidationResponse,
    SubjectScoreResponse,
)
from app.services.candidate_upload import (
    CandidateUploadParseError,
    CandidateUploadValidationError,
    find_subjects_column,
    parse_candidate_row,
    parse_upload_file,
    validate_required_columns,
)

router = APIRouter(prefix="/api/v1/candidates", tags=["candidates"])


# Validation Helper Functions


async def validate_subject_registration_requirements(
    session: DBSessionDep,
    exam_registration: ExamRegistration,
    registered_subject_ids: set[int],
) -> tuple[bool, list[str]]:
    """
    Validate that candidate's subject registrations meet programme requirements.

    For MAY/JUNE exams:
    - All compulsory core subjects must be registered
    - Exactly one subject from each optional core choice group must be registered
    - ALL elective subjects under the programme must be registered

    For NOV/DEC exams:
    - No validation (returns success)

    Returns:
        tuple[bool, list[str]]: (is_valid, list of error messages)
    """
    # Load exam to check series
    exam_stmt = select(Exam).where(Exam.id == exam_registration.exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        return False, ["Exam not found"]

    # For NOV/DEC, skip validation
    if exam.series == ExamSeries.NOV_DEC:
        return True, []

    # Only validate MAY/JUNE exams
    if exam.series != ExamSeries.MAY_JUNE:
        return True, []  # Unknown series, skip validation

    # Get candidate's programme
    candidate_stmt = select(Candidate).where(Candidate.id == exam_registration.candidate_id)
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()

    if not candidate or not candidate.programme_id:
        # No programme assigned, can't validate
        return True, []

    # Get programme subject requirements
    programme_subject_stmt = (
        select(
            Subject,
            programme_subjects.c.is_compulsory,
            programme_subjects.c.choice_group_id,
        )
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .where(programme_subjects.c.programme_id == candidate.programme_id)
    )
    programme_subject_result = await session.execute(programme_subject_stmt)
    programme_subjects_data = programme_subject_result.all()

    # Organize requirements
    compulsory_core_subject_ids: set[int] = set()
    optional_core_groups: dict[int, set[int]] = {}  # group_id -> set of subject_ids
    elective_subject_ids: set[int] = set()

    for subject, is_compulsory, choice_group_id in programme_subjects_data:
        if subject.subject_type == SubjectType.CORE:
            if is_compulsory is True:
                compulsory_core_subject_ids.add(subject.id)
            elif is_compulsory is False and choice_group_id is not None:
                if choice_group_id not in optional_core_groups:
                    optional_core_groups[choice_group_id] = set()
                optional_core_groups[choice_group_id].add(subject.id)
        elif subject.subject_type == SubjectType.ELECTIVE:
            elective_subject_ids.add(subject.id)

    errors: list[str] = []

    # Check compulsory core subjects
    missing_compulsory = compulsory_core_subject_ids - registered_subject_ids
    if missing_compulsory:
        missing_subject_stmt = select(Subject).where(Subject.id.in_(missing_compulsory))
        missing_subject_result = await session.execute(missing_subject_stmt)
        missing_subjects = missing_subject_result.scalars().all()
        missing_names = [s.name for s in missing_subjects]
        errors.append(f"Missing compulsory core subjects: {', '.join(missing_names)}")

    # Check optional core choice groups (exactly one from each group)
    for group_id, group_subject_ids in optional_core_groups.items():
        registered_from_group = group_subject_ids & registered_subject_ids
        if len(registered_from_group) == 0:
            # Get subject names for better error message
            group_subject_stmt = select(Subject).where(Subject.id.in_(group_subject_ids))
            group_subject_result = await session.execute(group_subject_stmt)
            group_subjects = group_subject_result.scalars().all()
            group_names = [s.name for s in group_subjects]
            errors.append(f"Must select exactly one from optional core group {group_id}: {', '.join(group_names)}")
        elif len(registered_from_group) > 1:
            # Multiple subjects from same group
            registered_subject_stmt = select(Subject).where(Subject.id.in_(registered_from_group))
            registered_subject_result = await session.execute(registered_subject_stmt)
            registered_subjects = registered_subject_result.scalars().all()
            registered_names = [s.name for s in registered_subjects]
            errors.append(f"Can only select one from optional core group {group_id}, but selected: {', '.join(registered_names)}")

    # Check ALL elective subjects are registered
    missing_electives = elective_subject_ids - registered_subject_ids
    if missing_electives:
        missing_elective_stmt = select(Subject).where(Subject.id.in_(missing_electives))
        missing_elective_result = await session.execute(missing_elective_stmt)
        missing_elective_subjects = missing_elective_result.scalars().all()
        missing_elective_names = [s.name for s in missing_elective_subjects]
        errors.append(f"Missing elective subjects (all are compulsory for MAY/JUNE): {', '.join(missing_elective_names)}")

    return len(errors) == 0, errors


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

    # Check if programme exists (if provided)
    if candidate.programme_id is not None:
        programme_stmt = select(Programme).where(Programme.id == candidate.programme_id)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if not programme:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

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
        date_of_birth=candidate.date_of_birth,
        gender=candidate.gender,
        programme_id=candidate.programme_id,
    )
    session.add(db_candidate)
    await session.commit()
    await session.refresh(db_candidate)
    return CandidateResponse.model_validate(db_candidate)


@router.post("/bulk-upload", response_model=CandidateBulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_candidates(
    session: DBSessionDep, file: UploadFile = File(...), exam_id: int = Form(...)
) -> CandidateBulkUploadResponse:
    """Bulk upload candidates from Excel or CSV file."""
    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Read file content
    file_content = await file.read()

    # Parse file
    try:
        df = parse_upload_file(file_content, file.filename or "unknown")
        validate_required_columns(df)
    except (CandidateUploadParseError, CandidateUploadValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Find subjects column (comma-separated original_code values)
    subjects_column = find_subjects_column(df)

    # Get exam subjects for validation
    exam_subject_stmt = (
        select(ExamSubject, Subject)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(ExamSubject.exam_id == exam_id)
    )
    exam_subject_result = await session.execute(exam_subject_stmt)
    exam_subjects_data = exam_subject_result.all()
    exam_subjects_by_original_code = {
        subject.original_code: (exam_subject, subject) for exam_subject, subject in exam_subjects_data
    }

    # Process each row
    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[CandidateBulkUploadError] = []

    for idx, row in df.iterrows():
        row_number = int(idx) + 2  # +2 because Excel rows are 1-indexed and header is row 1
        try:
            # Parse row data
            candidate_data = parse_candidate_row(row, subjects_column)

            # Validate required fields
            if not candidate_data["school_code"]:
                errors.append(
                    CandidateBulkUploadError(row_number=row_number, error_message="School code is required", field="school_code")
                )
                failed += 1
                continue

            if not candidate_data["name"]:
                errors.append(
                    CandidateBulkUploadError(row_number=row_number, error_message="Name is required", field="name")
                )
                failed += 1
                continue

            if not candidate_data["index_number"]:
                errors.append(
                    CandidateBulkUploadError(
                        row_number=row_number, error_message="Index number is required", field="index_number"
                    )
                )
                failed += 1
                continue

            # Lookup school by code
            school_stmt = select(School).where(School.code == candidate_data["school_code"])
            school_result = await session.execute(school_stmt)
            school = school_result.scalar_one_or_none()
            if not school:
                errors.append(
                    CandidateBulkUploadError(
                        row_number=row_number,
                        error_message=f"School with code '{candidate_data['school_code']}' not found",
                        field="school_code",
                    )
                )
                failed += 1
                continue

            # Lookup programme by code (if provided)
            programme = None
            if candidate_data["programme_code"]:
                programme_stmt = select(Programme).where(Programme.code == candidate_data["programme_code"])
                programme_result = await session.execute(programme_stmt)
                programme = programme_result.scalar_one_or_none()
                if not programme:
                    errors.append(
                        CandidateBulkUploadError(
                            row_number=row_number,
                            error_message=f"Programme with code '{candidate_data['programme_code']}' not found",
                            field="programme_code",
                        )
                    )
                    failed += 1
                    continue

            # Validate subject original_codes exist and are part of the exam
            valid_subject_original_codes = []
            for subject_original_code in candidate_data["subject_original_codes"]:
                if subject_original_code not in exam_subjects_by_original_code:
                    errors.append(
                        CandidateBulkUploadError(
                            row_number=row_number,
                            error_message=f"Subject with original_code '{subject_original_code}' not found in exam or not part of this exam",
                            field="subject_original_code",
                        )
                    )
                    failed += 1
                    break
                valid_subject_original_codes.append(subject_original_code)
            else:
                # Only continue if all subject original_codes were valid
                # Note: Empty subjects list is allowed (will be caught by validation for MAY/JUNE if required)

                # Check if (index_number, exam_id) already exists
                existing_reg_stmt = select(ExamRegistration).where(
                    ExamRegistration.index_number == candidate_data["index_number"],
                    ExamRegistration.exam_id == exam_id,
                )
                existing_reg_result = await session.execute(existing_reg_stmt)
                existing_reg = existing_reg_result.scalar_one_or_none()
                if existing_reg:
                    errors.append(
                        CandidateBulkUploadError(
                            row_number=row_number,
                            error_message=f"Candidate with index number '{candidate_data['index_number']}' is already registered for this exam",
                            field="index_number",
                        )
                    )
                    failed += 1
                    continue

                # Find or create candidate (index_number can be reused across exams)
                candidate_stmt = select(Candidate).where(
                    Candidate.index_number == candidate_data["index_number"], Candidate.school_id == school.id
                )
                candidate_result = await session.execute(candidate_stmt)
                candidate = candidate_result.scalar_one_or_none()

                if not candidate:
                    # Create new candidate
                    candidate = Candidate(
                        school_id=school.id,
                        programme_id=programme.id if programme else None,
                        name=candidate_data["name"],
                        index_number=candidate_data["index_number"],
                    )
                    session.add(candidate)
                    await session.flush()

                # Create exam registration
                exam_registration = ExamRegistration(
                    candidate_id=candidate.id, exam_id=exam_id, index_number=candidate_data["index_number"]
                )
                session.add(exam_registration)
                await session.flush()

                # Create subject registrations
                for subject_original_code in valid_subject_original_codes:
                    exam_subject, subject = exam_subjects_by_original_code[subject_original_code]
                    subject_registration = SubjectRegistration(
                        exam_registration_id=exam_registration.id, exam_subject_id=exam_subject.id, series=None
                    )
                    session.add(subject_registration)
                    await session.flush()

                    # Create default subject score
                    subject_score = SubjectScore(
                        subject_registration_id=subject_registration.id,
                        obj_raw_score=None,
                        essay_raw_score=None,  # Can be None (not entered), numeric string, or "A"/"AA"
                        pract_raw_score=None,
                        obj_normalized=None,
                        essay_normalized=None,
                        pract_normalized=None,
                        total_score=0.0,
                        obj_document_id=None,
                        essay_document_id=None,
                        pract_document_id=None,
                    )
                    session.add(subject_score)

                # Validate subject registration requirements (for MAY/JUNE exams)
                # Get all registered subject IDs for this exam registration
                registered_subject_regs_stmt = select(SubjectRegistration, ExamSubject).join(
                    ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id
                ).where(SubjectRegistration.exam_registration_id == exam_registration.id)
                registered_subject_regs_result = await session.execute(registered_subject_regs_stmt)
                registered_subject_ids = {exam_subj.subject_id for _, exam_subj in registered_subject_regs_result.all()}

                is_valid, validation_errors = await validate_subject_registration_requirements(
                    session, exam_registration, registered_subject_ids
                )

                if not is_valid:
                    # Remove the subject registrations and scores we just added
                    from sqlalchemy import delete as sql_delete
                    await session.execute(
                        sql_delete(SubjectScore).where(
                            SubjectScore.subject_registration_id.in_(
                                select(SubjectRegistration.id).where(
                                    SubjectRegistration.exam_registration_id == exam_registration.id
                                )
                            )
                        )
                    )
                    await session.execute(
                        sql_delete(SubjectRegistration).where(
                            SubjectRegistration.exam_registration_id == exam_registration.id
                        )
                    )
                    # Remove exam registration
                    await session.delete(exam_registration)
                    # If candidate was newly created, remove it too
                    if candidate.id:  # Check if candidate has an ID (was newly created)
                        # Check if candidate has other exam registrations
                        other_regs_stmt = select(ExamRegistration).where(
                            ExamRegistration.candidate_id == candidate.id
                        )
                        other_regs_result = await session.execute(other_regs_stmt)
                        other_regs = other_regs_result.scalars().all()
                        if not other_regs:
                            await session.delete(candidate)

                    errors.append(
                        CandidateBulkUploadError(
                            row_number=row_number,
                            error_message=f"Subject registration does not meet programme requirements: {'; '.join(validation_errors)}",
                            field="subject_original_code",
                        )
                    )
                    failed += 1
                    continue

                successful += 1

        except Exception as e:
            errors.append(
                CandidateBulkUploadError(
                    row_number=row_number, error_message=f"Unexpected error: {str(e)}", field=None
                )
            )
            failed += 1
            continue

    # Commit all successful transactions
    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to commit transactions: {str(e)}"
        )

    return CandidateBulkUploadResponse(total_rows=total_rows, successful=successful, failed=failed, errors=errors)


@router.get("", response_model=CandidateListResponse)
async def list_candidates(
    session: DBSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    school_id: int | None = Query(None),
    programme_id: int | None = Query(None),
) -> CandidateListResponse:
    """List candidates with pagination and optional school/programme filters."""
    offset = (page - 1) * page_size

    # Build query with optional filters
    base_stmt = select(Candidate)
    if school_id is not None:
        base_stmt = base_stmt.where(Candidate.school_id == school_id)
    if programme_id is not None:
        base_stmt = base_stmt.where(Candidate.programme_id == programme_id)

    # Get total count
    count_stmt = select(func.count(Candidate.id))
    if school_id is not None:
        count_stmt = count_stmt.where(Candidate.school_id == school_id)
    if programme_id is not None:
        count_stmt = count_stmt.where(Candidate.programme_id == programme_id)
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

    # Check if programme exists (if updating programme_id)
    if candidate_update.programme_id is not None:
        programme_stmt = select(Programme).where(Programme.id == candidate_update.programme_id)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if not programme:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

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
    if candidate_update.date_of_birth is not None:
        candidate.date_of_birth = candidate_update.date_of_birth
    if candidate_update.gender is not None:
        candidate.gender = candidate_update.gender
    if candidate_update.programme_id is not None:
        candidate.programme_id = candidate_update.programme_id

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

    # Check if registration already exists using (index_number, exam_id)
    existing_stmt = select(ExamRegistration).where(
        ExamRegistration.index_number == candidate.index_number, ExamRegistration.exam_id == exam_id
    )
    existing_result = await session.execute(existing_stmt)
    existing = existing_result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Candidate with index number {candidate.index_number} is already registered for this exam",
        )

    # Create exam registration
    db_exam_registration = ExamRegistration(
        candidate_id=candidate_id, exam_id=exam_id, index_number=candidate.index_number
    )
    session.add(db_exam_registration)
    await session.commit()
    await session.refresh(db_exam_registration)

    return ExamRegistrationResponse(
        id=db_exam_registration.id,
        candidate_id=db_exam_registration.candidate_id,
        exam_id=db_exam_registration.exam_id,
        exam_name=exam.exam_type.value,
        exam_year=exam.year,
        exam_series=exam.series.value,
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
            exam_name=exam.exam_type.value,
            exam_year=exam.year,
            exam_series=exam.series.value,
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
        exam_name=exam.exam_type.value,
        exam_year=exam.year,
        exam_series=exam.series.value,
        created_at=exam_reg.created_at,
        updated_at=exam_reg.updated_at,
    )


@router.get(
    "/{candidate_id}/exams/{exam_id}/subject-requirements-validation",
    response_model=SubjectRequirementsValidationResponse,
)
async def validate_candidate_subject_requirements(
    candidate_id: int, exam_id: int, session: DBSessionDep
) -> SubjectRequirementsValidationResponse:
    """Check if candidate's subject registrations meet programme requirements."""
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

    exam_registration, exam = exam_reg_data

    # Get all registered subject IDs for this exam registration
    registered_subject_regs_stmt = select(SubjectRegistration, ExamSubject).join(
        ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id
    ).where(SubjectRegistration.exam_registration_id == exam_registration.id)
    registered_subject_regs_result = await session.execute(registered_subject_regs_stmt)
    registered_subject_ids = {exam_subj.subject_id for _, exam_subj in registered_subject_regs_result.all()}

    # Validate requirements
    is_valid, validation_errors = await validate_subject_registration_requirements(
        session, exam_registration, registered_subject_ids
    )

    # Check if validation is applicable (MAY/JUNE only)
    is_applicable = exam.series == ExamSeries.MAY_JUNE

    # Get programme info if available
    programme_id = None
    programme_name = None
    if candidate.programme_id:
        programme_stmt = select(Programme).where(Programme.id == candidate.programme_id)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if programme:
            programme_id = programme.id
            programme_name = programme.name

    return SubjectRequirementsValidationResponse(
        is_valid=is_valid,
        exam_series=exam.series.value,
        is_applicable=is_applicable,
        errors=validation_errors,
        programme_id=programme_id,
        programme_name=programme_name,
    )


# Subject Registration Endpoints


@router.post(
    "/{candidate_id}/exams/{exam_id}/subjects/{exam_subject_id}",
    response_model=SubjectRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_subject_to_exam_registration(
    candidate_id: int,
    exam_id: int,
    exam_subject_id: int,
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

    # Check that ExamSubject exists and belongs to this exam
    exam_subject_stmt = (
        select(ExamSubject, Subject)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(ExamSubject.id == exam_subject_id, ExamSubject.exam_id == exam_id)
    )
    exam_subject_result = await session.execute(exam_subject_stmt)
    exam_subject_data = exam_subject_result.first()
    if not exam_subject_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exam subject not found or does not belong to exam {exam.exam_type.value}",
        )

    exam_subject, subject = exam_subject_data

    # Check if subject already registered
    existing_stmt = select(SubjectRegistration).where(
        SubjectRegistration.exam_registration_id == exam_registration.id,
        SubjectRegistration.exam_subject_id == exam_subject_id,
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
        exam_subject_id=exam_subject_id,
        series=subject_registration.series,
    )
    session.add(db_subject_registration)
    await session.flush()  # Flush to get the ID

    # Validate subject registration requirements (for MAY/JUNE exams)
    # Get all registered subject IDs for this exam registration
    registered_subject_regs_stmt = select(SubjectRegistration, ExamSubject).join(
        ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id
    ).where(SubjectRegistration.exam_registration_id == exam_registration.id)
    registered_subject_regs_result = await session.execute(registered_subject_regs_stmt)
    registered_subject_ids = {exam_subj.subject_id for _, exam_subj in registered_subject_regs_result.all()}

    is_valid, validation_errors = await validate_subject_registration_requirements(
        session, exam_registration, registered_subject_ids
    )

    if not is_valid:
        # Rollback the subject registration
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Subject registration does not meet programme requirements: {'; '.join(validation_errors)}",
        )

    # Automatically create SubjectScore with default values
    db_subject_score = SubjectScore(
        subject_registration_id=db_subject_registration.id,
        obj_raw_score=None,
        essay_raw_score=0.0,
        pract_raw_score=None,
        obj_normalized=None,
        essay_normalized=None,
        pract_normalized=None,
        total_score=0.0,
        obj_document_id=None,
        essay_document_id=None,
        pract_document_id=None,
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
        exam_subject_id=db_subject_registration.exam_subject_id,
        subject_id=subject.id,
        subject_code=subject.code,
        subject_name=subject.name,
        series=db_subject_registration.series,
        created_at=db_subject_registration.created_at,
        updated_at=db_subject_registration.updated_at,
        subject_score=subject_score_response,
    )


@router.delete("/{candidate_id}/exams/{exam_id}/subjects/{exam_subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subject_from_exam_registration(
    candidate_id: int, exam_id: int, exam_subject_id: int, session: DBSessionDep
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
        SubjectRegistration.exam_subject_id == exam_subject_id,
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

    # Get subject registrations with exam_subject, subject details and scores
    subject_reg_stmt = (
        select(SubjectRegistration, ExamSubject, Subject, SubjectScore)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
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
            exam_subject_id=subject_reg.exam_subject_id,
            subject_id=subject.id,
            subject_code=subject.code,
            subject_name=subject.name,
            series=subject_reg.series,
            created_at=subject_reg.created_at,
            updated_at=subject_reg.updated_at,
            subject_score=SubjectScoreResponse.model_validate(subject_score) if subject_score else None,
        )
        for subject_reg, exam_subject, subject, subject_score in subject_registrations
    ]
