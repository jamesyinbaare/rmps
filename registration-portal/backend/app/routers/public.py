"""Public endpoints (no authentication required)."""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime

from app.dependencies.database import DBSessionDep
from app.models import RegistrationExam, ExamRegistrationPeriod
from app.schemas.registration import RegistrationExamResponse

router = APIRouter(prefix="/api/v1/public", tags=["public"])


@router.get("/exams/available", response_model=list[RegistrationExamResponse])
async def list_available_exams(session: DBSessionDep) -> list[RegistrationExamResponse]:
    """List exams currently accepting registrations (public endpoint)."""
    now = datetime.utcnow()

    # Query exams with active registration periods
    stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .where(
            ExamRegistrationPeriod.is_active == True,
            ExamRegistrationPeriod.registration_start_date <= now,
            ExamRegistrationPeriod.registration_end_date >= now,
        )
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exams = result.scalars().all()

    return [RegistrationExamResponse.model_validate(exam) for exam in exams]
