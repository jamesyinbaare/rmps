"""Public examiner recommendation endpoints (token-based, no auth required)."""
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.database import DBSessionDep
from app.models import ExaminerApplication, ExaminerRecommendation
from app.schemas.examiner import ExaminerRecommendationCreate, ExaminerRecommendationResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/public/examiner-recommendations", tags=["examiner-recommendation"])


@router.get("/{token}", response_model=ExaminerRecommendationResponse)
async def get_recommendation_by_token(
    token: str,
    session: DBSessionDep,
) -> ExaminerRecommendationResponse:
    """Get recommendation form by token (public endpoint)."""
    stmt = (
        select(ExaminerRecommendation)
        .where(ExaminerRecommendation.token == token)
        .options(selectinload(ExaminerRecommendation.application))
    )

    result = await session.execute(stmt)
    recommendation = result.scalar_one_or_none()

    if not recommendation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired recommendation token",
        )

    # Check if token has expired
    if recommendation.token_expires_at and recommendation.token_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Recommendation token has expired",
        )

    # Check if already completed
    if recommendation.completed_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recommendation has already been submitted",
        )

    data = ExaminerRecommendationResponse.model_validate(recommendation).model_dump()
    data["applicant_name"] = recommendation.application.full_name if recommendation.application else None
    return ExaminerRecommendationResponse(**data)


@router.post("/{token}", response_model=ExaminerRecommendationResponse)
async def submit_recommendation(
    token: str,
    recommendation_data: ExaminerRecommendationCreate,
    session: DBSessionDep,
) -> ExaminerRecommendationResponse:
    """Submit recommendation form by token (public endpoint)."""
    stmt = (
        select(ExaminerRecommendation)
        .where(ExaminerRecommendation.token == token)
        .options(selectinload(ExaminerRecommendation.application))
    )

    result = await session.execute(stmt)
    recommendation = result.scalar_one_or_none()

    if not recommendation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired recommendation token",
        )

    # Check if token has expired
    if recommendation.token_expires_at and recommendation.token_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Recommendation token has expired",
        )

    # Check if already completed
    if recommendation.completed_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recommendation has already been submitted",
        )

    # Update recommendation with submitted data
    recommendation.recommender_name = recommendation_data.recommender_name
    recommendation.recommender_status = recommendation_data.recommender_status
    recommendation.recommender_office_address = recommendation_data.recommender_office_address
    recommendation.recommender_phone = recommendation_data.recommender_phone
    recommendation.quality_ratings = recommendation_data.quality_ratings
    recommendation.integrity_assessment = recommendation_data.integrity_assessment
    recommendation.certification_statement = recommendation_data.certification_statement
    recommendation.recommendation_decision = recommendation_data.recommendation_decision
    recommendation.recommender_signature = recommendation_data.recommender_signature
    recommendation.recommender_date = recommendation_data.recommender_date
    recommendation.completed_at = datetime.utcnow()

    await session.commit()
    await session.refresh(recommendation, ["application"])

    data = ExaminerRecommendationResponse.model_validate(recommendation).model_dump()
    data["applicant_name"] = recommendation.application.full_name if recommendation.application else None
    return ExaminerRecommendationResponse(**data)
