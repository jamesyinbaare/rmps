"""API endpoints for managing grade ranges for ExamSubjects."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies.database import DBSessionDep
from app.models import ExamSubject
from app.schemas.grade import GradeRangesResponse, GradeRangesUpdate
from app.utils.score_utils import validate_grade_ranges

router = APIRouter(prefix="/api/v1/exam-subjects", tags=["grades"])


@router.put("/{exam_subject_id}/grade-ranges", response_model=GradeRangesResponse)
async def upsert_grade_ranges(
    exam_subject_id: int, grade_ranges_update: GradeRangesUpdate, session: DBSessionDep
) -> GradeRangesResponse:
    """
    Upsert grade ranges for an ExamSubject.

    Updates grade_ranges_json field if ExamSubject exists, creates if not.
    This is an upsert operation: update if grade_ranges_json exists, otherwise set it.
    """
    # Check exam_subject exists
    exam_subject_stmt = select(ExamSubject).where(ExamSubject.id == exam_subject_id)
    exam_subject_result = await session.execute(exam_subject_stmt)
    exam_subject = exam_subject_result.scalar_one_or_none()
    if not exam_subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ExamSubject not found")

    # Convert Pydantic models to dict format for JSON storage
    grade_ranges_json = [gr.model_dump() for gr in grade_ranges_update.grade_ranges]

    # Validate grade ranges
    is_valid, error_msg = validate_grade_ranges(grade_ranges_json)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid grade ranges: {error_msg}")

    # Update grade_ranges_json field (upsert: update if exists, set if null)
    exam_subject.grade_ranges_json = grade_ranges_json

    await session.commit()
    await session.refresh(exam_subject)

    return GradeRangesResponse(
        exam_subject_id=exam_subject.id,
        grade_ranges=exam_subject.grade_ranges_json,
    )


@router.get("/{exam_subject_id}/grade-ranges", response_model=GradeRangesResponse)
async def get_grade_ranges(exam_subject_id: int, session: DBSessionDep) -> GradeRangesResponse:
    """Get grade ranges for an ExamSubject."""
    # Check exam_subject exists
    exam_subject_stmt = select(ExamSubject).where(ExamSubject.id == exam_subject_id)
    exam_subject_result = await session.execute(exam_subject_stmt)
    exam_subject = exam_subject_result.scalar_one_or_none()
    if not exam_subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ExamSubject not found")

    return GradeRangesResponse(
        exam_subject_id=exam_subject.id,
        grade_ranges=exam_subject.grade_ranges_json,
    )
