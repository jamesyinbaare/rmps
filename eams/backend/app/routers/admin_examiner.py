"""Admin endpoints for examiner application processing."""
import logging
from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select, or_
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies.auth import AdminDep
from app.dependencies.database import DBSessionDep
from app.models import (
    Examiner,
    ExaminerApplication,
    ExaminerApplicationDocument,
    ExaminerApplicationProcessing,
    ExaminerApplicationQualification,
    ExaminerApplicationStatus,
    ExaminerQualification,
    ExaminerSubjectEligibility,
)
from app.schemas.examiner import (
    ExaminerApplicationResponse,
    ExaminerRecommendationResponse,
    ExaminerRecommendationStatus,
)
from app.services.storage.factory import get_storage_backend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/applications", tags=["admin-examiner"])

# Eager-load these to avoid lazy-load greenlet errors when building ExaminerApplicationResponse
_APPLICATION_LOAD_OPTIONS = (
    selectinload(ExaminerApplication.qualifications),
    selectinload(ExaminerApplication.teaching_experiences),
    selectinload(ExaminerApplication.work_experiences),
    selectinload(ExaminerApplication.examining_experiences),
    selectinload(ExaminerApplication.training_courses),
    selectinload(ExaminerApplication.documents),
    selectinload(ExaminerApplication.recommendation),
    selectinload(ExaminerApplication.subject),
)


# Allowed sort fields for admin applications list
APPLICATION_SORT_FIELDS = {
    "application_number",
    "full_name",
    "status",
    "submitted_at",
    "created_at",
}


@router.get("", response_model=list[ExaminerApplicationResponse])
async def list_admin_examiner_applications(
    session: DBSessionDep,
    current_user: AdminDep,
    status_filter: ExaminerApplicationStatus | None = Query(None, alias="status"),
    search: str | None = Query(None, description="Search by application number or applicant name"),
    sort_by: str | None = Query(None, description="Sort field: application_number, full_name, status, submitted_at, created_at"),
    order: str | None = Query(None, description="Sort order: asc or desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
) -> list[ExaminerApplicationResponse]:
    """List all examiner applications (admin view with filters)."""
    stmt = select(ExaminerApplication)

    # Apply status filter
    if status_filter:
        stmt = stmt.where(ExaminerApplication.status == status_filter)

    # Apply search filter (columns are on ExaminerApplication)
    if search:
        search_pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                ExaminerApplication.application_number.ilike(search_pattern),
                ExaminerApplication.full_name.ilike(search_pattern),
                ExaminerApplication.email_address.ilike(search_pattern),
            )
        )

    # Order
    order_col = ExaminerApplication.created_at
    if sort_by and sort_by in APPLICATION_SORT_FIELDS:
        order_col = getattr(ExaminerApplication, sort_by, ExaminerApplication.created_at)
    desc = order != "asc"
    stmt = stmt.order_by(order_col.desc() if desc else order_col.asc())

    # Pagination
    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size).options(*_APPLICATION_LOAD_OPTIONS)

    result = await session.execute(stmt)
    applications = result.scalars().all()

    out = []
    for app in applications:
        data = ExaminerApplicationResponse.model_validate(app).model_dump(exclude={"recommendation"})
        if app.recommendation:
            rec = app.recommendation
            data["recommendation_status"] = ExaminerRecommendationStatus(
                completed=rec.completed_at is not None,
                recommender_name=rec.recommender_name if rec.completed_at else None,
            )
            rec_data = ExaminerRecommendationResponse.model_validate(rec).model_dump()
            rec_data["applicant_name"] = app.full_name
            data["recommendation"] = ExaminerRecommendationResponse(**rec_data)
        else:
            data["recommendation_status"] = None
            data["recommendation"] = None
        out.append(ExaminerApplicationResponse(**data))
    return out


@router.get("/{application_id}", response_model=ExaminerApplicationResponse)
async def get_admin_examiner_application(
    application_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminerApplicationResponse:
    """Get a specific examiner application for processing (admin view)."""
    stmt = (
        select(ExaminerApplication)
        .where(ExaminerApplication.id == application_id)
        .options(*_APPLICATION_LOAD_OPTIONS)
    )

    result = await session.execute(stmt)
    application = result.scalar_one_or_none()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner application not found",
        )

    data = ExaminerApplicationResponse.model_validate(application).model_dump(exclude={"recommendation"})
    if application.recommendation:
        rec = application.recommendation
        data["recommendation_status"] = ExaminerRecommendationStatus(
            completed=rec.completed_at is not None,
            recommender_name=rec.recommender_name if rec.completed_at else None,
        )
        rec_data = ExaminerRecommendationResponse.model_validate(rec).model_dump()
        rec_data["applicant_name"] = application.full_name
        data["recommendation"] = ExaminerRecommendationResponse(**rec_data)
    else:
        data["recommendation_status"] = None
        data["recommendation"] = None
    return ExaminerApplicationResponse(**data)


