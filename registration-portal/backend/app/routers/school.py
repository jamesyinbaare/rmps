"""School portal endpoints for school users."""
from datetime import datetime
from pathlib import Path
from typing import Annotated
from uuid import UUID
import io
import csv
import zipfile
from io import BytesIO

from fastapi import APIRouter, HTTPException, status, UploadFile, File, Query, Depends, Form
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_, func, insert, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import json
import pandas as pd

from app.dependencies.auth import SchoolUserWithSchoolDep, SchoolAdminDep, get_current_school_user
from app.dependencies.database import DBSessionDep, get_db_session
from app.models import (
    PortalUser,
    Role,
    RegistrationExam,
    ExamRegistrationPeriod,
    RegistrationCandidate,
    RegistrationStatus,
    RegistrationType,
    School,
    Programme,
    Subject,
    RegistrationCandidatePhoto,
    RegistrationSubjectSelection,
    school_programmes,
    programme_subjects,
)
from app.schemas.registration import (
    RegistrationCandidateCreate,
    RegistrationCandidateUpdate,
    RegistrationCandidateResponse,
    BulkUploadResponse,
    RegistrationExamResponse,
    RegistrationCandidatePhotoResponse,
    PhotoAlbumResponse,
    PhotoAlbumItem,
    PhotoBulkUploadResponse,
    PhotoBulkUploadError,
)
from app.schemas.programme import (
    ProgrammeResponse,
    ProgrammeSubjectResponse,
    ProgrammeSubjectRequirements,
    SchoolProgrammeAssociation,
)
from app.services.template_generator import generate_candidate_template
from app.schemas.user import SchoolUserCreate, UserUpdate
from app.schemas.auth import UserResponse
from app.core.security import get_password_hash
from app.utils.registration import generate_unique_registration_number
from app.config import settings
from app.services.subject_selection import (
    auto_select_subjects_for_programme,
    validate_subject_selections,
    get_programme_subjects_for_registration,
    normalize_exam_series,
)
from app.services.photo_storage import PhotoStorageService, calculate_checksum
from app.services.index_slip_service import generate_index_slip_pdf
from app.services.photo_validation import PhotoValidationService
from app.services.registration_validation import can_approve_registration
from app.services.registration_download_service import (
    generate_registration_summary_pdf,
    generate_registration_detailed_pdf,
)
from app.schemas.invoice import SchoolInvoiceResponse, ProgrammeInvoiceItem, ExaminationInvoiceItem
from app.services.school_invoice_service import (
    aggregate_candidates_by_examination,
    aggregate_candidates_by_examination_and_programme,
    generate_school_invoice_pdf,
)
import logging

logger = logging.getLogger(__name__)

# Create photo storage service instance
photo_storage_service = PhotoStorageService()

router = APIRouter(prefix="/api/v1/school", tags=["school"])

# Maximum number of active users allowed per school
MAX_ACTIVE_USERS_PER_SCHOOL = 10


async def count_active_school_users(session: DBSessionDep, school_id: int) -> int:
    """Count active users (SchoolAdmin + SchoolStaff) for a school."""
    stmt = select(func.count(PortalUser.id)).where(
        PortalUser.school_id == school_id,
        PortalUser.is_active.is_(True),
        PortalUser.role <= Role.SchoolStaff
    )
    result = await session.execute(stmt)
    return result.scalar_one() or 0


@router.get("/exams", response_model=list[RegistrationExamResponse])
async def list_available_exams(
    session: DBSessionDep, current_user: SchoolUserWithSchoolDep
) -> list[RegistrationExamResponse]:
    """List available exams with open registration periods."""
    now = datetime.utcnow()

    stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .where(
            ExamRegistrationPeriod.is_active.is_(True),
            ExamRegistrationPeriod.allows_bulk_registration.is_(True),
            ExamRegistrationPeriod.registration_start_date <= now,
            ExamRegistrationPeriod.registration_end_date >= now,
        )
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exams = result.scalars().all()

    return [RegistrationExamResponse.model_validate(exam) for exam in exams]


@router.get("/exams/all", response_model=list[RegistrationExamResponse])
async def list_all_exams(
    session: DBSessionDep, current_user: SchoolUserWithSchoolDep
) -> list[RegistrationExamResponse]:
    """List all exams that allow bulk registration (both open and closed) for viewing candidates."""
    stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .where(
            ExamRegistrationPeriod.allows_bulk_registration.is_(True),
        )
        .options(selectinload(RegistrationExam.registration_period))
        .order_by(RegistrationExam.year.desc(), RegistrationExam.exam_type, RegistrationExam.exam_series)
    )
    result = await session.execute(stmt)
    exams = result.scalars().all()

    return [RegistrationExamResponse.model_validate(exam) for exam in exams]


@router.get("/candidates", response_model=list[RegistrationCandidateResponse])
async def list_candidates(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    exam_id: int | None = None,
) -> list[RegistrationCandidateResponse]:
    """List registered candidates for the school."""
    query = select(RegistrationCandidate).where(RegistrationCandidate.school_id == current_user.school_id)

    if exam_id:
        query = query.where(RegistrationCandidate.registration_exam_id == exam_id)

    query = query.options(
        selectinload(RegistrationCandidate.subject_selections),
        selectinload(RegistrationCandidate.exam).selectinload(RegistrationExam.registration_period)
    )
    result = await session.execute(query)
    candidates = result.scalars().all()

    # Convert to response models, handling relationships to avoid lazy loading
    response_list = []
    for candidate in candidates:
        # Build exam response if available
        exam_response = None
        if candidate.exam:
            exam_response = {
                "id": candidate.exam.id,
                "exam_id_main_system": candidate.exam.exam_id_main_system,
                "exam_type": candidate.exam.exam_type,
                "exam_series": candidate.exam.exam_series,
                "year": candidate.exam.year,
                "description": candidate.exam.description,
                "registration_period": {
                    "id": candidate.exam.registration_period.id,
                    "registration_start_date": candidate.exam.registration_period.registration_start_date,
                    "registration_end_date": candidate.exam.registration_period.registration_end_date,
                    "is_active": candidate.exam.registration_period.is_active,
                    "allows_bulk_registration": candidate.exam.registration_period.allows_bulk_registration,
                    "allows_private_registration": candidate.exam.registration_period.allows_private_registration,
                    "created_at": candidate.exam.registration_period.created_at,
                    "updated_at": candidate.exam.registration_period.updated_at,
                },
                "created_at": candidate.exam.created_at,
                "updated_at": candidate.exam.updated_at,
            }

        candidate_dict = {
            "id": candidate.id,
            "registration_exam_id": candidate.registration_exam_id,
            "school_id": candidate.school_id,
            "firstname": candidate.firstname,
            "lastname": candidate.lastname,
            "othername": candidate.othername,
            "name": candidate.name,  # Computed property
            "fullname": candidate.fullname,  # Computed property
            "registration_number": candidate.registration_number,
            "index_number": candidate.index_number,
            "date_of_birth": candidate.date_of_birth,
            "gender": candidate.gender,
            "programme_code": candidate.programme_code,
            "programme_id": candidate.programme_id,
            "contact_email": candidate.contact_email,
            "contact_phone": candidate.contact_phone,
            "address": candidate.address,
            "national_id": candidate.national_id,
            "disability": get_enum_value(candidate.disability),
            "registration_type": get_enum_value(candidate.registration_type),
            "guardian_name": candidate.guardian_name,
            "guardian_phone": candidate.guardian_phone,
            "guardian_digital_address": candidate.guardian_digital_address,
            "guardian_national_id": candidate.guardian_national_id,
            "registration_status": candidate.registration_status,
            "registration_date": candidate.registration_date,
            "subject_selections": [
                {
                    "id": sel.id,
                    "subject_id": sel.subject_id,
                    "subject_code": sel.subject_code,
                    "subject_name": sel.subject_name,
                    "series": sel.series,
                    "created_at": sel.created_at,
                }
                for sel in (candidate.subject_selections or [])
            ],
            "exam": exam_response,
            "created_at": candidate.created_at,
            "updated_at": candidate.updated_at,
        }
        response_list.append(RegistrationCandidateResponse.model_validate(candidate_dict))

    return response_list


def get_enum_value(enum_or_string):
    """Safely extract value from enum or return string if already a string."""
    if enum_or_string is None:
        return None
    if hasattr(enum_or_string, 'value'):
        return enum_or_string.value
    return enum_or_string


async def validate_registration_type_and_guardian(
    registration_type: str | None,
    exam_series: str | None,
    guardian_name: str | None,
    guardian_phone: str | None,
) -> None:
    """Validate registration_type against exam series and guardian requirements."""
    if registration_type is None:
        return  # No validation needed if registration_type is not specified

    normalized_series = normalize_exam_series(exam_series)
    is_may_june = normalized_series == "MAY/JUNE"
    is_nov_dec = normalized_series == "NOV/DEC"

    # Validate registration_type against exam series
    if registration_type == RegistrationType.PRIVATE.value:
        if not is_nov_dec:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Private registration type is only allowed for NOV/DEC exams",
            )
        # Guardian info required for private
        if not guardian_name or not guardian_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Guardian name and phone are required for private registration type",
            )
    elif registration_type in (RegistrationType.FREE_TVET.value, RegistrationType.REFERRAL.value):
        if not is_may_june:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{registration_type.replace('_', ' ').title()} registration type is only allowed for MAY/JUNE exams",
            )
        # Guardian info optional for FREE_TVET and referral
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid registration_type: {registration_type}",
        )


