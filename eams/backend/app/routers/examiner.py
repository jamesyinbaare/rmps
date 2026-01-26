"""Examiner application endpoints for authenticated users."""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import (
    Examiner,
    ExaminerApplication,
    ExaminerApplicationDocument,
    ExaminerApplicationStatus,
    ExaminerDocumentType,
    ExaminerRecommendation,
)
from app.schemas.examiner import (
    ExaminerApplicationCreate,
    ExaminerApplicationDocumentResponse,
    ExaminerApplicationResponse,
    ExaminerApplicationUpdate,
    ExaminerRecommendationTokenRequest,
)
from app.services.examiner_email_service import send_recommendation_email
from app.services.examiner_service import generate_application_number, validate_application_completeness

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/examiner/applications", tags=["examiner"])


@router.post("", response_model=ExaminerApplicationResponse, status_code=status.HTTP_201_CREATED)
async def create_examiner_application(
    application_data: ExaminerApplicationCreate,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ExaminerApplicationResponse:
    """Create a new examiner application (draft)."""
    # Get or create examiner profile for user
    examiner_stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        # Create examiner profile
        examiner = Examiner(
            user_id=current_user.id,
            full_name=application_data.full_name,
            email_address=application_data.email_address or current_user.email,
        )
        session.add(examiner)
        await session.flush()

    # Check if user already has a submitted/under review/accepted application
    existing_submitted = (
        select(ExaminerApplication)
        .where(
            ExaminerApplication.examiner_id == examiner.id,
            ExaminerApplication.status.in_([
                ExaminerApplicationStatus.SUBMITTED,
                ExaminerApplicationStatus.UNDER_REVIEW,
                ExaminerApplicationStatus.ACCEPTED,
            ])
        )
    )
    result = await session.execute(existing_submitted)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can only submit one examiner application. You already have a submitted application.",
        )

    # Generate application number
    application_number = await generate_application_number(session)

    # Create application
    application = ExaminerApplication(
        examiner_id=examiner.id,
        application_number=application_number,
        status=ExaminerApplicationStatus.DRAFT,
        **application_data.model_dump(),
    )

    session.add(application)
    await session.commit()
    await session.refresh(application)

    return ExaminerApplicationResponse.model_validate(application)


@router.get("", response_model=list[ExaminerApplicationResponse])
async def list_examiner_applications(
    session: DBSessionDep,
    current_user: CurrentUserDep,
    status_filter: ExaminerApplicationStatus | None = Query(None, alias="status"),
) -> list[ExaminerApplicationResponse]:
    """List all examiner applications for the current user."""
    # Get examiner for user
    examiner_stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        return []

    stmt = select(ExaminerApplication).where(ExaminerApplication.examiner_id == examiner.id)

    if status_filter:
        stmt = stmt.where(ExaminerApplication.status == status_filter)

    stmt = stmt.order_by(ExaminerApplication.created_at.desc())
    result = await session.execute(stmt)
    applications = result.scalars().all()

    return [ExaminerApplicationResponse.model_validate(app) for app in applications]


@router.get("/{application_id}", response_model=ExaminerApplicationResponse)
async def get_examiner_application(
    application_id: UUID,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ExaminerApplicationResponse:
    """Get a specific examiner application."""
    # Get examiner for user
    examiner_stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner profile not found",
        )

    stmt = (
        select(ExaminerApplication)
        .where(
            ExaminerApplication.id == application_id,
            ExaminerApplication.examiner_id == examiner.id,
        )
    )

    result = await session.execute(stmt)
    application = result.scalar_one_or_none()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner application not found",
        )

    return ExaminerApplicationResponse.model_validate(application)


@router.put("/{application_id}", response_model=ExaminerApplicationResponse)
async def update_examiner_application(
    application_id: UUID,
    application_data: ExaminerApplicationUpdate,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ExaminerApplicationResponse:
    """Update an examiner application (only if in DRAFT status)."""
    # Get examiner for user
    examiner_stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner profile not found",
        )

    stmt = (
        select(ExaminerApplication)
        .where(
            ExaminerApplication.id == application_id,
            ExaminerApplication.examiner_id == examiner.id,
        )
    )

    result = await session.execute(stmt)
    application = result.scalar_one_or_none()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner application not found",
        )

    if application.status != ExaminerApplicationStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft applications can be updated",
        )

    # Update fields
    update_data = application_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(application, field, value)

    await session.commit()
    await session.refresh(application)

    return ExaminerApplicationResponse.model_validate(application)


