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
)
from app.schemas.document import DocumentListResponse, DocumentResponse
from app.schemas.score import (
    BatchScoreUpdate,
    BatchScoreUpdateResponse,
    CandidateScoreEntry,
    CandidateScoreListResponse,
    DocumentScoresResponse,
    ScoreResponse,
    ScoreUpdate,
)

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
            base_stmt = base_stmt.where(Exam.name == exam_type)
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
            count_stmt = count_stmt.where(Exam.name == exam_type)
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

    # Update raw scores
    if score_update.obj_raw_score is not None:
        subject_score.obj_raw_score = score_update.obj_raw_score
    if score_update.essay_raw_score is not None:
        subject_score.essay_raw_score = score_update.essay_raw_score
    if score_update.pract_raw_score is not None:
        subject_score.pract_raw_score = score_update.pract_raw_score

    # Note: Normalized scores and total_score would typically be calculated
    # by a service/utility function, but for now we'll leave them as-is
    # The backend should handle recalculation if needed

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
    # Note: document_id here refers to Document.extracted_id (string), not Document.id
    # We need to determine which document_id field to use based on the document's test_type
    # First, get the document to determine test_type
    doc_stmt = select(Document).where(Document.extracted_id == document_id)
    doc_result = await session.execute(doc_stmt)
    document = doc_result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Determine which document_id field to use based on test_type
    # test_type="1" -> obj_document_id, test_type="2" -> essay_document_id, test_type="3" -> pract_document_id
    test_type = document.test_type

    successful = 0
    failed = 0
    errors: list[dict[str, str]] = []

    for score_item in batch_update.scores:
        try:
            if score_item.score_id is not None:
                # Update existing score
                stmt = select(SubjectScore).where(SubjectScore.id == score_item.score_id)
                result = await session.execute(stmt)
                subject_score = result.scalar_one_or_none()
                if not subject_score:
                    failed += 1
                    errors.append({"score_id": str(score_item.score_id), "error": "Score not found"})
                    continue

                # Update fields
                if score_item.obj_raw_score is not None:
                    subject_score.obj_raw_score = score_item.obj_raw_score
                if score_item.essay_raw_score is not None:
                    subject_score.essay_raw_score = score_item.essay_raw_score
                if score_item.pract_raw_score is not None:
                    subject_score.pract_raw_score = score_item.pract_raw_score

                # Set appropriate document_id field based on test_type
                if test_type == "1":
                    subject_score.obj_document_id = document_id
                elif test_type == "2":
                    subject_score.essay_document_id = document_id
                elif test_type == "3":
                    subject_score.pract_document_id = document_id

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
                    if score_item.essay_raw_score is not None:
                        existing_score.essay_raw_score = score_item.essay_raw_score
                    if score_item.pract_raw_score is not None:
                        existing_score.pract_raw_score = score_item.pract_raw_score
                    # Set appropriate document_id field based on test_type
                    if test_type == "1":
                        existing_score.obj_document_id = document_id
                    elif test_type == "2":
                        existing_score.essay_document_id = document_id
                    elif test_type == "3":
                        existing_score.pract_document_id = document_id
                else:
                    # Create new score
                    subject_score = SubjectScore(
                        subject_registration_id=score_item.subject_registration_id,
                        obj_raw_score=score_item.obj_raw_score,
                        essay_raw_score=score_item.essay_raw_score,  # Can be None, numeric string, or "A"/"AA"
                        pract_raw_score=score_item.pract_raw_score,
                        obj_normalized=None,
                        essay_normalized=None,
                        pract_normalized=None,
                        total_score=0.0,
                        obj_document_id=document_id if test_type == "1" else None,
                        essay_document_id=document_id if test_type == "2" else None,
                        pract_document_id=document_id if test_type == "3" else None,
                    )
                    session.add(subject_score)

            successful += 1
        except Exception as e:
            failed += 1
            errors.append({"error": str(e)})

    await session.commit()

    return BatchScoreUpdateResponse(successful=successful, failed=failed, errors=errors)


@router.get("/candidates", response_model=CandidateScoreListResponse)
async def get_candidates_for_manual_entry(
    session: DBSessionDep,
    exam_id: int | None = Query(None),
    exam_type: ExamType | None = Query(None, description="Filter by examination type"),
    series: ExamSeries | None = Query(None, description="Filter by examination series"),
    year: int | None = Query(None, ge=1900, le=2100, description="Filter by examination year"),
    programme_id: int | None = Query(None),
    subject_id: int | None = Query(None),
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
            base_stmt = base_stmt.where(Exam.name == exam_type)
        if series is not None:
            base_stmt = base_stmt.where(Exam.series == series)
        if year is not None:
            base_stmt = base_stmt.where(Exam.year == year)
    if programme_id is not None:
        base_stmt = base_stmt.where(Candidate.programme_id == programme_id)
    if subject_id is not None:
        base_stmt = base_stmt.where(Subject.id == subject_id)

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
            count_base_stmt = count_base_stmt.where(Exam.name == exam_type)
        if series is not None:
            count_base_stmt = count_base_stmt.where(Exam.series == series)
        if year is not None:
            count_base_stmt = count_base_stmt.where(Exam.year == year)
    if programme_id is not None:
        count_base_stmt = count_base_stmt.where(Candidate.programme_id == programme_id)
    if subject_id is not None:
        count_base_stmt = count_base_stmt.where(Subject.id == subject_id)

    count_stmt = select(func.count()).select_from(count_base_stmt.subquery())
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get paginated results
    stmt = base_stmt.offset(offset).limit(page_size).order_by(Candidate.index_number)
    result = await session.execute(stmt)
    rows = result.all()

    items = []
    for candidate, subject_reg, subject_score, _exam_reg, exam, _exam_subject, subject, programme in rows:
        items.append(
            CandidateScoreEntry(
                candidate_id=candidate.id,
                candidate_name=candidate.name,
                candidate_index_number=candidate.index_number,
                subject_registration_id=subject_reg.id,
                subject_id=subject.id,
                subject_code=subject.code,
                subject_name=subject.name,
                exam_id=exam.id,
                exam_name=exam.name.value,
                exam_year=exam.year,
                exam_series=exam.series.value,
                programme_id=programme.id if programme else None,
                programme_code=programme.code if programme else None,
                programme_name=programme.name if programme else None,
                score_id=subject_score.id,
                obj_raw_score=subject_score.obj_raw_score,
                essay_raw_score=subject_score.essay_raw_score,
                pract_raw_score=subject_score.pract_raw_score,
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

            # Update existing score
            stmt = select(SubjectScore).where(SubjectScore.id == score_item.score_id)
            result = await session.execute(stmt)
            subject_score = result.scalar_one_or_none()

            if not subject_score:
                failed += 1
                errors.append({"score_id": str(score_item.score_id), "error": "Score not found"})
                continue

            # Update fields
            if score_item.obj_raw_score is not None:
                subject_score.obj_raw_score = score_item.obj_raw_score
            if score_item.essay_raw_score is not None:
                subject_score.essay_raw_score = score_item.essay_raw_score
            if score_item.pract_raw_score is not None:
                subject_score.pract_raw_score = score_item.pract_raw_score

            successful += 1
        except Exception as e:
            failed += 1
            errors.append({"error": str(e)})

    await session.commit()

    return BatchScoreUpdateResponse(successful=successful, failed=failed, errors=errors)
