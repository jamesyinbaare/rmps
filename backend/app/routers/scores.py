from datetime import datetime
import logging

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.dependencies.database import DBSessionDep
from app.models import (
    Candidate,
    Document,
    Exam,
    ExamRegistration,
    ExamSeries,
    ExamSubject,
    ExamType,
    Programme,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
    DataExtractionMethod,
    UnmatchedExtractionRecord,
    UnmatchedRecordStatus,
)
from app.schemas.document import DocumentListResponse, DocumentResponse
from app.schemas.score import (
    BatchScoreUpdate,
    BatchScoreUpdateResponse,
    CandidateScoreEntry,
    CandidateScoreListResponse,
    DocumentScoresResponse,
    ReductoDataResponse,
    ResolveUnmatchedRecordRequest,
    ScoreResponse,
    ScoreUpdate,
    UnmatchedExtractionRecordResponse,
    UnmatchedRecordsListResponse,
    UpdateScoresFromReductoResponse,
)
from app.utils.score_utils import add_extraction_method_to_document, parse_score_value

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/scores", tags=["scores"])


@router.get("/documents", response_model=DocumentListResponse)
async def get_filtered_documents(
    session: DBSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    exam_id: int | None = Query(None),
    exam_type: ExamType | None = Query(None, description="Filter by examination type"),
    series: ExamSeries | None = Query(None, description="Filter by examination series"),
    year: int | None = Query(None, ge=1900, le=2100, description="Filter by examination year"),
    school_id: int | None = Query(None),
    subject_id: int | None = Query(None),
    test_type: str | None = Query(None, description="1 = Objectives, 2 = Essay"),
    extraction_status: str | None = Query(None, description="Filter by extraction status: pending, queued, processing, success, error"),
    extraction_method: DataExtractionMethod | None = Query(None, description="Filter by extraction method in scores_extraction_methods array"),
) -> DocumentListResponse:
    """Get documents filtered by exam, school, subject, test_type, and extraction status."""
    offset = (page - 1) * page_size

    # Build base query with filters, join with School to get school name
    # Also join with Exam if filtering by exam_type, series, or year
    base_stmt = select(Document, School.name).outerjoin(School, Document.school_id == School.id)

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
    if subject_id is not None:
        base_stmt = base_stmt.where(Document.subject_id == subject_id)
    if test_type is not None:
        base_stmt = base_stmt.where(Document.test_type == test_type)
    if extraction_status is not None:
        base_stmt = base_stmt.where(Document.scores_extraction_status == extraction_status)
    if extraction_method is not None:
        # Filter by array contains operation - check if extraction_method is in the array
        # For PostgreSQL arrays, use the @> (contains) operator
        base_stmt = base_stmt.where(
            Document.scores_extraction_methods.isnot(None)
            & Document.scores_extraction_methods.op("@>")([extraction_method])
        )

    # Get total count with same filters
    count_stmt = select(func.count(Document.id)).select_from(Document)

    # Join with Exam table if filtering by exam_type, series, or year (and not using exam_id)
    if (exam_type is not None or series is not None or year is not None) and exam_id is None:
        count_stmt = count_stmt.join(Exam, Document.exam_id == Exam.id)

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
    if subject_id is not None:
        count_stmt = count_stmt.where(Document.subject_id == subject_id)
    if test_type is not None:
        count_stmt = count_stmt.where(Document.test_type == test_type)
    if extraction_status is not None:
        count_stmt = count_stmt.where(Document.scores_extraction_status == extraction_status)
    if extraction_method is not None:
        count_stmt = count_stmt.where(
            Document.scores_extraction_methods.isnot(None)
            & Document.scores_extraction_methods.op("@>")([extraction_method])
        )

    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get documents with filters
    stmt = base_stmt.offset(offset).limit(page_size).order_by(Document.uploaded_at.desc())
    result = await session.execute(stmt)
    rows = result.all()

    # Convert to DocumentResponse with school_name
    document_responses = []
    for document, school_name in rows:
        doc_dict = DocumentResponse.model_validate(document).model_dump()
        doc_dict["school_name"] = school_name
        document_responses.append(DocumentResponse(**doc_dict))

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return DocumentListResponse(
        items=document_responses,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/documents/{document_id}/scores", response_model=DocumentScoresResponse)
async def get_document_scores(document_id: str, session: DBSessionDep) -> DocumentScoresResponse:
    """Get all scores for a specific document."""
    # Get all scores with document_id matching, join with related tables
    # Note: document_id here refers to SubjectScore document_id fields (extracted_id string), not Document.id
    # Query by any of the three document_id fields (obj, essay, or pract)
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
        .where(
            or_(
                SubjectScore.obj_document_id == document_id,
                SubjectScore.essay_document_id == document_id,
                SubjectScore.pract_document_id == document_id,
            )
        )
        .order_by(Candidate.index_number)
    )

    result = await session.execute(stmt)
    rows = result.all()

    scores = []
    for subject_score, subject_reg, _exam_reg, candidate, _exam_subject, subject in rows:
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
            )
        )

    return DocumentScoresResponse(document_id=document_id, scores=scores)


