"""Dashboard verification endpoints (JWT auth, billed)."""
import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import DBSessionDep
from app.models import (
    ApiRequestSource,
    ApiRequestType,
    PortalUser,
    RegistrationExam,
    RegistrationCandidate,
    CandidateResult,
    RegistrationSubjectSelection,
    SubjectType,
)
from app.schemas.result import (
    PublicResultCheckRequest,
    PublicResultResponse,
    PublicSubjectResult,
)
from app.schemas.verification import (
    BulkVerificationRequest,
    BulkVerificationResponse,
    VerificationItemResponse,
)
from app.services.api_usage_tracker import record_api_usage
from app.services.credit_service import check_credit_balance
from app.services.result_service import check_result_blocks, get_candidate_results
from app.core.exam_codes import normalize_exam_type, normalize_exam_series
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/dashboard/verify", tags=["dashboard-verification"])


async def verify_dashboard_candidate(
    request_data: PublicResultCheckRequest,
    session: DBSessionDep,
) -> PublicResultResponse:
    """Dashboard verification function that supports index_number-only lookup."""
    # Validate that at least one identifier is provided
    if not request_data.registration_number and not request_data.index_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either registration_number or index_number must be provided",
        )

    # Normalize exam codes
    exam_type_input = normalize_exam_type(request_data.exam_type) if request_data.exam_type else ""
    exam_series_input = normalize_exam_series(request_data.exam_series) if request_data.exam_series else ""

    logger.info(
        "Dashboard verification request received",
        extra={
            "exam_type": exam_type_input,
            "exam_series": exam_series_input,
            "year": request_data.year,
            "has_registration_number": bool(request_data.registration_number),
            "has_index_number": bool(request_data.index_number),
        },
    )

    # Step 1: Find the exam by exam_type, exam_series, and year
    # First, get all exams for the year
    all_exams_stmt = select(RegistrationExam).where(RegistrationExam.year == request_data.year)
    all_exams_result = await session.execute(all_exams_stmt)
    all_exams = list(all_exams_result.scalars().all())

    logger.debug(
        "Exams found for year",
        extra={
            "year": request_data.year,
            "exam_count": len(all_exams),
        },
    )

    # Try exact case-insensitive match first
    # Handle empty exam_series for non-Certificate II exams (can match NULL in database)
    exam_conditions = [
        RegistrationExam.exam_type.ilike(exam_type_input),
        RegistrationExam.year == request_data.year,
    ]

    # For exam_series: if empty, match NULL or empty; otherwise match the value
    if exam_series_input:
        exam_conditions.append(RegistrationExam.exam_series.ilike(exam_series_input))
    else:
        # For non-Certificate II exams, exam_series can be NULL or empty
        from sqlalchemy import or_
        exam_conditions.append(
            or_(
                RegistrationExam.exam_series.is_(None),
                RegistrationExam.exam_series == "",
            )
        )

    exam_stmt = select(RegistrationExam).where(and_(*exam_conditions))
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    # Strategy 2: Bidirectional partial match
    if not exam:
        for db_exam in all_exams:
            db_exam_type = db_exam.exam_type.strip() if db_exam.exam_type else ""
            db_exam_series = db_exam.exam_series.strip() if db_exam.exam_series else ""

            # Case-insensitive bidirectional matching
            type_matches = (
                exam_type_input.lower() in db_exam_type.lower() or
                db_exam_type.lower() in exam_type_input.lower()
            )

            # For exam_series: if empty, match NULL or empty; otherwise do bidirectional match
            if exam_series_input:
                series_matches = (
                    exam_series_input.lower() in db_exam_series.lower() or
                    db_exam_series.lower() in exam_series_input.lower()
                )
            else:
                # Empty exam_series should match NULL or empty in database
                series_matches = not db_exam_series or db_exam_series == ""

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
                "year": request_data.year,
                "exam_count_for_year": len(all_exams),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examination not found",
        )

    # Step 2: Find the candidate using dynamic conditions (supports index_number alone)
    # Don't log registration_number or index_number for security
    conditions = [RegistrationCandidate.registration_exam_id == exam.id]

    if request_data.registration_number:
        conditions.append(RegistrationCandidate.registration_number == request_data.registration_number)

    if request_data.index_number:
        conditions.append(RegistrationCandidate.index_number == request_data.index_number)

    candidate_stmt = select(RegistrationCandidate).where(and_(*conditions))
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()

    if not candidate:
        logger.warning(
            "Candidate not found",
            extra={
                "exam_id": exam.id,
                "has_registration_number": bool(request_data.registration_number),
                "has_index_number": bool(request_data.index_number),
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

    # Step 3: Get all results for this candidate (dashboard can see unpublished results)
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
        "Dashboard verification completed successfully",
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


@router.post("")
async def verify_candidates(
    request: Request,
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(get_current_active_user)],
) -> PublicResultResponse | BulkVerificationResponse:
    """
    Dashboard verification endpoint that handles both single and bulk requests.

    Request body can be:
    - Single: {"registration_number": "...", "exam_type": "...", ...}
    - Bulk: {"items": [{"registration_number": "...", ...}, ...]}
    """
    start_time = datetime.utcnow()

    # Get request body first so we can check credit for full bulk size
    import json
    body = await request.json()
    is_bulk = "items" in body and isinstance(body["items"], list)

    from decimal import Decimal
    cost = Decimal(str(settings.credit_cost_per_verification))
    if is_bulk:
        bulk_request = BulkVerificationRequest(**body)
        if len(bulk_request.items) > settings.api_key_bulk_request_max_items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum {settings.api_key_bulk_request_max_items} items allowed per bulk request",
            )
        required_credits = cost * len(bulk_request.items)
    else:
        required_credits = cost

    has_credit = await check_credit_balance(session, current_user.id, required_credits)
    if not has_credit:
        await record_api_usage(
            session,
            user_id=current_user.id,
            api_key_id=None,
            request_source=ApiRequestSource.DASHBOARD,
            request_type=ApiRequestType.BULK if is_bulk else ApiRequestType.SINGLE,
            verification_count=0,
            response_status=status.HTTP_402_PAYMENT_REQUIRED,
            duration_ms=int((datetime.utcnow() - start_time).total_seconds() * 1000),
            start_time=start_time,
        )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient credit. Required: {required_credits} credit(s) for this request ({len(bulk_request.items) if is_bulk else 1} verification(s)).",
        )

    try:
        if is_bulk:
            # Bulk request (bulk_request already parsed above)
            results = []
            successful = 0
            failed = 0

            for item in bulk_request.items:
                try:
                    result = await verify_dashboard_candidate(item, session)
                    results.append(
                        VerificationItemResponse(
                            success=True,
                            request=item,
                            result=result,
                            error=None,
                        )
                    )
                    successful += 1
                except Exception as e:
                    results.append(
                        VerificationItemResponse(
                            success=False,
                            request=item,
                            result=None,
                            error=str(e),
                        )
                    )
                    failed += 1

            verification_count = len(bulk_request.items)
            response_status = status.HTTP_200_OK

            response = BulkVerificationResponse(
                total=len(bulk_request.items),
                successful=successful,
                failed=failed,
                results=results,
            )
        else:
            # Single request
            single_request = PublicResultCheckRequest(**body)
            result = await verify_dashboard_candidate(single_request, session)
            verification_count = 1
            response_status = status.HTTP_200_OK
            response = result

        # Record usage
        duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        await record_api_usage(
            session,
            user_id=current_user.id,
            api_key_id=None,
            request_source=ApiRequestSource.DASHBOARD,
            request_type=ApiRequestType.BULK if is_bulk else ApiRequestType.SINGLE,
            verification_count=verification_count,
            response_status=response_status,
            duration_ms=duration_ms,
            start_time=start_time,
        )

        return response

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Record error
        duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        await record_api_usage(
            session,
            user_id=current_user.id,
            api_key_id=None,
            request_source=ApiRequestSource.DASHBOARD,
            request_type=ApiRequestType.BULK if is_bulk else ApiRequestType.SINGLE,
            verification_count=0,
            response_status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            duration_ms=duration_ms,
            start_time=start_time,
        )
        logger.error(f"Error in verification: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during verification",
        )