@router.post("/candidates", response_model=RegistrationCandidateResponse, status_code=status.HTTP_201_CREATED)
async def register_candidate(
    candidate_data: RegistrationCandidateCreate,
    exam_id: Annotated[int, Query(..., description="The exam ID to register the candidate for")],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    current_user: Annotated[PortalUser, Depends(get_current_school_user)],
) -> RegistrationCandidateResponse:
    """Register a single candidate (form submission)."""
    # Validate dependencies are injected (FastAPI should inject these, but safety check)
    if session is None or current_user is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error: dependencies not injected",
        )

    # Validate exam exists and registration is open
    exam_stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    now = datetime.utcnow()
    if (
        not exam.registration_period.is_active
        or exam.registration_period.registration_start_date > now
        or exam.registration_period.registration_end_date < now
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Registration period is not open")

    # Validate registration_type and guardian requirements
    await validate_registration_type_and_guardian(
        candidate_data.registration_type,
        exam.exam_series,
        candidate_data.guardian_name,
        candidate_data.guardian_phone,
    )

    # Validate programme if provided
    programme_id = candidate_data.programme_id
    if programme_id:
        # Check programme exists
        programme_stmt = select(Programme).where(Programme.id == programme_id)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if not programme:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

        # Validate programme is in school's programme list
        if current_user.school_id:
            assoc_stmt = select(school_programmes).where(
                school_programmes.c.school_id == current_user.school_id,
                school_programmes.c.programme_id == programme_id
            )
            assoc_result = await session.execute(assoc_stmt)
            assoc_exists = assoc_result.first()
            if not assoc_exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Programme is not available for your school. Please contact your administrator.",
                )

    # Determine registration_type (default to FREE_TVET for school registrations)
    registration_type = candidate_data.registration_type or RegistrationType.FREE_TVET.value

    # Generate unique registration number
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="School ID is required for candidate registration",
        )
    registration_number = await generate_unique_registration_number(session, exam_id, current_user.school_id, registration_type)
    normalized_series = normalize_exam_series(exam.exam_series)
    is_may_june = normalized_series == "MAY/JUNE"
    is_nov_dec = normalized_series == "NOV/DEC"
    is_referral = registration_type == RegistrationType.REFERRAL.value

    # Create candidate
    try:
        new_candidate = RegistrationCandidate(
            registration_exam_id=exam_id,
            school_id=current_user.school_id,
            portal_user_id=current_user.id,
            firstname=candidate_data.firstname,
            lastname=candidate_data.lastname,
            othername=candidate_data.othername,
            registration_number=registration_number,
            date_of_birth=candidate_data.date_of_birth,
            gender=candidate_data.gender,
            programme_code=candidate_data.programme_code,  # Keep for backward compatibility
            programme_id=programme_id,
            contact_email=candidate_data.contact_email,
            contact_phone=candidate_data.contact_phone,
            address=candidate_data.address,
            national_id=candidate_data.national_id,
            disability=candidate_data.disability,
            registration_type=registration_type,
            guardian_name=candidate_data.guardian_name,
            guardian_phone=candidate_data.guardian_phone,
            guardian_digital_address=candidate_data.guardian_digital_address,
            guardian_national_id=candidate_data.guardian_national_id,
            registration_status=RegistrationStatus.PENDING,
        )
        session.add(new_candidate)
        await session.flush()

        # Handle subject selections
        selected_subject_ids: list[int] = []

        # For referral: use NOV/DEC logic (all subjects optional, no auto-selection)
        if is_referral:
            # No auto-selection for referral - user must select subjects manually
            pass
        elif programme_id:
            # Auto-select compulsory core subjects only (not optional core subjects)
            auto_selected = await auto_select_subjects_for_programme(session, programme_id, current_user.school_id)
            selected_subject_ids.extend(auto_selected)

            # For MAY/JUNE: Auto-select ALL elective subjects (they are compulsory)
            if is_may_june:
                subjects_info = await get_programme_subjects_for_registration(session, programme_id)
                selected_subject_ids.extend(subjects_info["electives"])

        # Add any additional subjects from subject_ids (including optional core subjects selected by user)
        if candidate_data.subject_ids:
            selected_subject_ids.extend(candidate_data.subject_ids)

        # Remove duplicates
        selected_subject_ids = list(set(selected_subject_ids))

        # Validate subject selections if programme is provided
        if programme_id and selected_subject_ids:
            is_valid, validation_errors = await validate_subject_selections(
                session, programme_id, selected_subject_ids, exam.exam_series
            )
            if not is_valid:
                await session.rollback()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Subject selections do not meet programme requirements: {'; '.join(validation_errors)}",
                )

        # Create subject selections
        for subject_id in selected_subject_ids:
            # Get subject details
            subject_stmt = select(Subject).where(Subject.id == subject_id)
            subject_result = await session.execute(subject_stmt)
            subject = subject_result.scalar_one_or_none()
            if not subject:
                continue  # Skip if subject not found

            subject_selection = RegistrationSubjectSelection(
                registration_candidate_id=new_candidate.id,
                subject_id=subject_id,
                subject_code=subject.code,  # Keep for backward compatibility
                subject_name=subject.name,  # Keep for backward compatibility
            )
            session.add(subject_selection)

        await session.commit()

        # Refresh to get the ID and relationships
        await session.refresh(new_candidate, ["subject_selections"])

        # Create response dict with subject selections
        candidate_dict = {
            "id": new_candidate.id,
            "registration_exam_id": new_candidate.registration_exam_id,
            "school_id": new_candidate.school_id,
            "firstname": new_candidate.firstname,
            "lastname": new_candidate.lastname,
            "othername": new_candidate.othername,
            "name": new_candidate.name,  # Computed property
            "fullname": new_candidate.fullname,  # Computed property
            "registration_number": new_candidate.registration_number,
            "index_number": new_candidate.index_number,
            "date_of_birth": new_candidate.date_of_birth,
            "gender": new_candidate.gender,
            "programme_code": new_candidate.programme_code,
            "programme_id": new_candidate.programme_id,
            "contact_email": new_candidate.contact_email,
            "contact_phone": new_candidate.contact_phone,
            "address": new_candidate.address,
            "national_id": new_candidate.national_id,
            "disability": get_enum_value(new_candidate.disability),
            "registration_type": get_enum_value(new_candidate.registration_type),
            "guardian_name": new_candidate.guardian_name,
            "guardian_phone": new_candidate.guardian_phone,
            "guardian_digital_address": new_candidate.guardian_digital_address,
            "guardian_national_id": new_candidate.guardian_national_id,
            "registration_status": new_candidate.registration_status,
            "registration_date": new_candidate.registration_date,
            "subject_selections": [
                {
                    "id": sel.id,
                    "subject_id": sel.subject_id,
                    "subject_code": sel.subject_code,
                    "subject_name": sel.subject_name,
                    "series": sel.series,
                    "created_at": sel.created_at,
                }
                for sel in (new_candidate.subject_selections or [])
            ],
            "created_at": new_candidate.created_at,
            "updated_at": new_candidate.updated_at,
        }
        return RegistrationCandidateResponse.model_validate(candidate_dict)
    except Exception:
        await session.rollback()
        raise


