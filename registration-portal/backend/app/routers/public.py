"""Public endpoints (no authentication required)."""
import logging
from fastapi import APIRouter, HTTPException, status, File, UploadFile, Form, Request, Query, Body, Depends
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta

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


# Certificate Request Endpoints

@router.post("/certificate-requests", status_code=status.HTTP_201_CREATED)
async def submit_certificate_request(
    request_type: str = Form(...),
    index_number: str = Form(...),
    exam_year: int = Form(...),
    examination_center_id: int | None = Form(None),  # Optional for confirmation/verification
    national_id_number: str | None = Form(None),  # Optional for confirmation/verification
    delivery_method: str | None = Form(None),  # Optional for confirmation/verification
    contact_phone: str = Form(...),
    contact_email: str | None = Form(None),
    courier_address_line1: str | None = Form(None),
    courier_address_line2: str | None = Form(None),
    courier_city: str | None = Form(None),
    courier_region: str | None = Form(None),
    courier_postal_code: str | None = Form(None),
    service_type: str = Form("standard"),
    photograph: UploadFile = File(None),  # Optional for confirmation/verification
    national_id_scan: UploadFile = File(None),  # Optional for confirmation/verification
    # Confirmation/Verification specific fields
    candidate_name: str | None = Form(None),
    candidate_index_number: str | None = Form(None),
    school_name: str | None = Form(None),
    programme_name: str | None = Form(None),
    completion_year: int | None = Form(None),
    certificate: UploadFile = File(None),  # Optional certificate scan
    candidate_photograph: UploadFile = File(None),  # Optional candidate photo
    request_details: str | None = Form(None),
    credentials: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(auto_error=False)),
    session: DBSessionDep = None,
) -> dict:
    """Submit a certificate, attestation, confirmation, or verification request."""
    from app.schemas.certificate import CertificateRequestResponse
    from app.services.certificate_service import create_certificate_request
    from app.services.certificate_file_storage import CertificateFileStorageService
    from app.models import CertificateRequestType, DeliveryMethod, ServiceType, PortalUser, PortalUserType
    from app.config import settings
    from app.dependencies.auth import get_current_user_optional

    try:
        # Resolve optional current user (only required for confirmation/verification)
        resolved_user: PortalUser | None = None
        try:
            resolved_user = await get_current_user_optional(session=session, credentials=credentials)
        except HTTPException:
            # If an Authorization header is present but invalid/expired, propagate 401
            raise

        # Parse enums first to check request type
        try:
            request_type_enum = CertificateRequestType(request_type.lower())
            service_type_enum = ServiceType(service_type.lower())
            # delivery_method is optional for confirmation/verification
            if delivery_method:
                delivery_method_enum = DeliveryMethod(delivery_method.lower())
            else:
                delivery_method_enum = DeliveryMethod.PICKUP  # Default
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid request_type, delivery_method, or service_type: {e}",
            )

        # Validate file uploads
        photo_content = None
        id_scan_content = None
        certificate_content = None
        candidate_photo_content = None
        allowed_mime_types = ["image/jpeg", "image/png", "image/jpg"]
        max_file_size = 5 * 1024 * 1024  # 5MB

        if request_type_enum in (CertificateRequestType.CERTIFICATE, CertificateRequestType.ATTESTATION):
            # Files are required for certificate/attestation
            if not photograph or not national_id_scan:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Photograph and national ID scan are required for certificate and attestation requests",
                )

            if photograph.content_type not in allowed_mime_types:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Photograph must be JPEG or PNG image",
                )
            if national_id_scan.content_type not in allowed_mime_types:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="National ID scan must be JPEG or PNG image",
                )

            photo_content = await photograph.read()
            id_scan_content = await national_id_scan.read()

            if len(photo_content) > max_file_size:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Photograph file size exceeds 5MB limit",
                )
            if len(id_scan_content) > max_file_size:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="National ID scan file size exceeds 5MB limit",
                )
        else:
            # Files are optional for confirmation/verification
            if photograph:
                if photograph.content_type not in allowed_mime_types:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Photograph must be JPEG or PNG image",
                    )
                photo_content = await photograph.read()
                if len(photo_content) > max_file_size:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Photograph file size exceeds 5MB limit",
                    )

            if national_id_scan:
                if national_id_scan.content_type not in allowed_mime_types:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="National ID scan must be JPEG or PNG image",
                    )
                id_scan_content = await national_id_scan.read()
                if len(id_scan_content) > max_file_size:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="National ID scan file size exceeds 5MB limit",
                    )

            # Handle certificate and candidate photo uploads for confirmation/verification
            if certificate:
                if certificate.content_type not in allowed_mime_types:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Certificate scan must be JPEG or PNG image",
                    )
                certificate_content = await certificate.read()
                if len(certificate_content) > max_file_size:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Certificate scan file size exceeds 5MB limit",
                    )

            if candidate_photograph:
                if candidate_photograph.content_type not in allowed_mime_types:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Candidate photograph must be JPEG or PNG image",
                    )
                candidate_photo_content = await candidate_photograph.read()
                if len(candidate_photo_content) > max_file_size:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Candidate photograph file size exceeds 5MB limit",
                    )


        # Validate courier address if delivery method is courier
        if delivery_method_enum == DeliveryMethod.COURIER:
            if not courier_address_line1 or not contact_phone:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Courier delivery requires address_line1 and contact_phone",
                )

        # Validate confirmation/verification specific fields
        if request_type_enum in (CertificateRequestType.CONFIRMATION, CertificateRequestType.VERIFICATION):
            # Disable guest creation: must be authenticated private user
            if resolved_user is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required for confirmation and verification requests",
                )
            if resolved_user.user_type != PortalUserType.PRIVATE_USER:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only private users can submit confirmation and verification requests",
                )
            if not candidate_name:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="candidate_name is required for confirmation and verification requests",
                )
            if not school_name:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="school_name is required for confirmation and verification requests",
                )
            if not programme_name:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="programme_name is required for confirmation and verification requests",
                )
            if not completion_year:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="completion_year is required for confirmation and verification requests",
                )
            if not candidate_index_number and not index_number:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="candidate_index_number or index_number is required for confirmation and verification requests",
                )
        else:
            # Validate required fields for certificate/attestation
            if not examination_center_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="examination_center_id is required for certificate and attestation requests",
                )
            if not national_id_number:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="national_id_number is required for certificate and attestation requests",
                )

        # Check if this is a confirmation/verification request
        if request_type_enum in (CertificateRequestType.CONFIRMATION, CertificateRequestType.VERIFICATION):
            # Handle confirmation/verification requests - save to certificate_confirmation_requests table
            from app.services.certificate_confirmation_service import create_certificate_confirmation
            from app.schemas.certificate import CertificateConfirmationRequestResponse

            # Disable guest creation: already enforced above
            user_id = str(resolved_user.id) if resolved_user else None

            # Prepare certificate_details array (single item for single request)
            certificate_details = [{
                "candidate_name": candidate_name,
                "candidate_index_number": candidate_index_number or index_number,
                "school_name": school_name,
                "programme_name": programme_name,
                "completion_year": completion_year,
                "certificate_file_path": None,  # Will set after saving
                "candidate_photograph_file_path": None,  # Will set after saving
                "request_details": request_details,
            }]

            # Create confirmation request (will create invoice too)
            confirmation_request = await create_certificate_confirmation(
                session,
                request_type=request_type_enum,
                contact_phone=contact_phone,
                contact_email=contact_email,
                service_type=service_type_enum,
                certificate_details=certificate_details,
                user_id=user_id,
            )

            # Save files and update certificate_details with file paths
            file_storage = CertificateFileStorageService()

            # Get current certificate_details and update with file paths
            updated_certificate_details = confirmation_request.certificate_details.copy()

            if certificate_content:
                certificate_path, _ = await file_storage.save_certificate_scan(
                    certificate_content,
                    certificate.filename or "certificate.jpg",
                    confirmation_request.id,
                )
                # Update certificate_details with file path
                updated_certificate_details[0]["certificate_file_path"] = certificate_path

            if candidate_photo_content:
                candidate_photo_path, _ = await file_storage.save_candidate_photo(
                    candidate_photo_content,
                    candidate_photograph.filename or "candidate_photo.jpg",
                    confirmation_request.id,
                )
                # Update certificate_details with file path
                updated_certificate_details[0]["candidate_photograph_file_path"] = candidate_photo_path

            # Update the certificate_details field (reassign to trigger SQLAlchemy change detection)
            confirmation_request.certificate_details = updated_certificate_details

            # Commit file path updates
            await session.commit()
            await session.refresh(confirmation_request, ["invoice", "payment"])

            # Return confirmation request response
            response_data = CertificateConfirmationRequestResponse.model_validate(confirmation_request)
            return response_data.model_dump()
        else:
            # Handle certificate/attestation requests - save to certificate_requests table (existing behavior)
            # Create request data dictionary
            request_data = {
                "request_type": request_type_enum,
                "index_number": index_number,
                "exam_year": exam_year,
                "examination_center_id": examination_center_id,
                "national_id_number": national_id_number,
                "delivery_method": delivery_method_enum,
                "contact_phone": contact_phone,
                "contact_email": contact_email,
                "courier_address_line1": courier_address_line1,
                "courier_address_line2": courier_address_line2,
                "courier_city": courier_city,
                "courier_region": courier_region,
                "courier_postal_code": courier_postal_code,
                "service_type": service_type_enum,
            }

            # Create request using service (will create invoice too)
            certificate_request = await create_certificate_request(
                session,
                request_data,
                photo_file_path=None,  # Will set after saving
                id_scan_file_path=None,  # Will set after saving
                certificate_file_path=None,  # Will set after saving
                candidate_photo_file_path=None,  # Will set after saving
            )

            # Now save files and update paths
            file_storage = CertificateFileStorageService()

            if photo_content:
                photo_path, _ = await file_storage.save_photo(
                    photo_content,
                    photograph.filename or "photo.jpg",
                    certificate_request.id,
                )
                certificate_request.photograph_file_path = photo_path

            if id_scan_content:
                id_scan_path, _ = await file_storage.save_id_scan(
                    id_scan_content,
                    national_id_scan.filename or "id_scan.jpg",
                    certificate_request.id,
                )
                certificate_request.national_id_file_path = id_scan_path

            if certificate_content:
                certificate_path, _ = await file_storage.save_certificate_scan(
                    certificate_content,
                    certificate.filename or "certificate.jpg",
                    certificate_request.id,
                )
                certificate_request.certificate_file_path = certificate_path

            if candidate_photo_content:
                candidate_photo_path, _ = await file_storage.save_candidate_photo(
                    candidate_photo_content,
                    candidate_photograph.filename or "candidate_photo.jpg",
                    certificate_request.id,
                )
                certificate_request.candidate_photograph_file_path = candidate_photo_path

            # Commit file path updates
            await session.commit()
            await session.refresh(certificate_request)

            # Query examination center separately to avoid lazy loading issues (if applicable)
            from app.models import School
            examination_center = None
            if certificate_request.examination_center_id:
                examination_center_stmt = select(School).where(School.id == certificate_request.examination_center_id)
                examination_center_result = await session.execute(examination_center_stmt)
                examination_center = examination_center_result.scalar_one_or_none()

            response_data = CertificateRequestResponse.model_validate(certificate_request)
            if examination_center:
                response_data.examination_center_name = examination_center.name

            return response_data.model_dump()

    except HTTPException:
        raise
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        logger.error(f"Error creating certificate request: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create certificate request",
        )