@router.post("/{application_id}/process", response_model=dict)
async def process_examiner_application(
    application_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Update Section C processing information and move application to UNDER_REVIEW if SUBMITTED."""
    stmt = select(ExaminerApplication).where(ExaminerApplication.id == application_id)
    result = await session.execute(stmt)
    application = result.scalar_one_or_none()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner application not found",
        )

    # Get or create processing record
    processing_stmt = select(ExaminerApplicationProcessing).where(
        ExaminerApplicationProcessing.application_id == application_id
    )
    processing_result = await session.execute(processing_stmt)
    processing = processing_result.scalar_one_or_none()

    if not processing:
        processing = ExaminerApplicationProcessing(
            application_id=application.id,
            checked_by_user_id=current_user.id,
            received_date=application.submitted_at.date() if application.submitted_at else date.today(),
        )
        session.add(processing)
        await session.flush()

    # Transition status from SUBMITTED to UNDER_REVIEW so the UI reflects "processed"
    if application.status == ExaminerApplicationStatus.SUBMITTED:
        application.status = ExaminerApplicationStatus.UNDER_REVIEW

    await session.commit()
    await session.refresh(processing)

    return {"message": "Processing information updated", "processing_id": str(processing.id)}


@router.post("/{application_id}/accept", response_model=ExaminerApplicationResponse)
async def accept_examiner_application(
    application_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminerApplicationResponse:
    """Accept an examiner application (updates status and Section C)."""
    stmt = (
        select(ExaminerApplication)
        .where(ExaminerApplication.id == application_id)
        .options(selectinload(ExaminerApplication.qualifications))
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
    processing_stmt = select(ExaminerApplicationProcessing).where(
        ExaminerApplicationProcessing.application_id == application_id
    )
    processing_result = await session.execute(processing_stmt)
    processing = processing_result.scalar_one_or_none()

    if not processing:
        processing = ExaminerApplicationProcessing(application_id=application.id)
        session.add(processing)
        await session.flush()

    processing.accepted_date = date.today()
    processing.accepted_officer_user_id = current_user.id

    # Update application status
    application.status = ExaminerApplicationStatus.ACCEPTED

    # Ensure examiner is eligible for this subject so they appear in allocation pool
    if application.subject_id:
        eligibility_stmt = select(ExaminerSubjectEligibility).where(
            ExaminerSubjectEligibility.examiner_id == application.examiner_id,
            ExaminerSubjectEligibility.subject_id == application.subject_id,
        )
        eligibility_result = await session.execute(eligibility_stmt)
        eligibility = eligibility_result.scalar_one_or_none()
        if not eligibility:
            eligibility = ExaminerSubjectEligibility(
                examiner_id=application.examiner_id,
                subject_id=application.subject_id,
                eligible=True,
            )
            session.add(eligibility)
        else:
            eligibility.eligible = True

    # Sync examiner profile from application so allocation (e.g. quotas, qualifications) can use it
    examiner_stmt = select(Examiner).where(Examiner.id == application.examiner_id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()
    if examiner:
        if application.region is not None:
            examiner.region = application.region.value if hasattr(application.region, "value") else str(application.region)
        # Sync qualifications from application to examiner for allocation scoring
        await session.execute(delete(ExaminerQualification).where(ExaminerQualification.examiner_id == examiner.id))
        for idx, app_qual in enumerate(application.qualifications):
            examiner_qual = ExaminerQualification(
                examiner_id=examiner.id,
                university_college=app_qual.university_college,
                degree_type=app_qual.degree_type,
                programme=app_qual.programme,
                class_of_degree=app_qual.class_of_degree,
                major_subjects=app_qual.major_subjects,
                date_of_award=app_qual.date_of_award,
                order_index=idx,
            )
            session.add(examiner_qual)

    await session.commit()
    app_id = application.id

    # Re-query with eager-loaded relationships to avoid lazy-load greenlet errors
    stmt = (
        select(ExaminerApplication)
        .where(ExaminerApplication.id == app_id)
        .options(*_APPLICATION_LOAD_OPTIONS)
    )
    result = await session.execute(stmt)
    application = result.scalar_one()
    data = ExaminerApplicationResponse.model_validate(application).model_dump(exclude={"recommendation"})
    if application.recommendation:
        rec = application.recommendation
        data["recommendation_status"] = ExaminerRecommendationStatus(
            completed=rec.completed_at is not None,
            recommender_name=rec.recommender_name if rec.completed_at else None,
        )
        rec_data = ExaminerRecommendationResponse.model_validate(rec).model_dump()
        rec_data["applicant_name"] = application.full_name
        data["recommendation"] = ExaminerRecommendationResponse(**rec_data)
    else:
        data["recommendation_status"] = None
        data["recommendation"] = None
    return ExaminerApplicationResponse(**data)


@router.post("/{application_id}/sync-eligibility", response_model=dict)
async def sync_accepted_application_eligibility(
    application_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """
    For an already-accepted application, ensure ExaminerSubjectEligibility exists
    and Examiner.region is synced so the examiner appears in the allocation pool.
    Use this to fix applications that were accepted before eligibility was auto-created.
    """
    stmt = select(ExaminerApplication).where(ExaminerApplication.id == application_id)
    result = await session.execute(stmt)
    application = result.scalar_one_or_none()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner application not found",
        )

    if application.status != ExaminerApplicationStatus.ACCEPTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Application must be accepted to sync eligibility",
        )

    updated = False
    if application.subject_id:
        eligibility_stmt = select(ExaminerSubjectEligibility).where(
            ExaminerSubjectEligibility.examiner_id == application.examiner_id,
            ExaminerSubjectEligibility.subject_id == application.subject_id,
        )
        eligibility_result = await session.execute(eligibility_stmt)
        eligibility = eligibility_result.scalar_one_or_none()
        if not eligibility:
            eligibility = ExaminerSubjectEligibility(
                examiner_id=application.examiner_id,
                subject_id=application.subject_id,
                eligible=True,
            )
            session.add(eligibility)
            updated = True
        elif not eligibility.eligible:
            eligibility.eligible = True
            updated = True

    examiner_stmt = select(Examiner).where(Examiner.id == application.examiner_id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()
    if examiner and application.region is not None:
        region_value = application.region.value if hasattr(application.region, "value") else str(application.region)
        if examiner.region != region_value:
            examiner.region = region_value
            updated = True

    await session.commit()
    return {"message": "Eligibility synced" if updated else "Already in sync"}


@router.post("/{application_id}/reject", response_model=ExaminerApplicationResponse)
async def reject_examiner_application(
    application_id: UUID,
    rejection_reasons: dict[str, str],
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminerApplicationResponse:
    """Reject an examiner application (updates status and Section C)."""
    stmt = select(ExaminerApplication).where(ExaminerApplication.id == application_id)
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

    rejection_reasons_text = rejection_reasons.get("reasons", "")
    if not rejection_reasons_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rejection reasons are required",
        )

    # Get or create processing record
    processing_stmt = select(ExaminerApplicationProcessing).where(
        ExaminerApplicationProcessing.application_id == application_id
    )
    processing_result = await session.execute(processing_stmt)
    processing = processing_result.scalar_one_or_none()

    if not processing:
        processing = ExaminerApplicationProcessing(application_id=application.id)
        session.add(processing)
        await session.flush()

    processing.rejected_reasons = rejection_reasons_text
    processing.rejected_date = date.today()
    processing.rejected_officer_user_id = current_user.id

    # Update application status
    application.status = ExaminerApplicationStatus.REJECTED

    await session.commit()
    app_id = application.id

    # Re-query with eager-loaded relationships to avoid lazy-load greenlet errors
    stmt = (
        select(ExaminerApplication)
        .where(ExaminerApplication.id == app_id)
        .options(*_APPLICATION_LOAD_OPTIONS)
    )
    result = await session.execute(stmt)
    application = result.scalar_one()
    data = ExaminerApplicationResponse.model_validate(application).model_dump(exclude={"recommendation"})
    if application.recommendation:
        rec = application.recommendation
        data["recommendation_status"] = ExaminerRecommendationStatus(
            completed=rec.completed_at is not None,
            recommender_name=rec.recommender_name if rec.completed_at else None,
        )
        rec_data = ExaminerRecommendationResponse.model_validate(rec).model_dump()
        rec_data["applicant_name"] = application.full_name
        data["recommendation"] = ExaminerRecommendationResponse(**rec_data)
    else:
        data["recommendation_status"] = None
        data["recommendation"] = None
    return ExaminerApplicationResponse(**data)


@router.get("/{application_id}/documents/{document_id}/download")
async def download_examiner_document(
    application_id: UUID,
    document_id: UUID,
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

    try:
        # Retrieve file from storage
        document_storage_backend = get_storage_backend(base_path=settings.examiner_document_storage_path)

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
