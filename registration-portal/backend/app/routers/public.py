"""Public endpoints (no authentication required)."""
import logging
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload
from datetime import datetime

from app.dependencies.database import DBSessionDep
from app.services.photo_storage import PhotoStorageService

logger = logging.getLogger(__name__)
from app.models import (
    RegistrationExam,
    ExamRegistrationPeriod,
    RegistrationCandidate,
    CandidateResult,
    Subject,
    Grade,
    SubjectType,
    RegistrationCandidatePhoto,
)
from app.schemas.registration import RegistrationExamResponse
from app.schemas.result import (
    PublicResultCheckRequest,
    PublicResultResponse,
    PublicSubjectResult,
)
from app.services.result_service import check_result_blocks, get_candidate_results

router = APIRouter(prefix="/api/v1/public", tags=["public"])


@router.get("/debug/results-check")
async def debug_results_check(
    registration_number: str,
    exam_type: str,
    exam_series: str,
    year: int,
    session: DBSessionDep,
) -> dict:
    """Debug endpoint to check what data exists for results checking."""
    from app.models import RegistrationSubjectSelection

    # Find exam
    exam_stmt = select(RegistrationExam).where(
        and_(
            RegistrationExam.exam_type.ilike(exam_type),
            RegistrationExam.exam_series.ilike(exam_series),
            RegistrationExam.year == year,
        )
    )
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        return {"error": "Exam not found", "exam_type": exam_type, "exam_series": exam_series, "year": year}

    # Find candidate
    candidate_stmt = select(RegistrationCandidate).where(
        and_(
            RegistrationCandidate.registration_exam_id == exam.id,
            RegistrationCandidate.registration_number == registration_number,
        )
    )
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()

    if not candidate:
        return {
            "error": "Candidate not found",
            "exam_id": exam.id,
            "registration_number": registration_number,
        }

    # Get results directly
    results_stmt = select(CandidateResult).where(
        and_(
            CandidateResult.registration_candidate_id == candidate.id,
            CandidateResult.registration_exam_id == exam.id,
        )
    ).options(selectinload(CandidateResult.subject))
    results_result = await session.execute(results_stmt)
    results = list(results_result.scalars().all())

    # Get subject selections
    selections_stmt = select(RegistrationSubjectSelection).where(
        RegistrationSubjectSelection.registration_candidate_id == candidate.id
    )
    selections_result = await session.execute(selections_stmt)
    selections = list(selections_result.scalars().all())

    return {
        "exam": {
            "id": exam.id,
            "exam_type": exam.exam_type,
            "exam_series": exam.exam_series,
            "year": exam.year,
            "results_published": exam.results_published,
        },
        "candidate": {
            "id": candidate.id,
            "registration_number": candidate.registration_number,
            "index_number": candidate.index_number,
        },
        "results": [
            {
                "id": r.id,
                "subject_id": r.subject_id,
                "subject_code": r.subject.code if r.subject else None,
                "subject_original_code": r.subject.original_code if r.subject else None,
                "grade": r.grade.value if r.grade else None,
                "is_published": r.is_published,
            }
            for r in results
        ],
        "subject_selections": [
            {
                "id": s.id,
                "subject_id": s.subject_id,
                "subject_code": s.subject_code,
                "subject_name": s.subject_name,
            }
            for s in selections
        ],
        "match_analysis": {
            "results_by_subject_id": {r.subject_id: r.id for r in results},
            "selections_by_subject_id": {s.subject_id: s.id for s in selections if s.subject_id},
            "missing_subject_ids": [
                sid for sid in {s.subject_id for s in selections if s.subject_id}
                if sid not in {r.subject_id for r in results}
            ],
        },
    }


@router.get("/exams/available", response_model=list[RegistrationExamResponse])
async def list_available_exams(session: DBSessionDep) -> list[RegistrationExamResponse]:
    """List exams currently accepting registrations (public endpoint)."""
    now = datetime.utcnow()

    # Query exams with active registration periods
    stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .where(
            ExamRegistrationPeriod.is_active == True,
            ExamRegistrationPeriod.registration_start_date <= now,
            ExamRegistrationPeriod.registration_end_date >= now,
        )
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exams = result.scalars().all()

    return [RegistrationExamResponse.model_validate(exam) for exam in exams]