@router.post("/certificate-requests/bulk", status_code=status.HTTP_201_CREATED)
async def submit_bulk_certificate_request(
    request_type: str = Form(...),
    contact_phone: str = Form(...),
    contact_email: str | None = Form(None),
    service_type: str = Form("standard"),
    requests_json: str = Form(...),  # JSON string of requests array
    http_request: Request = None,  # FastAPI will inject this automatically
    credentials: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(auto_error=False)),
    session: DBSessionDep = None,
) -> dict:
    """Submit bulk confirmation or verification requests with optional file uploads."""
    import json
    from fastapi import UploadFile, File
    from typing import List

    from app.models import CertificateRequestType, ServiceType, PortalUser, PortalUserType
    from app.services.certificate_confirmation_service import create_certificate_confirmation
    from app.services.certificate_file_storage import CertificateFileStorageService
    from sqlalchemy.orm import selectinload
    from app.dependencies.auth import get_current_user_optional

    # Resolve optional current user; bulk endpoint is confirmation/verification only so auth is required.
    resolved_user: PortalUser | None = None
    try:
        resolved_user = await get_current_user_optional(session=session, credentials=credentials)
    except HTTPException:
        raise
    if resolved_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required for bulk confirmation and verification requests",
        )
    if resolved_user.user_type != PortalUserType.PRIVATE_USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only private users can submit bulk confirmation and verification requests",
        )
    user_id = str(resolved_user.id)

    try:
        # Parse requests JSON
        try:
            requests = json.loads(requests_json)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid JSON format for requests array",
            )

        if not isinstance(requests, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="requests must be an array",
            )

        # Parse form data to extract files with indexed names
        # Files are sent as: certificate_0, certificate_1, candidate_photo_0, candidate_photo_1, etc.
        certificate_files: dict[int, UploadFile] = {}
        candidate_photo_files: dict[int, UploadFile] = {}

        if http_request:
            try:
                form_data = await http_request.form()
                for key, value in form_data.items():
                    if isinstance(value, UploadFile):
                        if key.startswith("certificate_"):
                            try:
                                index = int(key.replace("certificate_", ""))
                                certificate_files[index] = value
                            except ValueError:
                                pass
                        elif key.startswith("candidate_photo_"):
                            try:
                                index = int(key.replace("candidate_photo_", ""))
                                candidate_photo_files[index] = value
                            except ValueError:
                                pass
            except Exception as e:
                logger.warning(f"Error parsing form data for files: {e}")

        if not request_type or not requests:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="request_type and requests array are required",
            )

        if not contact_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="contact_phone is required",
            )

        # Validate request type
        try:
            request_type_enum = CertificateRequestType(request_type.lower())
            if request_type_enum not in (CertificateRequestType.CONFIRMATION, CertificateRequestType.VERIFICATION):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Bulk requests are only supported for confirmation and verification types",
                )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid request_type. Must be 'confirmation' or 'verification'",
            )

        if not isinstance(requests, list) or len(requests) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="requests must be a non-empty array",
            )

        if len(requests) > 100:  # Limit bulk requests
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum 100 requests allowed per bulk submission",
            )

        service_type_enum = ServiceType(service_type.lower()) if isinstance(service_type, str) else service_type

        # Validate individual requests and prepare data
        validated_requests = []
        errors = []
        file_storage = CertificateFileStorageService()

        for idx, req in enumerate(requests):
            try:
                candidate_name = req.get("candidate_name")
                candidate_index_number = req.get("candidate_index_number") or req.get("index_number")
                completion_year = req.get("completion_year") or req.get("exam_year")
                school_name = req.get("school_name")
                programme_name = req.get("programme_name")
                request_details = req.get("request_details")

                # Validate required fields for confirmation/verification
                # candidate_index_number is optional, so only check required fields
                if not all([candidate_name, completion_year, school_name, programme_name]):
                    errors.append({
                        "index": idx,
                        "error": "Missing required fields: candidate_name, completion_year (or exam_year), school_name, programme_name"
                    })
                    continue

                # Prepare certificate detail dict (files will be added after request creation)
                cert_detail = {
                    "candidate_name": candidate_name,
                    "candidate_index_number": candidate_index_number if candidate_index_number else None,
                    "school_name": school_name,
                    "programme_name": programme_name,
                    "completion_year": int(completion_year),
                    "certificate_file_path": None,
                    "candidate_photograph_file_path": None,
                    "request_details": request_details,
                }

                validated_requests.append(cert_detail)

            except Exception as e:
                errors.append({
                    "index": idx,
                    "error": str(e)
                })
                continue

        if not validated_requests:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid requests to create. All requests failed validation.",
            )

        # Create certificate confirmation request with certificate_details array
        confirmation_request = await create_certificate_confirmation(
            session,
            request_type=request_type_enum,
            contact_phone=contact_phone,
            contact_email=contact_email,
            service_type=service_type_enum,
            certificate_details=validated_requests,
            user_id=user_id,  # Pass user_id if user is logged in
        )

        # Save uploaded files and update certificate_details with file paths
        updated_certificate_details = list(confirmation_request.certificate_details)

        for idx, cert_detail in enumerate(updated_certificate_details):
            # Save certificate scan if provided
            if idx in certificate_files:
                cert_file = certificate_files[idx]
                cert_content = await cert_file.read()
                if cert_content:
                    cert_path, _ = await file_storage.save_certificate_scan(
                        cert_content,
                        cert_file.filename or f"certificate_{idx}.jpg",
                        confirmation_request.id,
                    )
                    cert_detail["certificate_file_path"] = cert_path

            # Save candidate photo if provided
            if idx in candidate_photo_files:
                photo_file = candidate_photo_files[idx]
                photo_content = await photo_file.read()
                if photo_content:
                    photo_path, _ = await file_storage.save_candidate_photo(
                        photo_content,
                        photo_file.filename or f"candidate_photo_{idx}.jpg",
                        confirmation_request.id,
                    )
                    cert_detail["candidate_photograph_file_path"] = photo_path

        # Update certificate_details with file paths
        confirmation_request.certificate_details = updated_certificate_details

        await session.commit()

        # Refresh to get relationships loaded
        await session.refresh(confirmation_request, ["invoice"])

        # Calculate total amount for response
        from app.services.invoice_service import calculate_invoice_amount
        from decimal import Decimal
        total_amount = Decimal(0)
        for _ in validated_requests:
            amount = calculate_invoice_amount(
                request_type=request_type_enum,
                delivery_method=None,
                service_type=service_type_enum,
            )
            total_amount += amount

        return {
            "bulk_request_number": confirmation_request.request_number,
            "bulk_request_id": confirmation_request.id,
            "total_amount": float(total_amount),
            "invoice_number": confirmation_request.invoice.invoice_number if confirmation_request.invoice else None,
            "success": len(validated_requests),
            "failed": len(errors),
            "individual_requests": [
                {
                    "index": idx,
                    "candidate_name": req.get("candidate_name"),
                    "candidate_index_number": req.get("candidate_index_number"),
                }
                for idx, req in enumerate(validated_requests)
            ],
            "errors": errors,
        }

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error(f"Error creating certificate confirmation: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create certificate confirmation",
        )


