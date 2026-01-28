"""Examiner application endpoints for authenticated users."""
import logging
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import (
    Examiner,
    ExaminerApplication,
    ExaminerApplicationDocument,
    ExaminerApplicationExaminingExperience,
    ExaminerApplicationQualification,
    ExaminerApplicationStatus,
    ExaminerApplicationTeachingExperience,
    ExaminerApplicationTrainingCourse,
    ExaminerApplicationWorkExperience,
    ExaminerDocumentType,
    ExaminerRecommendation,
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

    stmt = (
        select(ExaminerApplication)
        .where(ExaminerApplication.examiner_id == examiner.id)
        .options(
            selectinload(ExaminerApplication.qualifications),
            selectinload(ExaminerApplication.teaching_experiences),
            selectinload(ExaminerApplication.work_experiences),
            selectinload(ExaminerApplication.examining_experiences),
            selectinload(ExaminerApplication.training_courses),
            selectinload(ExaminerApplication.documents),
        )
    )

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
        .options(
            selectinload(ExaminerApplication.qualifications),
            selectinload(ExaminerApplication.teaching_experiences),
            selectinload(ExaminerApplication.work_experiences),
            selectinload(ExaminerApplication.examining_experiences),
            selectinload(ExaminerApplication.training_courses),
            selectinload(ExaminerApplication.documents),
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
        .options(
            selectinload(ExaminerApplication.qualifications),
            selectinload(ExaminerApplication.teaching_experiences),
            selectinload(ExaminerApplication.work_experiences),
            selectinload(ExaminerApplication.examining_experiences),
            selectinload(ExaminerApplication.training_courses),
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

    # Update fields (excluding nested relationships)
    # Get all data - use model_dump() without exclude_unset to ensure nested arrays are included
    # We'll filter out None values for non-nested fields manually
    raw_dump = application_data.model_dump()
    nested_fields = {"qualifications", "teaching_experiences", "work_experiences", "examining_experiences", "training_courses"}

    # Clean up additional_information if present to remove JSON artifacts
    if "additional_information" in raw_dump and raw_dump["additional_information"] is not None:
        import re
        cleaned = raw_dump["additional_information"]
        # Remove [Structured Data: ...] blocks
        cleaned = re.sub(r'\[Structured Data:.*?\]', '', cleaned, flags=re.DOTALL)
        # Remove JSON objects with empty arrays (various patterns)
        cleaned = re.sub(r'\{[^}]*"qualifications"\[[^\]]*\][^}]*\}', '', cleaned, flags=re.DOTALL)
        cleaned = re.sub(r'\{[^}]*"teaching_experiences"\[[^\]]*\][^}]*\}', '', cleaned, flags=re.DOTALL)
        cleaned = re.sub(r'\{[^}]*"work_experiences"\[[^\]]*\][^}]*\}', '', cleaned, flags=re.DOTALL)
        cleaned = re.sub(r'\{[^}]*"examining_experiences"\[[^\]]*\][^}]*\}', '', cleaned, flags=re.DOTALL)
        cleaned = re.sub(r'\{[^}]*"training_courses"\[[^\]]*\][^}]*\}', '', cleaned, flags=re.DOTALL)
        # Remove JSON objects with empty arrays (standard format)
        cleaned = re.sub(r'\{[^}]*"teaching_experiences"\s*:\s*\[\][^}]*\}', '', cleaned, flags=re.DOTALL)
        cleaned = re.sub(r'\{[^}]*"work_experiences"\s*:\s*\[\][^}]*\}', '', cleaned, flags=re.DOTALL)
        cleaned = re.sub(r'\{[^}]*"examining_experiences"\s*:\s*\[\][^}]*\}', '', cleaned, flags=re.DOTALL)
        cleaned = re.sub(r'\{[^}]*"training_courses"\s*:\s*\[\][^}]*\}', '', cleaned, flags=re.DOTALL)
        # Remove standalone JSON fragments starting with comma
        cleaned = re.sub(r',\s*"teaching_experiences"\s*:\s*\[\]', '', cleaned)
        cleaned = re.sub(r',\s*"work_experiences"\s*:\s*\[\]', '', cleaned)
        cleaned = re.sub(r',\s*"examining_experiences"\s*:\s*\[\]', '', cleaned)
        cleaned = re.sub(r',\s*"training_courses"\s*:\s*\[\]', '', cleaned)
        # Remove trailing closing braces and commas
        cleaned = re.sub(r',\s*\}', '}', cleaned)
        cleaned = re.sub(r'^\s*,\s*', '', cleaned)
        cleaned = re.sub(r',\s*$', '', cleaned)
        # Remove JSON objects with all empty arrays
        cleaned = re.sub(r'\{[^}]*"teaching_experiences"\s*:\s*\[\]\s*,\s*"work_experiences"\s*:\s*\[\]\s*,\s*"examining_experiences"\s*:\s*\[\]\s*,\s*"training_courses"\s*:\s*\[\][^}]*\}', '', cleaned, flags=re.DOTALL)
        cleaned = re.sub(r'\{\s*"teaching_experiences"\s*:\s*\[\]\s*,\s*"work_experiences"\s*:\s*\[\]\s*,\s*"examining_experiences"\s*:\s*\[\]\s*,\s*"training_courses"\s*:\s*\[\]\s*\}', '', cleaned, flags=re.DOTALL)
        # Remove multiple occurrences
        prev_length = 0
        while len(cleaned) != prev_length:
            prev_length = len(cleaned)
            cleaned = re.sub(r',\s*"teaching_experiences"\s*:\s*\[\]\s*,\s*"work_experiences"\s*:\s*\[\]\s*,\s*"examining_experiences"\s*:\s*\[\]\s*,\s*"training_courses"\s*:\s*\[\]', '', cleaned)
        cleaned = cleaned.strip()
        raw_dump["additional_information"] = cleaned if cleaned else None

    # Build update_data: include all non-None fields except nested ones (we handle those separately)
    update_data = {k: v for k, v in raw_dump.items() if k not in nested_fields and v is not None}

    # Always include nested arrays from raw_dump if they exist (even if None, we check for empty arrays)
    for nested_field in nested_fields:
        if nested_field in raw_dump:
            update_data[nested_field] = raw_dump[nested_field]

    logger.info(f"Update data keys: {list(update_data.keys())}")
    logger.info(f"Has qualifications: {'qualifications' in update_data}, count: {len(update_data.get('qualifications', [])) if 'qualifications' in update_data else 0}")
    for field, value in update_data.items():
        if field not in nested_fields:
            setattr(application, field, value)

    # Handle nested relationships
    if "qualifications" in update_data and update_data["qualifications"] is not None and len(update_data["qualifications"]) > 0:
        logger.info(f"Saving {len(update_data['qualifications'])} qualifications")
        # Delete existing qualifications
        await session.execute(
            delete(ExaminerApplicationQualification).where(
                ExaminerApplicationQualification.application_id == application.id
            )
        )
        # Create new qualifications
        for idx, qual_data in enumerate(update_data["qualifications"]):
            logger.info(f"Creating qualification {idx}: {qual_data.get('university_college', 'N/A')}")
            qualification = ExaminerApplicationQualification(
                application_id=application.id,
                university_college=qual_data["university_college"],
                degree_diploma=qual_data["degree_diploma"],
                class_of_degree=qual_data.get("class_of_degree"),
                major_subjects=qual_data.get("major_subjects"),
                date_of_award=qual_data.get("date_of_award"),
                order_index=idx,
            )
            session.add(qualification)

    if "teaching_experiences" in update_data and update_data["teaching_experiences"] is not None and len(update_data["teaching_experiences"]) > 0:
        logger.info(f"Saving {len(update_data['teaching_experiences'])} teaching experiences")
        # Delete existing teaching experiences
        await session.execute(
            delete(ExaminerApplicationTeachingExperience).where(
                ExaminerApplicationTeachingExperience.application_id == application.id
            )
        )
        # Create new teaching experiences
        for idx, exp_data in enumerate(update_data["teaching_experiences"]):
            logger.info(f"Creating teaching experience {idx}: {exp_data.get('institution_name', 'N/A')}")
            experience = ExaminerApplicationTeachingExperience(
                application_id=application.id,
                institution_name=exp_data["institution_name"],
                date_from=exp_data.get("date_from"),
                date_to=exp_data.get("date_to"),
                subject=exp_data.get("subject"),
                level=exp_data.get("level"),
                order_index=idx,
            )
            session.add(experience)

    if "work_experiences" in update_data and update_data["work_experiences"] is not None and len(update_data["work_experiences"]) > 0:
        logger.info(f"Saving {len(update_data['work_experiences'])} work experiences")
        # Delete existing work experiences
        await session.execute(
            delete(ExaminerApplicationWorkExperience).where(
                ExaminerApplicationWorkExperience.application_id == application.id
            )
        )
        # Create new work experiences
        for idx, exp_data in enumerate(update_data["work_experiences"]):
            logger.info(f"Creating work experience {idx}: {exp_data.get('occupation', 'N/A')}")
            experience = ExaminerApplicationWorkExperience(
                application_id=application.id,
                occupation=exp_data["occupation"],
                employer_name=exp_data["employer_name"],
                date_from=exp_data.get("date_from"),
                date_to=exp_data.get("date_to"),
                position_held=exp_data.get("position_held"),
                order_index=idx,
            )
            session.add(experience)

    if "examining_experiences" in update_data and update_data["examining_experiences"] is not None and len(update_data["examining_experiences"]) > 0:
        # Delete existing examining experiences
        await session.execute(
            delete(ExaminerApplicationExaminingExperience).where(
                ExaminerApplicationExaminingExperience.application_id == application.id
            )
        )
        # Create new examining experiences
        for idx, exp_data in enumerate(update_data["examining_experiences"]):
            experience = ExaminerApplicationExaminingExperience(
                application_id=application.id,
                examination_body=exp_data["examination_body"],
                subject=exp_data.get("subject"),
                level=exp_data.get("level"),
                status=exp_data.get("status"),
                date_from=exp_data.get("date_from"),
                date_to=exp_data.get("date_to"),
                order_index=idx,
            )
            session.add(experience)

    if "training_courses" in update_data and update_data["training_courses"] is not None and len(update_data["training_courses"]) > 0:
        # Delete existing training courses
        await session.execute(
            delete(ExaminerApplicationTrainingCourse).where(
                ExaminerApplicationTrainingCourse.application_id == application.id
            )
        )
        # Create new training courses
        for idx, course_data in enumerate(update_data["training_courses"]):
            course = ExaminerApplicationTrainingCourse(
                application_id=application.id,
                organizer=course_data["organizer"],
                course_name=course_data["course_name"],
                place=course_data.get("place"),
                date_from=course_data.get("date_from"),
                date_to=course_data.get("date_to"),
                reason_for_participation=course_data.get("reason_for_participation"),
                order_index=idx,
            )
            session.add(course)

    await session.commit()
    # Reload application with all relationships to ensure nested data is included in response
    # Save the ID before expiring the session
    application_id = application.id
    # Use expire_all to force reload, then query with relationships
    session.expire_all()
    stmt = (
        select(ExaminerApplication)
        .where(ExaminerApplication.id == application_id)
        .options(
            selectinload(ExaminerApplication.qualifications),
            selectinload(ExaminerApplication.teaching_experiences),
            selectinload(ExaminerApplication.work_experiences),
            selectinload(ExaminerApplication.examining_experiences),
            selectinload(ExaminerApplication.training_courses),
            selectinload(ExaminerApplication.documents),
        )
    )
    result = await session.execute(stmt)
    application = result.scalar_one()

    return ExaminerApplicationResponse.model_validate(application)


@router.get("/{application_id}/price")
async def get_application_price(
    application_id: UUID,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """Get application fee and payment status for an examiner application."""
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
            detail="Price is only available for draft applications",
        )
    fee = float(settings.examiner_application_fee)
    paid = application.payment_status == PaymentStatus.SUCCESS
    outstanding = 0.0 if paid else fee
    return {
        "application_fee": fee,
        "total": fee,
        "payment_required": not paid,
        "has_pricing": True,
        "total_paid_amount": fee if paid else 0.0,
        "outstanding_amount": outstanding,
        "payment_status": application.payment_status.name if application.payment_status else "PENDING",
    }


@router.post("/{application_id}/payment/initialize")
async def initialize_application_payment(
    application_id: UUID,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """Initialize payment for an examiner application. Mock: marks as paid for development."""
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
            detail="Payment only applies to draft applications",
        )
    if application.payment_status == PaymentStatus.SUCCESS:
        return {
            "message": "Payment already completed",
            "authorization_url": None,
            "payment_status": "SUCCESS",
        }
    # Mock payment: set SUCCESS. For production, integrate Paystack and return authorization_url.
    application.payment_status = PaymentStatus.SUCCESS
    await session.commit()
    return {
        "message": "Payment completed (mock)",
        "authorization_url": None,
        "payment_status": "SUCCESS",
    }


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

    # Payment gate: must pay before submit
    if application.payment_status != PaymentStatus.SUCCESS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment required before submission. Please complete payment first.",
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


@router.delete("/{application_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_examiner_document(
    application_id: UUID,
    document_id: UUID,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> None:
    """Delete a document from an examiner application."""
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
    from app.services.storage.factory import get_storage_backend

    document_storage_backend = get_storage_backend(base_path=settings.examiner_document_storage_path)
    try:
        await document_storage_backend.delete(document.file_path)
    except Exception as e:
        logger.warning(f"Failed to delete file {document.file_path}: {e}")

    # Delete document record
    await session.delete(document)
    await session.commit()


@router.get("/{application_id}/documents/{document_id}/download")
async def download_examiner_document(
    application_id: UUID,
    document_id: UUID,
    session: DBSessionDep,
    current_user: CurrentUserDep,
):
    """Download a document from an examiner application."""
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

    # Retrieve file from storage
    from app.services.storage.factory import get_storage_backend

    document_storage_backend = get_storage_backend(base_path=settings.examiner_document_storage_path)
    try:
        file_content = await document_storage_backend.retrieve(document.file_path)
        return StreamingResponse(
            iter([file_content]),
            media_type=document.mime_type,
            headers={"Content-Disposition": f'inline; filename="{document.file_name}"'},
        )
    except Exception as e:
        logger.error(f"Failed to retrieve document {document_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve document",
        )


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