@router.put("/candidates/{candidate_id}", response_model=RegistrationCandidateResponse, status_code=status.HTTP_200_OK)
async def update_candidate(
    candidate_id: int,
    candidate_update: RegistrationCandidateUpdate,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> RegistrationCandidateResponse:
    """Update a registration candidate's information and subject selections."""
    # Validate candidate exists and belongs to school
    candidate_stmt = (
        select(RegistrationCandidate)
        .where(RegistrationCandidate.id == candidate_id)
        .options(
            selectinload(RegistrationCandidate.exam).selectinload(RegistrationExam.registration_period),
            selectinload(RegistrationCandidate.subject_selections),
        )
    )
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if current_user.school_id and candidate.school_id != current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidate does not belong to your school",
        )

    # Check if registration period is still open (only if updating subject selections)
    if candidate_update.subject_ids is not None:
        if not candidate.exam or not candidate.exam.registration_period:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot update subject selections: exam or registration period not found",
            )

        now = datetime.utcnow()
        registration_period = candidate.exam.registration_period
        if (
            not registration_period.is_active
            or registration_period.registration_start_date > now
            or registration_period.registration_end_date < now
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot update subject selections: registration period is not open",
            )

    try:
        # Update basic candidate fields
        update_data = candidate_update.model_dump(exclude_unset=True, exclude={"subject_ids", "subject_codes"})

        for field, value in update_data.items():
            if value is not None:
                setattr(candidate, field, value)

        # Handle programme update
        if candidate_update.programme_id is not None:
            # Validate programme exists and is available to school
            if candidate_update.programme_id:
                programme_stmt = select(Programme).where(Programme.id == candidate_update.programme_id)
                programme_result = await session.execute(programme_stmt)
                programme = programme_result.scalar_one_or_none()

                if not programme:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Programme with ID {candidate_update.programme_id} not found",
                    )

                # Verify programme is associated with school
                if current_user.school_id:
                    assoc_stmt = select(school_programmes).where(
                        school_programmes.c.school_id == current_user.school_id,
                        school_programmes.c.programme_id == programme.id,
                    )
                    assoc_result = await session.execute(assoc_stmt)
                    if not assoc_result.first():
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Programme '{programme.code}' is not available for your school",
                        )

                candidate.programme_id = candidate_update.programme_id
                candidate.programme_code = programme.code  # Keep for backward compatibility

        # Handle subject selections update
        if candidate_update.subject_ids is not None:
            # Get current programme_id (might have been updated above)
            programme_id = candidate.programme_id

            # Validate subject selections if programme is provided
            if programme_id:
                is_valid, validation_errors = await validate_subject_selections(
                    session, programme_id, candidate_update.subject_ids, candidate.exam.exam_series if candidate.exam else None
                )
                if not is_valid:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Subject selections do not meet programme requirements: {'; '.join(validation_errors)}",
                    )

            # Delete existing subject selections
            delete_stmt = delete(RegistrationSubjectSelection).where(
                RegistrationSubjectSelection.registration_candidate_id == candidate_id
            )
            await session.execute(delete_stmt)

            # Create new subject selections
            for subject_id in candidate_update.subject_ids:
                subject_stmt = select(Subject).where(Subject.id == subject_id)
                subject_result = await session.execute(subject_stmt)
                subject = subject_result.scalar_one_or_none()
                if not subject:
                    continue  # Skip if subject not found

                subject_selection = RegistrationSubjectSelection(
                    registration_candidate_id=candidate.id,
                    subject_id=subject_id,
                    subject_code=subject.code,  # Keep for backward compatibility
                    subject_name=subject.name,  # Keep for backward compatibility
                )
                session.add(subject_selection)

        await session.commit()
        await session.refresh(candidate, ["subject_selections", "exam"])

        # Create response dict with subject selections
        candidate_dict = {
            "id": candidate.id,
            "registration_exam_id": candidate.registration_exam_id,
            "school_id": candidate.school_id,
            "firstname": candidate.firstname,
            "lastname": candidate.lastname,
            "othername": candidate.othername,
            "name": candidate.name,  # Computed property
            "fullname": candidate.fullname,  # Computed property
            "registration_number": candidate.registration_number,
            "index_number": candidate.index_number,
            "date_of_birth": candidate.date_of_birth,
            "gender": candidate.gender,
            "programme_code": candidate.programme_code,
            "programme_id": candidate.programme_id,
            "contact_email": candidate.contact_email,
            "contact_phone": candidate.contact_phone,
            "address": candidate.address,
            "national_id": candidate.national_id,
            "disability": get_enum_value(candidate.disability),
            "registration_type": get_enum_value(candidate.registration_type),
            "guardian_name": candidate.guardian_name,
            "guardian_phone": candidate.guardian_phone,
            "guardian_digital_address": candidate.guardian_digital_address,
            "guardian_national_id": candidate.guardian_national_id,
            "registration_status": candidate.registration_status,
            "registration_date": candidate.registration_date,
            "subject_selections": [
                {
                    "id": sel.id,
                    "subject_id": sel.subject_id,
                    "subject_code": sel.subject_code,
                    "subject_name": sel.subject_name,
                    "series": sel.series,
                    "created_at": sel.created_at,
                }
                for sel in (candidate.subject_selections or [])
            ],
            "created_at": candidate.created_at,
            "updated_at": candidate.updated_at,
        }
        return RegistrationCandidateResponse.model_validate(candidate_dict)
    except HTTPException:
        await session.rollback()
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update candidate: {str(e)}",
        )


@router.post("/candidates/{candidate_id}/approve", response_model=RegistrationCandidateResponse, status_code=status.HTTP_200_OK)
async def approve_candidate(
    candidate_id: int,
    session: DBSessionDep,
    current_user: SchoolAdminDep,
) -> RegistrationCandidateResponse:
    """Approve a registration candidate."""
    # Validate candidate exists and belongs to school
    candidate_stmt = (
        select(RegistrationCandidate)
        .where(RegistrationCandidate.id == candidate_id)
        .options(
            selectinload(RegistrationCandidate.exam).selectinload(RegistrationExam.registration_period),
            selectinload(RegistrationCandidate.subject_selections),
        )
    )
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if current_user.school_id and candidate.school_id != current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidate does not belong to your school",
        )

    # Check if candidate is already approved
    if candidate.registration_status == RegistrationStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidate is already approved",
        )

    # Check if candidate is in a valid status for approval
    if candidate.registration_status not in (RegistrationStatus.PENDING, RegistrationStatus.DRAFT):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve candidate with status {candidate.registration_status.value}",
        )

    # Validate that registration meets approval requirements
    is_valid, validation_errors = await can_approve_registration(session, candidate)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Registration does not meet approval requirements: {'; '.join(validation_errors)}",
        )

    # Update registration status to APPROVED
    candidate.registration_status = RegistrationStatus.APPROVED

    try:
        await session.commit()
        await session.refresh(candidate, ["subject_selections", "exam"])

        # Build exam response if available
        exam_response = None
        if candidate.exam:
            exam_response = {
                "id": candidate.exam.id,
                "exam_id_main_system": candidate.exam.exam_id_main_system,
                "exam_type": candidate.exam.exam_type,
                "exam_series": candidate.exam.exam_series,
                "year": candidate.exam.year,
                "description": candidate.exam.description,
                "registration_period": {
                    "id": candidate.exam.registration_period.id,
                    "registration_start_date": candidate.exam.registration_period.registration_start_date,
                    "registration_end_date": candidate.exam.registration_period.registration_end_date,
                    "is_active": candidate.exam.registration_period.is_active,
                    "allows_bulk_registration": candidate.exam.registration_period.allows_bulk_registration,
                    "allows_private_registration": candidate.exam.registration_period.allows_private_registration,
                    "created_at": candidate.exam.registration_period.created_at,
                    "updated_at": candidate.exam.registration_period.updated_at,
                },
                "created_at": candidate.exam.created_at,
                "updated_at": candidate.exam.updated_at,
            }

        # Create response dict with subject selections
        candidate_dict = {
            "id": candidate.id,
            "registration_exam_id": candidate.registration_exam_id,
            "school_id": candidate.school_id,
            "firstname": candidate.firstname,
            "lastname": candidate.lastname,
            "othername": candidate.othername,
            "name": candidate.name,  # Computed property
            "fullname": candidate.fullname,  # Computed property
            "registration_number": candidate.registration_number,
            "index_number": candidate.index_number,
            "date_of_birth": candidate.date_of_birth,
            "gender": candidate.gender,
            "programme_code": candidate.programme_code,
            "programme_id": candidate.programme_id,
            "contact_email": candidate.contact_email,
            "contact_phone": candidate.contact_phone,
            "address": candidate.address,
            "national_id": candidate.national_id,
            "disability": get_enum_value(candidate.disability),
            "registration_type": get_enum_value(candidate.registration_type),
            "guardian_name": candidate.guardian_name,
            "guardian_phone": candidate.guardian_phone,
            "guardian_digital_address": candidate.guardian_digital_address,
            "guardian_national_id": candidate.guardian_national_id,
            "registration_status": candidate.registration_status,
            "registration_date": candidate.registration_date,
            "subject_selections": [
                {
                    "id": sel.id,
                    "subject_id": sel.subject_id,
                    "subject_code": sel.subject_code,
                    "subject_name": sel.subject_name,
                    "series": sel.series,
                    "created_at": sel.created_at,
                }
                for sel in (candidate.subject_selections or [])
            ],
            "exam": exam_response,
            "created_at": candidate.created_at,
            "updated_at": candidate.updated_at,
        }
        return RegistrationCandidateResponse.model_validate(candidate_dict)
    except HTTPException:
        await session.rollback()
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve candidate: {str(e)}",
        )