@router.get("/certificate-confirmations/{request_number}/pdf", status_code=status.HTTP_200_OK)
async def download_confirmation_pdf_public(
    request_number: str,
    session: DBSessionDep = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(auto_error=False)),
) -> StreamingResponse:
    """Download certificate confirmation PDF (Public - for requester)."""
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_number
    from app.services.certificate_file_storage import CertificateFileStorageService
    from app.dependencies.auth import get_current_user_optional
    from app.models import PortalUser, PortalUserType

    resolved_user: PortalUser | None = None
    try:
        resolved_user = await get_current_user_optional(session=session, credentials=credentials)
    except HTTPException:
        raise
    if resolved_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to download confirmation documents",
        )
    if resolved_user.user_type != PortalUserType.PRIVATE_USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only private users can download confirmation documents",
        )

    confirmation_request = await get_certificate_confirmation_by_number(session, request_number)
    if not confirmation_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate confirmation request not found",
        )

    # Ownership check (authenticated requester only)
    if not confirmation_request.user_id or confirmation_request.user_id != resolved_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this confirmation request",
        )

    if not confirmation_request.pdf_file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not found. The certificate confirmation document has not been generated yet.",
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


@router.get("/certificate-requests/{request_number}")
async def get_certificate_request_status(
    request_number: str,
    session: DBSessionDep = None,
) -> dict:
    """Get certificate request status (public lookup). Supports both certificate requests and confirmation requests."""
    from app.schemas.certificate import CertificateRequestPublicResponse, CertificateConfirmationRequestResponse
    from app.services.certificate_service import get_certificate_request_by_number
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_number
    from app.models import Invoice, Payment
    from app.schemas.certificate import InvoiceResponse, PaymentResponse
    from sqlalchemy.orm import selectinload

    # Check if it's a confirmation request (starts with BULK- or REQ-)
    if request_number.upper().startswith(("BULK-", "REQ-")):
        confirmation_request = await get_certificate_confirmation_by_number(session, request_number)
        if confirmation_request:
            # Load relationships
            from app.models import CertificateConfirmationRequest
            stmt = select(CertificateConfirmationRequest).where(
                CertificateConfirmationRequest.id == confirmation_request.id
            ).options(
                selectinload(CertificateConfirmationRequest.invoice),
                selectinload(CertificateConfirmationRequest.payment),
            )
            result = await session.execute(stmt)
            confirmation_request = result.scalar_one_or_none()

            if confirmation_request:
                # Convert to response format
                confirmation_response = CertificateConfirmationRequestResponse.model_validate(confirmation_request)

                # Add invoice and payment if they exist
                if confirmation_request.invoice:
                    confirmation_response.invoice = InvoiceResponse.model_validate(confirmation_request.invoice)
                if confirmation_request.payment:
                    confirmation_response.payment = PaymentResponse.model_validate(confirmation_request.payment)

                response_dict = confirmation_response.model_dump()
                # Public lookup should not expose internal storage paths or response content/metadata.
                response_dict["pdf_file_path"] = None
                response_dict["has_response"] = False
                for k in (
                    "response_file_path",
                    "response_file_name",
                    "response_mime_type",
                    "response_source",
                    "responded_at",
                    "responded_by_user_id",
                    "response_notes",
                    "response_payload",
                ):
                    response_dict[k] = None
                response_dict["_type"] = "certificate_confirmation"
                return response_dict

    # Handle individual certificate request
    request = await get_certificate_request_by_number(session, request_number)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate request not found",
        )

    # Query invoice separately since CertificateRequest doesn't have invoice relationship
    invoice_stmt = select(Invoice).where(Invoice.certificate_request_id == request.id)
    invoice_result = await session.execute(invoice_stmt)
    invoice = invoice_result.scalar_one_or_none()

    # Query payment separately since CertificateRequest doesn't have payment relationship
    payment_stmt = select(Payment).where(Payment.certificate_request_id == request.id)
    payment_result = await session.execute(payment_stmt)
    payment = payment_result.scalar_one_or_none()

    # Convert SQLAlchemy models to Pydantic schemas
    invoice_response = InvoiceResponse.model_validate(invoice) if invoice else None
    payment_response = PaymentResponse.model_validate(payment) if payment else None

    response_data = CertificateRequestPublicResponse(
        request_number=request.request_number,
        request_type=request.request_type,
        status=request.status,
        invoice=invoice_response,
        payment=payment_response,
        tracking_number=request.tracking_number,
        created_at=request.created_at,
        updated_at=request.updated_at,
    )
    return response_data.model_dump()


