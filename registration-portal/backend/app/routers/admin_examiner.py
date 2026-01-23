"""Admin endpoints for examiner application processing (Section C)."""
import logging
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload

from app.dependencies.auth import AdminDep, CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import (
    ExaminerApplication,
    ExaminerApplicationDocument,
    ExaminerApplicationProcessing,
    ExaminerApplicationStatus,
    PortalUser,
)
from app.schemas.examiner import (
    ExaminerApplicationProcessingCreate,
    ExaminerApplicationProcessingResponse,
    ExaminerApplicationResponse,
)
from app.services.storage.factory import get_storage_backend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/examiner-applications", tags=["admin-examiner"])

# Create document storage backend instance
document_storage_backend = get_storage_backend(base_path="storage/examiner-applications")


@router.get("", response_model=list[ExaminerApplicationResponse])
async def list_admin_examiner_applications(
    session: DBSessionDep,
    current_user: AdminDep,
    status_filter: ExaminerApplicationStatus | None = Query(None, alias="status"),
    search: str | None = Query(None, description="Search by application number or applicant name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
) -> list[ExaminerApplicationResponse]:
    """List all examiner applications (admin view with filters)."""
    stmt = select(ExaminerApplication)

    # Apply status filter
    if status_filter:
        stmt = stmt.where(ExaminerApplication.status == status_filter)

    # Apply search filter
    if search:
        search_pattern = f"%{search}%"
        stmt = stmt.join(PortalUser, ExaminerApplication.applicant_id == PortalUser.id).where(
            or_(
                ExaminerApplication.application_number.ilike(search_pattern),
                PortalUser.full_name.ilike(search_pattern),
                PortalUser.email.ilike(search_pattern),
            )
        )

    # Order by created date (newest first)
    stmt = stmt.order_by(ExaminerApplication.created_at.desc())

    # Pagination
    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)

    # Load relationships
    stmt = stmt.options(
        selectinload(ExaminerApplication.applicant),
        selectinload(ExaminerApplication.qualifications),
        selectinload(ExaminerApplication.teaching_experiences),
        selectinload(ExaminerApplication.work_experiences),
        selectinload(ExaminerApplication.examining_experiences),
        selectinload(ExaminerApplication.training_courses),
        selectinload(ExaminerApplication.subject_preferences),
        selectinload(ExaminerApplication.documents),
        selectinload(ExaminerApplication.recommendation),
        selectinload(ExaminerApplication.processing),
    )

    result = await session.execute(stmt)
    applications = result.scalars().all()

    return [ExaminerApplicationResponse.model_validate(app) for app in applications]


