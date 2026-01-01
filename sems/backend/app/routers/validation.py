"""API router for validation endpoints."""

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.dependencies.database import DBSessionDep

logger = logging.getLogger(__name__)
from app.models import (
    Candidate,
    DataExtractionMethod,
    Document,
    Exam,
    ExamRegistration,
    ExamSubject,
    Subject,
    SubjectRegistration,
    SubjectScore,
    SubjectScoreValidationIssue,
    ValidationIssueStatus,
    ValidationIssueType,
)
from app.schemas.validation import (
    ResolveValidationIssueRequest,
    RunValidationRequest,
    RunValidationResponse,
    SubjectScoreValidationIssueResponse,
    ValidationIssueDetailResponse,
    ValidationIssueListResponse,
)
from app.utils.score_utils import add_extraction_method_to_document, parse_score_value
from app.services.validation_job_service import process_validation
from app.services.cache_service import cache_service
from app.utils.cache_utils import (
    generate_issues_list_key,
    generate_issue_detail_key,
    generate_issues_pattern,
    generate_issue_pattern,
)

router = APIRouter(prefix="/api/v1/validation", tags=["validation"])


@router.post("/run", response_model=RunValidationResponse, status_code=status.HTTP_200_OK)
async def run_validation(
    request: RunValidationRequest,
    session: DBSessionDep,
) -> RunValidationResponse:
    """
    Manually trigger validation for SubjectScores.

    Runs validation synchronously and returns results immediately.
    Optional filters can be provided to limit the scope of validation.
    """
    try:
        logger.info(
            f"Running validation with filters: exam_id={request.exam_id}, "
            f"school_id={request.school_id}, subject_id={request.subject_id}"
        )
        results = await process_validation(
            session,
            exam_id=request.exam_id,
            school_id=request.school_id,
            subject_id=request.subject_id,
        )

        message = (
            f"Validation completed. Checked {results['total_checked']} scores, "
            f"found {results['issues_found']} issues, "
            f"resolved {results['issues_resolved']} issues, "
            f"created {results['issues_created']} new issues."
        )

        logger.info(f"Validation completed: {message}")

        # Invalidate cache after validation run
        # This ensures fresh data is shown after new issues are created
        await cache_service.clear_pattern(generate_issues_pattern())
        await cache_service.clear_pattern(generate_issue_pattern())
        logger.debug("Cache invalidated after validation run")

        return RunValidationResponse(
            total_scores_checked=results["total_checked"],
            issues_found=results["issues_found"],
            issues_resolved=results["issues_resolved"],
            issues_created=results["issues_created"],
            message=message,
        )
    except Exception as e:
        logger.error(f"Validation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Validation failed: {str(e)}",
        )


@router.get("/issues", response_model=ValidationIssueListResponse)
async def list_validation_issues(
    session: DBSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    exam_id: int | None = Query(None, description="Filter by exam ID"),
    school_id: int | None = Query(None, description="Filter by school ID"),
    subject_id: int | None = Query(None, description="Filter by subject ID"),
    status_filter: ValidationIssueStatus | None = Query(None, description="Filter by issue status"),
    issue_type: str | None = Query(None, description="Filter by issue type (missing_score, invalid_score)"),
    test_type: int | None = Query(None, description="Filter by test type (1 = Objectives, 2 = Essay, 3 = Practical)"),
) -> ValidationIssueListResponse:
    """List validation issues with pagination and optional filters."""
    # Generate cache key
    cache_key = generate_issues_list_key(
        page=page,
        page_size=page_size,
        exam_id=exam_id,
        school_id=school_id,
        subject_id=subject_id,
        status_filter=status_filter.value if status_filter else None,
        issue_type=issue_type,
        test_type=test_type,
    )

    # Try to get from cache
    cached_response = await cache_service.get(cache_key)
    if cached_response is not None:
        logger.debug(f"Cache hit for key: {cache_key}")
        return ValidationIssueListResponse.model_validate(cached_response)

    logger.debug(f"Cache miss for key: {cache_key}, querying database")
    offset = (page - 1) * page_size

    # Build base query
    stmt = select(SubjectScoreValidationIssue)

    # Apply filters
    if exam_id is not None or subject_id is not None:
        stmt = stmt.join(ExamSubject, SubjectScoreValidationIssue.exam_subject_id == ExamSubject.id)
        if exam_id is not None:
            stmt = stmt.where(ExamSubject.exam_id == exam_id)
        if subject_id is not None:
            stmt = stmt.where(ExamSubject.subject_id == subject_id)

    if school_id is not None:
        # Join through SubjectScore -> SubjectRegistration -> ExamRegistration -> Candidate
        # Get subject_score_ids for the school
        from app.models import SubjectScore
        school_subject_score_ids = (
            select(SubjectScore.id)
            .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
            .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
            .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
            .where(Candidate.school_id == school_id)
        )
        stmt = stmt.where(SubjectScoreValidationIssue.subject_score_id.in_(school_subject_score_ids))

    if status_filter is not None:
        stmt = stmt.where(SubjectScoreValidationIssue.status == status_filter)

    if issue_type is not None:
        try:
            issue_type_enum = ValidationIssueType(issue_type)
            stmt = stmt.where(SubjectScoreValidationIssue.issue_type == issue_type_enum)
        except ValueError:
            # Invalid issue_type, return empty results
            stmt = stmt.where(False)

    if test_type is not None:
        stmt = stmt.where(SubjectScoreValidationIssue.test_type == test_type)

    # Get total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await session.execute(count_stmt)
    total = total_result.scalar() or 0

    # Apply pagination and ordering
    stmt = stmt.order_by(SubjectScoreValidationIssue.created_at.desc()).offset(offset).limit(page_size)

    # Execute query
    result = await session.execute(stmt)
    issues = result.scalars().all()

    response = ValidationIssueListResponse(
        total=total,
        page=page,
        page_size=page_size,
        issues=[SubjectScoreValidationIssueResponse.model_validate(issue) for issue in issues],
    )

    # Cache the response
    await cache_service.set(cache_key, response.model_dump())

    return response