@router.post("/certificate-requests/{request_number}/pay", status_code=status.HTTP_200_OK)
async def initialize_payment(
    request_number: str,
    session: DBSessionDep = None,
) -> dict:
    """Initialize Paystack payment for certificate request or confirmation request."""
    from app.schemas.certificate import PaymentInitializeResponse
    from app.services.certificate_service import get_certificate_request_by_number
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_number
    from app.services.payment_service import initialize_payment as init_payment_service
    from app.models import Invoice, CertificateConfirmationRequest, RequestStatus
    from decimal import Decimal

    # Check if it's a confirmation request (starts with BULK- or REQ-)
    if request_number.upper().startswith(("BULK-", "REQ-")):
        confirmation_request = await get_certificate_confirmation_by_number(session, request_number)
        if not confirmation_request:
            # If not found, raise error instead of continuing to check regular requests
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Certificate confirmation request not found",
            )

        # Get invoice (don't access relationship directly to avoid lazy loading issues)
        invoice = None
        if confirmation_request.invoice_id:
            invoice_stmt = select(Invoice).where(Invoice.id == confirmation_request.invoice_id)
            invoice_result = await session.execute(invoice_stmt)
            invoice = invoice_result.scalar_one_or_none()

        if not invoice:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invoice not found for this confirmation request",
            )

        if invoice.status == "paid":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invoice is already paid",
            )

        try:
            result = await init_payment_service(
                session,
                invoice,
                Decimal(str(invoice.amount)),
                email=confirmation_request.contact_email,
                metadata={
                    "request_number": confirmation_request.request_number,
                    "confirmation_request_id": confirmation_request.id,
                },
            )
            await session.flush()

            # Update confirmation request with payment_id from result
            confirmation_request.payment_id = result["payment_id"]
            await session.commit()

            return PaymentInitializeResponse(**result).model_dump()

        except ValueError as e:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except Exception as e:
            await session.rollback()
            logger.error(f"Error initializing payment: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to initialize payment",
            )

    # Regular certificate request
    request = await get_certificate_request_by_number(session, request_number)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate request not found",
        )

    # Query invoice separately since CertificateRequest doesn't have invoice relationship
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
        result = await init_payment_service(
            session,
            invoice,
            Decimal(str(invoice.amount)),
            email=request.contact_email,
            metadata={"request_number": request.request_number},
        )
        await session.flush()

        # Update request with payment_id from result
        request.payment_id = result["payment_id"]
        await session.commit()

        return PaymentInitializeResponse(**result).model_dump()

    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        logger.error(f"Error initializing payment: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize payment",
        )