@router.post("/candidates/bulk", response_model=BulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_candidates(
    exam_id: int = Form(...),
    file: UploadFile = File(...),
    default_choice_group_selection: str | None = Form(None, description="Optional JSON mapping of {choice_group_id: subject_code} for default selections"),
    registration_type: str | None = Form(None, description="Default registration type (free_tvet or referral) to apply to all candidates"),
    session: DBSessionDep = None,
    current_user: SchoolUserWithSchoolDep = None,
) -> BulkUploadResponse:
    """Bulk upload candidates via CSV/Excel."""
    from app.schemas.registration import BulkUploadError
    from dateutil import parser as date_parser

    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Validate exam exists and registration is open
    exam_stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    now = datetime.utcnow()
    if (
        not exam.registration_period.is_active
        or exam.registration_period.registration_start_date > now
        or exam.registration_period.registration_end_date < now
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Registration period is not open")

    if not exam.registration_period.allows_bulk_registration:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bulk registration is not allowed for this exam")

    # Parse default choice group selection if provided
    default_selections: dict[int, str] = {}
    if default_choice_group_selection:
        try:
            default_selections = json.loads(default_choice_group_selection)
            # Convert string keys to int for choice_group_id
            default_selections = {int(k): v for k, v in default_selections.items()}
        except (json.JSONDecodeError, ValueError) as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid default_choice_group_selection format: {str(e)}"
            )

    # Read and parse file
    file_content = await file.read()
    filename = file.filename or "unknown"

    try:
        if filename.endswith('.csv'):
            # Try different encodings
            try:
                text_content = file_content.decode('utf-8')
            except UnicodeDecodeError:
                text_content = file_content.decode('latin-1')

            csv_reader = csv.DictReader(io.StringIO(text_content))
            rows = list(csv_reader)

            if not rows:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="CSV file is empty or has no data rows"
                )

            # Convert to DataFrame for easier processing
            df = pd.DataFrame(rows)
        elif filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(file_content), engine='openpyxl')
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be CSV or Excel format (.csv, .xlsx, .xls)"
            )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error parsing file: {str(exc)}"
        )

    # Normalize column names (strip whitespace, handle case insensitivity)
    df.columns = df.columns.str.strip()
    column_mapping = {col.lower(): col for col in df.columns}

    # Required columns - check for either 'name' (backward compatibility) or 'firstname'/'lastname'
    has_name = 'name' in column_mapping or 'name' in [col.lower() for col in df.columns]
    has_firstname = 'firstname' in column_mapping or 'firstname' in [col.lower() for col in df.columns]
    has_lastname = 'lastname' in column_mapping or 'lastname' in [col.lower() for col in df.columns]

    missing_columns = []
    if not has_name and not (has_firstname and has_lastname):
        missing_columns.append('name (or firstname and lastname)')

    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required columns: {', '.join(missing_columns)}"
        )

    # Process each row
    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[BulkUploadError] = []

    for idx, row in df.iterrows():
        row_number = int(idx) + 2  # +2 because rows are 1-indexed and header is row 1

        try:
            # Extract data with normalized column names
            def get_col(key: str, default=None):
                key_lower = key.lower()
                if key_lower in column_mapping:
                    value = row[column_mapping[key_lower]]
                    return value if pd.notna(value) else default
                return default

            # Parse name - support both old 'name' field and new firstname/lastname/othername fields
            firstname = None
            lastname = None
            othername = None

            # Try new format first (firstname, lastname, othername)
            firstname_str = str(get_col('firstname', '')).strip()
            lastname_str = str(get_col('lastname', '')).strip()
            othername_str = str(get_col('othername', '')).strip()

            if firstname_str and lastname_str:
                # New format
                firstname = firstname_str
                lastname = lastname_str
                if othername_str:
                    othername = othername_str
            else:
                # Old format - parse name field
                name = str(get_col('name', '')).strip()
                if not name:
                    errors.append(BulkUploadError(
                        row_number=row_number,
                        error_message="Name (or firstname and lastname) is required",
                        field="name"
                    ))
                    failed += 1
                    continue

                # Split name: first word = firstname, second word = lastname, third word (if exists) = othername
                name_parts = name.split()
                if len(name_parts) >= 2:
                    firstname = name_parts[0]
                    lastname = name_parts[1]
                    if len(name_parts) >= 3:
                        othername = name_parts[2]
                else:
                    errors.append(BulkUploadError(
                        row_number=row_number,
                        error_message="Name must contain at least firstname and lastname",
                        field="name"
                    ))
                    failed += 1
                    continue

            # Parse date_of_birth if provided
            date_of_birth = None
            dob_str = get_col('date_of_birth') or get_col('dob')
            if dob_str:
                try:
                    if isinstance(dob_str, str):
                        date_of_birth = date_parser.parse(dob_str).date()
                    elif isinstance(dob_str, datetime):
                        date_of_birth = dob_str.date()
                    elif hasattr(dob_str, 'date'):
                        date_of_birth = dob_str.date()
                except Exception:
                    pass  # Keep as None if parsing fails

            gender = get_col('gender')
            if gender:
                gender = str(gender).strip()

            programme_code = get_col('programme_code') or get_col('programme')
            if programme_code:
                programme_code = str(programme_code).strip()

            # Parse optional subjects (comma-separated subject codes)
            optional_subjects_str = get_col('optional_subjects') or get_col('optional subjects')
            optional_subject_codes = []
            if optional_subjects_str:
                optional_subject_codes = [s.strip() for s in str(optional_subjects_str).split(',') if s.strip()]

            contact_email = get_col('contact_email') or get_col('email')
            if contact_email:
                contact_email = str(contact_email).strip() or None

            contact_phone = get_col('contact_phone') or get_col('phone')
            if contact_phone:
                contact_phone = str(contact_phone).strip() or None

            address = get_col('address')
            if address:
                address = str(address).strip() or None

            national_id = get_col('national_id') or get_col('national id')
            if national_id:
                national_id = str(national_id).strip() or None

            guardian_name = get_col('guardian_name') or get_col('guardian name')
            if guardian_name:
                guardian_name = str(guardian_name).strip() or None

            guardian_phone = get_col('guardian_phone') or get_col('guardian phone')
            if guardian_phone:
                guardian_phone = str(guardian_phone).strip() or None

            guardian_digital_address = get_col('guardian_digital_address') or get_col('guardian digital address') or get_col('guardian_digital_address')
            if guardian_digital_address:
                guardian_digital_address = str(guardian_digital_address).strip() or None

            guardian_national_id = get_col('guardian_national_id') or get_col('guardian national id') or get_col('guardian_national_id')
            if guardian_national_id:
                guardian_national_id = str(guardian_national_id).strip() or None

            disability = get_col('disability')
            if disability:
                disability = str(disability).strip() or None

            file_registration_type = get_col('registration_type') or get_col('registration type')
            if file_registration_type:
                file_registration_type = str(file_registration_type).strip() or None
            # Use file value if provided, otherwise use form parameter, otherwise default to FREE_TVET
            candidate_registration_type = file_registration_type or registration_type or RegistrationType.FREE_TVET.value

            # Validate and get programme
            programme_id = None
            if programme_code:
                programme_stmt = select(Programme).where(Programme.code == programme_code)
                programme_result = await session.execute(programme_stmt)
                programme = programme_result.scalar_one_or_none()

                if not programme:
                    errors.append(BulkUploadError(
                        row_number=row_number,
                        error_message=f"Programme with code '{programme_code}' not found",
                        field="programme_code"
                    ))
                    failed += 1
                    continue

                # Verify programme is associated with school
                assoc_stmt = select(school_programmes).where(
                    school_programmes.c.school_id == current_user.school_id,
                    school_programmes.c.programme_id == programme.id
                )
                assoc_result = await session.execute(assoc_stmt)
                if not assoc_result.first():
                    errors.append(BulkUploadError(
                        row_number=row_number,
                        error_message=f"Programme '{programme_code}' is not available for your school",
                        field="programme_code"
                    ))
                    failed += 1
                    continue

                programme_id = programme.id

            # Get subject selections
            selected_subject_ids: list[int] = []

            # Normalize exam series for comparison (needed for both programme and non-programme cases)
            from app.services.subject_selection import normalize_exam_series
            normalized_series = normalize_exam_series(exam.exam_series)
            is_may_june = normalized_series == "MAY/JUNE"

            if programme_id:
                # Get programme subjects structure
                subjects_info = await get_programme_subjects_for_registration(session, programme_id)

                # Auto-select compulsory core subjects
                selected_subject_ids.extend(subjects_info["compulsory_core"])

                # For MAY/JUNE: Auto-select ALL elective subjects
                if is_may_june:
                    selected_subject_ids.extend(subjects_info["electives"])

                # Handle optional core groups
                # Check for CSV column with optional core group selections
                choice_groups_col = get_col('optional_core_groups') or get_col('choice_groups')
                csv_choice_groups: dict[int, str] = {}
                if choice_groups_col:
                    try:
                        # Try to parse as JSON: {"1": "SUBJECT_CODE", "2": "SUBJECT_CODE"}
                        csv_choice_groups = json.loads(str(choice_groups_col))
                        csv_choice_groups = {int(k): v for k, v in csv_choice_groups.items()}
                    except (json.JSONDecodeError, ValueError):
                        # If not JSON, try individual columns like choice_group_1, choice_group_2
                        for group_id in subjects_info["optional_core_groups"].keys():
                            col_name = f'choice_group_{group_id}'
                            col_value = get_col(col_name)
                            if col_value:
                                csv_choice_groups[group_id] = str(col_value).strip()

                # Handle optional core groups - select one from each group if provided
                for group_id, group_subject_ids in subjects_info["optional_core_groups"].items():
                    selected_from_group = None

                    # First priority: CSV column for this group (row-specific selection)
                    if group_id in csv_choice_groups:
                        subject_code = csv_choice_groups[group_id].strip()
                        subject_stmt = select(Subject).where(Subject.code == subject_code)
                        subject_result = await session.execute(subject_stmt)
                        subject = subject_result.scalar_one_or_none()
                        if subject and subject.id in group_subject_ids:
                            selected_from_group = subject.id

                    # Second priority: Check if row has optional subjects that match this group
                    if not selected_from_group and optional_subject_codes:
                        # Lookup subjects by code to find which group they belong to
                        for code in optional_subject_codes:
                            code_trimmed = code.strip()
                            subject_stmt = select(Subject).where(Subject.code == code_trimmed)
                            subject_result = await session.execute(subject_stmt)
                            subject = subject_result.scalar_one_or_none()
                            if subject and subject.id in group_subject_ids:
                                selected_from_group = subject.id
                                break

                    # Third priority: Check default selections (from UI choice group selection)
                    if not selected_from_group and group_id in default_selections:
                        default_code = str(default_selections[group_id]).strip()
                        subject_stmt = select(Subject).where(Subject.code == default_code)
                        subject_result = await session.execute(subject_stmt)
                        subject = subject_result.scalar_one_or_none()
                        if subject and subject.id in group_subject_ids:
                            selected_from_group = subject.id

                    # Do NOT auto-select optional core subjects if not explicitly chosen
                    # If not selected via CSV, default selections, or optional_subjects column, leave unselected

                    # Add selected subject from this choice group to the candidate's subject selections
                    if selected_from_group:
                        selected_subject_ids.append(selected_from_group)

            # Add optional subjects (electives or additional subjects) - only for NOV/DEC
            # For MAY/JUNE, all electives are already auto-selected above
            if not is_may_june and optional_subject_codes:
                for code in optional_subject_codes:
                    subject_stmt = select(Subject).where(Subject.code == code)
                    subject_result = await session.execute(subject_stmt)
                    subject = subject_result.scalar_one_or_none()
                    if subject:
                        if subject.id not in selected_subject_ids:
                            selected_subject_ids.append(subject.id)
                    # Note: We don't error if optional subject not found, just skip it

            # Remove duplicates
            selected_subject_ids = list(set(selected_subject_ids))

            # Validate subject selections if programme is provided
            if programme_id and selected_subject_ids:
                is_valid, validation_errors = await validate_subject_selections(
                    session, programme_id, selected_subject_ids, exam.exam_series
                )
                if not is_valid:
                    errors.append(BulkUploadError(
                        row_number=row_number,
                        error_message=f"Subject selections do not meet programme requirements: {'; '.join(validation_errors)}",
                        field="subjects"
                    ))
                    failed += 1
                    continue

            # Generate registration number (candidate_registration_type already determined above)
            registration_number = await generate_unique_registration_number(session, exam_id, current_user.school_id, candidate_registration_type)

            # Create candidate
            new_candidate = RegistrationCandidate(
                registration_exam_id=exam_id,
                school_id=current_user.school_id,
                portal_user_id=current_user.id,
                firstname=firstname,
                lastname=lastname,
                othername=othername,
                registration_number=registration_number,
                date_of_birth=date_of_birth,
                gender=gender,
                programme_code=programme_code,  # Keep for backward compatibility
                programme_id=programme_id,
                contact_email=contact_email,
                contact_phone=contact_phone,
                address=address,
                national_id=national_id,
                disability=disability,
                registration_type=candidate_registration_type,
                guardian_name=guardian_name,
                guardian_phone=guardian_phone,
                guardian_digital_address=guardian_digital_address,
                guardian_national_id=guardian_national_id,
                registration_status=RegistrationStatus.PENDING,
            )
            session.add(new_candidate)
            await session.flush()

            # Create subject selections
            for subject_id in selected_subject_ids:
                subject_stmt = select(Subject).where(Subject.id == subject_id)
                subject_result = await session.execute(subject_stmt)
                subject = subject_result.scalar_one_or_none()
                if not subject:
                    continue

                subject_selection = RegistrationSubjectSelection(
                    registration_candidate_id=new_candidate.id,
                    subject_id=subject_id,
                    subject_code=subject.code,
                    subject_name=subject.name,
                )
                session.add(subject_selection)

            successful += 1

        except Exception as e:
            errors.append(BulkUploadError(
                row_number=row_number,
                error_message=f"Error processing row: {str(e)}",
                field=None
            ))
            failed += 1
            continue

    # Commit all successful candidates
    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error committing candidates: {str(e)}"
        )

    return BulkUploadResponse(
        total_rows=total_rows,
        successful=successful,
        failed=failed,
        errors=errors
    )


