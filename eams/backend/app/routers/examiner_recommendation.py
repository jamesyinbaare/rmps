"""Public examiner recommendation endpoints (token-based, no auth required)."""
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies.database import DBSessionDep
from app.models import ExaminerApplication, ExaminerDocumentType, ExaminerRecommendation
from app.schemas.examiner import ExaminerRecommendationCreate, ExaminerRecommendationResponse
from app.services.storage.factory import get_storage_backend

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


@router.get("/{token}/applicant-photo")
async def get_applicant_photo(
    token: str,
    session: DBSessionDep,
):
    """Stream the applicant's photograph for the recommendation form (public, token-validated)."""
    stmt = (
        select(ExaminerRecommendation)
        .where(ExaminerRecommendation.token == token)
        .options(
            selectinload(ExaminerRecommendation.application).selectinload(ExaminerApplication.documents),
        )
    )
    result = await session.execute(stmt)
    recommendation = result.scalar_one_or_none()

    if not recommendation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired recommendation token",
        )
    if recommendation.token_expires_at and recommendation.token_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recommendation token has expired",
        )

    application = recommendation.application
    if not application or not application.documents:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Applicant photo not found")

    photo_doc = next(
        (d for d in application.documents if d.document_type == ExaminerDocumentType.PHOTOGRAPH),
        None,
    )
    if not photo_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Applicant photo not found")

    document_storage_backend = get_storage_backend(base_path=settings.examiner_document_storage_path)
    try:
        file_content = await document_storage_backend.retrieve(photo_doc.file_path)
        return StreamingResponse(
            iter([file_content]),
            media_type=photo_doc.mime_type,
            headers={"Content-Disposition": f'inline; filename="{photo_doc.file_name}"'},
        )
    except Exception as e:
        logger.error(f"Failed to retrieve applicant photo for recommendation token: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve photo",
        )


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
    recommendation.recommendation_decision = recommendation_data.recommendation_decision
    recommendation.recommender_signature = recommendation_data.recommender_signature
    recommendation.recommender_date = recommendation_data.recommender_date
    recommendation.completed_at = datetime.utcnow()

    await session.commit()
    await session.refresh(recommendation, ["application"])

    data = ExaminerRecommendationResponse.model_validate(recommendation).model_dump()
    data["applicant_name"] = recommendation.application.full_name if recommendation.application else None
    return ExaminerRecommendationResponse(**data)