@router.post("/certificate-requests/paystack-webhook")
async def paystack_webhook(
    request: Request,
    session: DBSessionDep = None,
) -> dict:
    """Handle Paystack webhook events."""
    from app.services.payment_service import verify_webhook_signature, process_webhook_event
    from app.services.certificate_service import update_request_status
    from app.models import RequestStatus

    # Get signature from headers
    signature = request.headers.get("X-Paystack-Signature", "")
    if not signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-Paystack-Signature header",
        )

    # Read request body
    body = await request.body()

    # Verify signature
    if not verify_webhook_signature(body, signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    # Parse JSON
    import json
    try:
        event_data = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON in webhook payload",
        )

    try:
        payment = await process_webhook_event(session, event_data)
        if payment:
            # Refresh payment to ensure we have the latest status
            await session.refresh(payment)

            # Update certificate request status if payment successful
            # Use enum comparison instead of value comparison for reliability
            from app.models import PaymentStatus
            logger.info(f"Webhook processed payment {payment.id}, status: {payment.status}, certificate_request_id: {payment.certificate_request_id}")

            if payment.status == PaymentStatus.SUCCESS:
                # Handle certificate request
                if payment.certificate_request_id:
                    logger.info(f"Updating certificate request {payment.certificate_request_id} status to PAID")
                    await update_request_status(
                        session,
                        payment.certificate_request_id,
                        RequestStatus.PAID,
                    )
                    await session.flush()  # Ensure status update is flushed before commit

                    # Verify the update
                    from app.services.certificate_service import get_certificate_request_by_id
                    updated_request = await get_certificate_request_by_id(session, payment.certificate_request_id)
                    if updated_request:
                        logger.info(f"Certificate request {payment.certificate_request_id} status updated to: {updated_request.status}")

                # Handle confirmation request
                elif payment.certificate_confirmation_request_id:
                    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id
                    from app.models import TicketActivity, TicketStatusHistory, TicketActivityType
                    from uuid import UUID
                    from datetime import datetime

                    logger.info(f"Updating confirmation request {payment.certificate_confirmation_request_id} status to PAID")
                    confirmation_request = await get_certificate_confirmation_by_id(session, payment.certificate_confirmation_request_id)
                    if confirmation_request:
                        old_status = confirmation_request.status
                        confirmation_request.status = RequestStatus.PAID
                        confirmation_request.paid_at = payment.paid_at or datetime.utcnow()

                        # Record status history
                        status_history = TicketStatusHistory(
                            ticket_type="certificate_confirmation_request",
                            ticket_id=confirmation_request.id,
                            from_status=old_status.value if old_status else None,
                            to_status=RequestStatus.PAID.value,
                            changed_by_user_id=None,  # System/automatic via payment
                        )
                        session.add(status_history)

                        # Record activity
                        activity = TicketActivity(
                            ticket_type="certificate_confirmation_request",
                            ticket_id=confirmation_request.id,
                            activity_type=TicketActivityType.STATUS_CHANGE,
                            user_id=None,  # System/automatic via payment
                            old_status=old_status.value if old_status else None,
                            new_status=RequestStatus.PAID.value,
                            comment="Payment received via Paystack",
                        )
                        session.add(activity)
                        await session.flush()
                        logger.info(f"Confirmation request {payment.certificate_confirmation_request_id} status updated to: {confirmation_request.status}")
            await session.commit()
            return {"status": "success"}
        return {"status": "ignored"}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error processing webhook: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process webhook",
        )