@router.get("/issues/{issue_id}", response_model=ValidationIssueDetailResponse)
async def get_validation_issue(
    issue_id: int,
    session: DBSessionDep,
) -> ValidationIssueDetailResponse:
    """Get a single validation issue with extended details."""
    # Generate cache key
    cache_key = generate_issue_detail_key(issue_id)

    # Try to get from cache
    cached_response = await cache_service.get(cache_key)
    if cached_response is not None:
        logger.debug(f"Cache hit for key: {cache_key}")
        return ValidationIssueDetailResponse.model_validate(cached_response)

    logger.debug(f"Cache miss for key: {cache_key}, querying database")
    # Get issue with related data
    stmt = (
        select(
            SubjectScoreValidationIssue,
            SubjectScore,
            SubjectRegistration,
            ExamRegistration,
            Candidate,
            ExamSubject,
            Subject,
            Exam,
        )
        .join(SubjectScore, SubjectScoreValidationIssue.subject_score_id == SubjectScore.id)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .join(Exam, ExamSubject.exam_id == Exam.id)
        .where(SubjectScoreValidationIssue.id == issue_id)
    )

    result = await session.execute(stmt)
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Validation issue with id {issue_id} not found",
        )

    (
        issue,
        subject_score,
        subject_reg,
        exam_reg,
        candidate,
        exam_subject,
        subject,
        exam,
    ) = row

    # Get current score value for the problematic field
    current_score_value = None
    document_id = None
    if issue.field_name == "obj_raw_score":
        current_score_value = subject_score.obj_raw_score
        document_id = subject_score.obj_document_id
    elif issue.field_name == "essay_raw_score":
        current_score_value = subject_score.essay_raw_score
        document_id = subject_score.essay_document_id
    elif issue.field_name == "pract_raw_score":
        current_score_value = subject_score.pract_raw_score
        document_id = subject_score.pract_document_id

    # Get document info if document_id exists
    document_file_name = None
    document_numeric_id = None
    document_mime_type = None
    if document_id:
        # Filter by both extracted_id and exam_id to ensure we get the correct document
        doc_stmt = select(Document).where(
            Document.extracted_id == document_id,
            Document.exam_id == exam.id
        )
        doc_result = await session.execute(doc_stmt)
        doc = doc_result.scalar_one_or_none()
        if doc:
            document_file_name = doc.file_name
            document_numeric_id = doc.id
            document_mime_type = doc.mime_type

    response = ValidationIssueDetailResponse(
        id=issue.id,
        subject_score_id=issue.subject_score_id,
        exam_subject_id=issue.exam_subject_id,
        issue_type=issue.issue_type,
        field_name=issue.field_name,
        test_type=issue.test_type,
        message=issue.message,
        status=issue.status,
        created_at=issue.created_at,
        updated_at=issue.updated_at,
        resolved_at=issue.resolved_at,
        candidate_id=candidate.id,
        candidate_name=candidate.name,
        candidate_index_number=candidate.index_number,
        subject_id=subject.id,
        subject_code=subject.code,
        subject_name=subject.name,
        exam_id=exam.id,
        exam_type=exam.exam_type.value if exam.exam_type else None,
        exam_year=exam.year,
        exam_series=exam.series.value if exam.series else None,
        current_score_value=current_score_value,
        document_id=document_id,
        document_file_name=document_file_name,
        document_numeric_id=document_numeric_id,
        document_mime_type=document_mime_type,
    )

    # Cache the response
    await cache_service.set(cache_key, response.model_dump())

    return response