@router.get("/candidates/template")
async def download_candidate_template(
    exam_id: int | None = Query(None, description="Optional exam ID to generate template specific to exam series"),
    session: DBSessionDep = None,
    current_user: SchoolUserWithSchoolDep = None,
) -> StreamingResponse:
    """Download Excel template for candidate bulk upload."""
    try:
        exam_series = None
        if exam_id:
            # Get exam to determine exam series
            exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
            exam_result = await session.execute(exam_stmt)
            exam = exam_result.scalar_one_or_none()
            if exam:
                exam_series = exam.exam_series

        template_bytes = generate_candidate_template(exam_series=exam_series)
        return StreamingResponse(
            iter([template_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename=candidate_upload_template.xlsx'},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}",
        )


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_school_user(
    user_data: SchoolUserCreate,
    session: DBSessionDep,
    current_user: SchoolAdminDep,
) -> UserResponse:
    """Create a new SCHOOL_USER for the coordinator's school."""
    # Ensure coordinator has a school
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Coordinator must be associated with a school",
        )

    # Check active user count before creating
    active_count = await count_active_school_users(session, current_user.school_id)
    if active_count >= MAX_ACTIVE_USERS_PER_SCHOOL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot create user: You have reached the maximum of {MAX_ACTIVE_USERS_PER_SCHOOL} active users. Please deactivate an existing user first.",
        )

    # Ensure role is SchoolStaff (coordinators can only create SchoolStaff accounts)
    if user_data.role != Role.SchoolStaff:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Coordinators can only create SchoolStaff accounts",
        )

    # Check if user already exists
    stmt = select(PortalUser).where(PortalUser.email == user_data.email)
    result = await session.execute(stmt)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Validate password length
    if len(user_data.password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {settings.password_min_length} characters long",
        )

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = PortalUser(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        role=Role.SchoolStaff,
        school_id=current_user.school_id,
        is_active=True,
        created_by_user_id=current_user.id,
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    return UserResponse.model_validate(new_user)


@router.get("/users", response_model=list[UserResponse])
async def list_school_users(
    session: DBSessionDep,
    current_user: SchoolAdminDep,
) -> list[UserResponse]:
    """List all users (SchoolAdmin + SchoolStaff) for coordinator's school."""
    # Ensure coordinator has a school
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Coordinator must be associated with a school",
        )

    stmt = select(PortalUser).where(
        PortalUser.school_id == current_user.school_id,
        PortalUser.role <= Role.SchoolStaff
    ).order_by(PortalUser.created_at.desc())
    result = await session.execute(stmt)
    users = result.scalars().all()

    return [UserResponse.model_validate(user) for user in users]


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_school_user(
    user_id: UUID,
    user_update: UserUpdate,
    session: DBSessionDep,
    current_user: SchoolAdminDep,
) -> UserResponse:
    """Update user (deactivate/activate, update name) for coordinator's school."""
    # Ensure coordinator has a school
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Coordinator must be associated with a school",
        )

    # Get user and verify it belongs to coordinator's school
    stmt = select(PortalUser).where(
        PortalUser.id == user_id,
        PortalUser.school_id == current_user.school_id,
    )
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found or does not belong to your school",
        )

    # Prevent coordinators from deactivating themselves
    if user.id == current_user.id and user_update.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account",
        )

    # Update fields if provided
    if user_update.full_name is not None:
        user.full_name = user_update.full_name
    if user_update.is_active is not None:
        user.is_active = user_update.is_active

    await session.commit()
    await session.refresh(user)

    return UserResponse.model_validate(user)


@router.get("/dashboard")
async def get_school_dashboard(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
):
    """Get school dashboard statistics for school users (coordinators and regular users)."""
    # Ensure user has a school
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School user must be associated with a school",
        )

    # Get school information
    school_stmt = select(School).where(School.id == current_user.school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()

    if not school:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="School not found",
        )

    # Count active users
    active_user_count = await count_active_school_users(session, current_user.school_id)

    # Count total candidates
    total_candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
        RegistrationCandidate.school_id == current_user.school_id
    )
    total_result = await session.execute(total_candidates_stmt)
    total_candidates = total_result.scalar_one() or 0

    # Count candidates by status
    candidates_by_status_stmt = (
        select(RegistrationCandidate.registration_status, func.count(RegistrationCandidate.id))
        .where(RegistrationCandidate.school_id == current_user.school_id)
        .group_by(RegistrationCandidate.registration_status)
    )
    status_result = await session.execute(candidates_by_status_stmt)
    candidates_by_status = {row[0].value: row[1] for row in status_result.all()}

    # Count distinct exams
    total_exams_stmt = select(func.count(func.distinct(RegistrationCandidate.registration_exam_id))).where(
        RegistrationCandidate.school_id == current_user.school_id
    )
    exams_result = await session.execute(total_exams_stmt)
    total_exams = exams_result.scalar_one() or 0

    return {
        "school": {
            "id": school.id,
            "code": school.code,
            "name": school.name,
            "is_active": school.is_active,
        },
        "active_user_count": active_user_count,
        "max_active_users": MAX_ACTIVE_USERS_PER_SCHOOL,
        "total_candidates": total_candidates,
        "candidates_by_status": candidates_by_status,
        "total_exams": total_exams,
    }


# Programme Management Endpoints