@router.get("/certificate-requests/{request_number}/verify-payment", status_code=status.HTTP_200_OK)
async def verify_payment_callback(
    request_number: str,
    reference: str = Query(..., description="Paystack transaction reference"),
    session: DBSessionDep = None,
) -> dict:
    """Verify payment status after Paystack redirect (callback)."""
    from app.services.certificate_service import get_certificate_request_by_number, update_request_status
    from app.services.payment_service import verify_payment
    from app.models import RequestStatus, PaymentStatus
    from app.models import Payment, Invoice

    # Get certificate request
    request = await get_certificate_request_by_number(session, request_number)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate request not found",
        )

    # Find payment by reference
    payment_stmt = select(Payment).where(Payment.paystack_reference == reference)
    payment_result = await session.execute(payment_stmt)
    payment = payment_result.scalar_one_or_none()

    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found",
        )

    # Verify payment with Paystack
    try:
        paystack_response = await verify_payment(session, reference)

        if paystack_response.get("status") and paystack_response.get("data", {}).get("status") == "success":
            # Update payment status
            payment.status = PaymentStatus.SUCCESS
            payment.paystack_response = paystack_response
            # Set paid_at to current time (timezone-naive)
            from datetime import datetime
            payment.paid_at = datetime.utcnow()

            # Update invoice status
            if payment.invoice_id:
                invoice_stmt = select(Invoice).where(Invoice.id == payment.invoice_id)
                invoice_result = await session.execute(invoice_stmt)
                invoice = invoice_result.scalar_one_or_none()
                if invoice:
                    invoice.status = "paid"
                    invoice.paid_at = payment.paid_at  # Use same naive datetime

            # Update certificate request status
            if request.status != RequestStatus.PAID:
                await update_request_status(
                    session,
                    request.id,
                    RequestStatus.PAID,
                )

            await session.commit()
            logger.info(f"Payment verified and status updated for request {request_number}")

            # Redirect to receipt page with request number
            from fastapi.responses import RedirectResponse
            from app.config import settings
            callback_base_url = getattr(settings, 'paystack_callback_base_url', 'http://localhost:3001')
            receipt_url = f"{callback_base_url}/certificate-request/receipt?request_number={request_number}"
            return RedirectResponse(url=receipt_url, status_code=303)
        else:
            # Payment failed or pending
            payment.status = PaymentStatus.FAILED
            await session.commit()
            return {
                "status": "failed",
                "message": "Payment verification failed",
            }

    except Exception as e:
        await session.rollback()
        logger.error(f"Error verifying payment: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify payment",
        )