@router.post("/{application_id}/submit", response_model=dict)
async def submit_examiner_application(
    application_id: UUID,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """Submit an examiner application (validates completeness)."""
    # Get examiner for user
    examiner_stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner profile not found",
        )

    stmt = (
        select(ExaminerApplication)
        .where(
            ExaminerApplication.id == application_id,
            ExaminerApplication.examiner_id == examiner.id,
        )
    )

    result = await session.execute(stmt)
    application = result.scalar_one_or_none()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner application not found",
        )

    if application.status != ExaminerApplicationStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft applications can be submitted",
        )

    # Validate completeness
    is_valid, errors = validate_application_completeness(application)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Application is incomplete", "errors": errors},
        )

    # Update status
    from datetime import datetime

    application.status = ExaminerApplicationStatus.SUBMITTED
    application.submitted_at = datetime.utcnow()

    await session.commit()

    return {
        "message": "Application submitted successfully",
        "application_id": str(application.id),
        "application_number": application.application_number,
    }


@router.post("/{application_id}/documents", response_model=ExaminerApplicationDocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_examiner_document(
    application_id: UUID,
    session: DBSessionDep,
    current_user: CurrentUserDep,
    document_type: ExaminerDocumentType = Form(...),
    file: UploadFile = File(...),
) -> ExaminerApplicationDocumentResponse:
    """Upload a document for an examiner application."""
    # Verify application exists and belongs to user
    examiner_stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner profile not found",
        )

    stmt = select(ExaminerApplication).where(
        ExaminerApplication.id == application_id,
        ExaminerApplication.examiner_id == examiner.id,
    )
    result = await session.execute(stmt)
    application = result.scalar_one_or_none()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner application not found",
        )

    if application.status != ExaminerApplicationStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Documents can only be uploaded for draft applications",
        )

    # Validate file type
    allowed_mime_types = ["image/jpeg", "image/png", "image/jpg", "application/pdf"]
    if file.content_type not in allowed_mime_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Allowed types: {', '.join(allowed_mime_types)}",
        )

    # Read file content
    content = await file.read()

    # Validate file size (10MB max)
    max_size = 10 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {max_size / (1024 * 1024)}MB",
        )

    # Save file to storage
    from app.services.storage.factory import get_storage_backend

    document_storage_backend = get_storage_backend(base_path=settings.examiner_document_storage_path)
    subdir = f"{application_id}/{document_type.value.lower()}"
    file_path, _ = await document_storage_backend.save(
        file_content=content,
        filename=file.filename or "unknown",
        subdir=subdir,
    )

    # Create document record
    document = ExaminerApplicationDocument(
        application_id=application.id,
        document_type=document_type,
        file_path=file_path,
        file_name=file.filename or "unknown",
        mime_type=file.content_type or "application/octet-stream",
        file_size=len(content),
    )

    session.add(document)
    await session.commit()
    await session.refresh(document)

    return ExaminerApplicationDocumentResponse.model_validate(document)


@router.post("/{application_id}/request-recommendation", response_model=dict)
async def request_recommendation(
    application_id: UUID,
    request_data: ExaminerRecommendationTokenRequest,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """Request a recommendation by sending email to recommender."""
    # Get examiner for user
    examiner_stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner profile not found",
        )

    # Verify application exists and belongs to user
    stmt = (
        select(ExaminerApplication)
        .where(
            ExaminerApplication.id == application_id,
            ExaminerApplication.examiner_id == examiner.id,
        )
    )
    result = await session.execute(stmt)
    application = result.scalar_one_or_none()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner application not found",
        )

    if application.status != ExaminerApplicationStatus.SUBMITTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recommendation can only be requested for submitted applications",
        )

    # Create or get recommendation record
    recommendation_stmt = select(ExaminerRecommendation).where(
        ExaminerRecommendation.application_id == application_id
    )
    recommendation_result = await session.execute(recommendation_stmt)
    recommendation = recommendation_result.scalar_one_or_none()

    if not recommendation:
        recommendation = ExaminerRecommendation(application_id=application.id)
        session.add(recommendation)
        await session.flush()

    # Send email
    success = await send_recommendation_email(
        session,
        recommendation,
        request_data.recommender_email,
        request_data.recommender_name,
        application.full_name,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send recommendation email",
        )

    await session.commit()

    return {
        "message": "Recommendation email sent successfully",
        "recommender_email": request_data.recommender_email,
        "token": recommendation.token,
    }
