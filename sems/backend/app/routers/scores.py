from datetime import datetime
from pathlib import Path
import io
import logging
from typing import Any, Literal
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from sqlalchemy import and_, delete, func, or_, select, case

from app.dependencies.auth import CurrentUserDep, OfficerDep
from app.dependencies.database import DBSessionDep
from app.models import (
    Candidate,
    Document,
    DocumentScoreExtraction,
    Exam,
    ExamRegistration,
    ExamSeries,
    ExamSubject,
    ExamType,
    ProcessStatus,
    ProcessTracking,
    ProcessType,
    Programme,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
    SubjectScoreAbsentConfirmation,
    SubjectType,
    DataExtractionMethod,
    UnmatchedExtractionRecord,
    UnmatchedRecordStatus,
    User,
    UserRole,
)
from app.schemas.document import DocumentListResponse, DocumentResponse, ScoresExtractionStatusCounts
from app.schemas.score import (
    AbsentReviewCandidateGroup,
    AbsentReviewCandidateListResponse,
    AbsentReviewEntry,
    AbsentReviewListResponse,
    AbsentReviewPendingPaper,
    AbsentReviewStatsResponse,
    AbsentReviewSubjectGroup,
    BatchScoreUpdate,
    BatchScoreUpdateResponse,
    BulkUnmatchedActionError,
    BulkUnmatchedActionResponse,
    BulkUnmatchedIdsRequest,
    BulkUnmatchedOcrResolveRequest,
    CandidateScoreEntry,
    CandidateScoreListResponse,
    ConfirmAbsentReviewCandidateRequest,
    ConfirmAbsentReviewCandidateResponse,
    ConfirmAbsentReviewRequest,
    ConfirmAbsentReviewResponse,
    DocumentScoresResponse,
    ReductoDataResponse,
    ResolveUnmatchedRecordRequest,
    ResultsExportJobCreateResponse,
    ResultsExportJobStatusResponse,
    ScoreImportErrorItem,
    ScoreImportJobCreateResponse,
    ScoreImportJobStatusResponse,
    ScoreImportResponse,
    ScoreResponse,
    ScoreUpdate,
    ScoreValidationReportJobCreateResponse,
    ScoreValidationReportJobStatusResponse,
    ScoreValidationReportPreviewResponse,
    UnmatchedExtractionRecordResponse,
    UnmatchedIndexSuggestion,
    UnmatchedRecordsListResponse,
    UpdateScoresFromReductoRequest,
    UpdateScoresFromReductoResponse,
)
from app.utils.score_utils import add_extraction_method_to_document, is_absent, parse_score_value, parse_score_value_safe
from app.services.absent_review import (
    PAPER_FIELDS,
    RegisteredSubjectInfo,
    absent_field_sql,
    build_candidate_group,
    compute_group_stats,
    filter_groups_by_bucket,
    filter_unconfirmed_rows,
    flatten_absent_papers,
    normalize_absent_marker,
    paginate_groups,
    paginate_rows,
    sort_absent_papers,
    sort_candidate_groups,
)
from app.services.results_export import (
    generate_export_filename,
    generate_results_export,
    parse_export_test_types,
    process_results_export_job,
)
from app.services.score_import import (
    LARGE_IMPORT_ROW_THRESHOLD,
    file_checksum,
    find_idempotent_score_import_job,
    generate_missing_scores_import_template,
    generate_score_import_template,
    import_scores,
    normalize_score_import_columns,
    parse_score_import_file,
    start_score_import_job,
    validate_score_import_columns,
)
from app.services.storage import storage_service
from app.services.subject_upload import SubjectUploadParseError
from app.services.score_import_pipeline import build_errors_csv
from app.services.score_validation_report import (
    build_score_validation_report,
    generate_report_filename,
    generate_score_validation_report_bytes,
    parse_statuses,
    parse_subject_ids,
    parse_test_types,
    process_score_validation_report_job,
    report_to_preview_dict,
    should_use_report_job,
)
from app.services.issue_batch_service import (
    assigned_document_extracted_ids,
    clerk_may_access_extracted_id,
    clerk_may_access_score,
)
from app.services.app_settings_service import is_clerk_digital_entry_enabled
from app.services.unmatched_apply_reuse import (
    build_unmatched_reuse_index,
    lookup_unmatched_reuse,
    reuse_action,
)
from app.services.unmatched_index_suggestions import (
    list_unique_ocr_candidates,
    load_scoped_candidate_rows,
    suggestion_from_candidate_rows,
    suggest_for_unmatched,
)
from app.services.document_score_extraction import (
    apply_extraction_list_filters,
    extraction_to_item,
    get_extraction,
    is_current_applied,
    list_extractions_by_document_ids,
    normalize_provider,
    parse_extraction_provider_filter,
    payload_for_apply,
    status_count_join_provider,
    sync_document_snapshot,
    DEFAULT_PROVIDER,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/scores", tags=["scores"])

ExtractionProviderListFilter = Literal["reducto", "llama", "both", "llama_only", "reducto_only"]


def _id_ready_clause():
    """Has a usable extracted ID (not an ID-extraction failure)."""
    return Document.extracted_id.isnot(None) & (
        (Document.id_extraction_status.is_(None)) | (Document.id_extraction_status != "error")
    )


def _needs_id_clause():
    """Missing extracted ID or ID extraction failed."""
    return Document.extracted_id.is_(None) | (Document.id_extraction_status == "error")


def _apply_id_readiness_filter(stmt: Any, id_ready: bool | None):
    if id_ready is True:
        return stmt.where(_id_ready_clause())
    if id_ready is False:
        return stmt.where(_needs_id_clause())
    return stmt


async def _require_clerk_digital_entry_enabled(
    session: DBSessionDep,
    current_user: User,
) -> None:
    """Block dataclerks from digital score routes when the global toggle is off."""
    if current_user.role != UserRole.DATACLERK:
        return
    if not await is_clerk_digital_entry_enabled(session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Digital entry is disabled for dataclerks",
        )


async def _require_clerk_document_access(
    session: DBSessionDep,
    current_user: User,
    extracted_id: str | None,
) -> None:
    if current_user.role != UserRole.DATACLERK:
        return
    if not await clerk_may_access_extracted_id(session, current_user.id, extracted_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document is not in a batch assigned to you",
        )


async def _resolve_document_for_scores(
    session: DBSessionDep,
    document_id: str,
    exam_id: int | None = None,
) -> Document | None:
    """Resolve a Document by extracted_id (optionally scoped to exam), with numeric id fallback.

    Intended invariant: at most one success document per extracted_id per exam.
    If multiple rows match (data integrity gap), prefer success+uploaded then newest.
    """
    conditions = [Document.extracted_id == document_id]
    if exam_id is not None:
        conditions.append(Document.exam_id == exam_id)

    doc_stmt = (
        select(Document)
        .where(*conditions)
        .order_by(
            case(
                (
                    and_(
                        Document.id_extraction_status == "success",
                        Document.upload_status == "uploaded",
                    ),
                    0,
                ),
                else_=1,
            ),
            Document.uploaded_at.desc(),
            Document.id.desc(),
        )
        .limit(2)
    )
    rows = list((await session.execute(doc_stmt)).scalars().all())
    if len(rows) > 1:
        logger.warning(
            "Multiple documents for extracted_id=%s exam_id=%s; "
            "using preferred/newest",
            document_id,
            exam_id,
        )
    document = rows[0] if rows else None

    # Fallback: treat digit-only ids as Document.id only when they fit INTEGER.
    # Sheet extracted_ids are often long digit strings (e.g. 8170914211101) and
    # must not be cast to documents.id (PostgreSQL int32).
    if not document and document_id.isdigit():
        try:
            numeric_id = int(document_id)
        except ValueError:
            numeric_id = None
        if numeric_id is not None and -(2**31) <= numeric_id < 2**31:
            numeric_conditions = [Document.id == numeric_id]
            if exam_id is not None:
                numeric_conditions.append(Document.exam_id == exam_id)
            doc_stmt = select(Document).where(*numeric_conditions)
            doc_result = await session.execute(doc_stmt)
            document = doc_result.scalar_one_or_none()

    return document


def _document_id_match_condition(document: Document, extracted_id: str):
    """Match SubjectScore sheet-id column for the document's test type when known."""
    if document.test_type == "1":
        return SubjectScore.obj_document_id == extracted_id
    if document.test_type == "2":
        return SubjectScore.essay_document_id == extracted_id
    if document.test_type == "3":
        return SubjectScore.pract_document_id == extracted_id
    return or_(
        SubjectScore.obj_document_id == extracted_id,
        SubjectScore.essay_document_id == extracted_id,
        SubjectScore.pract_document_id == extracted_id,
    )


def _provider_from_extraction_data(data: Any) -> str | None:
    if isinstance(data, dict):
        value = data.get("provider")
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


@router.get("/documents", response_model=DocumentListResponse)
async def get_filtered_documents(
    session: DBSessionDep,
    current_user: CurrentUserDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    exam_id: int | None = Query(None),
    exam_type: ExamType | None = Query(None, description="Filter by examination type"),
    series: ExamSeries | None = Query(None, description="Filter by examination series"),
    year: int | None = Query(None, ge=1900, le=2100, description="Filter by examination year"),
    school_id: int | None = Query(None),
    subject_id: int | None = Query(None),
    subject_ids: str | None = Query(
        None, description="Comma-separated subject IDs (preferred over subject_id when set)"
    ),
    subject_type: SubjectType | None = Query(
        None, description="Filter by subject type: CORE or ELECTIVE"
    ),
    test_type: str | None = Query(None, description="1 = Objectives, 2 = Essay"),
    extraction_status: str | None = Query(
        None,
        description=(
            "Filter by extraction status: pending, queued, processing, success, error. "
            "Comma-separated for multiple (e.g. pending,error)."
        ),
    ),
    extraction_method: DataExtractionMethod | None = Query(None, description="Filter by extraction method in scores_extraction_methods array"),
    extraction_provider: ExtractionProviderListFilter | None = Query(
        None,
        description=(
            "Filter by extraction provider: reducto or llama (has that provider), "
            "llama_only / reducto_only (that provider and not the other), "
            "or both (llama and reducto)."
        ),
    ),
    scores_applied: bool | None = Query(
        None,
        description="Filter by whether extracted scores have been applied (true=applied, false=not applied)",
    ),
    id_ready: bool | None = Query(
        None,
        description="If true, only documents with a usable extracted ID. If false, only ID extraction failures / missing IDs.",
    ),
) -> DocumentListResponse:
    """Get documents filtered by exam, school, subject, test_type, and extraction status.

    Dataclerks only see documents linked to batches assigned to them.
    """
    await _require_clerk_digital_entry_enabled(session, current_user)

    offset = (page - 1) * page_size

    clerk_assigned_ids: set[str] | None = None
    if current_user.role == UserRole.DATACLERK:
        clerk_assigned_ids = await assigned_document_extracted_ids(session, current_user.id)
        if not clerk_assigned_ids:
            return DocumentListResponse(
                items=[],
                total=0,
                page=page,
                page_size=page_size,
                total_pages=0,
            )

    # Build base query with filters, join School and Subject for display names
    base_stmt = (
        select(
            Document,
            School.name.label("school_name"),
            Subject.code.label("subject_code"),
            Subject.name.label("subject_name"),
        )
        .outerjoin(School, Document.school_id == School.id)
        .outerjoin(Subject, Document.subject_id == Subject.id)
    )

    # Join with Exam table if filtering by exam_type, series, or year (and not using exam_id)
    if (exam_type is not None or series is not None or year is not None) and exam_id is None:
        base_stmt = base_stmt.join(Exam, Document.exam_id == Exam.id)

    # Apply exam filters
    if exam_id is not None:
        base_stmt = base_stmt.where(Document.exam_id == exam_id)
    else:
        # Apply exam_type, series, year filters (these require the join above)
        if exam_type is not None:
            base_stmt = base_stmt.where(Exam.exam_type == exam_type)
        if series is not None:
            base_stmt = base_stmt.where(Exam.series == series)
        if year is not None:
            base_stmt = base_stmt.where(Exam.year == year)

    if school_id is not None:
        base_stmt = base_stmt.where(Document.school_id == school_id)
    subject_id_list = _parse_subject_ids(subject_ids)
    if subject_id_list:
        base_stmt = base_stmt.where(Document.subject_id.in_(subject_id_list))
    elif subject_id is not None:
        base_stmt = base_stmt.where(Document.subject_id == subject_id)
    if subject_type is not None:
        base_stmt = base_stmt.where(Subject.subject_type == subject_type)
    if test_type is not None:
        base_stmt = base_stmt.where(Document.test_type == test_type)
    if extraction_method is not None:
        # Filter by array contains operation - check if extraction_method is in the array
        # For PostgreSQL arrays, use the @> (contains) operator
        base_stmt = base_stmt.where(
            Document.scores_extraction_methods.isnot(None)
            & Document.scores_extraction_methods.op("@>")([extraction_method])
        )
    base_stmt = apply_extraction_list_filters(
        base_stmt,
        extraction_provider=extraction_provider,
        extraction_status=extraction_status,
        scores_applied=scores_applied,
    )
    base_stmt = _apply_id_readiness_filter(base_stmt, id_ready)
    if clerk_assigned_ids is not None:
        base_stmt = base_stmt.where(Document.extracted_id.in_(clerk_assigned_ids))

    # Get total count with same filters
    count_stmt = select(func.count(Document.id)).select_from(Document)

    # Join with Exam table if filtering by exam_type, series, or year (and not using exam_id)
    if (exam_type is not None or series is not None or year is not None) and exam_id is None:
        count_stmt = count_stmt.join(Exam, Document.exam_id == Exam.id)
    if subject_type is not None:
        count_stmt = count_stmt.join(Subject, Document.subject_id == Subject.id)

    # Apply exam filters
    if exam_id is not None:
        count_stmt = count_stmt.where(Document.exam_id == exam_id)
    else:
        # Apply exam_type, series, year filters (these require the join above)
        if exam_type is not None:
            count_stmt = count_stmt.where(Exam.exam_type == exam_type)
        if series is not None:
            count_stmt = count_stmt.where(Exam.series == series)
        if year is not None:
            count_stmt = count_stmt.where(Exam.year == year)

    if school_id is not None:
        count_stmt = count_stmt.where(Document.school_id == school_id)
    if subject_id_list:
        count_stmt = count_stmt.where(Document.subject_id.in_(subject_id_list))
    elif subject_id is not None:
        count_stmt = count_stmt.where(Document.subject_id == subject_id)
    if subject_type is not None:
        count_stmt = count_stmt.where(Subject.subject_type == subject_type)
    if test_type is not None:
        count_stmt = count_stmt.where(Document.test_type == test_type)
    if extraction_method is not None:
        count_stmt = count_stmt.where(
            Document.scores_extraction_methods.isnot(None)
            & Document.scores_extraction_methods.op("@>")([extraction_method])
        )
    count_stmt = apply_extraction_list_filters(
        count_stmt,
        extraction_provider=extraction_provider,
        extraction_status=extraction_status,
        scores_applied=scores_applied,
    )
    count_stmt = _apply_id_readiness_filter(count_stmt, id_ready)
    if clerk_assigned_ids is not None:
        count_stmt = count_stmt.where(Document.extracted_id.in_(clerk_assigned_ids))

    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get documents with filters
    stmt = base_stmt.offset(offset).limit(page_size).order_by(Document.uploaded_at.desc())
    result = await session.execute(stmt)
    rows = result.all()

    # Convert to DocumentResponse with school_name and per-provider extractions
    document_ids = [document.id for document, _school_name, _subject_code, _subject_name in rows]
    extractions_by_doc = await list_extractions_by_document_ids(session, document_ids)

    document_responses = []
    for document, school_name, subject_code, subject_name in rows:
        doc_dict = DocumentResponse.model_validate(document).model_dump()
        doc_dict["school_name"] = school_name
        doc_dict["subject_code"] = subject_code
        doc_dict["subject_name"] = subject_name
        ext_rows = extractions_by_doc.get(document.id, [])
        doc_dict["extractions"] = [extraction_to_item(row) for row in ext_rows]
        overlay = None
        overlay_provider = status_count_join_provider(extraction_provider)
        if overlay_provider:
            overlay = next((row for row in ext_rows if row.provider == overlay_provider), None)
        if overlay is None and ext_rows:
            overlay = next(
                (row for row in ext_rows if row.provider == _provider_from_extraction_data(document.scores_extraction_data)),
                ext_rows[0],
            )
        if overlay is not None:
            doc_dict["scores_extraction_provider"] = overlay.provider
            doc_dict["scores_extraction_status"] = overlay.status
            doc_dict["scores_extraction_confidence"] = overlay.confidence
            doc_dict["scores_extracted_at"] = overlay.extracted_at
            doc_dict["scores_applied_at"] = overlay.applied_at
            doc_dict["scores_applied_count"] = overlay.applied_count
            doc_dict["scores_unmatched_count"] = overlay.unmatched_count
        else:
            doc_dict["scores_extraction_provider"] = _provider_from_extraction_data(
                document.scores_extraction_data
            )
        document_responses.append(DocumentResponse(**doc_dict))

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return DocumentListResponse(
        items=document_responses,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/documents/status-counts", response_model=ScoresExtractionStatusCounts)
async def get_scores_extraction_status_counts(
    session: DBSessionDep,
    current_user: CurrentUserDep,
    exam_id: int | None = Query(None),
    exam_type: ExamType | None = Query(None, description="Filter by examination type"),
    series: ExamSeries | None = Query(None, description="Filter by examination series"),
    year: int | None = Query(None, ge=1900, le=2100, description="Filter by examination year"),
    school_id: int | None = Query(None),
    subject_id: int | None = Query(None),
    subject_ids: str | None = Query(
        None, description="Comma-separated subject IDs (preferred over subject_id when set)"
    ),
    subject_type: SubjectType | None = Query(
        None, description="Filter by subject type: CORE or ELECTIVE"
    ),
    test_type: str | None = Query(None, description="1 = Objectives, 2 = Essay"),
    extraction_method: DataExtractionMethod | None = Query(
        None, description="Filter by extraction method in scores_extraction_methods array"
    ),
    extraction_provider: ExtractionProviderListFilter | None = Query(
        None,
        description=(
            "Filter by extraction provider: reducto or llama (has that provider), "
            "llama_only / reducto_only (that provider and not the other), "
            "or both (llama and reducto)."
        ),
    ),
    scores_applied: bool | None = Query(
        None,
        description="Filter by whether extracted scores have been applied (true=applied, false=not applied)",
    ),
) -> ScoresExtractionStatusCounts:
    """Return global scores_extraction_status counts for the current document filters.

    Intentionally ignores extraction_status so the status chips stay accurate while filtering.
    """
    await _require_clerk_digital_entry_enabled(session, current_user)

    clerk_assigned_ids: set[str] | None = None
    if current_user.role == UserRole.DATACLERK:
        clerk_assigned_ids = await assigned_document_extracted_ids(session, current_user.id)
        if not clerk_assigned_ids:
            return ScoresExtractionStatusCounts()

    stmt = select(Document.scores_extraction_status, func.count(Document.id)).select_from(Document)
    status_col = Document.scores_extraction_status
    join_provider = status_count_join_provider(extraction_provider)
    if join_provider:
        stmt = (
            select(DocumentScoreExtraction.status, func.count(Document.id))
            .select_from(Document)
            .outerjoin(
                DocumentScoreExtraction,
                and_(
                    DocumentScoreExtraction.document_id == Document.id,
                    DocumentScoreExtraction.provider == join_provider,
                ),
            )
        )
        status_col = DocumentScoreExtraction.status

    if (exam_type is not None or series is not None or year is not None) and exam_id is None:
        stmt = stmt.join(Exam, Document.exam_id == Exam.id)
    if subject_type is not None:
        stmt = stmt.join(Subject, Document.subject_id == Subject.id)

    if exam_id is not None:
        stmt = stmt.where(Document.exam_id == exam_id)
    else:
        if exam_type is not None:
            stmt = stmt.where(Exam.exam_type == exam_type)
        if series is not None:
            stmt = stmt.where(Exam.series == series)
        if year is not None:
            stmt = stmt.where(Exam.year == year)

    if school_id is not None:
        stmt = stmt.where(Document.school_id == school_id)
    subject_id_list = _parse_subject_ids(subject_ids)
    if subject_id_list:
        stmt = stmt.where(Document.subject_id.in_(subject_id_list))
    elif subject_id is not None:
        stmt = stmt.where(Document.subject_id == subject_id)
    if subject_type is not None:
        stmt = stmt.where(Subject.subject_type == subject_type)
    if test_type is not None:
        stmt = stmt.where(Document.test_type == test_type)
    if extraction_method is not None:
        stmt = stmt.where(
            Document.scores_extraction_methods.isnot(None)
            & Document.scores_extraction_methods.op("@>")([extraction_method])
        )
    _, provider_mode = parse_extraction_provider_filter(extraction_provider)
    stmt = apply_extraction_list_filters(
        stmt,
        extraction_provider=(
            extraction_provider
            if scores_applied is not None or provider_mode in ("only", "both")
            else None
        ),
        extraction_status=None,
        scores_applied=scores_applied,
    )
    if clerk_assigned_ids is not None:
        stmt = stmt.where(Document.extracted_id.in_(clerk_assigned_ids))

    needs_id_stmt = stmt.with_only_columns(func.count(Document.id), maintain_column_froms=True)
    needs_id_stmt = needs_id_stmt.where(_needs_id_clause())
    needs_id = int((await session.execute(needs_id_stmt)).scalar() or 0)

    stmt = stmt.where(_id_ready_clause())
    stmt = stmt.group_by(status_col)
    result = await session.execute(stmt)
    rows = result.all()

    counts = ScoresExtractionStatusCounts()
    counts.needs_id = needs_id
    for status_value, count in rows:
        key = (status_value or "pending").strip().lower()
        n = int(count or 0)
        counts.total += n
        if key == "queued":
            counts.queued += n
        elif key == "processing":
            counts.processing += n
        elif key == "success":
            counts.success += n
        elif key == "error":
            counts.error += n
        else:
            counts.pending += n

    return counts


@router.get("/documents/{document_id}/scores", response_model=DocumentScoresResponse)
async def get_document_scores(
    document_id: str,
    session: DBSessionDep,
    current_user: CurrentUserDep,
    exam_id: int = Query(..., description="Exam ID — extracted_id is only unique within an exam"),
) -> DocumentScoresResponse:
    """Get all scores for a specific document within an examination."""
    await _require_clerk_digital_entry_enabled(session, current_user)
    await _require_clerk_document_access(session, current_user, document_id)

    document = await _resolve_document_for_scores(session, document_id, exam_id)

    if not document:
        logger.warning(
            f"Document not found with extracted_id={document_id} exam_id={exam_id}",
            extra={"document_id_param": document_id, "exam_id": exam_id},
        )
        # Return empty results instead of error to maintain backward compatibility
        return DocumentScoresResponse(document_id=document_id, scores=[])

    if document.extracted_id is None:
        logger.warning(
            f"Document found but extracted_id is NULL. document_id={document.id}, extracted_id_param={document_id}",
            extra={
                "document_id": document.id,
                "document_id_param": document_id,
                "exam_id": exam_id,
            }
        )
        return DocumentScoresResponse(document_id=document_id, scores=[])

    # Use Document.extracted_id for filtering (not the parameter directly)
    # This ensures we're matching against the actual extracted_id value
    extracted_id_to_filter = document.extracted_id

    logger.info(
        f"Filtering subject_scores by document extracted_id and exam",
        extra={
            "document_id_param": document_id,
            "document_extracted_id": extracted_id_to_filter,
            "document_id": document.id,
            "document_test_type": document.test_type,
            "exam_id": document.exam_id,
            "subject_id": document.subject_id,
        }
    )

    # Scope to this exam (and subject/test type when known) so shared sheet IDs
    # across examinations do not leak candidates/fields into the entry form.
    conditions = [
        _document_id_match_condition(document, extracted_id_to_filter),
        ExamRegistration.exam_id == document.exam_id,
    ]
    if document.subject_id is not None:
        conditions.append(ExamSubject.subject_id == document.subject_id)

    stmt = (
        select(
            SubjectScore,
            SubjectRegistration,
            ExamRegistration,
            Candidate,
            ExamSubject,
            Subject,
        )
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(*conditions)
        .order_by(Candidate.index_number)
    )

    result = await session.execute(stmt)
    rows = result.all()

    logger.info(
        f"Found {len(rows)} subject_scores matching document extracted_id for exam",
        extra={
            "document_extracted_id": extracted_id_to_filter,
            "exam_id": document.exam_id,
            "matches_count": len(rows),
        }
    )

    scores = []
    for subject_score, subject_reg, _exam_reg, candidate, exam_subject, subject in rows:
        # Determine which field matched
        match_type = None
        if subject_score.obj_document_id == extracted_id_to_filter:
            match_type = "obj"
        elif subject_score.essay_document_id == extracted_id_to_filter:
            match_type = "essay"
        elif subject_score.pract_document_id == extracted_id_to_filter:
            match_type = "pract"

        logger.info(
            f"SubjectScore matched document extracted_id",
            extra={
                "subject_score_id": subject_score.id,
                "candidate_index_number": candidate.index_number,
                "candidate_name": candidate.name,
                "candidate_id": candidate.id,
                "subject_code": subject.code,
                "subject_name": subject.name,
                "obj_document_id": subject_score.obj_document_id,
                "essay_document_id": subject_score.essay_document_id,
                "pract_document_id": subject_score.pract_document_id,
                "match_type": match_type,
                "document_extracted_id": extracted_id_to_filter,
            }
        )
        # Prefer persisted grade; fall back to Pending when not yet processed
        grade = subject_score.grade if subject_score.grade is not None else None

        scores.append(
            ScoreResponse(
                id=subject_score.id,
                subject_registration_id=subject_score.subject_registration_id,
                obj_raw_score=subject_score.obj_raw_score,
                essay_raw_score=subject_score.essay_raw_score,
                pract_raw_score=subject_score.pract_raw_score,
                obj_normalized=subject_score.obj_normalized,
                essay_normalized=subject_score.essay_normalized,
                pract_normalized=subject_score.pract_normalized,
                total_score=subject_score.total_score,
                obj_document_id=subject_score.obj_document_id,
                essay_document_id=subject_score.essay_document_id,
                pract_document_id=subject_score.pract_document_id,
                created_at=subject_score.created_at,
                updated_at=subject_score.updated_at,
                candidate_id=candidate.id,
                candidate_name=candidate.name,
                candidate_index_number=candidate.index_number,
                subject_id=subject.id,
                subject_code=subject.code,
                subject_name=subject.name,
                grade=grade,
            )
        )

    return DocumentScoresResponse(document_id=document_id, scores=scores)


@router.put("/scores/{score_id}", response_model=ScoreResponse)
async def update_score(
    score_id: int,
    score_update: ScoreUpdate,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ScoreResponse:
    """Update individual score."""
    await _require_clerk_digital_entry_enabled(session, current_user)

    # Get score with related data
    stmt = (
        select(SubjectScore, SubjectRegistration, ExamRegistration, Candidate, ExamSubject, Subject)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(SubjectScore.id == score_id)
    )

    result = await session.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Score not found")

    subject_score, subject_reg, exam_reg, candidate, exam_subject, subject = row

    if current_user.role == UserRole.DATACLERK:
        if not await clerk_may_access_score(session, current_user.id, subject_score):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Score is not on a sheet assigned to you",
            )

    # Determine extraction method (from parameter or infer from context)
    extraction_method = score_update.extraction_method
    if extraction_method is None:
        # Check if any associated document has AUTOMATED_EXTRACTION
        document_ids_to_check: set[str] = set()
        if subject_score.obj_document_id:
            document_ids_to_check.add(subject_score.obj_document_id)
        if subject_score.essay_document_id:
            document_ids_to_check.add(subject_score.essay_document_id)
        if subject_score.pract_document_id:
            document_ids_to_check.add(subject_score.pract_document_id)

        has_automated = False
        if document_ids_to_check:
            docs_stmt = select(Document).where(Document.extracted_id.in_(document_ids_to_check))
            docs_result = await session.execute(docs_stmt)
            for doc in docs_result.scalars().all():
                if doc.scores_extraction_methods and DataExtractionMethod.AUTOMATED_EXTRACTION in doc.scores_extraction_methods:
                    has_automated = True
                    break

        if has_automated:
            extraction_method = DataExtractionMethod.AUTOMATED_EXTRACTION
        else:
            extraction_method = DataExtractionMethod.MANUAL_TRANSCRIPTION_DIGITAL

    # Track documents that need status updates
    documents_to_update_status: set[Document] = set()
    exam_id_for_docs = exam_reg.exam_id

    # Update raw scores and set extraction methods per field
    if score_update.obj_raw_score is not None:
        subject_score.obj_raw_score = score_update.obj_raw_score
        subject_score.obj_extraction_method = extraction_method
        # Update document's extraction methods array
        if subject_score.obj_document_id:
            doc = await _resolve_document_for_scores(
                session, subject_score.obj_document_id, exam_id_for_docs
            )
            if doc:
                add_extraction_method_to_document(doc, extraction_method)
                documents_to_update_status.add(doc)

    if score_update.essay_raw_score is not None:
        subject_score.essay_raw_score = score_update.essay_raw_score
        subject_score.essay_extraction_method = extraction_method
        # Update document's extraction methods array
        if subject_score.essay_document_id:
            doc = await _resolve_document_for_scores(
                session, subject_score.essay_document_id, exam_id_for_docs
            )
            if doc:
                add_extraction_method_to_document(doc, extraction_method)
                documents_to_update_status.add(doc)

    if score_update.pract_raw_score is not None:
        subject_score.pract_raw_score = score_update.pract_raw_score
        subject_score.pract_extraction_method = extraction_method
        # Update document's extraction methods array
        if subject_score.pract_document_id:
            doc = await _resolve_document_for_scores(
                session, subject_score.pract_document_id, exam_id_for_docs
            )
            if doc:
                add_extraction_method_to_document(doc, extraction_method)
                documents_to_update_status.add(doc)

    # Update document extraction status to success when scores are manually entered/transcribed
    current_time = datetime.utcnow()
    for doc in documents_to_update_status:
        doc.scores_extraction_status = "success"
        doc.scores_extracted_at = current_time

    # Note: Result processing must be triggered manually via /api/v1/results/process endpoints
    # Normalized scores and total_score will remain unchanged until processing is triggered

    await session.commit()
    await session.refresh(subject_score)

    # Prefer persisted grade written by result processing
    grade = subject_score.grade

    return ScoreResponse(
        id=subject_score.id,
        subject_registration_id=subject_score.subject_registration_id,
        obj_raw_score=subject_score.obj_raw_score,
        essay_raw_score=subject_score.essay_raw_score,
        pract_raw_score=subject_score.pract_raw_score,
        obj_normalized=subject_score.obj_normalized,
        essay_normalized=subject_score.essay_normalized,
        pract_normalized=subject_score.pract_normalized,
        total_score=subject_score.total_score,
        obj_document_id=subject_score.obj_document_id,
        essay_document_id=subject_score.essay_document_id,
        pract_document_id=subject_score.pract_document_id,
        created_at=subject_score.created_at,
        updated_at=subject_score.updated_at,
        candidate_id=candidate.id,
        candidate_name=candidate.name,
        candidate_index_number=candidate.index_number,
        subject_id=subject.id,
        subject_code=subject.code,
        subject_name=subject.name,
        grade=grade,
    )


@router.post("/documents/{document_id}/scores/batch", response_model=BatchScoreUpdateResponse)
async def batch_update_scores(
    document_id: str,
    batch_update: BatchScoreUpdate,
    session: DBSessionDep,
    current_user: CurrentUserDep,
    exam_id: int = Query(..., description="Exam ID — extracted_id is only unique within an exam"),
) -> BatchScoreUpdateResponse:
    """Batch update/create scores for a document within an examination."""
    await _require_clerk_digital_entry_enabled(session, current_user)

    # document_id is Document.extracted_id (or numeric Document.id fallback), scoped by exam_id
    document = await _resolve_document_for_scores(session, document_id, exam_id)

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    await _require_clerk_document_access(
        session,
        current_user,
        document.extracted_id or document_id,
    )

    # Use document.extracted_id if available, otherwise fall back to the document_id parameter
    # This ensures we use the correct identifier when setting SubjectScore document_id fields
    document_identifier = document.extracted_id if document.extracted_id else document_id

    # Determine which document_id field to use based on test_type
    # test_type="1" -> obj_document_id, test_type="2" -> essay_document_id, test_type="3" -> pract_document_id
    test_type = document.test_type

    successful = 0
    failed = 0
    errors: list[dict[str, str]] = []

    for score_item in batch_update.scores:
        try:
            # Determine extraction method for this score item
            extraction_method = score_item.extraction_method
            if extraction_method is None:
                # Check if document has AUTOMATED_EXTRACTION
                if document.scores_extraction_methods and DataExtractionMethod.AUTOMATED_EXTRACTION in document.scores_extraction_methods:
                    extraction_method = DataExtractionMethod.AUTOMATED_EXTRACTION
                else:
                    extraction_method = DataExtractionMethod.MANUAL_TRANSCRIPTION_DIGITAL

            if score_item.score_id is not None:
                # Update existing score — must belong to this document's exam
                stmt = (
                    select(SubjectScore, SubjectRegistration, ExamRegistration)
                    .join(
                        SubjectRegistration,
                        SubjectScore.subject_registration_id == SubjectRegistration.id,
                    )
                    .join(
                        ExamRegistration,
                        SubjectRegistration.exam_registration_id == ExamRegistration.id,
                    )
                    .where(SubjectScore.id == score_item.score_id)
                    .where(ExamRegistration.exam_id == document.exam_id)
                )
                result = await session.execute(stmt)
                row = result.first()
                if not row:
                    failed += 1
                    errors.append(
                        {
                            "score_id": str(score_item.score_id),
                            "error": "Score not found for this examination",
                        }
                    )
                    continue

                subject_score, subject_reg, _exam_reg = row

                # Update fields and set extraction methods per field
                if score_item.obj_raw_score is not None:
                    subject_score.obj_raw_score = score_item.obj_raw_score
                    subject_score.obj_extraction_method = extraction_method
                    # Set document_id if test_type matches
                    if test_type == "1":
                        subject_score.obj_document_id = document_identifier
                    # Update document's extraction methods array
                    add_extraction_method_to_document(document, extraction_method)

                if score_item.essay_raw_score is not None:
                    subject_score.essay_raw_score = score_item.essay_raw_score
                    subject_score.essay_extraction_method = extraction_method
                    # Set document_id if test_type matches
                    if test_type == "2":
                        subject_score.essay_document_id = document_identifier
                    # Update document's extraction methods array
                    add_extraction_method_to_document(document, extraction_method)

                if score_item.pract_raw_score is not None:
                    subject_score.pract_raw_score = score_item.pract_raw_score
                    subject_score.pract_extraction_method = extraction_method
                    # Set document_id if test_type matches
                    if test_type == "3":
                        subject_score.pract_document_id = document_identifier
                    # Update document's extraction methods array
                    add_extraction_method_to_document(document, extraction_method)

            else:
                # Create new score — subject registration must belong to this exam
                reg_stmt = (
                    select(SubjectRegistration)
                    .join(
                        ExamRegistration,
                        SubjectRegistration.exam_registration_id == ExamRegistration.id,
                    )
                    .where(SubjectRegistration.id == score_item.subject_registration_id)
                    .where(ExamRegistration.exam_id == document.exam_id)
                )
                reg_result = await session.execute(reg_stmt)
                subject_reg = reg_result.scalar_one_or_none()
                if not subject_reg:
                    failed += 1
                    errors.append(
                        {
                            "subject_registration_id": str(score_item.subject_registration_id),
                            "error": "Subject registration not found for this examination",
                        }
                    )
                    continue

                # Check if score already exists for this registration
                existing_stmt = select(SubjectScore).where(
                    SubjectScore.subject_registration_id == score_item.subject_registration_id
                )
                existing_result = await session.execute(existing_stmt)
                existing_score = existing_result.scalar_one_or_none()

                if existing_score:
                    # Update existing score instead of creating new one
                    if score_item.obj_raw_score is not None:
                        existing_score.obj_raw_score = score_item.obj_raw_score
                        existing_score.obj_extraction_method = extraction_method
                        if test_type == "1":
                            existing_score.obj_document_id = document_identifier
                        add_extraction_method_to_document(document, extraction_method)
                    if score_item.essay_raw_score is not None:
                        existing_score.essay_raw_score = score_item.essay_raw_score
                        existing_score.essay_extraction_method = extraction_method
                        if test_type == "2":
                            existing_score.essay_document_id = document_identifier
                        add_extraction_method_to_document(document, extraction_method)
                    if score_item.pract_raw_score is not None:
                        existing_score.pract_raw_score = score_item.pract_raw_score
                        existing_score.pract_extraction_method = extraction_method
                        if test_type == "3":
                            existing_score.pract_document_id = document_identifier
                        add_extraction_method_to_document(document, extraction_method)
                else:
                    # Create new score
                    # Determine which extraction methods to set based on which scores are provided
                    obj_extraction_method = extraction_method if score_item.obj_raw_score is not None else None
                    essay_extraction_method = extraction_method if score_item.essay_raw_score is not None else None
                    pract_extraction_method = extraction_method if score_item.pract_raw_score is not None else None

                    subject_score = SubjectScore(
                        subject_registration_id=score_item.subject_registration_id,
                        obj_raw_score=score_item.obj_raw_score,
                        essay_raw_score=score_item.essay_raw_score,  # Can be None, numeric string, or "A"/"AA"
                        pract_raw_score=score_item.pract_raw_score,
                        obj_normalized=None,
                        essay_normalized=None,
                        pract_normalized=None,
                        total_score=0.0,
                        obj_document_id=document_identifier if test_type == "1" else None,
                        essay_document_id=document_identifier if test_type == "2" else None,
                        pract_document_id=document_identifier if test_type == "3" else None,
                        obj_extraction_method=obj_extraction_method,
                        essay_extraction_method=essay_extraction_method,
                        pract_extraction_method=pract_extraction_method,
                    )
                    session.add(subject_score)
                    # Update document's extraction methods array for any scores being set
                    if score_item.obj_raw_score is not None or score_item.essay_raw_score is not None or score_item.pract_raw_score is not None:
                        add_extraction_method_to_document(document, extraction_method)

            successful += 1
        except Exception as e:
            failed += 1
            errors.append({"error": str(e)})

    # Update document extraction status to success when scores are manually entered/transcribed
    if document and successful > 0:
        document.scores_extraction_status = "success"
        document.scores_extracted_at = datetime.utcnow()

    await session.commit()

    return BatchScoreUpdateResponse(successful=successful, failed=failed, errors=errors)


def _absent_review_base_stmt(
    exam_id: int,
    school_id: int | None,
    subject_id: int | None,
):
    stmt = (
        select(SubjectScore, Candidate, School, Exam, ExamSubject, Subject)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(Exam, ExamRegistration.exam_id == Exam.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .outerjoin(School, Candidate.school_id == School.id)
        .where(Exam.id == exam_id)
    )
    if school_id is not None:
        stmt = stmt.where(Candidate.school_id == school_id)
    if subject_id is not None:
        stmt = stmt.where(Subject.id == subject_id)
    return stmt


def _absent_field_conditions(
    test_type: int | None,
    absent_marker: str | None,
) -> list:
    conditions = []
    for field_name, _, paper_test_type, _ in PAPER_FIELDS:
        if test_type is not None and paper_test_type != test_type:
            continue
        col = getattr(SubjectScore, field_name)
        conditions.append(absent_field_sql(col, absent_marker))
    return conditions


@router.get("/absent-review", response_model=AbsentReviewListResponse)
async def get_absent_review(
    session: DBSessionDep,
    current_user: CurrentUserDep,
    exam_id: int = Query(..., description="Exam ID (required)"),
    school_id: int | None = Query(None, description="Filter by school ID"),
    subject_id: int | None = Query(None, description="Filter by subject ID"),
    candidate_id: int | None = Query(None, description="Filter by candidate ID"),
    test_type: int | None = Query(None, ge=1, le=3, description="Filter by test type (1=Objectives, 2=Essay, 3=Practical)"),
    absent_marker: Literal["A", "AA", "AAA"] | None = Query(None, description="Filter by absent marker"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
) -> AbsentReviewListResponse:
    """List absent paper rows (A/AA/AAA) for QA review, one row per absent paper."""
    _ = current_user
    field_conditions = _absent_field_conditions(test_type, absent_marker)
    if not field_conditions:
        return AbsentReviewListResponse(
            items=[],
            total=0,
            page=page,
            page_size=page_size,
            total_pages=0,
        )

    base_stmt = _absent_review_base_stmt(exam_id, school_id, subject_id)
    if candidate_id is not None:
        base_stmt = base_stmt.where(Candidate.id == candidate_id)
    stmt = base_stmt.where(or_(*field_conditions))
    result = await session.execute(stmt)
    rows = result.all()

    if not rows:
        return AbsentReviewListResponse(
            items=[],
            total=0,
            page=page,
            page_size=page_size,
            total_pages=0,
        )

    score_ids = [subject_score.id for subject_score, *_rest in rows]
    confirmed_result = await session.execute(
        select(SubjectScoreAbsentConfirmation).where(
            SubjectScoreAbsentConfirmation.subject_score_id.in_(score_ids)
        )
    )
    confirmed_keys = {
        (c.subject_score_id, c.field_name) for c in confirmed_result.scalars().all()
    }

    doc_ids: set[str] = set()
    for subject_score, *_rest in rows:
        for _field_name, doc_field, _paper_test_type, _max_field in PAPER_FIELDS:
            doc_id = getattr(subject_score, doc_field)
            if doc_id:
                doc_ids.add(doc_id)

    documents_by_extracted_id: dict[str, Document] = {}
    if doc_ids:
        docs_stmt = select(Document).where(Document.extracted_id.in_(doc_ids))
        docs_result = await session.execute(docs_stmt)
        for doc in docs_result.scalars().all():
            if doc.extracted_id:
                documents_by_extracted_id[doc.extracted_id] = doc

    flattened = []
    for subject_score, candidate, school, exam, exam_subject, subject in rows:
        flattened.extend(
            flatten_absent_papers(
                subject_score,
                candidate=candidate,
                school=school,
                exam=exam,
                exam_subject=exam_subject,
                subject=subject,
                documents_by_extracted_id=documents_by_extracted_id,
                test_type_filter=test_type,
                absent_marker_filter=absent_marker,
            )
        )

    sorted_rows = sort_absent_papers(filter_unconfirmed_rows(flattened, confirmed_keys))
    total = len(sorted_rows)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    page_rows = paginate_rows(sorted_rows, page, page_size)

    items = [
        AbsentReviewEntry(
            score_id=row.score_id,
            candidate_id=row.candidate_id,
            candidate_name=row.candidate_name,
            candidate_index_number=row.candidate_index_number,
            school_id=row.school_id,
            school_name=row.school_name,
            school_code=row.school_code,
            subject_id=row.subject_id,
            subject_code=row.subject_code,
            subject_name=row.subject_name,
            exam_id=row.exam_id,
            test_type=row.test_type,
            field_name=row.field_name,
            absent_marker=row.absent_marker,
            obj_raw_score=row.obj_raw_score,
            essay_raw_score=row.essay_raw_score,
            pract_raw_score=row.pract_raw_score,
            total_score=row.total_score,
            grade=row.grade,
            max_score=row.max_score,
            document_id=row.document_id,
            document_file_name=row.document_file_name,
            document_numeric_id=row.document_numeric_id,
            document_mime_type=row.document_mime_type,
        )
        for row in page_rows
    ]

    return AbsentReviewListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


_VALID_ABSENT_FIELDS = {field_name for field_name, _, _, _ in PAPER_FIELDS}
_FIELD_TO_TEST_TYPE = {field_name: paper_test_type for field_name, _, paper_test_type, _ in PAPER_FIELDS}


@router.post("/absent-review/confirm", response_model=ConfirmAbsentReviewResponse)
async def confirm_absent_review(
    body: ConfirmAbsentReviewRequest,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ConfirmAbsentReviewResponse:
    """Confirm an absent mark is correct; removes it from the absent-review queue."""
    if body.field_name not in _VALID_ABSENT_FIELDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="field_name must be obj_raw_score, essay_raw_score, or pract_raw_score",
        )

    stmt = select(SubjectScore).where(SubjectScore.id == body.score_id)
    result = await session.execute(stmt)
    subject_score = result.scalar_one_or_none()
    if not subject_score:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Score not found")

    score_value = getattr(subject_score, body.field_name)
    if not is_absent(score_value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Score is not marked absent for this field",
        )

    existing_stmt = select(SubjectScoreAbsentConfirmation).where(
        SubjectScoreAbsentConfirmation.subject_score_id == body.score_id,
        SubjectScoreAbsentConfirmation.field_name == body.field_name,
    )
    existing_result = await session.execute(existing_stmt)
    existing = existing_result.scalar_one_or_none()
    if existing:
        return ConfirmAbsentReviewResponse(
            score_id=existing.subject_score_id,
            field_name=existing.field_name,
            test_type=existing.test_type,
            confirmed_at=existing.confirmed_at,
        )

    confirmed_at = datetime.utcnow()
    confirmation = SubjectScoreAbsentConfirmation(
        subject_score_id=body.score_id,
        field_name=body.field_name,
        test_type=_FIELD_TO_TEST_TYPE[body.field_name],
        confirmed_by_user_id=current_user.id,
        confirmed_at=confirmed_at,
    )
    session.add(confirmation)
    await session.commit()
    await session.refresh(confirmation)

    return ConfirmAbsentReviewResponse(
        score_id=confirmation.subject_score_id,
        field_name=confirmation.field_name,
        test_type=confirmation.test_type,
        confirmed_at=confirmation.confirmed_at,
    )


async def _load_pending_absent_papers(
    session: DBSessionDep,
    *,
    exam_id: int,
    school_id: int | None = None,
    subject_id: int | None = None,
    test_type: int | None = None,
    absent_marker: str | None = None,
    candidate_id: int | None = None,
):
    """Return unconfirmed absent paper rows for the exam scope."""
    field_conditions = _absent_field_conditions(test_type, absent_marker)
    if not field_conditions:
        return []

    base_stmt = _absent_review_base_stmt(exam_id, school_id, subject_id)
    if candidate_id is not None:
        base_stmt = base_stmt.where(Candidate.id == candidate_id)
    stmt = base_stmt.where(or_(*field_conditions))
    result = await session.execute(stmt)
    rows = result.all()
    if not rows:
        return []

    score_ids = [subject_score.id for subject_score, *_rest in rows]
    confirmed_result = await session.execute(
        select(SubjectScoreAbsentConfirmation).where(
            SubjectScoreAbsentConfirmation.subject_score_id.in_(score_ids)
        )
    )
    confirmed_keys = {
        (c.subject_score_id, c.field_name) for c in confirmed_result.scalars().all()
    }

    flattened = []
    for subject_score, candidate, school, exam, exam_subject, subject in rows:
        flattened.extend(
            flatten_absent_papers(
                subject_score,
                candidate=candidate,
                school=school,
                exam=exam,
                exam_subject=exam_subject,
                subject=subject,
                documents_by_extracted_id={},
                test_type_filter=test_type,
                absent_marker_filter=absent_marker,
            )
        )
    return filter_unconfirmed_rows(flattened, confirmed_keys)


async def _build_absent_candidate_groups(
    session: DBSessionDep,
    *,
    exam_id: int,
    school_id: int | None = None,
    test_type: int | None = None,
):
    pending = await _load_pending_absent_papers(
        session, exam_id=exam_id, school_id=school_id, test_type=test_type
    )
    if not pending:
        return []

    by_candidate: dict[int, list] = {}
    for row in pending:
        by_candidate.setdefault(row.candidate_id, []).append(row)

    candidate_ids = list(by_candidate.keys())
    reg_stmt = (
        select(Candidate, School, Subject, SubjectScore, ExamSubject)
        .select_from(ExamRegistration)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(SubjectRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .outerjoin(SubjectScore, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .outerjoin(School, Candidate.school_id == School.id)
        .where(ExamRegistration.exam_id == exam_id)
        .where(Candidate.id.in_(candidate_ids))
    )
    if school_id is not None:
        reg_stmt = reg_stmt.where(Candidate.school_id == school_id)

    reg_result = await session.execute(reg_stmt)
    registered_by_candidate: dict[int, list[RegisteredSubjectInfo]] = {
        cid: [] for cid in candidate_ids
    }
    meta_by_candidate: dict[int, tuple] = {}
    for candidate, school, subject, subject_score, exam_subject in reg_result.all():
        meta_by_candidate[candidate.id] = (candidate, school)
        registered_by_candidate[candidate.id].append(
            RegisteredSubjectInfo(
                subject_id=subject.id,
                subject_code=subject.code,
                subject_name=subject.name,
                score_id=subject_score.id if subject_score else None,
                total_score=subject_score.total_score if subject_score else None,
                grade=subject_score.grade if subject_score else None,
                obj_raw_score=subject_score.obj_raw_score if subject_score else None,
                essay_raw_score=subject_score.essay_raw_score if subject_score else None,
                pract_raw_score=subject_score.pract_raw_score if subject_score else None,
                obj_expected=exam_subject.obj_max_score is not None,
                essay_expected=exam_subject.essay_max_score is not None,
                pract_expected=exam_subject.pract_max_score is not None,
            )
        )

    groups = []
    for candidate_id, papers in by_candidate.items():
        sample = papers[0]
        meta = meta_by_candidate.get(candidate_id)
        candidate = meta[0] if meta else None
        school = meta[1] if meta else None
        group = build_candidate_group(
            candidate_id=candidate_id,
            candidate_name=candidate.name if candidate else sample.candidate_name,
            candidate_index_number=(
                candidate.index_number if candidate else sample.candidate_index_number
            ),
            school_id=school.id if school else sample.school_id,
            school_name=school.name if school else sample.school_name,
            school_code=school.code if school else sample.school_code,
            exam_id=exam_id,
            registered=registered_by_candidate.get(candidate_id, []),
            pending_papers=papers,
        )
        if group:
            groups.append(group)
    return sort_candidate_groups(groups)


def _group_to_schema(group) -> AbsentReviewCandidateGroup:
    return AbsentReviewCandidateGroup(
        candidate_id=group.candidate_id,
        candidate_name=group.candidate_name,
        candidate_index_number=group.candidate_index_number,
        school_id=group.school_id,
        school_name=group.school_name,
        school_code=group.school_code,
        exam_id=group.exam_id,
        bucket=group.bucket,
        registered_subject_count=group.registered_subject_count,
        fully_absent_subject_count=group.fully_absent_subject_count,
        scored_subject_count=group.scored_subject_count,
        pending_paper_count=group.pending_paper_count,
        subjects=[
            AbsentReviewSubjectGroup(
                subject_id=s.subject_id,
                subject_code=s.subject_code,
                subject_name=s.subject_name,
                score_id=s.score_id,
                total_score=s.total_score,
                grade=s.grade,
                is_fully_absent=s.is_fully_absent,
                pending_papers=[
                    AbsentReviewPendingPaper(
                        score_id=p.score_id,
                        field_name=p.field_name,
                        test_type=p.test_type,
                        absent_marker=p.absent_marker,
                    )
                    for p in s.pending_papers
                ],
            )
            for s in group.subjects
        ],
    )


@router.get("/absent-review/candidates", response_model=AbsentReviewCandidateListResponse)
async def get_absent_review_candidates(
    session: DBSessionDep,
    current_user: CurrentUserDep,
    exam_id: int = Query(..., description="Exam ID (required)"),
    school_id: int | None = Query(None, description="Filter by school ID"),
    test_type: int | None = Query(None, description="Filter by paper type: 1=obj, 2=essay, 3=pract"),
    bucket: Literal["fully_absent", "mixed", "all"] | None = Query(
        "all", description="Candidate bucket filter"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
) -> AbsentReviewCandidateListResponse:
    """List candidates with pending absences, grouped and classified as fully_absent or mixed."""
    _ = current_user
    groups = await _build_absent_candidate_groups(
        session, exam_id=exam_id, school_id=school_id, test_type=test_type
    )
    filtered = filter_groups_by_bucket(groups, bucket)
    total = len(filtered)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    page_groups = paginate_groups(filtered, page, page_size)
    return AbsentReviewCandidateListResponse(
        items=[_group_to_schema(g) for g in page_groups],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/absent-review/stats", response_model=AbsentReviewStatsResponse)
async def get_absent_review_stats(
    session: DBSessionDep,
    current_user: CurrentUserDep,
    exam_id: int = Query(..., description="Exam ID (required)"),
    school_id: int | None = Query(None, description="Filter by school ID"),
    test_type: int | None = Query(None, description="Filter by paper type: 1=obj, 2=essay, 3=pract"),
) -> AbsentReviewStatsResponse:
    """Absentee queue statistics for an exam (optional school / paper-type filter)."""
    _ = current_user
    groups = await _build_absent_candidate_groups(
        session, exam_id=exam_id, school_id=school_id, test_type=test_type
    )
    stats = compute_group_stats(groups)

    confirmed_stmt = (
        select(func.count(SubjectScoreAbsentConfirmation.id))
        .select_from(SubjectScoreAbsentConfirmation)
        .join(SubjectScore, SubjectScoreAbsentConfirmation.subject_score_id == SubjectScore.id)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .where(ExamRegistration.exam_id == exam_id)
    )
    if school_id is not None:
        confirmed_stmt = confirmed_stmt.where(Candidate.school_id == school_id)
    confirmed_count = (await session.execute(confirmed_stmt)).scalar() or 0

    return AbsentReviewStatsResponse(
        candidates_fully_absent=stats.candidates_fully_absent,
        candidates_mixed=stats.candidates_mixed,
        pending_papers=stats.pending_papers,
        subjects_fully_absent=stats.subjects_fully_absent,
        confirmed_papers=int(confirmed_count),
    )


@router.post(
    "/absent-review/confirm-candidate",
    response_model=ConfirmAbsentReviewCandidateResponse,
)
async def confirm_absent_review_candidate(
    body: ConfirmAbsentReviewCandidateRequest,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ConfirmAbsentReviewCandidateResponse:
    """Confirm all unconfirmed absent papers for a fully-absent candidate."""
    groups = await _build_absent_candidate_groups(session, exam_id=body.exam_id)
    group = next((g for g in groups if g.candidate_id == body.candidate_id), None)
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending absences for this candidate in the exam",
        )
    if group.bucket != "fully_absent":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidate is not fully absent on all registered subjects; review papers individually",
        )

    pending = await _load_pending_absent_papers(
        session, exam_id=body.exam_id, candidate_id=body.candidate_id
    )
    if not pending:
        return ConfirmAbsentReviewCandidateResponse(
            candidate_id=body.candidate_id,
            exam_id=body.exam_id,
            confirmed_count=0,
            already_confirmed_count=0,
        )

    score_ids = list({p.score_id for p in pending})
    scores_result = await session.execute(
        select(SubjectScore).where(SubjectScore.id.in_(score_ids))
    )
    scores_by_id = {s.id: s for s in scores_result.scalars().all()}

    existing_result = await session.execute(
        select(SubjectScoreAbsentConfirmation).where(
            SubjectScoreAbsentConfirmation.subject_score_id.in_(score_ids)
        )
    )
    existing_keys = {
        (c.subject_score_id, c.field_name) for c in existing_result.scalars().all()
    }

    confirmed_count = 0
    already_confirmed_count = 0
    confirmed_at = datetime.utcnow()
    for paper in pending:
        key = (paper.score_id, paper.field_name)
        if key in existing_keys:
            already_confirmed_count += 1
            continue
        subject_score = scores_by_id.get(paper.score_id)
        if not subject_score:
            continue
        if normalize_absent_marker(getattr(subject_score, paper.field_name)) is None:
            continue
        session.add(
            SubjectScoreAbsentConfirmation(
                subject_score_id=paper.score_id,
                field_name=paper.field_name,
                test_type=paper.test_type,
                confirmed_by_user_id=current_user.id,
                confirmed_at=confirmed_at,
            )
        )
        existing_keys.add(key)
        confirmed_count += 1

    await session.commit()
    return ConfirmAbsentReviewCandidateResponse(
        candidate_id=body.candidate_id,
        exam_id=body.exam_id,
        confirmed_count=confirmed_count,
        already_confirmed_count=already_confirmed_count,
    )


@router.get("/candidates", response_model=CandidateScoreListResponse)
async def get_candidates_for_manual_entry(
    session: DBSessionDep,
    exam_id: int | None = Query(None),
    exam_type: ExamType | None = Query(None, description="Filter by examination type"),
    series: ExamSeries | None = Query(None, description="Filter by examination series"),
    year: int | None = Query(None, ge=1900, le=2100, description="Filter by examination year"),
    school_id: int | None = Query(None, description="Filter by school ID"),
    programme_id: int | None = Query(None),
    programme_ids: str | None = Query(None, description="Comma-separated programme IDs"),
    subject_id: int | None = Query(None),
    subject_type: SubjectType | None = Query(None, description="Filter by subject type (CORE or ELECTIVE)"),
    document_id: str | None = Query(None, description="Filter by document ID (extracted_id) - matches obj_document_id, essay_document_id, or pract_document_id"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=10000),
) -> CandidateScoreListResponse:
    """Get candidates with existing scores for manual entry, filtered by exam, programme, and subject."""
    offset = (page - 1) * page_size
    programme_ids_list = _parse_programme_ids(programme_id, programme_ids)

    # Build query to get candidates with existing SubjectScore records
    # Join through: SubjectScore -> SubjectRegistration -> ExamRegistration -> Candidate
    # Also join Exam, ExamSubject, Subject, and Programme
    base_stmt = (
        select(
            Candidate,
            SubjectRegistration,
            SubjectScore,
            ExamRegistration,
            Exam,
            ExamSubject,
            Subject,
            Programme,
        )
        .join(SubjectScore, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(Exam, ExamRegistration.exam_id == Exam.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .outerjoin(Programme, Candidate.programme_id == Programme.id)
    )

    # Apply filters
    if exam_id is not None:
        base_stmt = base_stmt.where(Exam.id == exam_id)
    else:
        # Apply exam_type, series, year filters (these require the Exam join above)
        if exam_type is not None:
            base_stmt = base_stmt.where(Exam.exam_type == exam_type)
        if series is not None:
            base_stmt = base_stmt.where(Exam.series == series)
        if year is not None:
            base_stmt = base_stmt.where(Exam.year == year)
    if school_id is not None:
        base_stmt = base_stmt.where(Candidate.school_id == school_id)
    if programme_ids_list:
        base_stmt = base_stmt.where(Candidate.programme_id.in_(programme_ids_list))
    if subject_id is not None:
        base_stmt = base_stmt.where(Subject.id == subject_id)
    if subject_type is not None:
        base_stmt = base_stmt.where(Subject.subject_type == subject_type)
    if document_id is not None:
        # Validate that document_id matches a Document.extracted_id
        document = await _resolve_document_for_scores(session, document_id, exam_id)

        if not document:
            logger.warning(
                f"Document not found with extracted_id={document_id} when filtering candidates",
                extra={"document_id_param": document_id}
            )
        elif document.extracted_id is None:
            logger.warning(
                f"Document found but extracted_id is NULL. document_id={document.id}, extracted_id_param={document_id}",
                extra={
                    "document_id": document.id,
                    "document_id_param": document_id,
                }
            )
        else:
            # Use Document.extracted_id for filtering (not the parameter directly)
            extracted_id_to_filter = document.extracted_id
            logger.info(
                f"Filtering candidates by document extracted_id",
                extra={
                    "document_id_param": document_id,
                    "document_extracted_id": extracted_id_to_filter,
                    "document_id": document.id,
                    "document_test_type": document.test_type,
                }
            )
            # Filter by document_id matching any of obj_document_id, essay_document_id, or pract_document_id
            base_stmt = base_stmt.where(
                or_(
                    SubjectScore.obj_document_id == extracted_id_to_filter,
                    SubjectScore.essay_document_id == extracted_id_to_filter,
                    SubjectScore.pract_document_id == extracted_id_to_filter,
                )
            )

    # Get total count - count distinct SubjectScore IDs with same filters
    count_base_stmt = (
        select(SubjectScore.id.distinct())
        .select_from(SubjectScore)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(Exam, ExamRegistration.exam_id == Exam.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .outerjoin(Programme, Candidate.programme_id == Programme.id)
    )

    # Apply same filters
    if exam_id is not None:
        count_base_stmt = count_base_stmt.where(Exam.id == exam_id)
    else:
        # Apply exam_type, series, year filters (these require the Exam join above)
        if exam_type is not None:
            count_base_stmt = count_base_stmt.where(Exam.exam_type == exam_type)
        if series is not None:
            count_base_stmt = count_base_stmt.where(Exam.series == series)
        if year is not None:
            count_base_stmt = count_base_stmt.where(Exam.year == year)
    if school_id is not None:
        count_base_stmt = count_base_stmt.where(Candidate.school_id == school_id)
    if programme_ids_list:
        count_base_stmt = count_base_stmt.where(Candidate.programme_id.in_(programme_ids_list))
    if subject_id is not None:
        count_base_stmt = count_base_stmt.where(Subject.id == subject_id)
    if subject_type is not None:
        count_base_stmt = count_base_stmt.where(Subject.subject_type == subject_type)
    if document_id is not None:
        # Validate that document_id matches a Document.extracted_id (same as above)
        document = await _resolve_document_for_scores(session, document_id, exam_id)

        if document and document.extracted_id is not None:
            # Use Document.extracted_id for filtering (not the parameter directly)
            extracted_id_to_filter = document.extracted_id
            # Filter by document_id matching any of obj_document_id, essay_document_id, or pract_document_id
            count_base_stmt = count_base_stmt.where(
                or_(
                    SubjectScore.obj_document_id == extracted_id_to_filter,
                    SubjectScore.essay_document_id == extracted_id_to_filter,
                    SubjectScore.pract_document_id == extracted_id_to_filter,
                )
            )
        else:
            # If document not found or extracted_id is NULL, filter will return 0 results
            # Add a condition that never matches to return 0 count
            count_base_stmt = count_base_stmt.where(SubjectScore.id == -1)

    count_stmt = select(func.count()).select_from(count_base_stmt.subquery())
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get paginated results
    stmt = base_stmt.offset(offset).limit(page_size).order_by(Candidate.index_number)
    result = await session.execute(stmt)
    rows = result.all()

    # Resolve once for logging when document_id filter is used
    log_extracted_id: str | None = None
    if document_id is not None:
        log_document = await _resolve_document_for_scores(session, document_id, exam_id)
        log_extracted_id = (
            log_document.extracted_id
            if log_document and log_document.extracted_id
            else document_id
        )
        logger.info(
            f"Found {len(rows)} candidates matching document extracted_id filter",
            extra={
                "document_id_param": document_id,
                "document_extracted_id": log_extracted_id,
                "matches_count": len(rows),
                "page": page,
                "page_size": page_size,
            }
        )

    items = []
    for candidate, subject_reg, subject_score, _exam_reg, exam, exam_subject, subject, programme in rows:
        # Log individual matches when document_id filter is used
        if document_id is not None and log_extracted_id is not None:
            # Determine which field matched
            match_type = None
            if subject_score.obj_document_id == log_extracted_id:
                match_type = "obj"
            elif subject_score.essay_document_id == log_extracted_id:
                match_type = "essay"
            elif subject_score.pract_document_id == log_extracted_id:
                match_type = "pract"

            logger.info(
                f"Candidate matched document extracted_id filter",
                extra={
                    "subject_score_id": subject_score.id,
                    "candidate_index_number": candidate.index_number,
                    "candidate_name": candidate.name,
                    "candidate_id": candidate.id,
                    "subject_code": subject.code,
                    "subject_name": subject.name,
                    "obj_document_id": subject_score.obj_document_id,
                    "essay_document_id": subject_score.essay_document_id,
                    "pract_document_id": subject_score.pract_document_id,
                    "match_type": match_type,
                    "document_extracted_id": log_extracted_id,
                }
            )
        items.append(
            CandidateScoreEntry(
                candidate_id=candidate.id,
                candidate_name=candidate.name,
                candidate_index_number=candidate.index_number,
                subject_registration_id=subject_reg.id,
                subject_id=subject.id,
                subject_code=subject.code,
                subject_name=subject.name,
                subject_series=subject_reg.series,
                exam_id=exam.id,
                exam_name=exam.exam_type.value,
                exam_year=exam.year,
                exam_series=exam.series.value,
                programme_id=programme.id if programme else None,
                programme_code=programme.code if programme else None,
                programme_name=programme.name if programme else None,
                score_id=subject_score.id,
                obj_raw_score=subject_score.obj_raw_score,
                essay_raw_score=subject_score.essay_raw_score,
                pract_raw_score=subject_score.pract_raw_score,
                obj_pct=exam_subject.obj_pct,
                essay_pct=exam_subject.essay_pct,
                pract_pct=exam_subject.pract_pct,
                obj_document_id=subject_score.obj_document_id,
                essay_document_id=subject_score.essay_document_id,
                pract_document_id=subject_score.pract_document_id,
            )
        )

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return CandidateScoreListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("/manual-entry/batch-update", response_model=BatchScoreUpdateResponse)
async def batch_update_scores_manual_entry(
    batch_update: BatchScoreUpdate, session: DBSessionDep
) -> BatchScoreUpdateResponse:
    """Batch update scores for manual entry (no document_id required)."""
    successful = 0
    failed = 0
    errors: list[dict[str, str]] = []

    async def _touch_document_for_field(
        document_id: str | None,
        method: DataExtractionMethod,
        *,
        exam_id: int | None = None,
    ) -> Document | None:
        if not document_id:
            return None
        doc = await _resolve_document_for_scores(session, document_id, exam_id)
        if doc:
            add_extraction_method_to_document(doc, method)
        return doc

    for score_item in batch_update.scores:
        try:
            if score_item.score_id is None:
                # Skip if no score_id - manual entry only updates existing scores
                failed += 1
                errors.append(
                    {
                        "subject_registration_id": str(score_item.subject_registration_id),
                        "error": "Score ID required for manual entry",
                    }
                )
                continue

            # Determine extraction method for this score item
            extraction_method = score_item.extraction_method
            if extraction_method is None:
                extraction_method = DataExtractionMethod.MANUAL_ENTRY_PHYSICAL

            # Update existing score
            stmt = select(SubjectScore).where(SubjectScore.id == score_item.score_id)
            result = await session.execute(stmt)
            subject_score = result.scalar_one_or_none()

            if not subject_score:
                failed += 1
                errors.append({"score_id": str(score_item.score_id), "error": "Score not found"})
                continue

            fields_set = score_item.model_fields_set
            documents_to_update_status: set[Document] = set()
            applied_any = False

            # Explicitly set fields: null clears; omitted fields are left alone
            if "obj_raw_score" in fields_set:
                subject_score.obj_raw_score = score_item.obj_raw_score
                applied_any = True
                if score_item.obj_raw_score is not None:
                    subject_score.obj_extraction_method = extraction_method
                    doc = await _touch_document_for_field(
                        subject_score.obj_document_id, extraction_method
                    )
                    if doc:
                        documents_to_update_status.add(doc)

            if "essay_raw_score" in fields_set:
                subject_score.essay_raw_score = score_item.essay_raw_score
                applied_any = True
                if score_item.essay_raw_score is not None:
                    subject_score.essay_extraction_method = extraction_method
                    doc = await _touch_document_for_field(
                        subject_score.essay_document_id, extraction_method
                    )
                    if doc:
                        documents_to_update_status.add(doc)

            if "pract_raw_score" in fields_set:
                subject_score.pract_raw_score = score_item.pract_raw_score
                applied_any = True
                if score_item.pract_raw_score is not None:
                    subject_score.pract_extraction_method = extraction_method
                    doc = await _touch_document_for_field(
                        subject_score.pract_document_id, extraction_method
                    )
                    if doc:
                        documents_to_update_status.add(doc)

            if not applied_any:
                failed += 1
                errors.append(
                    {
                        "score_id": str(score_item.score_id),
                        "error": "No score fields provided to update",
                    }
                )
                continue

            # Update document extraction status to success when scores are manually entered/transcribed
            current_time = datetime.utcnow()
            for doc in documents_to_update_status:
                doc.scores_extraction_status = "success"
                doc.scores_extracted_at = current_time

            successful += 1
        except Exception as e:
            failed += 1
            errors.append({"error": str(e)})

    await session.commit()

    return BatchScoreUpdateResponse(successful=successful, failed=failed, errors=errors)


async def _load_extraction_row(
    session: DBSessionDep, document: Document, provider: str | None
) -> DocumentScoreExtraction | None:
    key = normalize_provider(provider or _provider_from_extraction_data(document.scores_extraction_data))
    return await get_extraction(session, document.id, key)


@router.get("/documents/{document_id}/extraction-data", response_model=ReductoDataResponse)
@router.get("/documents/{document_id}/reducto-data", response_model=ReductoDataResponse)
async def get_extraction_data(
    document_id: int,
    session: DBSessionDep,
    provider: Literal["reducto", "llama"] | None = Query(
        None, description="Provider whose extract to preview. Defaults to the last-touched snapshot."
    ),
) -> ReductoDataResponse:
    """Get extraction data for a document, optionally for a specific provider."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    row = await _load_extraction_row(session, document, provider)
    if row and row.data:
        return ReductoDataResponse(
            data=row.data,
            status=row.status or "pending",
            confidence=row.confidence,
            extracted_at=row.extracted_at,
            provider=row.provider,
            applied_at=row.applied_at,
            current_applied=is_current_applied(row),
        )

    if not provider and document.scores_extraction_data:
        snapshot_provider = _provider_from_extraction_data(document.scores_extraction_data)
        return ReductoDataResponse(
            data=document.scores_extraction_data,
            status=document.scores_extraction_status or "pending",
            confidence=document.scores_extraction_confidence,
            extracted_at=document.scores_extracted_at,
            provider=snapshot_provider,
            applied_at=document.scores_applied_at,
            current_applied=bool(document.scores_applied_at),
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No extraction data available for this document"
        + (f" ({provider})" if provider else ""),
    )


def scores_match(score: str | float | None, verify: str | float | None) -> bool:
    """
    Check if score and verify fields match for insertion.

    Returns True if:
    - Both are numeric AND their integer values are equal, OR
    - Both are A/AA/AAA (any combination is acceptable)

    Args:
        score: The score value to check
        verify: The verify value to check against score

    Returns:
        True if scores match, False otherwise
    """
    # Use parse_score_value_safe directly so numeric 0 is not treated as missing
    parsed_score = parse_score_value_safe(score)
    parsed_verify = parse_score_value_safe(verify)

    # Both None - consider as match (no data to verify)
    if parsed_score is None and parsed_verify is None:
        return True

    # One is None, other is not - no match
    if parsed_score is None or parsed_verify is None:
        return False

    # Both are A/AA/AAA - any combination is acceptable
    if is_absent(parsed_score) and is_absent(parsed_verify):
        return True

    # Both are numeric - check if integer values match
    try:
        score_int = int(float(parsed_score))
        verify_int = int(float(parsed_verify))
        return score_int == verify_int
    except (ValueError, TypeError):
        return False


async def _get_or_create_subject_score(
    session: DBSessionDep, document: Document, subject_registration_id: int
) -> SubjectScore | None:
    """Load SubjectScore for a registration, creating an empty one if needed."""
    reg_stmt = select(SubjectRegistration).where(SubjectRegistration.id == subject_registration_id)
    if (await session.execute(reg_stmt)).scalar_one_or_none() is None:
        return None
    score_stmt = select(SubjectScore).where(SubjectScore.subject_registration_id == subject_registration_id)
    subject_score = (await session.execute(score_stmt)).scalar_one_or_none()
    if subject_score:
        return subject_score
    subject_score = SubjectScore(
        subject_registration_id=subject_registration_id,
        obj_raw_score=None,
        essay_raw_score=None,
        pract_raw_score=None,
        obj_normalized=None,
        essay_normalized=None,
        pract_normalized=None,
        total_score=0.0,
    )
    session.add(subject_score)
    await session.flush()
    return subject_score


@router.post("/documents/{document_id}/apply-extraction", response_model=UpdateScoresFromReductoResponse)
@router.post("/documents/{document_id}/update-from-reducto", response_model=UpdateScoresFromReductoResponse)
async def update_scores_from_reducto(
    document_id: int, request: UpdateScoresFromReductoRequest, session: DBSessionDep
) -> UpdateScoresFromReductoResponse:
    """Update existing SubjectScore records with data from reducto extraction."""
    logger.info(f"Starting update_scores_from_reducto for document_id={document_id}")

    # Get document
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()

    if not document:
        logger.warning(f"Document not found: document_id={document_id}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    logger.debug(f"Document found: id={document.id}, extracted_id={document.extracted_id}, test_type={document.test_type}, exam_id={document.exam_id}, subject_id={document.subject_id}")
    if not request.provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="provider is required (llama or reducto)",
        )
    extraction_row = await _load_extraction_row(session, document, request.provider)
    extraction_data = payload_for_apply(
        extraction_row,
        document.scores_extraction_data if isinstance(document.scores_extraction_data, dict) else None,
        request.provider,
    )
    applied_provider = (
        (extraction_row.provider if extraction_row else None)
        or _provider_from_extraction_data(extraction_data)
        or DEFAULT_PROVIDER
    )
    if not extraction_data:
        logger.warning(f"No extraction data available for document_id={document_id} provider={applied_provider}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No extraction data available for this document"
        )
    # Log raw data structure for debugging (limit size to avoid huge logs)
    import json
    data_str = json.dumps(extraction_data, default=str)[:500] if extraction_data else "None"
    logger.info(f"Raw extraction_data (first 500 chars): {data_str}")
    logger.info(f"Extraction data type: {type(extraction_data)}")
    if isinstance(extraction_data, dict):
        logger.info(f"Extraction data keys: {list(extraction_data.keys())}")
        # Log a sample of the structure for debugging
        if "data" in extraction_data:
            data = extraction_data.get("data", {})
            if isinstance(data, dict):
                logger.info(f"Nested data keys: {list(data.keys())}")
                if "tables" in data:
                    tables = data.get("tables", [])
                    logger.info(f"Found {len(tables)} tables in nested data")
                    if tables and isinstance(tables[0], dict):
                        logger.info(f"First table keys: {list(tables[0].keys())}")
                        if "rows" in tables[0]:
                            logger.info(f"First table has {len(tables[0].get('rows', []))} rows")

    # Handle different data structures from reducto extraction
    # The data might be in:
    # 1. Direct format: {"candidates": [...]}
    # 2. Tables format: {"tables": [{"rows": [...]}]}
    # 3. Nested format: {"data": {"candidates": [...]}}
    # 4. Nested tables format: {"data": {"tables": [{"rows": [...]}]}}
    candidates = []

    def extract_candidates_from_rows(rows: list) -> list:
        """Helper function to convert rows to candidates format."""
        result = []
        for idx, row in enumerate(rows):
            if isinstance(row, dict):
                raw_score = row.get("raw_score")
                score = raw_score if raw_score is not None else row.get("score")
                candidate = {
                    "index_number": row.get("index_number"),
                    "candidate_name": row.get("candidate_name"),
                    "score": score,
                    "attend": row.get("attend"),
                    "verify": row.get("verify"),
                    "sn": row.get("sn") or row.get("serial_number") or row.get("row_number") or (idx + 1),
                }
                result.append(candidate)
        return result

    if isinstance(extraction_data, dict):
        # Try direct candidates key
        if "candidates" in extraction_data:
            candidates = extraction_data.get("candidates", [])
            logger.info(f"Found candidates in direct 'candidates' key: {len(candidates)} candidates")

        # Try tables format at top level
        if not candidates and "tables" in extraction_data:
            tables = extraction_data.get("tables", [])
            logger.info(f"Found 'tables' key at top level with {len(tables)} tables")
            for table in tables:
                if isinstance(table, dict) and "rows" in table:
                    rows = table.get("rows", [])
                    logger.info(f"Found {len(rows)} rows in top-level table")
                    candidates.extend(extract_candidates_from_rows(rows))
                    logger.info(f"Total candidates after processing top-level tables: {len(candidates)}")

        # Try nested data format
        if not candidates and "data" in extraction_data:
            data = extraction_data.get("data", {})
            logger.info(f"Found 'data' key, checking nested structure")
            if isinstance(data, dict):
                # Check for candidates in nested data
                if "candidates" in data:
                    candidates = data.get("candidates", [])
                    logger.info(f"Found candidates in nested 'data.candidates' key: {len(candidates)} candidates")

                # Check for tables in nested data
                if not candidates and "tables" in data:
                    tables = data.get("tables", [])
                    logger.info(f"Found 'tables' key in nested data with {len(tables)} tables")
                    for table in tables:
                        if isinstance(table, dict) and "rows" in table:
                            rows = table.get("rows", [])
                            logger.info(f"Found {len(rows)} rows in nested table")
                            candidates.extend(extract_candidates_from_rows(rows))
                            logger.info(f"Total candidates after processing nested tables: {len(candidates)}")

    logger.info(f"Total candidates extracted: {len(candidates)} from extraction_data structure")

    if not candidates:
        logger.warning(f"No candidate data found in extraction for document_id={document_id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No candidate data found in extraction"
        )

    # Use document's extracted_id and test_type to determine which fields to update
    # Fallback to document.id if extracted_id is not available
    document_identifier = document.extracted_id if document.extracted_id else str(document.id)
    logger.debug(f"Using document_identifier={document_identifier} (extracted_id={document.extracted_id}, fallback={str(document.id)})")

    test_type = document.test_type

    # Check if test_type is set
    if not test_type:
        logger.error(f"Document {document_id} does not have test_type set")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document does not have a test_type set. Please set test_type to '1' (obj), '2' (essay), or '3' (pract)",
        )

    # Determine which score field to update based on test_type
    # test_type="1" -> obj, test_type="2" -> essay, test_type="3" -> pract
    if test_type == "1":
        update_score_attr = "obj_raw_score"
        update_doc_attr = "obj_document_id"
        update_method_attr = "obj_extraction_method"
        logger.debug("test_type='1' -> updating obj_raw_score")
    elif test_type == "2":
        update_score_attr = "essay_raw_score"
        update_doc_attr = "essay_document_id"
        update_method_attr = "essay_extraction_method"
        logger.debug("test_type='2' -> updating essay_raw_score")
    elif test_type == "3":
        update_score_attr = "pract_raw_score"
        update_doc_attr = "pract_document_id"
        update_method_attr = "pract_extraction_method"
        logger.debug("test_type='3' -> updating pract_raw_score")
    else:
        logger.error(f"Invalid test_type={test_type} for document_id={document_id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid test_type: {test_type}. Expected '1' (obj), '2' (essay), or '3' (pract)",
        )

    updated_count = 0
    unmatched_count = 0
    skipped_count = 0
    cleared_count = 0
    skipped_records: list[dict] = []
    unmatched_records = []
    errors: list[dict[str, str]] = []
    verify_enabled = request.verify

    await session.execute(
        delete(UnmatchedExtractionRecord).where(
            UnmatchedExtractionRecord.document_id == document.id,
            UnmatchedExtractionRecord.status == UnmatchedRecordStatus.PENDING,
            or_(
                UnmatchedExtractionRecord.extraction_provider == applied_provider,
                UnmatchedExtractionRecord.extraction_provider.is_(None),
            ),
        )
    )
    kept_result = await session.execute(
        select(UnmatchedExtractionRecord).where(
            UnmatchedExtractionRecord.document_id == document.id,
            UnmatchedExtractionRecord.status.in_(
                [UnmatchedRecordStatus.RESOLVED, UnmatchedRecordStatus.IGNORED]
            ),
            or_(
                UnmatchedExtractionRecord.extraction_provider == applied_provider,
                UnmatchedExtractionRecord.extraction_provider.is_(None),
            ),
        )
    )
    reuse_index = build_unmatched_reuse_index(list(kept_result.scalars().all()))

    # Process each candidate from reducto data
    logger.info(f"Processing {len(candidates)} candidates from reducto data (verify={verify_enabled})")
    for idx, candidate_data in enumerate(candidates):
        try:
            index_number = candidate_data.get("index_number")
            candidate_name = candidate_data.get("candidate_name")
            score_value = candidate_data.get("score")
            verify_value = candidate_data.get("verify")
            # Extract SN: try sn, serial_number, row_number, or fallback to array index + 1
            sn = candidate_data.get("sn") or candidate_data.get("serial_number") or candidate_data.get("row_number") or (idx + 1)
            # Ensure sn is an integer
            if not isinstance(sn, int):
                try:
                    sn = int(sn)
                except (ValueError, TypeError):
                    sn = idx + 1

            logger.debug(f"Processing candidate {idx+1}/{len(candidates)}: index_number={index_number}, name={candidate_name}, score={score_value}, verify={verify_value}, sn={sn}")

            if not index_number:
                logger.warning(f"Candidate {idx+1} missing index_number: {candidate_data}")
                unmatched_count += 1
                parsed_score = None
                try:
                    parsed_score = parse_score_value(score_value) if score_value is not None else None
                except ValueError:
                    pass

                unmatched_record = UnmatchedExtractionRecord(
                    document_id=document.id,
                    index_number=index_number,
                    candidate_name=candidate_name,
                    score=parsed_score,
                    sn=sn,
                    raw_data=candidate_data,
                    status=UnmatchedRecordStatus.PENDING,
                    extraction_method=DataExtractionMethod.AUTOMATED_EXTRACTION,
                    extraction_provider=applied_provider,
                )
                session.add(unmatched_record)
                unmatched_records.append(
                    {
                        "index_number": None,
                        "candidate_name": candidate_name,
                        "score": str(score_value) if score_value else None,
                        "error": "Missing index_number",
                    }
                )
                continue

            # Find matching SubjectScore via Candidate.index_number
            # Path: SubjectScore -> SubjectRegistration -> ExamRegistration -> Candidate
            stmt = (
                select(SubjectScore, Candidate, SubjectRegistration, ExamRegistration)
                .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
                .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
                .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
                .where(Candidate.index_number == index_number)
                .where(ExamRegistration.exam_id == document.exam_id)
            )

            # If document has subject_id, filter by it
            if document.subject_id:
                logger.debug(f"Filtering by subject_id={document.subject_id}")
                stmt = stmt.join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id).where(
                    ExamSubject.subject_id == document.subject_id
                )

            result = await session.execute(stmt)
            row = result.first()

            if not row:
                prior = lookup_unmatched_reuse(reuse_index, sn=sn, index_number=index_number)
                action = reuse_action(
                    prior.status if prior is not None else None,
                    prior.resolved_subject_registration_id if prior is not None else None,
                )
                if action == "skip":
                    logger.debug(
                        f"Not recreating unmatched for index_number={index_number} sn={sn} "
                        f"(prior status={getattr(prior, 'status', None)})"
                    )
                    continue
                if action == "write":
                    subject_score = await _get_or_create_subject_score(
                        session, document, prior.resolved_subject_registration_id
                    )
                    if subject_score is None:
                        logger.warning(
                            f"Resolved unmatched mapping registration missing for "
                            f"index_number={index_number} registration_id={prior.resolved_subject_registration_id}"
                        )
                        continue
                    logger.info(
                        f"Reusing resolved unmatched mapping for index_number={index_number} "
                        f"subject_registration_id={prior.resolved_subject_registration_id}"
                    )
                else:
                    logger.warning(
                        f"No matching SubjectScore found for index_number={index_number}, "
                        f"exam_id={document.exam_id}, subject_id={document.subject_id}"
                    )
                    unmatched_count += 1
                    parsed_score = None
                    try:
                        parsed_score = parse_score_value(score_value) if score_value is not None else None
                    except ValueError as e:
                        logger.debug(
                            f"Failed to parse score value '{score_value}' for index_number={index_number}: {e}"
                        )

                    unmatched_record = UnmatchedExtractionRecord(
                        document_id=document.id,
                        index_number=index_number,
                        candidate_name=candidate_name,
                        score=parsed_score,
                        sn=sn,
                        raw_data=candidate_data,
                        status=UnmatchedRecordStatus.PENDING,
                        extraction_method=DataExtractionMethod.AUTOMATED_EXTRACTION,
                        extraction_provider=applied_provider,
                    )
                    session.add(unmatched_record)
                    unmatched_records.append(
                        {
                            "index_number": index_number,
                            "candidate_name": candidate_name,
                            "score": parsed_score,
                        }
                    )
                    continue
            else:
                subject_score, candidate, _subject_reg, _exam_reg = row
                logger.debug(
                    f"Found matching SubjectScore: id={subject_score.id}, candidate_id={candidate.id}, "
                    f"subject_registration_id={subject_score.subject_registration_id}"
                )

            # Parse score value
            try:
                parsed_score = parse_score_value(score_value) if score_value is not None else None
                logger.debug(f"Parsed score: {score_value} -> {parsed_score}")
            except ValueError as e:
                logger.debug(f"Invalid score format for index_number={index_number}, score={score_value}: {e}. Skipping candidate.")
                continue

            # If verify is enabled, check if score and verify fields match
            if verify_enabled:
                if not scores_match(score_value, verify_value):
                    existing_score = getattr(subject_score, update_score_attr)
                    cleared = existing_score is not None
                    if cleared:
                        setattr(subject_score, update_score_attr, None)
                        setattr(subject_score, update_method_attr, None)
                        cleared_count += 1
                        logger.debug(
                            f"Cleared {update_score_attr} for index_number={index_number} "
                            f"(score={score_value} verify={verify_value} mismatch; left {update_doc_attr} unchanged)"
                        )
                    else:
                        logger.debug(
                            f"Skipping candidate {index_number}: score={score_value} and verify={verify_value} do not match"
                        )
                    skipped_count += 1
                    skipped_records.append(
                        {
                            "index_number": index_number,
                            "candidate_name": candidate_name,
                            "score": score_value,
                            "verify": verify_value,
                            "cleared": cleared,
                        }
                    )
                    continue

            # Update appropriate score field based on test_type
            old_score = getattr(subject_score, update_score_attr)
            setattr(subject_score, update_score_attr, parsed_score)
            setattr(subject_score, update_method_attr, DataExtractionMethod.AUTOMATED_EXTRACTION)
            setattr(subject_score, update_doc_attr, document_identifier)

            logger.debug(f"Updated {update_score_attr}: {old_score} -> {parsed_score} for SubjectScore id={subject_score.id}")

            # Update document's extraction methods array
            add_extraction_method_to_document(document, DataExtractionMethod.AUTOMATED_EXTRACTION)

            updated_count += 1

        except ValueError as e:
            # Handle ValueError (invalid score format) silently at DEBUG level
            index_number = candidate_data.get("index_number", "unknown")
            logger.debug(f"Invalid score format for candidate {idx+1} (index_number={index_number}): {e}. Skipping candidate.")
            # Do not add to errors list - this is expected behavior for invalid formats
            continue
        except Exception as e:
            # Handle other unexpected errors at ERROR level
            logger.error(f"Error processing candidate {idx+1} (index_number={candidate_data.get('index_number', 'unknown')}): {e}", exc_info=True)
            errors.append({"index_number": candidate_data.get("index_number", "unknown"), "error": str(e)})

    # Update per-provider applied tracking (do not overwrite extracted_at)
    if updated_count > 0 or cleared_count > 0:
        applied_at = datetime.utcnow()
        if extraction_row is None:
            extraction_row = await get_extraction(session, document.id, applied_provider)
        if extraction_row is not None:
            extraction_row.applied_at = applied_at
            extraction_row.applied_count = updated_count
            extraction_row.unmatched_count = unmatched_count
            if extraction_row.status != "success":
                extraction_row.status = "success"
            sync_document_snapshot(document, extraction_row)
        else:
            document.scores_extraction_status = "success"
            document.scores_applied_at = applied_at
            document.scores_applied_count = updated_count
            document.scores_unmatched_count = unmatched_count
        logger.info(f"Marked {applied_provider} extract applied for document_id={document_id}")

    await session.commit()

    logger.info(
        f"Completed update_scores_from_reducto for document_id={document_id}: "
        f"updated={updated_count}, unmatched={unmatched_count}, skipped={skipped_count}, "
        f"cleared={cleared_count}, errors={len(errors)}"
    )

    return UpdateScoresFromReductoResponse(
        updated_count=updated_count,
        unmatched_count=unmatched_count,
        skipped_count=skipped_count,
        skipped_records=skipped_records,
        unmatched_records=unmatched_records,
        errors=errors,
        cleared_count=cleared_count,
        scores_applied_at=document.scores_applied_at,
        scores_applied_count=document.scores_applied_count,
        scores_unmatched_count=document.scores_unmatched_count,
    )


@router.get("/unmatched-records", response_model=UnmatchedRecordsListResponse)
async def get_unmatched_records(
    session: DBSessionDep,
    document_id: int | None = Query(None),
    status: UnmatchedRecordStatus | None = Query(None),
    extraction_method: DataExtractionMethod | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    include_suggestions: bool = Query(
        False,
        description="Attach OCR index suggestions (extra lookups). Use for the visible page only.",
    ),
) -> UnmatchedRecordsListResponse:
    """Get list of unmatched extraction records."""
    offset = (page - 1) * page_size

    # Build query with joins to get document info
    base_stmt = (
        select(UnmatchedExtractionRecord, Document, School.name, Subject.name)
        .join(Document, UnmatchedExtractionRecord.document_id == Document.id)
        .outerjoin(School, Document.school_id == School.id)
        .outerjoin(Subject, Document.subject_id == Subject.id)
    )

    # Apply filters
    if document_id is not None:
        base_stmt = base_stmt.where(UnmatchedExtractionRecord.document_id == document_id)
    if status is not None:
        base_stmt = base_stmt.where(UnmatchedExtractionRecord.status == status)
    if extraction_method is not None:
        base_stmt = base_stmt.where(UnmatchedExtractionRecord.extraction_method == extraction_method)

    # Get total count
    count_stmt = select(func.count(UnmatchedExtractionRecord.id))
    if document_id is not None:
        count_stmt = count_stmt.where(UnmatchedExtractionRecord.document_id == document_id)
    if status is not None:
        count_stmt = count_stmt.where(UnmatchedExtractionRecord.status == status)
    if extraction_method is not None:
        count_stmt = count_stmt.where(UnmatchedExtractionRecord.extraction_method == extraction_method)

    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get paginated results
    stmt = base_stmt.offset(offset).limit(page_size).order_by(UnmatchedExtractionRecord.created_at.desc())
    result = await session.execute(stmt)
    rows = result.all()

    items = []
    for unmatched_record, document, school_name, subject_name in rows:
        suggestion = None
        if include_suggestions:
            suggestion = UnmatchedIndexSuggestion.model_validate(
                await suggest_for_unmatched(session, document, unmatched_record.index_number)
            )
        items.append(
            _unmatched_record_response(
                unmatched_record, document, school_name, subject_name, suggestion
            )
        )

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return UnmatchedRecordsListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


def _unmatched_record_response(
    unmatched_record: UnmatchedExtractionRecord,
    document: Document,
    school_name: str | None,
    subject_name: str | None,
    suggestion: UnmatchedIndexSuggestion | None = None,
) -> UnmatchedExtractionRecordResponse:
    return UnmatchedExtractionRecordResponse(
        id=unmatched_record.id,
        document_id=unmatched_record.document_id,
        document_extracted_id=document.extracted_id,
        document_school_name=school_name,
        document_subject_name=subject_name,
        index_number=unmatched_record.index_number,
        candidate_name=unmatched_record.candidate_name,
        score=unmatched_record.score,
        sn=unmatched_record.sn,
        raw_data=unmatched_record.raw_data,
        status=unmatched_record.status.value,
        extraction_method=unmatched_record.extraction_method.value,
        extraction_provider=unmatched_record.extraction_provider,
        created_at=unmatched_record.created_at,
        updated_at=unmatched_record.updated_at,
        resolved_at=unmatched_record.resolved_at,
        suggestion=suggestion,
        resolved_subject_registration_id=unmatched_record.resolved_subject_registration_id,
    )


async def _apply_unmatched_score(
    session: DBSessionDep,
    unmatched_record: UnmatchedExtractionRecord,
    document: Document,
    *,
    subject_registration_id: int,
    score_field: str,
    score_value: str | None,
) -> None:
    """Apply extracted score to SubjectScore and mark the unmatched row resolved. Caller commits."""
    if score_field not in ("obj", "essay", "pract"):
        raise ValueError("score_field must be 'obj', 'essay', or 'pract'")

    parsed_score = None
    if score_value is not None:
        try:
            parsed_score = parse_score_value(score_value)
        except ValueError as e:
            raise ValueError(f"Invalid score format: {e}") from e

    score_stmt = select(SubjectScore).where(SubjectScore.subject_registration_id == subject_registration_id)
    score_result = await session.execute(score_stmt)
    subject_score = score_result.scalar_one_or_none()

    document_identifier = document.extracted_id if document.extracted_id else str(document.id)

    if not subject_score:
        subject_score = SubjectScore(
            subject_registration_id=subject_registration_id,
            obj_raw_score=parsed_score if score_field == "obj" else None,
            essay_raw_score=parsed_score if score_field == "essay" else None,
            pract_raw_score=parsed_score if score_field == "pract" else None,
            obj_normalized=None,
            essay_normalized=None,
            pract_normalized=None,
            total_score=0.0,
            obj_document_id=document_identifier if score_field == "obj" else None,
            essay_document_id=document_identifier if score_field == "essay" else None,
            pract_document_id=document_identifier if score_field == "pract" else None,
            obj_extraction_method=DataExtractionMethod.AUTOMATED_EXTRACTION if score_field == "obj" else None,
            essay_extraction_method=DataExtractionMethod.AUTOMATED_EXTRACTION if score_field == "essay" else None,
            pract_extraction_method=DataExtractionMethod.AUTOMATED_EXTRACTION if score_field == "pract" else None,
        )
        session.add(subject_score)
    else:
        if score_field == "obj":
            subject_score.obj_raw_score = parsed_score
            subject_score.obj_extraction_method = DataExtractionMethod.AUTOMATED_EXTRACTION
            subject_score.obj_document_id = document_identifier
        elif score_field == "essay":
            subject_score.essay_raw_score = parsed_score
            subject_score.essay_extraction_method = DataExtractionMethod.AUTOMATED_EXTRACTION
            subject_score.essay_document_id = document_identifier
        elif score_field == "pract":
            subject_score.pract_raw_score = parsed_score
            subject_score.pract_extraction_method = DataExtractionMethod.AUTOMATED_EXTRACTION
            subject_score.pract_document_id = document_identifier

    add_extraction_method_to_document(document, DataExtractionMethod.AUTOMATED_EXTRACTION)
    unmatched_record.status = UnmatchedRecordStatus.RESOLVED
    unmatched_record.resolved_at = datetime.utcnow()
    unmatched_record.resolved_subject_registration_id = subject_registration_id


@router.get("/unmatched-records/ocr-candidates", response_model=UnmatchedRecordsListResponse)
async def get_unmatched_ocr_candidates(
    session: DBSessionDep,
    document_id: int | None = Query(None),
    extraction_method: DataExtractionMethod | None = Query(None),
    record_ids: list[int] | None = Query(None),
    limit: int = Query(500, ge=1, le=500),
) -> UnmatchedRecordsListResponse:
    """Pending unmatched rows whose cleaned index uniquely matches one registered candidate."""
    items_raw, total = await list_unique_ocr_candidates(
        session,
        document_id=document_id,
        extraction_method=extraction_method,
        record_ids=record_ids,
        limit=limit,
    )
    items = [
        _unmatched_record_response(
            item["record"],
            item["document"],
            item["school_name"],
            item["subject_name"],
            UnmatchedIndexSuggestion.model_validate(item["suggestion"]),
        )
        for item in items_raw
    ]
    return UnmatchedRecordsListResponse(
        items=items,
        total=total,
        page=1,
        page_size=limit,
        total_pages=1 if total == 0 else (total + limit - 1) // limit,
    )


@router.post("/unmatched-records/bulk-resolve-ocr", response_model=BulkUnmatchedActionResponse)
async def bulk_resolve_unmatched_ocr(
    request: BulkUnmatchedOcrResolveRequest,
    session: DBSessionDep,
) -> BulkUnmatchedActionResponse:
    """Apply scores for unique OCR-cleaned index matches. Re-validates uniqueness at apply time."""
    extraction_method = None
    if request.extraction_method:
        try:
            extraction_method = DataExtractionMethod(request.extraction_method)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid extraction_method",
            )

    candidates, _total = await list_unique_ocr_candidates(
        session,
        document_id=request.document_id,
        extraction_method=extraction_method,
        record_ids=request.record_ids,
        limit=5000,
    )

    requested_ids = set(request.record_ids) if request.record_ids is not None else None
    unique_ids = {item["record"].id for item in candidates}

    applied = 0
    skipped = 0
    failed = 0
    errors: list[BulkUnmatchedActionError] = []

    # Skip ids the client asked for that are not unique OCR (or no longer pending).
    if requested_ids is not None:
        for record_id in requested_ids:
            if record_id not in unique_ids:
                skipped += 1
                errors.append(
                    BulkUnmatchedActionError(record_id=record_id, reason="not a unique OCR match")
                )

    scoped_cache: dict[tuple[int | None, int | None], list] = {}

    for item in candidates:
        unmatched_record: UnmatchedExtractionRecord = item["record"]
        document: Document = item["document"]
        try:
            if unmatched_record.status != UnmatchedRecordStatus.PENDING:
                skipped += 1
                errors.append(
                    BulkUnmatchedActionError(record_id=unmatched_record.id, reason="not pending")
                )
                continue

            cache_key = (document.exam_id, document.subject_id)
            if cache_key not in scoped_cache:
                scoped_cache[cache_key] = await load_scoped_candidate_rows(session, document)
            suggestion = suggestion_from_candidate_rows(
                unmatched_record.index_number,
                scoped_cache[cache_key],
                document.test_type,
            )
            if not suggestion.get("likely_ocr_noise") or not suggestion.get("unique"):
                skipped += 1
                errors.append(
                    BulkUnmatchedActionError(
                        record_id=unmatched_record.id, reason="not a unique OCR match"
                    )
                )
                continue

            score_field = suggestion.get("score_field")
            if score_field not in ("obj", "essay", "pract"):
                skipped += 1
                errors.append(
                    BulkUnmatchedActionError(
                        record_id=unmatched_record.id, reason="no score field for document test type"
                    )
                )
                continue

            matches = suggestion.get("matches") or []
            if len(matches) != 1:
                skipped += 1
                errors.append(
                    BulkUnmatchedActionError(
                        record_id=unmatched_record.id, reason="not a unique OCR match"
                    )
                )
                continue

            subject_registration_id = matches[0]["subject_registration_id"]
            reg_stmt = select(SubjectRegistration).where(
                SubjectRegistration.id == subject_registration_id
            )
            subject_reg = (await session.execute(reg_stmt)).scalar_one_or_none()
            if not subject_reg:
                skipped += 1
                errors.append(
                    BulkUnmatchedActionError(
                        record_id=unmatched_record.id, reason="subject registration not found"
                    )
                )
                continue

            async with session.begin_nested():
                await _apply_unmatched_score(
                    session,
                    unmatched_record,
                    document,
                    subject_registration_id=subject_registration_id,
                    score_field=score_field,
                    score_value=unmatched_record.score,
                )
            applied += 1
        except Exception as exc:
            failed += 1
            errors.append(BulkUnmatchedActionError(record_id=unmatched_record.id, reason=str(exc)))

    await session.commit()
    return BulkUnmatchedActionResponse(
        applied=applied,
        skipped=skipped,
        failed=failed,
        errors=errors,
    )


@router.post("/unmatched-records/bulk-ignore", response_model=BulkUnmatchedActionResponse)
async def bulk_ignore_unmatched_records(
    request: BulkUnmatchedIdsRequest,
    session: DBSessionDep,
) -> BulkUnmatchedActionResponse:
    stmt = select(UnmatchedExtractionRecord).where(UnmatchedExtractionRecord.id.in_(request.record_ids))
    records = list((await session.execute(stmt)).scalars().all())
    found_ids = {record.id for record in records}

    applied = 0
    skipped = 0
    failed = 0
    errors: list[BulkUnmatchedActionError] = []

    for record_id in request.record_ids:
        if record_id not in found_ids:
            skipped += 1
            errors.append(BulkUnmatchedActionError(record_id=record_id, reason="not found"))

    for record in records:
        if record.status != UnmatchedRecordStatus.PENDING:
            skipped += 1
            errors.append(
                BulkUnmatchedActionError(
                    record_id=record.id, reason=f"already {record.status.value}"
                )
            )
            continue
        try:
            record.status = UnmatchedRecordStatus.IGNORED
            applied += 1
        except Exception as exc:
            failed += 1
            errors.append(BulkUnmatchedActionError(record_id=record.id, reason=str(exc)))

    await session.commit()
    return BulkUnmatchedActionResponse(applied=applied, skipped=skipped, failed=failed, errors=errors)


@router.post("/unmatched-records/bulk-mark-resolved", response_model=BulkUnmatchedActionResponse)
async def bulk_mark_unmatched_records_resolved(
    request: BulkUnmatchedIdsRequest,
    session: DBSessionDep,
) -> BulkUnmatchedActionResponse:
    stmt = select(UnmatchedExtractionRecord).where(UnmatchedExtractionRecord.id.in_(request.record_ids))
    records = list((await session.execute(stmt)).scalars().all())
    found_ids = {record.id for record in records}

    applied = 0
    skipped = 0
    failed = 0
    errors: list[BulkUnmatchedActionError] = []

    for record_id in request.record_ids:
        if record_id not in found_ids:
            skipped += 1
            errors.append(BulkUnmatchedActionError(record_id=record_id, reason="not found"))

    for record in records:
        if record.status != UnmatchedRecordStatus.PENDING:
            skipped += 1
            errors.append(
                BulkUnmatchedActionError(
                    record_id=record.id, reason=f"already {record.status.value}"
                )
            )
            continue
        try:
            record.status = UnmatchedRecordStatus.RESOLVED
            record.resolved_at = datetime.utcnow()
            applied += 1
        except Exception as exc:
            failed += 1
            errors.append(BulkUnmatchedActionError(record_id=record.id, reason=str(exc)))

    await session.commit()
    return BulkUnmatchedActionResponse(applied=applied, skipped=skipped, failed=failed, errors=errors)


@router.get("/unmatched-records/{record_id}", response_model=UnmatchedExtractionRecordResponse)
async def get_unmatched_record(record_id: int, session: DBSessionDep) -> UnmatchedExtractionRecordResponse:
    """Get single unmatched record details."""
    stmt = (
        select(UnmatchedExtractionRecord, Document, School.name, Subject.name)
        .join(Document, UnmatchedExtractionRecord.document_id == Document.id)
        .outerjoin(School, Document.school_id == School.id)
        .outerjoin(Subject, Document.subject_id == Subject.id)
        .where(UnmatchedExtractionRecord.id == record_id)
    )

    result = await session.execute(stmt)
    row = result.first()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unmatched record not found")

    unmatched_record, document, school_name, subject_name = row
    suggestion = await suggest_for_unmatched(session, document, unmatched_record.index_number)

    return _unmatched_record_response(
        unmatched_record,
        document,
        school_name,
        subject_name,
        UnmatchedIndexSuggestion.model_validate(suggestion),
    )


@router.get("/unmatched-records/{record_id}/suggestions", response_model=UnmatchedIndexSuggestion)
async def get_unmatched_record_suggestions(
    record_id: int,
    session: DBSessionDep,
    q: str | None = Query(None, description="Optional cleaned index or candidate name search"),
) -> UnmatchedIndexSuggestion:
    """Suggest registered candidates for an unmatched extracted index (OCR cleanup)."""
    stmt = (
        select(UnmatchedExtractionRecord, Document)
        .join(Document, UnmatchedExtractionRecord.document_id == Document.id)
        .where(UnmatchedExtractionRecord.id == record_id)
    )
    result = await session.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unmatched record not found")
    unmatched_record, document = row
    suggestion = await suggest_for_unmatched(
        session, document, unmatched_record.index_number, search=q
    )
    return UnmatchedIndexSuggestion.model_validate(suggestion)


@router.put("/unmatched-records/{record_id}/resolve")
async def resolve_unmatched_record(
    record_id: int, request: ResolveUnmatchedRecordRequest, session: DBSessionDep
) -> dict:
    """Resolve an unmatched record by linking it to a SubjectRegistration and applying the score."""
    # Get unmatched record
    stmt = select(UnmatchedExtractionRecord, Document).join(
        Document, UnmatchedExtractionRecord.document_id == Document.id
    ).where(UnmatchedExtractionRecord.id == record_id)

    result = await session.execute(stmt)
    row = result.first()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unmatched record not found")

    unmatched_record, document = row

    if unmatched_record.status != UnmatchedRecordStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Record is already {unmatched_record.status.value}, cannot resolve",
        )

    # Verify subject_registration exists
    reg_stmt = select(SubjectRegistration).where(SubjectRegistration.id == request.subject_registration_id)
    reg_result = await session.execute(reg_stmt)
    subject_reg = reg_result.scalar_one_or_none()

    if not subject_reg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Subject registration not found"
        )

    if request.score_field not in ("obj", "essay", "pract"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="score_field must be 'obj', 'essay', or 'pract'"
        )

    try:
        await _apply_unmatched_score(
            session,
            unmatched_record,
            document,
            subject_registration_id=request.subject_registration_id,
            score_field=request.score_field,
            score_value=request.score_value,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await session.commit()

    return {"message": "Record resolved successfully", "record_id": record_id}


@router.put("/unmatched-records/{record_id}/mark-resolved")
async def mark_unmatched_record_resolved(record_id: int, session: DBSessionDep) -> dict:
    """Mark an unmatched record as resolved without linking to a subject registration."""
    stmt = select(UnmatchedExtractionRecord).where(UnmatchedExtractionRecord.id == record_id)
    result = await session.execute(stmt)
    unmatched_record = result.scalar_one_or_none()

    if not unmatched_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unmatched record not found")

    if unmatched_record.status != UnmatchedRecordStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Record is already {unmatched_record.status.value}, cannot mark as resolved",
        )

    unmatched_record.status = UnmatchedRecordStatus.RESOLVED
    unmatched_record.resolved_at = datetime.utcnow()
    await session.commit()

    return {"message": "Record marked as resolved successfully", "record_id": record_id}


@router.put("/unmatched-records/{record_id}/ignore")
async def ignore_unmatched_record(record_id: int, session: DBSessionDep) -> dict:
    """Mark an unmatched record as ignored."""
    stmt = select(UnmatchedExtractionRecord).where(UnmatchedExtractionRecord.id == record_id)
    result = await session.execute(stmt)
    unmatched_record = result.scalar_one_or_none()

    if not unmatched_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unmatched record not found")

    if unmatched_record.status != UnmatchedRecordStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Record is already {unmatched_record.status.value}, cannot ignore",
        )

    unmatched_record.status = UnmatchedRecordStatus.IGNORED
    await session.commit()

    return {"message": "Record ignored successfully", "record_id": record_id}


def _parse_export_fields(fields: str) -> list[str]:
    fields_list = [f.strip() for f in fields.split(",") if f.strip()]
    if not fields_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one field must be specified",
        )
    return fields_list


def _parse_subject_ids(subject_ids: str | None) -> list[int] | None:
    if not subject_ids:
        return None
    try:
        return [int(sid.strip()) for sid in subject_ids.split(",") if sid.strip()]
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="subject_ids must be comma-separated integers",
        )


def _parse_programme_ids(
    programme_id: int | None,
    programme_ids: str | None,
) -> list[int] | None:
    if programme_id is not None and programme_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="programme_id and programme_ids cannot both be specified",
        )
    if programme_ids:
        try:
            return [int(pid.strip()) for pid in programme_ids.split(",") if pid.strip()]
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="programme_ids must be comma-separated integers",
            )
    if programme_id is not None:
        return [programme_id]
    return None


def _parse_test_types_param(
    test_type: str | None,
    test_types: str | None,
) -> list[str] | None:
    if not test_type and not test_types:
        return None
    try:
        return parse_export_test_types(test_type, test_types)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


def _validate_export_filters(
    *,
    subject_type: SubjectType | None,
    subject_id: int | None,
    programme_ids_list: list[int] | None,
    export_format: str,
    test_types_list: list[str] | None,
    subject_ids: str | None,
) -> list[int] | None:
    if subject_type is not None and subject_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="subject_type and subject_id cannot both be specified",
        )
    if subject_type == SubjectType.ELECTIVE and not programme_ids_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="programme_id or programme_ids is required when subject_type is ELECTIVE",
        )
    subject_ids_list = None
    if export_format == "multi_subject":
        if not test_types_list:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="test_types (or test_type) is required when export_format is 'multi_subject'",
            )
        if subject_ids is None and subject_type is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either subject_ids or subject_type must be provided when export_format is 'multi_subject'",
            )
        if subject_ids is not None and subject_type is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="subject_ids and subject_type cannot both be specified",
            )
        subject_ids_list = _parse_subject_ids(subject_ids)
    return subject_ids_list


def _excel_content_disposition(filename: str) -> str:
    encoded_filename = quote(filename, safe="")
    return f'attachment; filename="{filename}"; filename*=UTF-8\'\'{encoded_filename}'


@router.get("/export")
async def export_candidate_results(
    session: DBSessionDep,
    exam_id: int | None = Query(None, description="Filter by exam ID"),
    exam_type: ExamType | None = Query(None, description="Filter by examination type"),
    series: ExamSeries | None = Query(None, description="Filter by examination series"),
    year: int | None = Query(None, ge=1900, le=2100, description="Filter by examination year"),
    school_id: int | None = Query(None, description="Filter by school ID"),
    programme_id: int | None = Query(None, description="Filter by programme ID (legacy single programme)"),
    programme_ids: str | None = Query(None, description="Comma-separated programme IDs for elective exports"),
    subject_id: int | None = Query(None, description="Filter by subject ID"),
    document_id: str | None = Query(None, description="Filter by document ID (extracted_id) - matches obj_document_id, essay_document_id, or pract_document_id"),
    fields: str = Query(..., description="Comma-separated list of fields to export. Available fields: candidate_name, candidate_index_number, school_name, school_code, exam_name, exam_type, exam_year, exam_series, programme_name, programme_code, subject_name, subject_code, subject_series, obj_raw_score, essay_raw_score, pract_raw_score, obj_normalized, essay_normalized, pract_normalized, total_score, grade, obj_document_id, essay_document_id, pract_document_id, created_at, updated_at"),
    subject_type: SubjectType | None = Query(None, description="Filter by subject type (CORE or ELECTIVE). If ELECTIVE, programme_id is required. Mutually exclusive with subject_id."),
    export_format: Literal["standard", "multi_subject"] = Query("standard", description="Export format: 'standard' for traditional format, 'multi_subject' for multiple subjects on same sheet"),
    test_type: Literal["obj", "essay"] | None = Query(None, description="Legacy single test type for multi_subject format"),
    test_types: str | None = Query(None, description="Comma-separated test types for multi_subject: obj, essay"),
    subject_ids: str | None = Query(None, description="Comma-separated list of subject IDs for multi_subject format (mutually exclusive with subject_type)"),
) -> StreamingResponse:
    """Export candidate processed results as Excel file (small/sync downloads)."""
    try:
        fields_list = _parse_export_fields(fields)
        programme_ids_list = _parse_programme_ids(programme_id, programme_ids)
        test_types_list = _parse_test_types_param(test_type, test_types)
        subject_ids_list = _validate_export_filters(
            subject_type=subject_type,
            subject_id=subject_id,
            programme_ids_list=programme_ids_list,
            export_format=export_format,
            test_types_list=test_types_list,
            subject_ids=subject_ids,
        )
        try:
            filename = await generate_export_filename(
                session=session,
                exam_id=exam_id,
                exam_type=exam_type,
                series=series,
                year=year,
                subject_type=subject_type,
                programme_ids=programme_ids_list,
                subject_id=subject_id,
                export_format=export_format,
                test_type=test_type,
                test_types=test_types_list,
                subject_ids=subject_ids_list,
            )
        except Exception as e:
            logger.error(f"Error generating export filename: {e}")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"candidate_results_export_{timestamp}.xlsx"

        excel_bytes = await generate_results_export(
            session=session,
            exam_id=exam_id,
            exam_type=exam_type,
            series=series,
            year=year,
            school_id=school_id,
            programme_ids=programme_ids_list,
            subject_id=subject_id,
            document_id=document_id,
            fields=fields_list,
            subject_type=subject_type,
            export_format=export_format,
            test_type=test_type,
            test_types=test_types_list,
            subject_ids=subject_ids_list,
        )
        return StreamingResponse(
            iter([excel_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": _excel_content_disposition(filename)},
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating export: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate export: {str(e)}",
        )


@router.post("/export", response_model=ResultsExportJobCreateResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_results_export_job(
    session: DBSessionDep,
    background_tasks: BackgroundTasks,
    exam_id: int = Query(..., description="Exam ID (required for background export)"),
    exam_type: ExamType | None = Query(None),
    series: ExamSeries | None = Query(None),
    year: int | None = Query(None, ge=1900, le=2100),
    school_id: int | None = Query(None),
    programme_id: int | None = Query(None),
    programme_ids: str | None = Query(None),
    subject_id: int | None = Query(None),
    document_id: str | None = Query(None),
    fields: str = Query(...),
    subject_type: SubjectType | None = Query(None),
    export_format: Literal["standard", "multi_subject"] = Query("standard"),
    test_type: Literal["obj", "essay"] | None = Query(None),
    test_types: str | None = Query(None),
    subject_ids: str | None = Query(None),
) -> ResultsExportJobCreateResponse:
    """Start a background results export job for large exam-wide downloads."""
    exam = (await session.execute(select(Exam).where(Exam.id == exam_id))).scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    fields_list = _parse_export_fields(fields)
    programme_ids_list = _parse_programme_ids(programme_id, programme_ids)
    test_types_list = _parse_test_types_param(test_type, test_types)
    subject_ids_list = _validate_export_filters(
        subject_type=subject_type,
        subject_id=subject_id,
        programme_ids_list=programme_ids_list,
        export_format=export_format,
        test_types_list=test_types_list,
        subject_ids=subject_ids,
    )
    filename = await generate_export_filename(
        session=session,
        exam_id=exam_id,
        exam_type=exam_type,
        series=series,
        year=year,
        subject_type=subject_type,
        programme_ids=programme_ids_list,
        subject_id=subject_id,
        export_format=export_format,
        test_type=test_type,
        test_types=test_types_list,
        subject_ids=subject_ids_list,
    )
    tracking = ProcessTracking(
        exam_id=exam_id,
        process_type=ProcessType.RESULTS_EXPORT,
        school_id=school_id,
        subject_id=subject_id,
        status=ProcessStatus.PENDING,
        process_metadata={
            "exam_id": exam_id,
            "exam_type": exam_type.value if exam_type else None,
            "series": series.value if series else None,
            "year": year,
            "school_id": school_id,
            "programme_ids": programme_ids_list,
            "subject_id": subject_id,
            "document_id": document_id,
            "fields": fields_list,
            "subject_type": subject_type.value if subject_type else None,
            "export_format": export_format,
            "test_type": test_type,
            "test_types": test_types_list,
            "subject_ids": subject_ids_list,
            "filename": filename,
            "message": "Queued",
        },
    )
    session.add(tracking)
    await session.commit()
    await session.refresh(tracking)
    background_tasks.add_task(process_results_export_job, tracking.id)
    return ResultsExportJobCreateResponse(job_id=tracking.id, status=tracking.status.value)


@router.get("/export/{job_id}", response_model=ResultsExportJobStatusResponse)
async def get_results_export_job(
    job_id: int,
    session: DBSessionDep,
) -> ResultsExportJobStatusResponse:
    tracking = (
        await session.execute(
            select(ProcessTracking).where(
                ProcessTracking.id == job_id,
                ProcessTracking.process_type == ProcessType.RESULTS_EXPORT,
            )
        )
    ).scalar_one_or_none()
    if not tracking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export job not found")
    metadata = tracking.process_metadata or {}
    return ResultsExportJobStatusResponse(
        job_id=tracking.id,
        exam_id=tracking.exam_id,
        status=tracking.status.value,
        filename=metadata.get("filename"),
        message=metadata.get("message"),
        error_message=tracking.error_message,
    )


@router.get("/export/{job_id}/file")
async def download_results_export_job_file(
    job_id: int,
    session: DBSessionDep,
) -> FileResponse:
    tracking = (
        await session.execute(
            select(ProcessTracking).where(
                ProcessTracking.id == job_id,
                ProcessTracking.process_type == ProcessType.RESULTS_EXPORT,
            )
        )
    ).scalar_one_or_none()
    if not tracking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export job not found")
    if tracking.status != ProcessStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Export is not ready yet",
        )
    metadata = tracking.process_metadata or {}
    file_path = metadata.get("file_path")
    filename = metadata.get("filename") or "candidate_results_export.xlsx"
    if not file_path or not Path(file_path).is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export file not found")
    return FileResponse(
        path=file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
        headers={"Content-Disposition": _excel_content_disposition(filename)},
    )


def _parse_validation_report_filters(
    *,
    subject_type: SubjectType | None,
    subject_ids: str | None,
    test_types: str | None,
    statuses: str | None,
) -> tuple[list[int] | None, list[int] | None, list[str] | None]:
    try:
        subject_ids_list = parse_subject_ids(subject_ids)
        test_types_list = parse_test_types(test_types)
        statuses_list = parse_statuses(statuses)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if subject_type is not None and subject_ids_list:
        # Allow both: subject_ids further narrow within type filter applied in query
        pass
    return subject_ids_list, test_types_list, statuses_list


def _validation_report_content_disposition(filename: str) -> str:
    encoded_filename = quote(filename, safe="")
    return f'attachment; filename="{filename}"; filename*=UTF-8\'\'{encoded_filename}'


@router.get("/validation-report/preview", response_model=ScoreValidationReportPreviewResponse)
async def preview_score_validation_report(
    session: DBSessionDep,
    _user: OfficerDep,
    exam_id: int = Query(..., description="Examination ID (required)"),
    school_id: int | None = Query(None),
    subject_type: SubjectType | None = Query(None),
    subject_ids: str | None = Query(None, description="Comma-separated subject IDs"),
    test_types: str | None = Query(None, description="Comma-separated papers: 1,2,3"),
    statuses: str | None = Query(
        None,
        description="Exactly one status: entered, missing, invalid, or absent. Default: missing",
    ),
    combine_p1_p2: bool = Query(
        False,
        description="When true with status=missing: one row per candidate×subject with Missing papers P1, P2, or P1/P2",
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> ScoreValidationReportPreviewResponse:
    """Paginated live preview of score validation report rows."""
    subject_ids_list, test_types_list, statuses_list = _parse_validation_report_filters(
        subject_type=subject_type,
        subject_ids=subject_ids,
        test_types=test_types,
        statuses=statuses,
    )
    exam = (await session.execute(select(Exam).where(Exam.id == exam_id))).scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    try:
        data = await build_score_validation_report(
            session,
            exam_id=exam_id,
            school_id=school_id,
            subject_type=subject_type,
            subject_ids=subject_ids_list,
            test_types=test_types_list,
            statuses=statuses_list,  # type: ignore[arg-type]
            combine_p1_p2=combine_p1_p2,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    return ScoreValidationReportPreviewResponse(**report_to_preview_dict(data, page=page, page_size=page_size))


@router.get("/validation-report")
async def download_score_validation_report(
    session: DBSessionDep,
    _user: OfficerDep,
    exam_id: int = Query(..., description="Examination ID (required)"),
    school_id: int | None = Query(None),
    subject_type: SubjectType | None = Query(None),
    subject_ids: str | None = Query(None),
    test_types: str | None = Query(None),
    statuses: str | None = Query(None),
    combine_p1_p2: bool = Query(False),
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    packaging: Literal["zip", "merged"] = Query(
        "zip",
        description="Multi-school delivery: zip (one file per school) or merged (single file)",
    ),
):
    """Synchronous score validation report download (small scopes)."""
    subject_ids_list, test_types_list, statuses_list = _parse_validation_report_filters(
        subject_type=subject_type,
        subject_ids=subject_ids,
        test_types=test_types,
        statuses=statuses,
    )
    try:
        file_bytes, filename, data = await generate_score_validation_report_bytes(
            session,
            exam_id=exam_id,
            school_id=school_id,
            subject_type=subject_type,
            subject_ids=subject_ids_list,
            test_types=test_types_list,
            statuses=statuses_list,  # type: ignore[arg-type]
            report_format=format,
            combine_p1_p2=combine_p1_p2,
            packaging=packaging,
        )
    except ValueError as e:
        detail = str(e)
        code = status.HTTP_404_NOT_FOUND if "not found" in detail.lower() or "no score rows" in detail.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=detail) from e

    if should_use_report_job(
        school_id=school_id,
        report_format=format,
        estimated_rows=data.meta.row_count,
    ):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Report is too large for synchronous download. Use POST /validation-report/jobs instead.",
        )

    media = (
        "application/zip"
        if filename.lower().endswith(".zip")
        else "application/pdf"
        if format == "pdf"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    return StreamingResponse(
        iter([file_bytes]),
        media_type=media,
        headers={"Content-Disposition": _validation_report_content_disposition(filename)},
    )


@router.post(
    "/validation-report/jobs",
    response_model=ScoreValidationReportJobCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_score_validation_report_job(
    session: DBSessionDep,
    background_tasks: BackgroundTasks,
    _user: OfficerDep,
    exam_id: int = Query(...),
    school_id: int | None = Query(None),
    subject_type: SubjectType | None = Query(None),
    subject_ids: str | None = Query(None),
    test_types: str | None = Query(None),
    statuses: str | None = Query(None),
    combine_p1_p2: bool = Query(False),
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    packaging: Literal["zip", "merged"] = Query(
        "zip",
        description="Multi-school delivery: zip or merged single file",
    ),
) -> ScoreValidationReportJobCreateResponse:
    """Start a background score validation report job for large scopes."""
    exam = (await session.execute(select(Exam).where(Exam.id == exam_id))).scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")

    subject_ids_list, test_types_list, statuses_list = _parse_validation_report_filters(
        subject_type=subject_type,
        subject_ids=subject_ids,
        test_types=test_types,
        statuses=statuses,
    )
    filename = await generate_report_filename(
        session,
        exam_id=exam_id,
        school_id=school_id,
        subject_type=subject_type,
        test_types=test_types_list,
        statuses=statuses_list,  # type: ignore[arg-type]
        report_format=format,
        combine_p1_p2=combine_p1_p2,
    )
    # Merged multi-school keeps the natural extension; zip packaging uses .zip later
    if school_id is None and packaging == "zip":
        filename = filename.rsplit(".", 1)[0] + ".zip"

    tracking = ProcessTracking(
        exam_id=exam_id,
        process_type=ProcessType.SCORE_VALIDATION_REPORT,
        school_id=school_id,
        status=ProcessStatus.PENDING,
        process_metadata={
            "exam_id": exam_id,
            "school_id": school_id,
            "subject_type": subject_type.value if subject_type else None,
            "subject_ids": subject_ids_list,
            "test_types": test_types_list if not combine_p1_p2 else [1, 2],
            "statuses": statuses_list,
            "combine_p1_p2": combine_p1_p2,
            "format": format,
            "packaging": packaging,
            "filename": filename,
            "message": "Queued",
        },
    )
    session.add(tracking)
    await session.commit()
    await session.refresh(tracking)
    background_tasks.add_task(process_score_validation_report_job, tracking.id)
    return ScoreValidationReportJobCreateResponse(job_id=tracking.id, status=tracking.status.value)


@router.get(
    "/validation-report/jobs/{job_id}",
    response_model=ScoreValidationReportJobStatusResponse,
)
async def get_score_validation_report_job(
    job_id: int,
    session: DBSessionDep,
    _user: OfficerDep,
) -> ScoreValidationReportJobStatusResponse:
    tracking = (
        await session.execute(
            select(ProcessTracking).where(
                ProcessTracking.id == job_id,
                ProcessTracking.process_type == ProcessType.SCORE_VALIDATION_REPORT,
            )
        )
    ).scalar_one_or_none()
    if not tracking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report job not found")
    metadata = tracking.process_metadata or {}
    return ScoreValidationReportJobStatusResponse(
        job_id=tracking.id,
        exam_id=tracking.exam_id,
        status=tracking.status.value,
        filename=metadata.get("filename"),
        message=metadata.get("message"),
        error_message=tracking.error_message,
        row_count=metadata.get("row_count"),
        stage=metadata.get("stage"),
        schools_done=metadata.get("schools_done"),
        schools_total=metadata.get("schools_total"),
        school_count=metadata.get("school_count"),
        is_zip=metadata.get("is_zip"),
    )


@router.get("/validation-report/jobs/{job_id}/file")
async def download_score_validation_report_job_file(
    job_id: int,
    session: DBSessionDep,
    _user: OfficerDep,
) -> FileResponse:
    tracking = (
        await session.execute(
            select(ProcessTracking).where(
                ProcessTracking.id == job_id,
                ProcessTracking.process_type == ProcessType.SCORE_VALIDATION_REPORT,
            )
        )
    ).scalar_one_or_none()
    if not tracking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report job not found")
    if tracking.status != ProcessStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Report is not ready yet",
        )
    metadata = tracking.process_metadata or {}
    file_path = metadata.get("file_path")
    filename = metadata.get("filename") or "score_validation_report.xlsx"
    report_format = metadata.get("format") or "xlsx"
    if not file_path or not Path(file_path).is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report file not found")
    media = (
        "application/zip"
        if str(filename).lower().endswith(".zip")
        else "application/pdf"
        if report_format == "pdf"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    return FileResponse(
        path=file_path,
        media_type=media,
        filename=filename,
        headers={"Content-Disposition": _validation_report_content_disposition(filename)},
    )


@router.get("/import/template")
async def download_score_import_template(
    session: DBSessionDep,
    _user: OfficerDep,
    # Use int (not Literal[1,2]): query strings are str and fail Literal int enum checks
    test_type: int = Query(..., ge=1, le=2, description="1 = Paper 1 (Objectives), 2 = Paper 2 (Essay)"),
    exam_id: int | None = Query(None, description="Optional examination ID (filename only)"),
) -> StreamingResponse:
    """Download format-only Excel template for score import (example rows, not prefilled)."""
    try:
        template_bytes, filename = await generate_score_import_template(
            session,
            test_type=test_type,  # type: ignore[arg-type]
            exam_id=exam_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        logger.error("Failed to generate score import template: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {e}",
        ) from e

    encoded = quote(filename, safe="")
    return StreamingResponse(
        iter([template_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"; filename*=UTF-8\'\'{encoded}'
        },
    )


@router.get("/import/template/missing")
async def download_missing_scores_import_template(
    session: DBSessionDep,
    _user: OfficerDep,
    exam_id: int = Query(..., description="Examination ID"),
    test_type: int = Query(..., ge=1, le=2, description="1 = Paper 1, 2 = Paper 2"),
    subject_id: int = Query(..., description="Subject ID (must be on the examination)"),
    school_id: int | None = Query(None, description="Optional school filter"),
) -> StreamingResponse:
    """Download prefilled template for candidates missing a score for subject + paper."""
    try:
        template_bytes, filename = await generate_missing_scores_import_template(
            session,
            exam_id=exam_id,
            test_type=test_type,  # type: ignore[arg-type]
            subject_id=subject_id,
            school_id=school_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        logger.error("Failed to generate missing scores template: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {e}",
        ) from e

    encoded = quote(filename, safe="")
    return StreamingResponse(
        iter([template_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"; filename*=UTF-8\'\'{encoded}'
        },
    )


@router.post("/import")
async def import_subject_scores(
    session: DBSessionDep,
    _user: OfficerDep,
    exam_id: int = Form(..., description="Examination ID"),
    # Use int (not Literal[1,2]): multipart form values are str and fail Literal int enum checks
    test_type: int = Form(..., ge=1, le=2, description="1 = Paper 1, 2 = Paper 2"),
    file: UploadFile = File(...),
    school_id: int | None = Form(None, description="Optional school scope for index lookup"),
    dry_run: bool = Form(False, description="Validate and match without writing scores"),
) -> ScoreImportResponse | ScoreImportJobCreateResponse:
    """Import CORE and ELECTIVE scores. Large files (>5k rows) run as a background job."""
    file_content = await file.read()
    if not file_content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")

    filename = file.filename or "scores.xlsx"
    checksum = file_checksum(file_content)

    exam = (await session.execute(select(Exam).where(Exam.id == exam_id))).scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")

    # Idempotent resume for non-dry-run uploads of the same file fingerprint
    if not dry_run:
        existing = await find_idempotent_score_import_job(
            session,
            exam_id=exam_id,
            test_type=test_type,
            school_id=school_id,
            checksum=checksum,
        )
        if existing is not None:
            meta = existing.process_metadata or {}
            total_rows = int(meta.get("total_rows") or 0)
            if existing.status == ProcessStatus.PENDING:
                start_score_import_job(existing.id)
            return JSONResponse(
                status_code=status.HTTP_202_ACCEPTED,
                content=ScoreImportJobCreateResponse(
                    job_id=existing.id,
                    status=existing.status.value,
                    total_rows=total_rows,
                    async_job=True,
                    dry_run=False,
                    resumed_existing=True,
                ).model_dump(),
            )

    try:
        df = parse_score_import_file(file_content, filename)
        df = normalize_score_import_columns(df)
        validate_score_import_columns(df)
    except (SubjectUploadParseError, ValueError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    total_rows = len(df)

    # Large files (or dry-run of large files): async job — pass preparsed only for sync path
    if total_rows > LARGE_IMPORT_ROW_THRESHOLD:
        file_path, _ = await storage_service.save(file_content, filename)
        tracking = ProcessTracking(
            exam_id=exam_id,
            school_id=school_id,
            process_type=ProcessType.SCORE_IMPORT,
            status=ProcessStatus.PENDING,
            process_metadata={
                "filename": filename,
                "file_path": file_path,
                "test_type": test_type,
                "school_id": school_id,
                "total_rows": total_rows,
                "processed_rows": 0,
                "successful": 0,
                "failed": 0,
                "skipped": 0,
                "updated": 0,
                "errors": [],
                "errors_truncated": False,
                "dry_run": dry_run,
                "file_checksum": checksum,
            },
        )
        session.add(tracking)
        await session.commit()
        await session.refresh(tracking)
        start_score_import_job(tracking.id)
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content=ScoreImportJobCreateResponse(
                job_id=tracking.id,
                status=tracking.status.value,
                total_rows=total_rows,
                async_job=True,
                dry_run=dry_run,
            ).model_dump(),
        )

    try:
        result = await import_scores(
            session,
            exam_id=exam_id,
            test_type=test_type,  # type: ignore[arg-type]
            file_content=file_content,
            filename=filename,
            school_id=school_id,
            enforce_row_limit=False,
            dry_run=dry_run,
            preparsed_df=df,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        logger.error("Score import failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to import scores: {e}",
        ) from e

    errors_file_available = False
    if result.all_errors:
        # Persist error artifact for sync imports so UI can download full list
        try:
            csv_bytes = build_errors_csv(result.all_errors)
            err_path, _ = await storage_service.save(
                csv_bytes,
                f"score_import_errors_sync_{exam_id}_{checksum[:12]}.csv",
            )
            errors_file_available = True
            # Stash path on a lightweight ProcessTracking row for download endpoint
            tracking = ProcessTracking(
                exam_id=exam_id,
                school_id=school_id,
                process_type=ProcessType.SCORE_IMPORT,
                status=ProcessStatus.COMPLETED,
                started_at=datetime.utcnow(),
                completed_at=datetime.utcnow(),
                process_metadata={
                    "filename": filename,
                    "test_type": test_type,
                    "school_id": school_id,
                    "total_rows": result.total_rows,
                    "processed_rows": result.total_rows,
                    "successful": result.successful,
                    "failed": result.failed,
                    "skipped": result.skipped,
                    "updated": result.updated,
                    "errors": [e.as_dict() for e in result.errors],
                    "errors_truncated": result.errors_truncated,
                    "errors_file_path": err_path,
                    "dry_run": dry_run,
                    "file_checksum": checksum,
                    "sync_import": True,
                },
            )
            session.add(tracking)
            await session.commit()
            await session.refresh(tracking)
            return ScoreImportResponse(
                successful=result.successful,
                failed=result.failed,
                skipped=result.skipped,
                updated=result.updated,
                errors=[ScoreImportErrorItem(**err.as_dict()) for err in result.errors],
                errors_truncated=result.errors_truncated,
                total_rows=result.total_rows,
                job_id=tracking.id,
                async_job=False,
                dry_run=dry_run,
                errors_file_available=True,
                file_checksum=checksum,
            )
        except Exception:
            logger.exception("Failed to persist sync import error artifact")

    return ScoreImportResponse(
        successful=result.successful,
        failed=result.failed,
        skipped=result.skipped,
        updated=result.updated,
        errors=[ScoreImportErrorItem(**err.as_dict()) for err in result.errors],
        errors_truncated=result.errors_truncated,
        total_rows=result.total_rows,
        async_job=False,
        dry_run=dry_run,
        errors_file_available=errors_file_available,
        file_checksum=checksum,
    )


@router.get("/import/jobs/{job_id}", response_model=ScoreImportJobStatusResponse)
async def get_score_import_job_status(
    job_id: int,
    session: DBSessionDep,
    _user: OfficerDep,
) -> ScoreImportJobStatusResponse:
    """Poll status/progress for an async score import job."""
    tracking = (
        await session.execute(
            select(ProcessTracking).where(
                ProcessTracking.id == job_id,
                ProcessTracking.process_type == ProcessType.SCORE_IMPORT,
            )
        )
    ).scalar_one_or_none()
    if not tracking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Score import job not found")

    metadata = tracking.process_metadata or {}
    errors_raw = metadata.get("errors") or []
    errors = [ScoreImportErrorItem.model_validate(err) for err in errors_raw]

    return ScoreImportJobStatusResponse(
        job_id=tracking.id,
        status=tracking.status.value,
        total_rows=int(metadata.get("total_rows") or 0),
        processed_rows=int(metadata.get("processed_rows") or 0),
        successful=int(metadata.get("successful") or 0),
        failed=int(metadata.get("failed") or 0),
        skipped=int(metadata.get("skipped") or 0),
        updated=int(metadata.get("updated") or 0),
        errors=errors,
        errors_truncated=bool(metadata.get("errors_truncated")),
        filename=metadata.get("filename"),
        error_message=tracking.error_message,
        started_at=tracking.started_at,
        completed_at=tracking.completed_at,
        dry_run=bool(metadata.get("dry_run")),
        errors_file_available=bool(metadata.get("errors_file_path")),
        file_checksum=metadata.get("file_checksum"),
        phase=metadata.get("phase"),
        apply_total=int(metadata.get("apply_total") or 0),
        apply_done=int(metadata.get("apply_done") or 0),
    )


@router.get("/import/jobs/{job_id}/errors")
async def download_score_import_job_errors(
    job_id: int,
    session: DBSessionDep,
    _user: OfficerDep,
) -> StreamingResponse:
    """Download full error CSV for a score import job (when truncated or any failures)."""
    tracking = (
        await session.execute(
            select(ProcessTracking).where(
                ProcessTracking.id == job_id,
                ProcessTracking.process_type == ProcessType.SCORE_IMPORT,
            )
        )
    ).scalar_one_or_none()
    if not tracking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Score import job not found")

    metadata = tracking.process_metadata or {}
    errors_file_path = metadata.get("errors_file_path")
    if not errors_file_path:
        # Fall back to inline errors if no artifact was stored
        errors_raw = metadata.get("errors") or []
        if not errors_raw:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No import errors available for this job",
            )
        from app.services.score_import_pipeline import ScoreImportRowError as _Err

        csv_bytes = build_errors_csv(
            [
                _Err(
                    row=int(e.get("row") or 0),
                    index_number=e.get("index_number"),
                    subject_code=e.get("subject_code"),
                    message=e.get("message") or "",
                )
                for e in errors_raw
            ]
        )
    else:
        try:
            csv_bytes = await storage_service.retrieve(errors_file_path)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Error artifact file not found",
            ) from exc

    filename = f"score_import_errors_job_{job_id}.csv"
    encoded = quote(filename, safe="")
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{encoded}"
        },
    )