@router.put("/scores/{score_id}", response_model=ScoreResponse)
async def update_score(score_id: int, score_update: ScoreUpdate, session: DBSessionDep) -> ScoreResponse:
    """Update individual score."""
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

    # Update raw scores and set extraction methods per field
    if score_update.obj_raw_score is not None:
        subject_score.obj_raw_score = score_update.obj_raw_score
        subject_score.obj_extraction_method = extraction_method
        # Update document's extraction methods array
        if subject_score.obj_document_id:
            doc_stmt = select(Document).where(Document.extracted_id == subject_score.obj_document_id)
            doc_result = await session.execute(doc_stmt)
            doc = doc_result.scalar_one_or_none()
            if doc:
                add_extraction_method_to_document(doc, extraction_method)
                documents_to_update_status.add(doc)

    if score_update.essay_raw_score is not None:
        subject_score.essay_raw_score = score_update.essay_raw_score
        subject_score.essay_extraction_method = extraction_method
        # Update document's extraction methods array
        if subject_score.essay_document_id:
            doc_stmt = select(Document).where(Document.extracted_id == subject_score.essay_document_id)
            doc_result = await session.execute(doc_stmt)
            doc = doc_result.scalar_one_or_none()
            if doc:
                add_extraction_method_to_document(doc, extraction_method)
                documents_to_update_status.add(doc)

    if score_update.pract_raw_score is not None:
        subject_score.pract_raw_score = score_update.pract_raw_score
        subject_score.pract_extraction_method = extraction_method
        # Update document's extraction methods array
        if subject_score.pract_document_id:
            doc_stmt = select(Document).where(Document.extracted_id == subject_score.pract_document_id)
            doc_result = await session.execute(doc_stmt)
            doc = doc_result.scalar_one_or_none()
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
    )