@router.get("/programmes/available", response_model=list[ProgrammeResponse])
async def list_available_programmes(
    session: DBSessionDep, current_user: SchoolUserWithSchoolDep
) -> list[ProgrammeResponse]:
    """List all available programmes in the system (for school coordinators to select from)."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Get all programmes in the system (created by system admin)
    programme_stmt = select(Programme).order_by(Programme.code)
    programme_result = await session.execute(programme_stmt)
    programmes = programme_result.scalars().all()

    return [ProgrammeResponse.model_validate(programme) for programme in programmes]


@router.get("/programmes", response_model=list[ProgrammeResponse])
async def list_school_programmes(
    session: DBSessionDep, current_user: SchoolUserWithSchoolDep
) -> list[ProgrammeResponse]:
    """List programmes available to the school (filtered by school's programmes)."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Get programmes for this school
    programme_stmt = (
        select(Programme)
        .join(school_programmes, Programme.id == school_programmes.c.programme_id)
        .where(school_programmes.c.school_id == current_user.school_id)
        .order_by(Programme.code)
    )
    programme_result = await session.execute(programme_stmt)
    programmes = programme_result.scalars().all()

    return [ProgrammeResponse.model_validate(programme) for programme in programmes]


@router.post("/programmes/{programme_id}", response_model=SchoolProgrammeAssociation, status_code=status.HTTP_201_CREATED)
async def associate_programme_with_school(
    programme_id: int, session: DBSessionDep, current_user: SchoolAdminDep
) -> SchoolProgrammeAssociation:
    """Associate a programme with the school (add to school's programme list)."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Check programme exists
    programme_stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(programme_stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Check if association already exists
    assoc_stmt = select(school_programmes).where(
        school_programmes.c.school_id == current_user.school_id, school_programmes.c.programme_id == programme_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Programme already associated with school"
        )

    # Create association
    await session.execute(insert(school_programmes).values(school_id=current_user.school_id, programme_id=programme_id))
    await session.commit()

    return SchoolProgrammeAssociation(school_id=current_user.school_id, programme_id=programme_id)


@router.delete("/programmes/{programme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_programme_from_school(
    programme_id: int, session: DBSessionDep, current_user: SchoolAdminDep
) -> None:
    """Remove programme from school."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Check association exists
    assoc_stmt = select(school_programmes).where(
        school_programmes.c.school_id == current_user.school_id, school_programmes.c.programme_id == programme_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme association not found")

    await session.execute(
        delete(school_programmes).where(
            school_programmes.c.school_id == current_user.school_id, school_programmes.c.programme_id == programme_id
        )
    )
    await session.commit()


@router.get("/programmes/{programme_id}", response_model=ProgrammeResponse)
async def get_programme(
    programme_id: int, session: DBSessionDep, current_user: SchoolUserWithSchoolDep
) -> ProgrammeResponse:
    """Get programme details (view-only for school users)."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Verify programme is associated with school
    assoc_stmt = select(school_programmes).where(
        school_programmes.c.school_id == current_user.school_id, school_programmes.c.programme_id == programme_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found or not associated with school"
        )

    # Get programme
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    return ProgrammeResponse.model_validate(programme)


@router.get("/programmes/{programme_id}/subjects", response_model=ProgrammeSubjectRequirements)
async def get_programme_subjects(
    programme_id: int, session: DBSessionDep, current_user: SchoolUserWithSchoolDep
) -> ProgrammeSubjectRequirements:
    """Get subjects for a programme (for registration UI)."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Verify programme is associated with school
    assoc_stmt = select(school_programmes).where(
        school_programmes.c.school_id == current_user.school_id, school_programmes.c.programme_id == programme_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found or not associated with school"
        )

    # Get programme subject requirements
    from app.schemas.programme import ProgrammeSubjectResponse, SubjectChoiceGroup

    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Get all subjects for this programme
    subject_stmt = (
        select(
            Subject,
            programme_subjects.c.created_at,
            programme_subjects.c.is_compulsory,
            programme_subjects.c.choice_group_id,
        )
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .where(programme_subjects.c.programme_id == programme_id)
        .order_by(Subject.code)
    )
    subject_result = await session.execute(subject_stmt)
    subjects_data = subject_result.all()

    # Organize subjects into categories
    compulsory_core = []
    optional_core_by_group: dict[int, list[ProgrammeSubjectResponse]] = {}
    electives = []

    for subject, created_at, is_compulsory, choice_group_id in subjects_data:
        subject_response = ProgrammeSubjectResponse(
            subject_id=subject.id,
            subject_code=subject.code,
            subject_name=subject.name,
            subject_type=subject.subject_type,
            is_compulsory=is_compulsory,
            choice_group_id=choice_group_id,
            created_at=created_at,
        )

        from app.models import SubjectType
        if subject.subject_type == SubjectType.CORE:
            if is_compulsory is True:
                compulsory_core.append(subject_response)
            elif is_compulsory is False and choice_group_id is not None:
                if choice_group_id not in optional_core_by_group:
                    optional_core_by_group[choice_group_id] = []
                optional_core_by_group[choice_group_id].append(subject_response)
        elif subject.subject_type == SubjectType.ELECTIVE:
            electives.append(subject_response)

    # Convert optional core groups to SubjectChoiceGroup list
    optional_core_groups = [
        SubjectChoiceGroup(choice_group_id=group_id, subjects=subjects)
        for group_id, subjects in sorted(optional_core_by_group.items())
    ]

    return ProgrammeSubjectRequirements(
        compulsory_core=compulsory_core,
        optional_core_groups=optional_core_groups,
        electives=electives,
    )


# Photo Management Endpoints

@router.post("/candidates/{candidate_id}/photos", response_model=RegistrationCandidatePhotoResponse, status_code=status.HTTP_201_CREATED)
async def upload_candidate_photo(
    candidate_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    file: UploadFile = File(...),
) -> RegistrationCandidatePhotoResponse:
    """Upload/replace photo for a candidate (automatically deletes existing photo if present)."""
    # Validate candidate exists and belongs to school
    candidate_stmt = select(RegistrationCandidate).where(RegistrationCandidate.id == candidate_id)
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if current_user.school_id and candidate.school_id != current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidate does not belong to your school",
        )

    # Read file content
    content = await file.read()

    # Validate photo (file type, dimensions, file size)
    PhotoValidationService.validate_all(content, file.content_type or "")

    # Delete existing photo if present (one photo per candidate)
    existing_photo_stmt = select(RegistrationCandidatePhoto).where(
        RegistrationCandidatePhoto.registration_candidate_id == candidate_id
    )
    existing_photo_result = await session.execute(existing_photo_stmt)
    existing_photo = existing_photo_result.scalar_one_or_none()

    if existing_photo:
        try:
            # Delete the file from storage
            await photo_storage_service.delete(existing_photo.file_path)
        except Exception as e:
            logger.warning(f"Failed to delete old photo file {existing_photo.file_path}: {e}")
        # Delete the database record
        await session.delete(existing_photo)
        await session.commit()

    # Calculate checksum
    checksum = calculate_checksum(content)

    # Rename file using candidate's registration number
    original_filename = file.filename or "photo.jpg"
    ext = Path(original_filename).suffix or ".jpg"
    new_filename = f"{candidate.registration_number}{ext}" if candidate.registration_number else original_filename

    # Save photo file (renamed using registration number)
    file_path, _ = await photo_storage_service.save(
        content, new_filename, candidate_id, candidate.registration_exam_id, candidate.registration_number
    )

    # Create photo record
    db_photo = RegistrationCandidatePhoto(
        registration_candidate_id=candidate_id,
        file_path=file_path,
        file_name=new_filename,
        mime_type=file.content_type or "image/jpeg",
        checksum=checksum,
    )
    session.add(db_photo)
    await session.commit()
    await session.refresh(db_photo)

    return RegistrationCandidatePhotoResponse.model_validate(db_photo)


@router.get("/candidates/{candidate_id}/photos", response_model=RegistrationCandidatePhotoResponse | None)
async def get_candidate_photo(
    candidate_id: int, session: DBSessionDep, current_user: SchoolUserWithSchoolDep
) -> RegistrationCandidatePhotoResponse | None:
    """Get candidate's photo (returns single photo or null)."""
    # Validate candidate exists and belongs to school
    candidate_stmt = select(RegistrationCandidate).where(RegistrationCandidate.id == candidate_id)
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if current_user.school_id and candidate.school_id != current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidate does not belong to your school",
        )

    # Get photo
    photo_stmt = select(RegistrationCandidatePhoto).where(
        RegistrationCandidatePhoto.registration_candidate_id == candidate_id
    )
    photo_result = await session.execute(photo_stmt)
    photo = photo_result.scalar_one_or_none()

    if not photo:
        return None

    return RegistrationCandidatePhotoResponse.model_validate(photo)


@router.get("/candidates/{candidate_id}/photos/file")
async def get_candidate_photo_file(
    candidate_id: int, session: DBSessionDep, current_user: SchoolUserWithSchoolDep
) -> StreamingResponse:
    """Get photo file."""
    # Validate candidate exists and belongs to school
    candidate_stmt = select(RegistrationCandidate).where(RegistrationCandidate.id == candidate_id)
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if current_user.school_id and candidate.school_id != current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidate does not belong to your school",
        )

    # Get photo
    photo_stmt = select(RegistrationCandidatePhoto).where(
        RegistrationCandidatePhoto.registration_candidate_id == candidate_id
    )
    photo_result = await session.execute(photo_stmt)
    photo = photo_result.scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    # Retrieve file
    try:
        if not await photo_storage_service.exists(photo.file_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Photo file not found in storage"
            )
        file_content = await photo_storage_service.retrieve(photo.file_path)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error retrieving photo file {photo.file_path}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to retrieve photo file: {str(e)}"
        )

    return StreamingResponse(
        iter([file_content]),
        media_type=photo.mime_type,
        headers={"Content-Disposition": f'inline; filename="{photo.file_name}"'},
    )