@router.post("/results/check", response_model=PublicResultResponse, status_code=status.HTTP_200_OK)
async def check_public_results(
    check_data: PublicResultCheckRequest,
    session: DBSessionDep,
) -> PublicResultResponse:
    """Check results using index_number, registration_number, exam_type, exam_series, year.

    Flow:
    1. Find exam by exam_type, exam_series, year to get exam.id
    2. Use exam.id to find candidate by registration_exam_id and registration_number
    3. Use exam.id and candidate.id to get results
    """
    logger.info(
        "Public results check request received",
        extra={
            "exam_type": check_data.exam_type,
            "exam_series": check_data.exam_series,
            "year": check_data.year,
            "has_registration_number": bool(check_data.registration_number),
            "has_index_number": bool(check_data.index_number),
        },
    )

    # Step 1: Find the exam by exam_type, exam_series, and year to get the exam.id
    # Use case-insensitive matching for exam_type and exam_series to handle variations
    exam_type_input = check_data.exam_type.strip() if check_data.exam_type else ""
    exam_series_input = check_data.exam_series.strip() if check_data.exam_series else ""

    # Don't log exam query details to avoid exposing search patterns

    # First, let's see what exams exist with this year
    all_exams_stmt = select(RegistrationExam).where(RegistrationExam.year == check_data.year)
    all_exams_result = await session.execute(all_exams_stmt)
    all_exams = list(all_exams_result.scalars().all())
    logger.debug(
        "Exams found for year",
        extra={
            "year": check_data.year,
            "exam_count": len(all_exams),
        },
    )

    # Try exact case-insensitive match first
    exam_stmt = select(RegistrationExam).where(
        and_(
            RegistrationExam.exam_type.ilike(exam_type_input),
            RegistrationExam.exam_series.ilike(exam_series_input),
            RegistrationExam.year == check_data.year,
        )
    )
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    # Strategy 2: Bidirectional partial match
    # Check if either the input contains the DB value OR the DB value contains the input
    if not exam:
        # Don't log detailed matching attempts to avoid exposing internal logic
        # For each exam in the year, check bidirectional matching
        for db_exam in all_exams:
            db_exam_type = db_exam.exam_type.strip() if db_exam.exam_type else ""
            db_exam_series = db_exam.exam_series.strip() if db_exam.exam_series else ""

            # Case-insensitive bidirectional matching
            # Check if input contains DB value OR DB value contains input
            type_matches = (
                exam_type_input.lower() in db_exam_type.lower() or
                db_exam_type.lower() in exam_type_input.lower()
            )
            series_matches = (
                exam_series_input.lower() in db_exam_series.lower() or
                db_exam_series.lower() in exam_series_input.lower()
            )

            if type_matches and series_matches:
                logger.debug(
                    "Found exam using bidirectional partial matching",
                    extra={
                        "exam_id": db_exam.id,
                    },
                )
                exam = db_exam
                break

    if exam:
        logger.debug(
            "Exam found",
            extra={
                "exam_id": exam.id,
                "year": exam.year,
                "results_published": exam.results_published,
            },
        )
    else:
        logger.warning(
            "Exam not found",
            extra={
                "year": check_data.year,
                "exam_count_for_year": len(all_exams),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examination not found",
        )

    # Check if exam results are published
    if not exam.results_published:
        logger.warning(
            "Results not published for exam",
            extra={
                "exam_id": exam.id,
                "year": exam.year,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Results for this examination have not been published yet",
        )

    # Step 2: Find the candidate using the exam.id (registration_exam_id) and registration_number
    # Don't log registration_number or index_number for security
    candidate_stmt = select(RegistrationCandidate).where(
        and_(
            RegistrationCandidate.registration_exam_id == exam.id,
            RegistrationCandidate.registration_number == check_data.registration_number,
        )
    )

    if check_data.index_number:
        candidate_stmt = candidate_stmt.where(
            RegistrationCandidate.index_number == check_data.index_number
        )

    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()

    if not candidate:
        logger.warning(
            "Candidate not found",
            extra={
                "exam_id": exam.id,
                "has_registration_number": bool(check_data.registration_number),
                "has_index_number": bool(check_data.index_number),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found. Please verify your credentials.",
        )

    logger.debug(
        "Candidate found",
        extra={
            "candidate_id": candidate.id,
            "exam_id": exam.id,
        },
    )

    # Check if results are administratively blocked
    is_blocked = await check_result_blocks(
        session,
        exam.id,
        candidate_id=candidate.id,
        school_id=candidate.school_id,
    )

    if is_blocked:
        logger.warning(
            "Results blocked for candidate",
            extra={
                "candidate_id": candidate.id,
                "exam_id": exam.id,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your results are currently blocked. Please contact the examination board.",
        )

    # Step 3: Get all results for this candidate using exam.id and candidate.id
    # If exam.results_published is True, show all results regardless of individual is_published status
    # Don't log detailed result fetching to reduce verbosity
    # Don't filter by is_published since exam.results_published=True means all results should be visible
    results = await get_candidate_results(session, exam.id, candidate.id, check_blocks=False, only_published=False)

    # Also query directly to verify results exist
    direct_results_stmt = select(CandidateResult).where(
        and_(
            CandidateResult.registration_candidate_id == candidate.id,
            CandidateResult.registration_exam_id == exam.id,
        )
    ).options(selectinload(CandidateResult.subject))
    direct_results_result = await session.execute(direct_results_stmt)
    direct_results = list(direct_results_result.scalars().all())

    logger.debug(
        "Results fetched from database",
        extra={
            "exam_id": exam.id,
            "candidate_id": candidate.id,
            "result_count": len(results),
        },
    )

    # Get all subjects the candidate registered for
    from app.models import RegistrationSubjectSelection

    subject_selections_stmt = (
        select(RegistrationSubjectSelection)
        .where(RegistrationSubjectSelection.registration_candidate_id == candidate.id)
        .options(selectinload(RegistrationSubjectSelection.subject))
    )
    subject_selections_result = await session.execute(subject_selections_stmt)
    subject_selections = subject_selections_result.scalars().all()

    logger.debug(
        "Subject selections found",
        extra={
            "candidate_id": candidate.id,
            "selection_count": len(subject_selections),
        },
    )

    # Build results list - key by subject_id for lookup
    # Also create a map by subject_code for fallback matching when subject_id is NULL or doesn't match
    results_dict_by_id = {r.subject_id: r for r in results}
    results_dict_by_code = {}
    for r in results:
        if r.subject:
            if r.subject.code:
                # Use subject.code (case-insensitive)
                results_dict_by_code[r.subject.code.upper()] = r
                results_dict_by_code[r.subject.code.lower()] = r
            if r.subject.original_code:
                # Also index by original_code (case-insensitive)
                results_dict_by_code[r.subject.original_code.upper()] = r
                results_dict_by_code[r.subject.original_code.lower()] = r

    subject_results: list[PublicSubjectResult] = []

    # Don't log detailed matching process to avoid exposing internal logic

    # Build results with subject type information for sorting
    result_items: list[tuple[RegistrationSubjectSelection, CandidateResult | None, SubjectType | None]] = []

    for selection in subject_selections:
        subject_id = selection.subject_id
        # First try to match by subject_id
        result = results_dict_by_id.get(subject_id) if subject_id else None

        # If no match and subject_id is NULL, try matching by subject_code (case-insensitive)
        if not result and selection.subject_code:
            result = (
                results_dict_by_code.get(selection.subject_code.upper()) or
                results_dict_by_code.get(selection.subject_code.lower())
            )

        # Get subject type for sorting (CORE before ELECTIVE)
        subject_type = None
        if selection.subject:
            subject_type = selection.subject.subject_type
        elif result and result.subject:
            subject_type = result.subject.subject_type

        result_items.append((selection, result, subject_type))

    # Sort: CORE subjects first, then ELECTIVE subjects, then by subject_code within each group
    def sort_key(item: tuple[RegistrationSubjectSelection, CandidateResult | None, SubjectType | None]) -> tuple[int, str]:
        selection, result, subject_type = item
        # CORE = 0 (comes first), ELECTIVE = 1, None = 2 (comes last)
        type_order = 0 if subject_type == SubjectType.CORE else (1 if subject_type == SubjectType.ELECTIVE else 2)
        return (type_order, selection.subject_code)

    result_items.sort(key=sort_key)

    # Build the final results list with only subject_code and grade
    for selection, result, subject_type in result_items:
        grade = None
        if result:
            subject_id = selection.subject_id if selection.subject_id else result.subject_id
            subject_blocked = await check_result_blocks(
                session,
                exam.id,
                candidate_id=candidate.id,
                school_id=candidate.school_id,
                subject_id=subject_id,
            )
            if not subject_blocked:
                grade = result.grade

        subject_results.append(
            PublicSubjectResult(
                subject_code=selection.subject_code,
                subject_name=selection.subject_name,
                grade=grade,
            )
        )

    logger.info(
        "Results check completed successfully",
        extra={
            "exam_id": exam.id,
            "candidate_id": candidate.id,
            "subject_results_count": len(subject_results),
        },
    )

    # Load related data (school, programme, photo)
    await session.refresh(candidate, ["school", "programme", "photo"])

    # Get school name
    school_name = None
    school_code = None
    if candidate.school:
        school_name = candidate.school.name
        school_code = candidate.school.code

    # Get programme name
    programme_name = None
    programme_code = None
    if candidate.programme:
        programme_name = candidate.programme.name
        programme_code = candidate.programme.code
    elif candidate.programme_code:
        # Fallback to programme_code if programme relationship is not set
        programme_code = candidate.programme_code

    # Get photo URL if available
    photo_url = None
    if candidate.photo:
        # Construct photo URL for public endpoint
        photo_url = f"/api/v1/public/candidates/{candidate.id}/photo"

    return PublicResultResponse(
        candidate_name=candidate.name,
        index_number=candidate.index_number,
        registration_number=candidate.registration_number,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        year=exam.year,
        results=subject_results,
        exam_published=exam.results_published,
        school_name=school_name,
        school_code=school_code,
        programme_name=programme_name,
        programme_code=programme_code,
        photo_url=photo_url,
    )


@router.get("/candidates/{candidate_id}/photo")
async def get_public_candidate_photo(
    candidate_id: int,
    session: DBSessionDep,
) -> StreamingResponse:
    """Get candidate photo file (public endpoint for results display)."""
    # Get photo
    photo_stmt = select(RegistrationCandidatePhoto).where(
        RegistrationCandidatePhoto.registration_candidate_id == candidate_id
    )
    photo_result = await session.execute(photo_stmt)
    photo = photo_result.scalar_one_or_none()

    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    # Retrieve file
    photo_storage_service = PhotoStorageService()
    try:
        if not await photo_storage_service.exists(photo.file_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Photo file not found in storage"
            )
        file_content = await photo_storage_service.retrieve(photo.file_path)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error retrieving photo file {photo.file_path}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to retrieve photo file: {str(e)}"
        )

    return StreamingResponse(
        iter([file_content]),
        media_type=photo.mime_type,
        headers={"Content-Disposition": f'inline; filename="{photo.file_name}"'},
    )


@router.post("/results/pdf", response_class=StreamingResponse)
async def generate_results_pdf_endpoint(
    check_data: PublicResultCheckRequest,
    session: DBSessionDep,
) -> StreamingResponse:
    """Generate PDF for examination results."""
    from app.services.pdf_generator import generate_results_pdf
    from app.services.photo_storage import PhotoStorageService

    # Reuse the same logic as check_public_results to get the results
    # Step 1: Find the exam
    exam_type_input = check_data.exam_type.strip() if check_data.exam_type else ""
    exam_series_input = check_data.exam_series.strip() if check_data.exam_series else ""

    # Query exams for the year
    all_exams_stmt = select(RegistrationExam).where(RegistrationExam.year == check_data.year)
    all_exams_result = await session.execute(all_exams_stmt)
    all_exams = list(all_exams_result.scalars().all())

    exam = None
    for e in all_exams:
        db_type = e.exam_type.strip()
        db_series = e.exam_series.strip()

        # Exact case-insensitive match
        if (db_type.lower() == exam_type_input.lower() and
            db_series.lower() == exam_series_input.lower()):
            exam = e
            break

        # Partial match
        if (exam_type_input.lower() in db_type.lower() or db_type.lower() in exam_type_input.lower()):
            if (exam_series_input.lower() in db_series.lower() or db_series.lower() in exam_series_input.lower()):
                exam = e
                break

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")

    if not exam.results_published:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Results are not yet published for this examination")

    # Step 2: Find candidate
    candidate_stmt = (
        select(RegistrationCandidate)
        .options(
            selectinload(RegistrationCandidate.school),
            selectinload(RegistrationCandidate.programme),
            selectinload(RegistrationCandidate.photo),
        )
        .where(
            and_(
                RegistrationCandidate.registration_exam_id == exam.id,
                RegistrationCandidate.registration_number == check_data.registration_number,
            )
        )
    )

    if check_data.index_number:
        candidate_stmt = candidate_stmt.where(RegistrationCandidate.index_number == check_data.index_number)

    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # Step 3: Get results
    results_list = await get_candidate_results(
        session=session,
        exam_id=exam.id,
        candidate_id=candidate.id,
        check_blocks=False,
        only_published=False,  # Exam-level results_published flag controls visibility
    )

    # Get subject selections for this candidate
    # Note: candidate is already associated with exam via registration_exam_id
    from app.models import RegistrationSubjectSelection

    subject_selections_stmt = (
        select(RegistrationSubjectSelection)
        .options(selectinload(RegistrationSubjectSelection.subject))
        .where(
            RegistrationSubjectSelection.registration_candidate_id == candidate.id
        )
    )
    subject_selections_result = await session.execute(subject_selections_stmt)
    subject_selections = list(subject_selections_result.scalars().all())

    # Build subject results list
    subject_results = []
    for selection in subject_selections:
        if not selection.subject:
            continue

        # Find matching result by subject_id
        matching_result = None
        for result in results_list:
            if result.subject_id == selection.subject.id:
                matching_result = result
                break

        # If no match by subject_id, try by code (access through subject relationship)
        if not matching_result:
            for result in results_list:
                if not result.subject:
                    continue
                if (result.subject.code and selection.subject.code and
                    result.subject.code.lower() == selection.subject.code.lower()):
                    matching_result = result
                    break
                elif (result.subject.code and selection.subject.original_code and
                      result.subject.code.lower() == selection.subject.original_code.lower()):
                    matching_result = result
                    break
                elif (result.subject.original_code and selection.subject.code and
                      result.subject.original_code.lower() == selection.subject.code.lower()):
                    matching_result = result
                    break
                elif (result.subject.original_code and selection.subject.original_code and
                      result.subject.original_code.lower() == selection.subject.original_code.lower()):
                    matching_result = result
                    break

        subject_result_item = PublicSubjectResult(
            subject_code=selection.subject.code,
            subject_name=selection.subject.name,
            grade=matching_result.grade if matching_result else None,
        )
        subject_results.append(subject_result_item)

    # Sort: CORE subjects first, then ELECTIVE, then alphabetically
    from app.models import SubjectType

    def sort_key(x):
        # Try to determine subject type from selections
        for sel in subject_selections:
            if sel.subject and (sel.subject.code == x.subject_code or sel.subject.original_code == x.subject_code):
                subject_type_order = 0 if sel.subject.subject_type == SubjectType.CORE else 1
                return (subject_type_order, x.subject_name or x.subject_code)
        return (1, x.subject_name or x.subject_code)  # Default to ELECTIVE if not found

    subject_results.sort(key=sort_key)

    # Build response data
    school_name = candidate.school.name if candidate.school else None
    school_code = candidate.school.code if candidate.school else None
    programme_name = candidate.programme.name if candidate.programme else None
    programme_code = candidate.programme.code if candidate.programme else None

    photo_url = None
    photo_data = None
    if candidate.photo:
        photo_url = f"/api/v1/public/candidates/{candidate.id}/photo"
        # Fetch photo data for PDF
        photo_storage_service = PhotoStorageService()
        try:
            if await photo_storage_service.exists(candidate.photo.file_path):
                photo_data = await photo_storage_service.retrieve(candidate.photo.file_path)
        except Exception:
            logger.warning(f"Failed to load photo for candidate {candidate.id} for PDF", exc_info=True)

    public_result_response = PublicResultResponse(
        candidate_name=candidate.name,
        index_number=candidate.index_number,
        registration_number=candidate.registration_number,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        year=exam.year,
        results=subject_results,
        exam_published=exam.results_published,
        school_name=school_name,
        school_code=school_code,
        programme_name=programme_name,
        programme_code=programme_code,
        photo_url=photo_url,
    )

    # Generate PDF
    try:
        pdf_bytes = generate_results_pdf(public_result_response, photo_data)
    except Exception as e:
        logger.error(f"Failed to generate PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PDF document"
        )

    filename = f"results_{candidate.registration_number}_{exam.year}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