@router.get("/certificate-requests/{request_number}/invoice")
async def download_invoice(
    request_number: str,
    session: DBSessionDep = None,
) -> StreamingResponse:
    """Download invoice PDF for certificate request."""
    from app.services.certificate_service import get_certificate_request_by_number
    from app.services.invoice_service import generate_invoice_pdf

    from app.models import Invoice

    request = await get_certificate_request_by_number(session, request_number)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate request not found",
        )

    # Query invoice separately since CertificateRequest doesn't have invoice relationship
    invoice_stmt = select(Invoice).where(Invoice.certificate_request_id == request.id)
    invoice_result = await session.execute(invoice_stmt)
    invoice = invoice_result.scalar_one_or_none()

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found for this request",
        )

    try:
        pdf_bytes = await generate_invoice_pdf(invoice, request)
        filename = f"invoice_{invoice.invoice_number}.pdf"
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        logger.error(f"Error generating invoice PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate invoice PDF",
        )


@router.get("/examination-centers", response_model=list[dict])
async def list_examination_centers_public(
    session: DBSessionDep,
    search: str | None = Query(None, description="Search schools by name or code"),
) -> list[dict]:
    """List all schools as examination centers for certificate requests (public endpoint).

    Returns all schools regardless of active status, as users may request certificates
    for schools that are no longer active.
    """
    from app.models import School

    stmt = select(School)

    # Apply search filter if provided
    if search:
        search_filter = (
            School.name.ilike(f"%{search}%") |
            School.code.ilike(f"%{search}%")
        )
        stmt = stmt.where(search_filter)

    stmt = stmt.order_by(School.name)

    result = await session.execute(stmt)
    schools = result.scalars().all()

    return [
        {
            "id": school.id,
            "code": school.code,
            "name": school.name,
            "is_active": school.is_active,  # Include status for UI display
        }
        for school in schools
    ]