@router.get("/candidates/{candidate_id}/index-slip")
async def download_candidate_index_slip(
    candidate_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> StreamingResponse:
    """Download Index Slip PDF for a candidate (school admin only)."""
    # Get candidate and verify it belongs to the user's school
    candidate_stmt = select(RegistrationCandidate).where(
        RegistrationCandidate.id == candidate_id,
        RegistrationCandidate.school_id == current_user.school_id,
    )
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if not candidate.index_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Index number must be generated before downloading Index Slip",
        )

    # Generate PDF (service function will load photo if needed)
    try:
        pdf_bytes = await generate_index_slip_pdf(candidate, session, photo_data=None)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate Index Slip PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate Index Slip PDF",
        )

    filename = f"index_slip_{candidate.index_number}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exams/{exam_id}/candidates/summary.pdf")
async def download_registration_summary(
    exam_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    programme_id: int | None = Query(None, description="Optional programme ID to filter candidates"),
) -> StreamingResponse:
    """Download registration summary PDF with candidates grouped by programme."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Validate exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Generate PDF
    try:
        pdf_bytes = await generate_registration_summary_pdf(
            session, exam_id, current_user.school_id, programme_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate registration summary PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate registration summary PDF",
        )

    programme_suffix = f"_programme_{programme_id}" if programme_id else ""
    filename = f"registration_summary_{exam.exam_type}_{exam.year}_{exam.exam_series}{programme_suffix}.pdf"
    # Sanitize filename
    filename = filename.replace("/", "_").replace("\\", "_")

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exams/{exam_id}/candidates/detailed.pdf")
async def download_registration_detailed(
    exam_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    programme_id: int | None = Query(None, description="Optional programme ID to filter candidates"),
) -> StreamingResponse:
    """Download detailed registration PDF with one candidate per page."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Validate exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Generate PDF
    try:
        pdf_bytes = await generate_registration_detailed_pdf(
            session, exam_id, current_user.school_id, programme_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate registration detailed PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate registration detailed PDF",
        )

    programme_suffix = f"_programme_{programme_id}" if programme_id else ""
    filename = f"registration_detailed_{exam.exam_type}_{exam.year}_{exam.exam_series}{programme_suffix}.pdf"
    # Sanitize filename
    filename = filename.replace("/", "_").replace("\\", "_")

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exams/{exam_id}/index-slips/download")
async def download_index_slips_bulk(
    exam_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    programme_id: int | None = Query(None, description="Optional programme ID to filter candidates"),
) -> StreamingResponse:
    """Download index slips for multiple candidates as a ZIP file."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Validate exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Query candidates with index numbers
    candidate_stmt = (
        select(RegistrationCandidate)
        .where(
            RegistrationCandidate.registration_exam_id == exam_id,
            RegistrationCandidate.school_id == current_user.school_id,
            RegistrationCandidate.index_number.isnot(None),
        )
        .order_by(RegistrationCandidate.name)
    )

    if programme_id:
        candidate_stmt = candidate_stmt.where(RegistrationCandidate.programme_id == programme_id)

    candidate_result = await session.execute(candidate_stmt)
    candidates = candidate_result.scalars().all()

    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No candidates with index numbers found for the selected filters",
        )

    # Create ZIP file in memory
    zip_buffer = BytesIO()

    try:
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for candidate in candidates:
                try:
                    # Generate PDF for each candidate
                    pdf_bytes = await generate_index_slip_pdf(candidate, session, photo_data=None)

                    # Use index number for filename
                    filename = f"index_slip_{candidate.index_number}.pdf"
                    zip_file.writestr(filename, pdf_bytes)
                except Exception as e:
                    logger.warning(f"Failed to generate index slip for candidate {candidate.id}: {e}")
                    # Continue with other candidates even if one fails
                    continue

        zip_buffer.seek(0)
    except Exception as e:
        logger.error(f"Failed to create index slips ZIP: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create index slips ZIP file",
        )

    programme_suffix = f"_programme_{programme_id}" if programme_id else ""
    zip_filename = f"index_slips_{exam.exam_type}_{exam.year}_{exam.exam_series}{programme_suffix}.zip"
    # Sanitize filename
    zip_filename = zip_filename.replace("/", "_").replace("\\", "_")

    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
    )


@router.delete("/candidates/{candidate_id}/photos", status_code=status.HTTP_204_NO_CONTENT)
async def delete_candidate_photo(
    candidate_id: int, session: DBSessionDep, current_user: SchoolUserWithSchoolDep
) -> None:
    """Delete candidate's photo."""
    # Validate candidate exists and belongs to school
    candidate_stmt = select(RegistrationCandidate).where(RegistrationCandidate.id == candidate_id)
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if current_user.school_id and candidate.school_id != current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidate does not belong to your school",
        )

    # Get photo
    photo_stmt = select(RegistrationCandidatePhoto).where(
        RegistrationCandidatePhoto.registration_candidate_id == candidate_id
    )
    photo_result = await session.execute(photo_stmt)
    photo = photo_result.scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    # Delete file from storage
    try:
        await photo_storage_service.delete(photo.file_path)
    except Exception as e:
        logger.warning(f"Failed to delete photo file {photo.file_path}: {e}")

    # Delete database record
    await session.delete(photo)
    await session.commit()


