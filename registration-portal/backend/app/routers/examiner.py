"""Examiner application endpoints for authenticated users."""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import (
    ExaminerApplication,
    ExaminerApplicationDocument,
    ExaminerApplicationStatus,
    ExaminerDocumentType,
    ExaminerRecommendation,
    Invoice,
    PaymentStatus,
)
from app.schemas.examiner import (
    ExaminerApplicationCreate,
    ExaminerApplicationDocumentResponse,
    ExaminerApplicationResponse,
    ExaminerApplicationUpdate,
    ExaminerRecommendationTokenRequest,
)
from app.services.examiner_email_service import send_recommendation_email
from app.services.examiner_service import (
    create_application_invoice,
    generate_application_number,
    validate_application_completeness,
)
from app.services.storage.factory import get_storage_backend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/private/examiner-applications", tags=["examiner"])

# Create document storage backend instance
document_storage_backend = get_storage_backend(base_path="storage/examiner-applications")


@router.post("", response_model=ExaminerApplicationResponse, status_code=status.HTTP_201_CREATED)
async def create_examiner_application(
    application_data: ExaminerApplicationCreate,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ExaminerApplicationResponse:
    """Create a new examiner application (draft)."""
    # Check if user already has a submitted/under review/accepted application
    existing_submitted = (
        select(ExaminerApplication)
        .where(
            ExaminerApplication.applicant_id == current_user.id,
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
        applicant_id=current_user.id,
        application_number=application_number,
        status=ExaminerApplicationStatus.DRAFT,
        **application_data.model_dump(exclude={"qualifications", "teaching_experiences", "work_experiences", "examining_experiences", "training_courses", "subject_preferences"}),
    )

    session.add(application)
    await session.flush()

    # Add related entities
    for qual_data in application_data.qualifications:
        from app.models import ExaminerAcademicQualification
        qual = ExaminerAcademicQualification(application_id=application.id, **qual_data.model_dump())
        session.add(qual)

    for exp_data in application_data.teaching_experiences:
        from app.models import ExaminerTeachingExperience
        exp = ExaminerTeachingExperience(application_id=application.id, **exp_data.model_dump())
        session.add(exp)

    for exp_data in application_data.work_experiences:
        from app.models import ExaminerWorkExperience
        exp = ExaminerWorkExperience(application_id=application.id, **exp_data.model_dump())
        session.add(exp)

    for exp_data in application_data.examining_experiences:
        from app.models import ExaminerExaminingExperience
        exp = ExaminerExaminingExperience(application_id=application.id, **exp_data.model_dump())
        session.add(exp)

    for course_data in application_data.training_courses:
        from app.models import ExaminerTrainingCourse
        course = ExaminerTrainingCourse(application_id=application.id, **course_data.model_dump())
        session.add(course)

    for pref_data in application_data.subject_preferences:
        from app.models import ExaminerApplicationSubjectPreference
        pref = ExaminerApplicationSubjectPreference(application_id=application.id, **pref_data.model_dump())
        session.add(pref)

    await session.commit()
    await session.refresh(application, ["qualifications", "teaching_experiences", "work_experiences", "examining_experiences", "training_courses", "subject_preferences", "documents"])

    return ExaminerApplicationResponse.model_validate(application)


@router.get("", response_model=list[ExaminerApplicationResponse])
async def list_examiner_applications(
    session: DBSessionDep,
    current_user: CurrentUserDep,
    status_filter: ExaminerApplicationStatus | None = Query(None, alias="status"),
) -> list[ExaminerApplicationResponse]:
    """List all examiner applications for the current user."""
    stmt = select(ExaminerApplication).where(ExaminerApplication.applicant_id == current_user.id)

    if status_filter:
        stmt = stmt.where(ExaminerApplication.status == status_filter)

    stmt = stmt.order_by(ExaminerApplication.created_at.desc())
    stmt = stmt.options(
        selectinload(ExaminerApplication.qualifications),
        selectinload(ExaminerApplication.teaching_experiences),
        selectinload(ExaminerApplication.work_experiences),
        selectinload(ExaminerApplication.examining_experiences),
        selectinload(ExaminerApplication.training_courses),
        selectinload(ExaminerApplication.subject_preferences),
        selectinload(ExaminerApplication.documents),
    )

    result = await session.execute(stmt)
    applications = result.scalars().all()

    return [ExaminerApplicationResponse.model_validate(app) for app in applications]


@router.get("/{application_id}", response_model=ExaminerApplicationResponse)
async def get_examiner_application(
    application_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ExaminerApplicationResponse:
    """Get a specific examiner application."""
    stmt = (
        select(ExaminerApplication)
        .where(
            ExaminerApplication.id == application_id,
            ExaminerApplication.applicant_id == current_user.id,
        )
        .options(
            selectinload(ExaminerApplication.qualifications),
            selectinload(ExaminerApplication.teaching_experiences),
            selectinload(ExaminerApplication.work_experiences),
            selectinload(ExaminerApplication.examining_experiences),
            selectinload(ExaminerApplication.training_courses),
            selectinload(ExaminerApplication.subject_preferences),
            selectinload(ExaminerApplication.documents),
            selectinload(ExaminerApplication.recommendation),
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
    application_id: int,
    application_data: ExaminerApplicationUpdate,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ExaminerApplicationResponse:
    """Update an examiner application (only if in DRAFT status)."""
    stmt = (
        select(ExaminerApplication)
        .where(
            ExaminerApplication.id == application_id,
            ExaminerApplication.applicant_id == current_user.id,
        )
        .options(
            selectinload(ExaminerApplication.qualifications),
            selectinload(ExaminerApplication.teaching_experiences),
            selectinload(ExaminerApplication.work_experiences),
            selectinload(ExaminerApplication.examining_experiences),
            selectinload(ExaminerApplication.training_courses),
            selectinload(ExaminerApplication.subject_preferences),
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

    # Update basic fields
    update_data = application_data.model_dump(exclude_unset=True, exclude={"qualifications", "teaching_experiences", "work_experiences", "examining_experiences", "training_courses", "subject_preferences"})
    for field, value in update_data.items():
        setattr(application, field, value)

    # Update related entities if provided
    if application_data.qualifications is not None:
        # Delete existing and add new
        for qual in application.qualifications:
            await session.delete(qual)
        for qual_data in application_data.qualifications:
            from app.models import ExaminerAcademicQualification
            qual = ExaminerAcademicQualification(application_id=application.id, **qual_data.model_dump())
            session.add(qual)

    if application_data.teaching_experiences is not None:
        for exp in application.teaching_experiences:
            await session.delete(exp)
        for exp_data in application_data.teaching_experiences:
            from app.models import ExaminerTeachingExperience
            exp = ExaminerTeachingExperience(application_id=application.id, **exp_data.model_dump())
            session.add(exp)

    if application_data.work_experiences is not None:
        for exp in application.work_experiences:
            await session.delete(exp)
        for exp_data in application_data.work_experiences:
            from app.models import ExaminerWorkExperience
            exp = ExaminerWorkExperience(application_id=application.id, **exp_data.model_dump())
            session.add(exp)

    if application_data.examining_experiences is not None:
        for exp in application.examining_experiences:
            await session.delete(exp)
        for exp_data in application_data.examining_experiences:
            from app.models import ExaminerExaminingExperience
            exp = ExaminerExaminingExperience(application_id=application.id, **exp_data.model_dump())
            session.add(exp)

    if application_data.training_courses is not None:
        for course in application.training_courses:
            await session.delete(course)
        for course_data in application_data.training_courses:
            from app.models import ExaminerTrainingCourse
            course = ExaminerTrainingCourse(application_id=application.id, **course_data.model_dump())
            session.add(course)

    if application_data.subject_preferences is not None:
        for pref in application.subject_preferences:
            await session.delete(pref)
        for pref_data in application_data.subject_preferences:
            from app.models import ExaminerApplicationSubjectPreference
            pref = ExaminerApplicationSubjectPreference(application_id=application.id, **pref_data.model_dump())
            session.add(pref)

    await session.commit()
    await session.refresh(application, ["qualifications", "teaching_experiences", "work_experiences", "examining_experiences", "training_courses", "subject_preferences", "documents"])

    return ExaminerApplicationResponse.model_validate(application)


@router.post("/{application_id}/submit", response_model=dict)
async def submit_examiner_application(
    application_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """Submit an examiner application (validates and creates invoice for payment)."""
    stmt = (
        select(ExaminerApplication)
        .where(
            ExaminerApplication.id == application_id,
            ExaminerApplication.applicant_id == current_user.id,
        )
        .options(
            selectinload(ExaminerApplication.qualifications),
            selectinload(ExaminerApplication.documents),
            selectinload(ExaminerApplication.subject_preferences),
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

    # Create invoice
    invoice = await create_application_invoice(session, application)

    # Update status
    from datetime import datetime
    application.status = ExaminerApplicationStatus.SUBMITTED
    application.submitted_at = datetime.utcnow()

    await session.commit()

    # Initialize payment
    from app.services.payment_service import initialize_payment

    try:
        payment_result = await initialize_payment(
            session,
            invoice,
            invoice.amount,
            email=current_user.email,
            metadata={
                "type": "examiner_application",
                "application_id": application.id,
                "application_number": application.application_number,
            },
        )

        return {
            "message": "Application submitted successfully. Please complete payment to finalize submission.",
            "application_id": application.id,
            "application_number": application.application_number,
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "amount": float(invoice.amount),
            "payment_url": payment_result["authorization_url"],
            "payment_reference": payment_result["paystack_reference"],
        }
    except Exception as e:
        logger.error(f"Failed to initialize payment for application {application.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initialize payment: {str(e)}",
        )


@router.post("/{application_id}/documents", response_model=ExaminerApplicationDocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_examiner_document(
    application_id: int,
    document_type: ExaminerDocumentType = Form(...),
    file: UploadFile = File(...),
    session: DBSessionDep = None,
    current_user: CurrentUserDep = None,
) -> ExaminerApplicationDocumentResponse:
    """Upload a document for an examiner application."""
    # Verify application exists and belongs to user
    stmt = select(ExaminerApplication).where(
        ExaminerApplication.id == application_id,
        ExaminerApplication.applicant_id == current_user.id,
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

    # Save file
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


@router.delete("/{application_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_examiner_document(
    application_id: int,
    document_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> None:
    """Delete a document from an examiner application."""
    # Verify application exists and belongs to user
    stmt = select(ExaminerApplication).where(
        ExaminerApplication.id == application_id,
        ExaminerApplication.applicant_id == current_user.id,
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
            detail="Documents can only be deleted from draft applications",
        )

    # Get document
    doc_stmt = select(ExaminerApplicationDocument).where(
        ExaminerApplicationDocument.id == document_id,
        ExaminerApplicationDocument.application_id == application_id,
    )
    doc_result = await session.execute(doc_stmt)
    document = doc_result.scalar_one_or_none()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Delete file from storage
    try:
        await document_storage_backend.delete(document.file_path)
    except Exception as e:
        logger.warning(f"Failed to delete file {document.file_path}: {e}")

    # Delete document record
    await session.delete(document)
    await session.commit()


@router.post("/{application_id}/request-recommendation", response_model=dict)
async def request_recommendation(
    application_id: int,
    request_data: ExaminerRecommendationTokenRequest,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """Request a recommendation by sending email to recommender."""
    # Verify application exists and belongs to user
    stmt = (
        select(ExaminerApplication)
        .where(
            ExaminerApplication.id == application_id,
            ExaminerApplication.applicant_id == current_user.id,
        )
        .options(selectinload(ExaminerApplication.recommendation))
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
    if application.recommendation:
        recommendation = application.recommendation
    else:
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