@router.get("/{application_id}", response_model=ExaminerApplicationResponse)
async def get_admin_examiner_application(
    application_id: int,
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminerApplicationResponse:
    """Get a specific examiner application for processing (admin view)."""
    stmt = (
        select(ExaminerApplication)
        .where(ExaminerApplication.id == application_id)
        .options(
            selectinload(ExaminerApplication.applicant),
            selectinload(ExaminerApplication.qualifications),
            selectinload(ExaminerApplication.teaching_experiences),
            selectinload(ExaminerApplication.work_experiences),
            selectinload(ExaminerApplication.examining_experiences),
            selectinload(ExaminerApplication.training_courses),
            selectinload(ExaminerApplication.subject_preferences),
            selectinload(ExaminerApplication.documents),
            selectinload(ExaminerApplication.recommendation),
            selectinload(ExaminerApplication.processing),
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


@router.post("/{application_id}/process", response_model=ExaminerApplicationProcessingResponse)
async def process_examiner_application(
    application_id: int,
    processing_data: ExaminerApplicationProcessingCreate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminerApplicationProcessingResponse:
    """Update Section C processing information."""
    # Get application
    stmt = select(ExaminerApplication).where(ExaminerApplication.id == application_id)
    result = await session.execute(stmt)
    application = result.scalar_one_or_none()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner application not found",
        )

    # Get or create processing record
    if application.processing:
        processing = application.processing
    else:
        processing = ExaminerApplicationProcessing(application_id=application.id)
        session.add(processing)
        await session.flush()

    # Auto-populate fields if not already set
    if not processing.checked_by_user_id:
        processing.checked_by_user_id = current_user.id

    if not processing.received_date and application.submitted_at:
        # Convert datetime to date (handles both timezone-aware and naive datetimes)
        if isinstance(application.submitted_at, datetime):
            processing.received_date = application.submitted_at.date()
        elif isinstance(application.submitted_at, date):
            processing.received_date = application.submitted_at

    # Auto-populate certificates_checked_by_user_id and certificates_checked_date when certificate_types are provided
    if processing_data.certificate_types and not processing.certificates_checked_by_user_id:
        processing.certificates_checked_by_user_id = current_user.id
        # Auto-populate checked_date if not already set
        if not processing.certificates_checked_date:
            processing.certificates_checked_date = date.today()

    # Update processing fields
    # Filter out any fields that don't exist on the model (e.g., removed fields)
    update_data = processing_data.model_dump(exclude_unset=True)
    valid_fields = {
        'checked_by_user_id', 'received_date', 'certificate_types',
        'certificates_checked_by_user_id', 'certificates_checked_date',
        'accepted_first_invitation_date', 'accepted_subject', 'accepted_officer_user_id',
        'accepted_date', 'rejected_reasons', 'rejected_officer_user_id', 'rejected_date'
    }
    for field, value in update_data.items():
        if field in valid_fields:
            setattr(processing, field, value)

    await session.commit()
    await session.refresh(processing)

    return ExaminerApplicationProcessingResponse.model_validate(processing)


@router.post("/{application_id}/accept", response_model=ExaminerApplicationResponse)
async def accept_examiner_application(
    application_id: int,
    processing_data: ExaminerApplicationProcessingCreate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminerApplicationResponse:
    """Accept an examiner application (updates status and Section C)."""
    # Get application
    stmt = (
        select(ExaminerApplication)
        .where(ExaminerApplication.id == application_id)
        .options(selectinload(ExaminerApplication.processing))
    )
    result = await session.execute(stmt)
    application = result.scalar_one_or_none()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner application not found",
        )

    if application.status == ExaminerApplicationStatus.ACCEPTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Application has already been accepted",
        )

    # Get or create processing record
    if application.processing:
        processing = application.processing
    else:
        processing = ExaminerApplicationProcessing(application_id=application.id)
        session.add(processing)
        await session.flush()

    # Update processing with acceptance data
    if processing_data.accepted_first_invitation_date:
        processing.accepted_first_invitation_date = processing_data.accepted_first_invitation_date
    if processing_data.accepted_subject:
        processing.accepted_subject = processing_data.accepted_subject
    processing.accepted_date = date.today()
    processing.accepted_officer_user_id = current_user.id

    # Update application status
    application.status = ExaminerApplicationStatus.ACCEPTED

    await session.commit()
    await session.refresh(application, ["processing"])

    return ExaminerApplicationResponse.model_validate(application)


@router.post("/{application_id}/reject", response_model=ExaminerApplicationResponse)
async def reject_examiner_application(
    application_id: int,
    processing_data: ExaminerApplicationProcessingCreate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminerApplicationResponse:
    """Reject an examiner application (updates status and Section C)."""
    # Get application
    stmt = (
        select(ExaminerApplication)
        .where(ExaminerApplication.id == application_id)
        .options(selectinload(ExaminerApplication.processing))
    )
    result = await session.execute(stmt)
    application = result.scalar_one_or_none()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner application not found",
        )

    if application.status == ExaminerApplicationStatus.REJECTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Application has already been rejected",
        )

    if not processing_data.rejected_reasons:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rejection reasons are required",
        )

    # Get or create processing record
    if application.processing:
        processing = application.processing
    else:
        processing = ExaminerApplicationProcessing(application_id=application.id)
        session.add(processing)
        await session.flush()

    # Update processing with rejection data
    processing.rejected_reasons = processing_data.rejected_reasons
    processing.rejected_date = date.today()
    processing.rejected_officer_user_id = current_user.id

    # Update application status
    application.status = ExaminerApplicationStatus.REJECTED

    await session.commit()
    await session.refresh(application, ["processing"])

    return ExaminerApplicationResponse.model_validate(application)


@router.get("/{application_id}/documents/{document_id}/download")
async def download_examiner_document(
    application_id: int,
    document_id: int,
    session: DBSessionDep,
    current_user: AdminDep,
) -> StreamingResponse:
    """Download a document from an examiner application (admin access)."""
    # Verify application exists
    stmt = select(ExaminerApplication).where(ExaminerApplication.id == application_id)
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
        logger.warning(f"Document {document_id} not found for application {application_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    logger.info(f"Retrieving document {document_id}: file_path={document.file_path}, mime_type={document.mime_type}")

    try:
        # Check if file exists first
        if not await document_storage_backend.exists(document.file_path):
            logger.error(f"Document file not found in storage: {document.file_path} for document {document_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document file not found in storage: {document.file_path}",
            )

        # Retrieve file from storage
        file_content = await document_storage_backend.retrieve(document.file_path)

        # Determine media type
        media_type = document.mime_type or "application/octet-stream"

        # For images and PDFs, use inline disposition for viewing; others use attachment
        disposition = "inline" if (media_type.startswith("image/") or media_type == "application/pdf") else "attachment"

        # Return file as streaming response
        return StreamingResponse(
            iter([file_content]),
            media_type=media_type,
            headers={
                "Content-Disposition": f'{disposition}; filename="{document.file_name}"',
            },
        )
    except HTTPException:
        raise
    except FileNotFoundError as e:
        logger.error(f"FileNotFoundError retrieving document {document_id}: {e}, file_path: {document.file_path}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document file not found: {document.file_path}",
        )
    except Exception as e:
        logger.error(f"Error retrieving document {document_id}: {e}, file_path: {document.file_path}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve document: {str(e)}",
        )