@router.put("/issues/{issue_id}/resolve", response_model=SubjectScoreValidationIssueResponse)
async def resolve_validation_issue(
    issue_id: int,
    request: ResolveValidationIssueRequest,
    session: DBSessionDep,
) -> SubjectScoreValidationIssueResponse:
    """Mark a validation issue as resolved, optionally with a corrected score."""
    stmt = select(SubjectScoreValidationIssue).where(SubjectScoreValidationIssue.id == issue_id)
    result = await session.execute(stmt)
    issue = result.scalar_one_or_none()

    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Validation issue with id {issue_id} not found",
        )

    # If corrected_score is provided, update the SubjectScore field
    if request.corrected_score is not None:
        # Get the subject score
        score_stmt = select(SubjectScore).where(SubjectScore.id == issue.subject_score_id)
        score_result = await session.execute(score_stmt)
        subject_score = score_result.scalar_one_or_none()

        if not subject_score:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Subject score with id {issue.subject_score_id} not found",
            )

        # Parse and validate the corrected score
        try:
            parsed_score = parse_score_value(request.corrected_score)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid score value: {str(e)}",
            )

        # Update the appropriate field based on issue's field_name
        if issue.field_name == "obj_raw_score":
            subject_score.obj_raw_score = parsed_score
            subject_score.obj_extraction_method = DataExtractionMethod.MANUAL_TRANSCRIPTION_DIGITAL
            # Update document if exists
            if subject_score.obj_document_id:
                doc_stmt = select(Document).where(Document.extracted_id == subject_score.obj_document_id)
                doc_result = await session.execute(doc_stmt)
                doc = doc_result.scalar_one_or_none()
                if doc:
                    add_extraction_method_to_document(doc, DataExtractionMethod.MANUAL_TRANSCRIPTION_DIGITAL)
                    doc.scores_extraction_status = "success"
                    doc.scores_extracted_at = datetime.utcnow()
        elif issue.field_name == "essay_raw_score":
            subject_score.essay_raw_score = parsed_score
            subject_score.essay_extraction_method = DataExtractionMethod.MANUAL_TRANSCRIPTION_DIGITAL
            # Update document if exists
            if subject_score.essay_document_id:
                doc_stmt = select(Document).where(Document.extracted_id == subject_score.essay_document_id)
                doc_result = await session.execute(doc_stmt)
                doc = doc_result.scalar_one_or_none()
                if doc:
                    add_extraction_method_to_document(doc, DataExtractionMethod.MANUAL_TRANSCRIPTION_DIGITAL)
                    doc.scores_extraction_status = "success"
                    doc.scores_extracted_at = datetime.utcnow()
        elif issue.field_name == "pract_raw_score":
            subject_score.pract_raw_score = parsed_score
            subject_score.pract_extraction_method = DataExtractionMethod.MANUAL_TRANSCRIPTION_DIGITAL
            # Update document if exists
            if subject_score.pract_document_id:
                doc_stmt = select(Document).where(Document.extracted_id == subject_score.pract_document_id)
                doc_result = await session.execute(doc_stmt)
                doc = doc_result.scalar_one_or_none()
                if doc:
                    add_extraction_method_to_document(doc, DataExtractionMethod.MANUAL_TRANSCRIPTION_DIGITAL)
                    doc.scores_extraction_status = "success"
                    doc.scores_extracted_at = datetime.utcnow()

    issue.status = ValidationIssueStatus.RESOLVED
    issue.resolved_at = datetime.utcnow()
    await session.commit()
    await session.refresh(issue)

    # Invalidate cache for this issue and all issue lists
    await cache_service.delete(generate_issue_detail_key(issue_id))
    await cache_service.clear_pattern(generate_issues_pattern())
    logger.debug(f"Cache invalidated after resolving issue {issue_id}")

    return SubjectScoreValidationIssueResponse.model_validate(issue)


@router.put("/issues/{issue_id}/ignore", response_model=SubjectScoreValidationIssueResponse)
async def ignore_validation_issue(
    issue_id: int,
    session: DBSessionDep,
) -> SubjectScoreValidationIssueResponse:
    """Mark a validation issue as ignored."""
    stmt = select(SubjectScoreValidationIssue).where(SubjectScoreValidationIssue.id == issue_id)
    result = await session.execute(stmt)
    issue = result.scalar_one_or_none()

    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Validation issue with id {issue_id} not found",
        )

    issue.status = ValidationIssueStatus.IGNORED
    issue.resolved_at = datetime.utcnow()
    await session.commit()
    await session.refresh(issue)

    # Invalidate cache for this issue and all issue lists
    await cache_service.delete(generate_issue_detail_key(issue_id))
    await cache_service.clear_pattern(generate_issues_pattern())
    logger.debug(f"Cache invalidated after ignoring issue {issue_id}")

    return SubjectScoreValidationIssueResponse.model_validate(issue)