@router.post("/documents/{document_id}/scores/batch", response_model=BatchScoreUpdateResponse)
async def batch_update_scores(
    document_id: str, batch_update: BatchScoreUpdate, session: DBSessionDep
) -> BatchScoreUpdateResponse:
    """Batch update/create scores for a document."""
    # Note: document_id here refers to Document.extracted_id (string) or Document.id (numeric string)
    # We need to determine which document_id field to use based on the document's test_type
    # First, get the document to determine test_type
    # Try extracted_id first, then fall back to numeric ID if not found
    doc_stmt = select(Document).where(Document.extracted_id == document_id)
    doc_result = await session.execute(doc_stmt)
    document = doc_result.scalar_one_or_none()

    # If not found by extracted_id and document_id looks like a numeric ID, try by Document.id
    if not document and document_id.isdigit():
        doc_stmt = select(Document).where(Document.id == int(document_id))
        doc_result = await session.execute(doc_stmt)
        document = doc_result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

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
                # Update existing score
                stmt = (
                    select(SubjectScore, SubjectRegistration)
                    .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
                    .where(SubjectScore.id == score_item.score_id)
                )
                result = await session.execute(stmt)
                row = result.first()
                if not row:
                    failed += 1
                    errors.append({"score_id": str(score_item.score_id), "error": "Score not found"})
                    continue

                subject_score, subject_reg = row

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
                # Create new score
                # Verify subject_registration exists
                reg_stmt = select(SubjectRegistration).where(SubjectRegistration.id == score_item.subject_registration_id)
                reg_result = await session.execute(reg_stmt)
                subject_reg = reg_result.scalar_one_or_none()
                if not subject_reg:
                    failed += 1
                    errors.append(
                        {
                            "subject_registration_id": str(score_item.subject_registration_id),
                            "error": "Subject registration not found",
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


@router.get("/candidates", response_model=CandidateScoreListResponse)
async def get_candidates_for_manual_entry(
    session: DBSessionDep,
    exam_id: int | None = Query(None),
    exam_type: ExamType | None = Query(None, description="Filter by examination type"),
    series: ExamSeries | None = Query(None, description="Filter by examination series"),
    year: int | None = Query(None, ge=1900, le=2100, description="Filter by examination year"),
    school_id: int | None = Query(None, description="Filter by school ID"),
    programme_id: int | None = Query(None),
    subject_id: int | None = Query(None),
    document_id: str | None = Query(None, description="Filter by document ID (extracted_id) - matches obj_document_id, essay_document_id, or pract_document_id"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> CandidateScoreListResponse:
    """Get candidates with existing scores for manual entry, filtered by exam, programme, and subject."""
    offset = (page - 1) * page_size

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
    if programme_id is not None:
        base_stmt = base_stmt.where(Candidate.programme_id == programme_id)
    if subject_id is not None:
        base_stmt = base_stmt.where(Subject.id == subject_id)
    if document_id is not None:
        # Filter by document_id matching any of obj_document_id, essay_document_id, or pract_document_id
        base_stmt = base_stmt.where(
            or_(
                SubjectScore.obj_document_id == document_id,
                SubjectScore.essay_document_id == document_id,
                SubjectScore.pract_document_id == document_id,
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
    if programme_id is not None:
        count_base_stmt = count_base_stmt.where(Candidate.programme_id == programme_id)
    if subject_id is not None:
        count_base_stmt = count_base_stmt.where(Subject.id == subject_id)
    if document_id is not None:
        # Filter by document_id matching any of obj_document_id, essay_document_id, or pract_document_id
        count_base_stmt = count_base_stmt.where(
            or_(
                SubjectScore.obj_document_id == document_id,
                SubjectScore.essay_document_id == document_id,
                SubjectScore.pract_document_id == document_id,
            )
        )

    count_stmt = select(func.count()).select_from(count_base_stmt.subquery())
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get paginated results
    stmt = base_stmt.offset(offset).limit(page_size).order_by(Candidate.index_number)
    result = await session.execute(stmt)
    rows = result.all()

    items = []
    for candidate, subject_reg, subject_score, _exam_reg, exam, exam_subject, subject, programme in rows:
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

            # Track documents that need status updates
            documents_to_update_status: set[Document] = set()

            # Update fields and set extraction methods per field
            if score_item.obj_raw_score is not None:
                subject_score.obj_raw_score = score_item.obj_raw_score
                subject_score.obj_extraction_method = extraction_method
                # Update document's extraction methods array
                if subject_score.obj_document_id:
                    doc_stmt = select(Document).where(Document.extracted_id == subject_score.obj_document_id)
                    doc_result = await session.execute(doc_stmt)
                    doc = doc_result.scalar_one_or_none()
                    if doc:
                        add_extraction_method_to_document(doc, extraction_method)
                        documents_to_update_status.add(doc)

            if score_item.essay_raw_score is not None:
                subject_score.essay_raw_score = score_item.essay_raw_score
                subject_score.essay_extraction_method = extraction_method
                # Update document's extraction methods array
                if subject_score.essay_document_id:
                    doc_stmt = select(Document).where(Document.extracted_id == subject_score.essay_document_id)
                    doc_result = await session.execute(doc_stmt)
                    doc = doc_result.scalar_one_or_none()
                    if doc:
                        add_extraction_method_to_document(doc, extraction_method)
                        documents_to_update_status.add(doc)

            if score_item.pract_raw_score is not None:
                subject_score.pract_raw_score = score_item.pract_raw_score
                subject_score.pract_extraction_method = extraction_method
                # Update document's extraction methods array
                if subject_score.pract_document_id:
                    doc_stmt = select(Document).where(Document.extracted_id == subject_score.pract_document_id)
                    doc_result = await session.execute(doc_stmt)
                    doc = doc_result.scalar_one_or_none()
                    if doc:
                        add_extraction_method_to_document(doc, extraction_method)
                        documents_to_update_status.add(doc)

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


@router.get("/documents/{document_id}/reducto-data", response_model=ReductoDataResponse)
async def get_reducto_data(document_id: int, session: DBSessionDep) -> ReductoDataResponse:
    """Get reducto extraction data for a document."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if not document.scores_extraction_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No extraction data available for this document"
        )

    return ReductoDataResponse(
        data=document.scores_extraction_data,
        status=document.scores_extraction_status or "pending",
        confidence=document.scores_extraction_confidence,
        extracted_at=document.scores_extracted_at,
    )


@router.post("/documents/{document_id}/update-from-reducto", response_model=UpdateScoresFromReductoResponse)
async def update_scores_from_reducto(document_id: int, session: DBSessionDep) -> UpdateScoresFromReductoResponse:
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
    print(document)
    if not document.scores_extraction_data:
        logger.warning(f"No extraction data available for document_id={document_id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No extraction data available for this document"
        )

    extraction_data = document.scores_extraction_data
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
                candidate = {
                    "index_number": row.get("index_number"),
                    "candidate_name": row.get("candidate_name"),
                    "score": row.get("raw_score") or row.get("score"),
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
    unmatched_records = []
    errors: list[dict[str, str]] = []

    # Process each candidate from reducto data
    logger.info(f"Processing {len(candidates)} candidates from reducto data")
    for idx, candidate_data in enumerate(candidates):
        try:
            index_number = candidate_data.get("index_number")
            candidate_name = candidate_data.get("candidate_name")
            score_value = candidate_data.get("score")
            # Extract SN: try sn, serial_number, row_number, or fallback to array index + 1
            sn = candidate_data.get("sn") or candidate_data.get("serial_number") or candidate_data.get("row_number") or (idx + 1)
            # Ensure sn is an integer
            if not isinstance(sn, int):
                try:
                    sn = int(sn)
                except (ValueError, TypeError):
                    sn = idx + 1

            logger.debug(f"Processing candidate {idx+1}/{len(candidates)}: index_number={index_number}, name={candidate_name}, score={score_value}, sn={sn}")

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
                # No match found - create unmatched record
                logger.warning(f"No matching SubjectScore found for index_number={index_number}, exam_id={document.exam_id}, subject_id={document.subject_id}")
                unmatched_count += 1
                parsed_score = None
                try:
                    parsed_score = parse_score_value(score_value) if score_value is not None else None
                except ValueError as e:
                    logger.debug(f"Failed to parse score value '{score_value}' for index_number={index_number}: {e}")

                unmatched_record = UnmatchedExtractionRecord(
                    document_id=document.id,
                    index_number=index_number,
                    candidate_name=candidate_name,
                    score=parsed_score,
                    sn=sn,
                    raw_data=candidate_data,
                    status=UnmatchedRecordStatus.PENDING,
                    extraction_method=DataExtractionMethod.AUTOMATED_EXTRACTION,
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

            subject_score, candidate, _subject_reg, _exam_reg = row
            logger.debug(f"Found matching SubjectScore: id={subject_score.id}, candidate_id={candidate.id}, subject_registration_id={subject_score.subject_registration_id}")

            # Parse score value
            try:
                parsed_score = parse_score_value(score_value) if score_value is not None else None
                logger.debug(f"Parsed score: {score_value} -> {parsed_score}")
            except ValueError as e:
                logger.error(f"Invalid score format for index_number={index_number}, score={score_value}: {e}")
                errors.append({"index_number": index_number, "error": f"Invalid score format: {e}"})
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

        except Exception as e:
            logger.error(f"Error processing candidate {idx+1} (index_number={candidate_data.get('index_number', 'unknown')}): {e}", exc_info=True)
            errors.append({"index_number": candidate_data.get("index_number", "unknown"), "error": str(e)})

    # Update document extraction status
    if updated_count > 0:
        document.scores_extraction_status = "success"
        document.scores_extracted_at = datetime.utcnow()
        logger.info(f"Updated document extraction status to 'success' for document_id={document_id}")

    await session.commit()

    logger.info(
        f"Completed update_scores_from_reducto for document_id={document_id}: "
        f"updated={updated_count}, unmatched={unmatched_count}, errors={len(errors)}"
    )

    return UpdateScoresFromReductoResponse(
        updated_count=updated_count,
        unmatched_count=unmatched_count,
        unmatched_records=unmatched_records,
        errors=errors,
    )


@router.get("/unmatched-records", response_model=UnmatchedRecordsListResponse)
async def get_unmatched_records(
    session: DBSessionDep,
    document_id: int | None = Query(None),
    status: UnmatchedRecordStatus | None = Query(None),
    extraction_method: DataExtractionMethod | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
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
        items.append(
            UnmatchedExtractionRecordResponse(
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
                created_at=unmatched_record.created_at,
                updated_at=unmatched_record.updated_at,
                resolved_at=unmatched_record.resolved_at,
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
        created_at=unmatched_record.created_at,
        updated_at=unmatched_record.updated_at,
        resolved_at=unmatched_record.resolved_at,
    )


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

    # Validate score_field
    if request.score_field not in ("obj", "essay", "pract"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="score_field must be 'obj', 'essay', or 'pract'"
        )

    # Parse score value
    parsed_score = None
    if request.score_value is not None:
        try:
            parsed_score = parse_score_value(request.score_value)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid score format: {e}")

    # Get or create SubjectScore
    score_stmt = select(SubjectScore).where(SubjectScore.subject_registration_id == request.subject_registration_id)
    score_result = await session.execute(score_stmt)
    subject_score = score_result.scalar_one_or_none()

    document_identifier = document.extracted_id if document.extracted_id else str(document.id)

    if not subject_score:
        # Create new SubjectScore
        subject_score = SubjectScore(
            subject_registration_id=request.subject_registration_id,
            obj_raw_score=parsed_score if request.score_field == "obj" else None,
            essay_raw_score=parsed_score if request.score_field == "essay" else None,
            pract_raw_score=parsed_score if request.score_field == "pract" else None,
            obj_normalized=None,
            essay_normalized=None,
            pract_normalized=None,
            total_score=0.0,
            obj_document_id=document_identifier if request.score_field == "obj" else None,
            essay_document_id=document_identifier if request.score_field == "essay" else None,
            pract_document_id=document_identifier if request.score_field == "pract" else None,
            obj_extraction_method=DataExtractionMethod.AUTOMATED_EXTRACTION
            if request.score_field == "obj"
            else None,
            essay_extraction_method=DataExtractionMethod.AUTOMATED_EXTRACTION
            if request.score_field == "essay"
            else None,
            pract_extraction_method=DataExtractionMethod.AUTOMATED_EXTRACTION
            if request.score_field == "pract"
            else None,
        )
        session.add(subject_score)
    else:
        # Update existing SubjectScore
        if request.score_field == "obj":
            subject_score.obj_raw_score = parsed_score
            subject_score.obj_extraction_method = DataExtractionMethod.AUTOMATED_EXTRACTION
            subject_score.obj_document_id = document_identifier
        elif request.score_field == "essay":
            subject_score.essay_raw_score = parsed_score
            subject_score.essay_extraction_method = DataExtractionMethod.AUTOMATED_EXTRACTION
            subject_score.essay_document_id = document_identifier
        elif request.score_field == "pract":
            subject_score.pract_raw_score = parsed_score
            subject_score.pract_extraction_method = DataExtractionMethod.AUTOMATED_EXTRACTION
            subject_score.pract_document_id = document_identifier

    # Update document's extraction methods array
    add_extraction_method_to_document(document, DataExtractionMethod.AUTOMATED_EXTRACTION)

    # Mark unmatched record as resolved
    unmatched_record.status = UnmatchedRecordStatus.RESOLVED
    unmatched_record.resolved_at = datetime.utcnow()

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
