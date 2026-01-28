"""Examiner profile endpoints (GET /examiner/me, GET /examiner/subjects)."""
from fastapi import APIRouter, HTTPException, Query, status

from sqlalchemy import select

from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import Examiner, Subject, SubjectType
from app.schemas.examiner import ExaminerMeResponse
from app.schemas.subject import SubjectResponse, SubjectTypeOption

router = APIRouter(prefix="/api/v1/examiner", tags=["examiner"])

# Display labels for subject type enum (first dropdown)
SUBJECT_TYPE_LABELS: dict[SubjectType, str] = {
    SubjectType.ELECTIVE: "Elective",
    SubjectType.CORE: "Core",
    SubjectType.TECHNICAL_DRAWING_BUILDING_OPTION: "Technical Drawing [Building option]",
    SubjectType.TECHNICAL_DRAWING_MECHANICAL_OPTION: "Technical Drawing [Mechanical option]",
    SubjectType.PRACTICAL: "Practical",
}


@router.get("/subject-types", response_model=list[SubjectTypeOption])
async def list_subject_types() -> list[SubjectTypeOption]:
    """List subject type options for the first dropdown."""
    return [
        SubjectTypeOption(value=t.value, label=SUBJECT_TYPE_LABELS[t])
        for t in SubjectType
    ]


@router.get("/subjects", response_model=list[SubjectResponse])
async def list_subjects(
    session: DBSessionDep,
    current_user: CurrentUserDep,
    subject_type: SubjectType | None = Query(None, description="Filter by subject type"),
) -> list[SubjectResponse]:
    """List subjects, optionally filtered by type. For application subject dropdown."""
    stmt = select(Subject).order_by(Subject.name)
    if subject_type is not None:
        stmt = stmt.where(Subject.type == subject_type)
    result = await session.execute(stmt)
    subjects = result.scalars().all()
    return [SubjectResponse.model_validate(s) for s in subjects]


@router.get("/me", response_model=ExaminerMeResponse)
async def get_examiner_me(
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ExaminerMeResponse:
    """Get current user's examiner profile. 404 if no examiner (e.g. not yet started application)."""
    stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    result = await session.execute(stmt)
    examiner = result.scalar_one_or_none()
    if not examiner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner profile not found. Complete an application to create one.",
        )
    return ExaminerMeResponse(
        examiner_id=examiner.id,
        full_name=examiner.full_name,
        email_address=examiner.email_address,
    )
