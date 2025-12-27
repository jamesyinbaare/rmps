"""API endpoints for manual result processing."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select

from app.dependencies.database import DBSessionDep
from app.models import (
    ExamRegistration,
    ExamSubject,
    Subject,
    SubjectRegistration,
    SubjectScore,
)
from app.schemas.score import ScoreResponse
from app.services.result_processing import ResultProcessingError, ResultProcessingService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/results", tags=["results"])


class ProcessExamSubjectsRequest(BaseModel):
    exam_subject_ids: list[int]


@router.post("/process/exam-subjects", status_code=status.HTTP_200_OK)
async def process_exam_subjects(
    request: ProcessExamSubjectsRequest,
    session: DBSessionDep,
) -> dict[str, Any]:
    """
    Manually process all subject scores for selected exam subjects.

    Processes all subject registrations (and their scores) for the given exam subjects.
    """
    exam_subject_ids = request.exam_subject_ids
    if not exam_subject_ids:
        return {
            "message": "No exam subjects provided",
            "successful": 0,
            "failed": 0,
            "total": 0,
            "errors": [],
        }

    # Build query to get all scores for the selected exam subjects
    stmt = (
        select(SubjectScore, SubjectRegistration, ExamSubject)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .where(ExamSubject.id.in_(exam_subject_ids))
    )

    result = await session.execute(stmt)
    rows = result.all()

    if not rows:
        return {
            "message": "No scores found for the selected exam subjects",
            "successful": 0,
            "failed": 0,
            "total": 0,
            "errors": [],
        }

    successful = 0
    failed = 0
    errors: list[dict[str, Any]] = []

    for subject_score, subject_reg, exam_subject in rows:
        try:
            ResultProcessingService.process_subject_score(subject_score, exam_subject)
            successful += 1
        except ResultProcessingError as e:
            failed += 1
            errors.append(
                {
                    "score_id": subject_score.id,
                    "subject_registration_id": subject_reg.id,
                    "exam_subject_id": exam_subject.id,
                    "error": str(e),
                }
            )
        except Exception as e:
            failed += 1
            errors.append(
                {
                    "score_id": subject_score.id,
                    "subject_registration_id": subject_reg.id,
                    "exam_subject_id": exam_subject.id,
                    "error": f"Unexpected error: {str(e)}",
                }
            )

    await session.commit()

    return {
        "message": f"Processed {successful} out of {len(rows)} scores",
        "successful": successful,
        "failed": failed,
        "total": len(rows),
        "errors": errors,
    }


@router.post("/process/{score_id}", response_model=ScoreResponse, status_code=status.HTTP_200_OK)
async def process_score(score_id: int, session: DBSessionDep) -> ScoreResponse:
    """
    Manually process a single subject score by calculating normalized scores and final score.

    This endpoint triggers result processing for a specific SubjectScore record.
    """
    # Get score with related data
    stmt = (
        select(SubjectScore, SubjectRegistration, ExamRegistration, ExamSubject, Subject)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(SubjectScore.id == score_id)
    )

    result = await session.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Score not found")

    subject_score, subject_reg, exam_reg, exam_subject, subject = row

    # Process subject score using result processing service
    try:
        ResultProcessingService.process_subject_score(subject_score, exam_subject)
    except ResultProcessingError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing result: {str(e)}",
        )

    await session.commit()
    await session.refresh(subject_score)

    # Get candidate info for response
    candidate_stmt = select(ExamRegistration.candidate_id).where(ExamRegistration.id == exam_reg.id)
    candidate_result = await session.execute(candidate_stmt)
    candidate_id = candidate_result.scalar_one()

    from app.models import Candidate
    candidate_stmt = select(Candidate).where(Candidate.id == candidate_id)
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one()

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


@router.post("/process/batch", status_code=status.HTTP_200_OK)
async def process_scores_batch(
    session: DBSessionDep,
    score_ids: list[int] = Query(..., description="List of score IDs to process"),

) -> dict[str, Any]:
    """
    Manually process multiple subject scores in batch.

    Returns statistics about successful and failed processing operations.
    """
    successful = 0
    failed = 0
    errors: list[dict[str, Any]] = []

    for score_id in score_ids:
        try:
            # Get score with ExamSubject
            stmt = (
                select(SubjectScore, SubjectRegistration, ExamSubject)
                .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
                .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
                .where(SubjectScore.id == score_id)
            )

            result = await session.execute(stmt)
            row = result.first()
            if not row:
                failed += 1
                errors.append({"score_id": score_id, "error": "Score not found"})
                continue

            subject_score, subject_reg, exam_subject = row

            # Process subject score
            ResultProcessingService.process_subject_score(subject_score, exam_subject)
            successful += 1

        except ResultProcessingError as e:
            failed += 1
            errors.append({"score_id": score_id, "error": str(e)})
        except Exception as e:
            failed += 1
            errors.append({"score_id": score_id, "error": f"Unexpected error: {str(e)}"})

    await session.commit()

    return {
        "successful": successful,
        "failed": failed,
        "total": len(score_ids),
        "errors": errors,
    }


@router.post("/process/exam/{exam_id}", status_code=status.HTTP_200_OK)
async def process_exam_results(
    session: DBSessionDep,
    exam_id: int,
    school_id: int | None = Query(None, description="Filter by school ID"),
    subject_id: int | None = Query(None, description="Filter by subject ID"),

) -> dict[str, Any]:
    """
    Manually process all subject scores for an exam.

    Optionally filter by school_id and/or subject_id.
    """
    # Build query to get all scores for the exam
    stmt = (
        select(SubjectScore, SubjectRegistration, ExamSubject)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .where(ExamRegistration.exam_id == exam_id)
    )

    if school_id:
        from app.models import Candidate
        stmt = stmt.join(Candidate, ExamRegistration.candidate_id == Candidate.id).where(
            Candidate.school_id == school_id
        )

    if subject_id:
        stmt = stmt.where(ExamSubject.subject_id == subject_id)

    result = await session.execute(stmt)
    rows = result.all()

    if not rows:
        return {
            "message": "No scores found for the specified criteria",
            "successful": 0,
            "failed": 0,
            "total": 0,
            "errors": [],
        }

    successful = 0
    failed = 0
    errors: list[dict[str, Any]] = []

    for subject_score, subject_reg, exam_subject in rows:
        try:
            ResultProcessingService.process_subject_score(subject_score, exam_subject)
            successful += 1
        except ResultProcessingError as e:
            failed += 1
            errors.append(
                {
                    "score_id": subject_score.id,
                    "subject_registration_id": subject_reg.id,
                    "error": str(e),
                }
            )
        except Exception as e:
            failed += 1
            errors.append(
                {
                    "score_id": subject_score.id,
                    "subject_registration_id": subject_reg.id,
                    "error": f"Unexpected error: {str(e)}",
                }
            )

    await session.commit()

    return {
        "message": f"Processed {successful} out of {len(rows)} scores",
        "successful": successful,
        "failed": failed,
        "total": len(rows),
        "errors": errors,
    }


@router.post("/process/subject-registration/{subject_registration_id}", status_code=status.HTTP_200_OK)
async def process_subject_registration_result(
    subject_registration_id: int, session: DBSessionDep
) -> ScoreResponse:
    """
    Manually process the result for a specific subject registration.

    Creates a SubjectScore if it doesn't exist, then processes it.
    """
    # Get subject registration with ExamSubject
    stmt = (
        select(SubjectRegistration, ExamSubject, ExamRegistration)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .where(SubjectRegistration.id == subject_registration_id)
    )

    result = await session.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Subject registration not found"
        )

    subject_reg, exam_subject, exam_reg = row

    # Get or create SubjectScore
    score_stmt = select(SubjectScore).where(SubjectScore.subject_registration_id == subject_registration_id)
    score_result = await session.execute(score_stmt)
    subject_score = score_result.scalar_one_or_none()

    if not subject_score:
        # Create new SubjectScore with default values
        subject_score = SubjectScore(
            subject_registration_id=subject_registration_id,
            obj_raw_score=None,
            essay_raw_score=None,
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
        await session.flush()

    # Process subject score
    try:
        ResultProcessingService.process_subject_score(subject_score, exam_subject)
    except ResultProcessingError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing result: {str(e)}",
        )

    await session.commit()
    await session.refresh(subject_score)

    # Get candidate and subject info for response
    from app.models import Candidate
    candidate_stmt = select(Candidate).where(Candidate.id == exam_reg.candidate_id)
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one()

    subject_stmt = select(Subject).where(Subject.id == exam_subject.subject_id)
    subject_result = await session.execute(subject_stmt)
    subject = subject_result.scalar_one()

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
