"""Examiner profile endpoints (GET /examiner/me)."""
from fastapi import APIRouter, HTTPException, status

from sqlalchemy import select

from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import Examiner
from app.schemas.examiner import ExaminerMeResponse

router = APIRouter(prefix="/api/v1/examiner", tags=["examiner"])


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