@router.post("/candidates/photos/bulk-upload", response_model=PhotoBulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_photos(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    exam_id: int = Form(...),
    files: list[UploadFile] = File(...),
) -> PhotoBulkUploadResponse:
    """Bulk upload photos (zip file with photos named by registration_number or index_number)."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Validate exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    total = len(files)
    successful = 0
    failed = 0
    skipped = 0
    errors: list[PhotoBulkUploadError] = []

    for file in files:
        filename = file.filename or "unknown"
        try:
            # Read file content
            content = await file.read()

            # Validate photo
            try:
                PhotoValidationService.validate_all(content, file.content_type or "")
            except HTTPException as e:
                errors.append(
                    PhotoBulkUploadError(
                        filename=filename,
                        registration_number=None,
                        index_number=None,
                        error_message=e.detail.get("message", "Photo validation failed") if isinstance(e.detail, dict) else str(e.detail),
                    )
                )
                failed += 1
                continue

            # Extract registration number or index number from filename
            # Prioritize registration_number over index_number
            # Filename format: {registration_number}.jpg or {index_number}.jpg
            base_name = filename.rsplit(".", 1)[0]  # Remove extension

            # Try to find candidate by registration_number first, then index_number
            candidate_stmt = select(RegistrationCandidate).where(
                and_(
                    RegistrationCandidate.registration_exam_id == exam_id,
                    RegistrationCandidate.school_id == current_user.school_id,
                    RegistrationCandidate.registration_number == base_name,
                )
            )
            candidate_result = await session.execute(candidate_stmt)
            candidate = candidate_result.scalar_one_or_none()

            # If not found by registration_number, try index_number
            if not candidate:
                candidate_stmt = select(RegistrationCandidate).where(
                    and_(
                        RegistrationCandidate.registration_exam_id == exam_id,
                        RegistrationCandidate.school_id == current_user.school_id,
                        RegistrationCandidate.index_number == base_name,
                    )
                )
            candidate_result = await session.execute(candidate_stmt)
            candidate = candidate_result.scalar_one_or_none()

            if not candidate:
                errors.append(
                    PhotoBulkUploadError(
                        filename=filename,
                        registration_number=None,
                        index_number=None,
                        error_message=f"No candidate found with registration_number or index_number matching '{base_name}'",
                    )
                )
                failed += 1
                continue

            # Delete existing photo if present
            existing_photo_stmt = select(RegistrationCandidatePhoto).where(
                RegistrationCandidatePhoto.registration_candidate_id == candidate.id
            )
            existing_photo_result = await session.execute(existing_photo_stmt)
            existing_photo = existing_photo_result.scalar_one_or_none()

            if existing_photo:
                try:
                    await photo_storage_service.delete(existing_photo.file_path)
                except Exception as e:
                    logger.warning(f"Failed to delete old photo file {existing_photo.file_path}: {e}")
                await session.delete(existing_photo)
                await session.commit()

            # Calculate checksum
            checksum = calculate_checksum(content)

            # Rename file using candidate's registration number
            ext = Path(filename).suffix or ".jpg"
            new_filename = f"{candidate.registration_number}{ext}" if candidate.registration_number else filename

            # Save photo file (renamed using registration number)
            file_path, _ = await photo_storage_service.save(
                content, new_filename, candidate.id, exam_id, candidate.registration_number
            )

            # Create photo record
            db_photo = RegistrationCandidatePhoto(
                registration_candidate_id=candidate.id,
                file_path=file_path,
                file_name=new_filename,
                mime_type=file.content_type or "image/jpeg",
                checksum=checksum,
            )
            session.add(db_photo)
            await session.commit()

            successful += 1

        except Exception as e:
            logger.error(f"Unexpected error processing photo {filename}: {e}", exc_info=True)
            errors.append(
                PhotoBulkUploadError(
                    filename=filename,
                    registration_number=None,
                    index_number=None,
                    error_message=f"Unexpected error: {str(e)}",
                )
            )
            failed += 1
            continue

    return PhotoBulkUploadResponse(
        total=total,
        successful=successful,
        failed=failed,
        skipped=skipped,
        errors=errors,
    )


@router.get("/candidates/photos/album", response_model=PhotoAlbumResponse)
async def get_photo_album(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=10000),
    exam_id: int | None = Query(None, description="Filter by exam ID"),
    programme_id: int | None = Query(None, description="Filter by programme ID"),
    has_photo: bool | None = Query(None, description="Filter by presence of photo"),
) -> PhotoAlbumResponse:
    """Get photo album with pagination and filtering."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    offset = (page - 1) * page_size

    # Build base query for candidates
    base_stmt = select(RegistrationCandidate, School)
    base_stmt = base_stmt.join(School, RegistrationCandidate.school_id == School.id)
    base_stmt = base_stmt.where(RegistrationCandidate.school_id == current_user.school_id)

    # Apply filters
    if exam_id is not None:
        base_stmt = base_stmt.where(RegistrationCandidate.registration_exam_id == exam_id)

    if programme_id is not None:
        base_stmt = base_stmt.where(RegistrationCandidate.programme_id == programme_id)

    # Get total count
    count_stmt = select(func.count(func.distinct(RegistrationCandidate.id)))
    count_stmt = count_stmt.where(RegistrationCandidate.school_id == current_user.school_id)
    if exam_id is not None:
        count_stmt = count_stmt.where(RegistrationCandidate.registration_exam_id == exam_id)
    if programme_id is not None:
        count_stmt = count_stmt.where(RegistrationCandidate.programme_id == programme_id)
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # If has_photo filter is applied, we need to filter candidates
    if has_photo is not None:
        # Get all candidate IDs matching other filters
        all_candidates_stmt = select(RegistrationCandidate.id)
        all_candidates_stmt = all_candidates_stmt.where(RegistrationCandidate.school_id == current_user.school_id)
        if exam_id is not None:
            all_candidates_stmt = all_candidates_stmt.where(RegistrationCandidate.registration_exam_id == exam_id)
        if programme_id is not None:
            all_candidates_stmt = all_candidates_stmt.where(RegistrationCandidate.programme_id == programme_id)

        all_candidates_result = await session.execute(all_candidates_stmt)
        all_candidate_ids = [row[0] for row in all_candidates_result.all()]

        # Filter by photo presence
        if has_photo:
            # Get candidates with photos
            photos_stmt = select(RegistrationCandidatePhoto.registration_candidate_id)
            if all_candidate_ids:
                photos_stmt = photos_stmt.where(RegistrationCandidatePhoto.registration_candidate_id.in_(all_candidate_ids))
            photos_result = await session.execute(photos_stmt)
            candidate_ids_with_photos = {row[0] for row in photos_result.all()}
            filtered_candidate_ids = [cid for cid in all_candidate_ids if cid in candidate_ids_with_photos]
        else:
            # Get candidates without photos
            photos_stmt = select(RegistrationCandidatePhoto.registration_candidate_id)
            if all_candidate_ids:
                photos_stmt = photos_stmt.where(RegistrationCandidatePhoto.registration_candidate_id.in_(all_candidate_ids))
            photos_result = await session.execute(photos_stmt)
            candidate_ids_with_photos = {row[0] for row in photos_result.all()}
            filtered_candidate_ids = [cid for cid in all_candidate_ids if cid not in candidate_ids_with_photos]

        # Update total and base query
        total = len(filtered_candidate_ids)
        if not filtered_candidate_ids:
            return PhotoAlbumResponse(
                items=[],
                total=0,
                page=page,
                page_size=page_size,
                total_pages=0,
            )

        base_stmt = base_stmt.where(RegistrationCandidate.id.in_(filtered_candidate_ids))

    # Get candidates
    stmt = base_stmt.offset(offset).limit(page_size).order_by(RegistrationCandidate.registration_number)
    result = await session.execute(stmt)
    candidate_school_pairs = result.all()

    # Build response items
    items: list[PhotoAlbumItem] = []
    for candidate, school in candidate_school_pairs:
        # Get photo for this candidate
        photo_stmt = select(RegistrationCandidatePhoto).where(
            RegistrationCandidatePhoto.registration_candidate_id == candidate.id
        )
        photo_result = await session.execute(photo_stmt)
        photo = photo_result.scalar_one_or_none()

        photo_response = RegistrationCandidatePhotoResponse.model_validate(photo) if photo else None

        items.append(
            PhotoAlbumItem(
                candidate_id=candidate.id,
                candidate_name=candidate.name,
                registration_number=candidate.registration_number,
                index_number=candidate.index_number,
                school_id=school.id if school else None,
                school_name=school.name if school else None,
                school_code=school.code if school else None,
                photo=photo_response,
            )
        )

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return PhotoAlbumResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/invoices/free-tvet/by-examination", response_model=SchoolInvoiceResponse)
async def get_free_tvet_invoice_by_examination(
    session: DBSessionDep,
    current_user: SchoolAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
) -> SchoolInvoiceResponse:
    """Generate invoice for free_tvet candidates by examination."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not associated with a school",
        )

    # Get school
    school_stmt = select(School).where(School.id == current_user.school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Get aggregated data
    invoice_data = await aggregate_candidates_by_examination(
        session, current_user.school_id, exam_id, RegistrationType.FREE_TVET.value
    )

    # Get exam details
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    return SchoolInvoiceResponse(
        school_id=school.id,
        school_code=school.code,
        school_name=school.name,
        registration_type=RegistrationType.FREE_TVET.value,
        examination=ExaminationInvoiceItem(
            exam_id=invoice_data["exam_id"],
            exam_type=invoice_data["exam_type"],
            exam_series=invoice_data["exam_series"],
            year=invoice_data["year"],
            candidate_count=invoice_data["candidate_count"],
            total_amount=invoice_data["total_amount"],
        ),
        generated_at=datetime.utcnow(),
    )


@router.get("/invoices/free-tvet/by-examination-grouped-by-programme", response_model=SchoolInvoiceResponse)
async def get_free_tvet_invoice_by_examination_grouped_by_programme(
    session: DBSessionDep,
    current_user: SchoolAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
) -> SchoolInvoiceResponse:
    """Generate invoice for free_tvet candidates by examination grouped by programme."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not associated with a school",
        )

    # Get school
    school_stmt = select(School).where(School.id == current_user.school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Get aggregated data
    invoice_data = await aggregate_candidates_by_examination_and_programme(
        session, current_user.school_id, exam_id, RegistrationType.FREE_TVET.value
    )

    # Build programme items
    programme_items = [
        ProgrammeInvoiceItem(
            programme_id=prog["programme_id"],
            programme_code=prog["programme_code"],
            programme_name=prog["programme_name"],
            candidate_count=prog["candidate_count"],
            total_amount=prog["total_amount"],
        )
        for prog in invoice_data["programmes"]
    ]

    return SchoolInvoiceResponse(
        school_id=school.id,
        school_code=school.code,
        school_name=school.name,
        registration_type=RegistrationType.FREE_TVET.value,
        examination=ExaminationInvoiceItem(
            exam_id=invoice_data["exam_id"],
            exam_type=invoice_data["exam_type"],
            exam_series=invoice_data["exam_series"],
            year=invoice_data["year"],
            candidate_count=invoice_data["candidate_count"],
            total_amount=invoice_data["total_amount"],
            programmes=programme_items,
        ),
        generated_at=datetime.utcnow(),
    )


@router.get("/invoices/referral/by-examination", response_model=SchoolInvoiceResponse)
async def get_referral_invoice_by_examination(
    session: DBSessionDep,
    current_user: SchoolAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
) -> SchoolInvoiceResponse:
    """Generate invoice for referral candidates by examination."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not associated with a school",
        )

    # Get school
    school_stmt = select(School).where(School.id == current_user.school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Get aggregated data
    invoice_data = await aggregate_candidates_by_examination(
        session, current_user.school_id, exam_id, RegistrationType.REFERRAL.value
    )

    return SchoolInvoiceResponse(
        school_id=school.id,
        school_code=school.code,
        school_name=school.name,
        registration_type=RegistrationType.REFERRAL.value,
        examination=ExaminationInvoiceItem(
            exam_id=invoice_data["exam_id"],
            exam_type=invoice_data["exam_type"],
            exam_series=invoice_data["exam_series"],
            year=invoice_data["year"],
            candidate_count=invoice_data["candidate_count"],
            total_amount=invoice_data["total_amount"],
        ),
        generated_at=datetime.utcnow(),
    )


@router.get("/invoices/free-tvet/pdf")
async def download_free_tvet_invoice_pdf(
    session: DBSessionDep,
    current_user: SchoolAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
    group_by_programme: bool = Query(False, description="Group by programme"),
) -> StreamingResponse:
    """Download PDF invoice for free_tvet candidates."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not associated with a school",
        )

    try:
        pdf_bytes = await generate_school_invoice_pdf(
            session,
            current_user.school_id,
            exam_id,
            RegistrationType.FREE_TVET.value,
            group_by_programme=group_by_programme,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    filename = f"free_tvet_invoice_exam_{exam_id}"
    if group_by_programme:
        filename += "_by_programme"
    filename += ".pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/invoices/referral/pdf")
async def download_referral_invoice_pdf(
    session: DBSessionDep,
    current_user: SchoolAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
) -> StreamingResponse:
    """Download PDF invoice for referral candidates."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not associated with a school",
        )

    try:
        pdf_bytes = await generate_school_invoice_pdf(
            session,
            current_user.school_id,
            exam_id,
            RegistrationType.REFERRAL.value,
            group_by_programme=False,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    filename = f"referral_invoice_exam_{exam_id}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
