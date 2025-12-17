from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.dependencies.database import DBSessionDep
from app.models import (
    Candidate,
    Document,
    ExamRegistration,
    ExamSubject,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
)
from app.schemas.document import DocumentListResponse, DocumentResponse
from app.schemas.score import (
    BatchScoreUpdate,
    BatchScoreUpdateItem,
    BatchScoreUpdateResponse,
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
    school_id: int | None = Query(None),
    subject_id: int | None = Query(None),
    test_type: str | None = Query(None, description="1 = Objectives, 2 = Essay"),
) -> DocumentListResponse:
    """Get documents filtered by exam, school, subject, and test_type."""
    offset = (page - 1) * page_size

    # Build base query with filters
    base_stmt = select(Document)
    if exam_id is not None:
        base_stmt = base_stmt.where(Document.exam_id == exam_id)
    if school_id is not None:
        base_stmt = base_stmt.where(Document.school_id == school_id)
    if subject_id is not None:
        base_stmt = base_stmt.where(Document.subject_id == subject_id)
    if test_type is not None:
        base_stmt = base_stmt.where(Document.test_type == test_type)

    # Get total count with same filters
    count_stmt = select(func.count(Document.id))
    if exam_id is not None:
        count_stmt = count_stmt.where(Document.exam_id == exam_id)
    if school_id is not None:
        count_stmt = count_stmt.where(Document.school_id == school_id)
    if subject_id is not None:
        count_stmt = count_stmt.where(Document.subject_id == subject_id)
    if test_type is not None:
        count_stmt = count_stmt.where(Document.test_type == test_type)

    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get documents with filters
    stmt = base_stmt.offset(offset).limit(page_size).order_by(Document.uploaded_at.desc())
    result = await session.execute(stmt)
    documents = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return DocumentListResponse(
        items=[DocumentResponse.model_validate(doc) for doc in documents],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/documents/{document_id}/scores", response_model=DocumentScoresResponse)
async def get_document_scores(document_id: str, session: DBSessionDep) -> DocumentScoresResponse:
    """Get all scores for a specific document."""
    # Get all scores with document_id matching, join with related tables
    # Note: document_id here refers to SubjectScore.document_id (string), not Document.id
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
        .where(SubjectScore.document_id == document_id)
        .order_by(Candidate.index_number)
    )

    result = await session.execute(stmt)
    rows = result.all()

    scores = []
    for subject_score, subject_reg, exam_reg, candidate, exam_subject, subject in rows:
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
                document_id=subject_score.document_id,
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
        document_id=subject_score.document_id,
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
    # Note: document_id here refers to SubjectScore.document_id (string), not Document.id

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

                # Ensure document_id is set (already a string)
                subject_score.document_id = document_id

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
                    existing_score.document_id = document_id  # Already a string
                else:
                    # Create new score
                    subject_score = SubjectScore(
                        subject_registration_id=score_item.subject_registration_id,
                        obj_raw_score=score_item.obj_raw_score,
                        essay_raw_score=score_item.essay_raw_score or 0.0,
                        pract_raw_score=score_item.pract_raw_score,
                        obj_normalized=None,
                        essay_normalized=None,
                        pract_normalized=None,
                        total_score=0.0,
                        document_id=document_id,  # Already a string
                    )
                    session.add(subject_score)

            successful += 1
        except Exception as e:
            failed += 1
            errors.append({"error": str(e)})

    await session.commit()

    return BatchScoreUpdateResponse(successful=successful, failed=failed, errors=errors)
