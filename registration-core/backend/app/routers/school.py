"""School portal endpoints for school users."""
from datetime import datetime, date, time
from pathlib import Path
from typing import Annotated, Any
from uuid import UUID
import io
import os
import csv
import zipfile
import re
from io import BytesIO

from fastapi import APIRouter, HTTPException, status, UploadFile, File, Query, Depends, Form
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_, or_, func, insert, delete
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
    ExamEligibleSchool,
    RegistrationCandidate,
    RegistrationCandidateNotDuplicate,
    RegistrationStatus,
    RegistrationType,
    School,
    Programme,
    Subject,
    RegistrationCandidatePhoto,
    RegistrationSubjectSelection,
    PhotoValidationJob,
    PhotoValidationJobStatus,
    school_programmes,
    programme_subjects,
)
from app.schemas.expectations import (
    SchoolExamExpectationsResponse,
    SchoolExamExpectationsUpdate,
)
from app.services.registration_expectations import (
    get_school_exam_expectations,
    upsert_school_exam_expectations,
)
from app.services.exam_eligibility_service import (
    is_school_eligible_for_exam,
    school_allows_free_tvet_for_exam,
)
from app.services.late_registration_service import (
    exam_ids_with_active_late_window_for_school,
    is_registration_open_for_school,
)
from app.services.exam_response import serialize_exam, exam_load_options
from app.services.exam_kind_service import (
    is_private_exam,
    validate_registration_type_for_exam,
    resolve_examination_center,
)
from app.services.registration_cohorts import school_mediated_type_filter
from app.schemas.registration import (
    RegistrationCandidateCreate,
    RegistrationCandidateUpdate,
    RegistrationCandidateResponse,
    BulkUploadResponse,
    BulkCandidateChunkRequest,
    BulkCandidateParseResponse,
    BulkUploadResultsExportRequest,
    RegistrationExamResponse,
    RegistrationCandidatePhotoResponse,
    PhotoAlbumResponse,
    PhotoAlbumItem,
    PhotoExamSummaryResponse,
    PhotoExamSummaryItem,
    PhotoBulkUploadResponse,
    PhotoBulkUploadError,
    PhotoValidationJobResponse,
    CandidateFeeBulkUpdate,
    DuplicateMatchesResponse,
    CandidateNotDuplicateCreate,
)
from app.services.bulk_candidate_upload import process_bulk_candidate_rows
from app.services.duplicate_detection import (
    DEFAULT_NAME_THRESHOLD,
    clear_not_duplicate_marks_for_candidate,
    find_school_exam_duplicates,
    removal_block_reason,
)
from app.schemas.programme import (
    ProgrammeResponse,
    ProgrammeSubjectRequirements,
    SchoolProgrammeAssociation,
)
from app.services.template_generator import (
    generate_bulk_upload_instructions_pdf,
    generate_candidate_template,
)
from app.schemas.user import SchoolUserCreate, UserUpdate
from app.schemas.auth import UserResponse
from app.core.security import get_password_hash
from app.utils.registration import generate_unique_registration_number
from app.config import settings
from app.services.subject_selection import (
    auto_select_subjects_for_programme,
    validate_subject_selections,
    get_programme_subjects_for_registration,
)
from app.services.photo_storage import PhotoStorageService, calculate_checksum
from app.services.index_slip_service import generate_index_slip_pdf
from app.services.photo_validation import PhotoValidationService
from app.services.bulk_photo_validation import process_bulk_photo_validation, process_bulk_photo_resize, process_bulk_background_replacement
from app.services.mediapipe_photo_validation import replace_background
from fastapi import BackgroundTasks
from app.services.registration_completeness import (
    apply_fee_paid,
    apply_fee_waived,
    default_fee_payment_status,
    recompute_registration_status,
)
from app.services.registration_download_service import (
    generate_registration_summary_pdf,
    generate_registration_detailed_pdf,
    generate_missing_photos_summary_pdf,
)
from app.schemas.invoice import SchoolInvoiceResponse, ProgrammeInvoiceItem, ExaminationInvoiceItem
from app.services.school_invoice_service import (
    aggregate_candidates_by_examination,
    aggregate_candidates_by_examination_and_programme,
    generate_school_invoice_pdf,
)
from app.services.timetable_service import generate_timetable_pdf
from app.schemas.timetable import TimetableDownloadFilter
from app.schemas.school import SchoolUpdate, SchoolResponse
from app.utils.school import check_school_profile_completion
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
    """List school and private exams open for this school (main period or late window)."""
    now = datetime.utcnow()
    school_id = current_user.school_id

    main_open_stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .join(ExamEligibleSchool, ExamEligibleSchool.exam_id == RegistrationExam.id)
        .where(
            ExamRegistrationPeriod.is_active.is_(True),
            ExamRegistrationPeriod.registration_start_date <= now,
            ExamRegistrationPeriod.registration_end_date >= now,
            ExamEligibleSchool.school_id == school_id,
        )
        .options(*exam_load_options())
    )
    main_exams = list((await session.execute(main_open_stmt)).scalars().unique().all())
    by_id = {exam.id: exam for exam in main_exams}

    late_exam_ids = await exam_ids_with_active_late_window_for_school(session, school_id, now)
    missing_ids = [eid for eid in late_exam_ids if eid not in by_id]
    if missing_ids:
        late_stmt = (
            select(RegistrationExam)
            .join(
                ExamRegistrationPeriod,
                RegistrationExam.registration_period_id == ExamRegistrationPeriod.id,
            )
            .join(ExamEligibleSchool, ExamEligibleSchool.exam_id == RegistrationExam.id)
            .where(
                RegistrationExam.id.in_(missing_ids),
                ExamEligibleSchool.school_id == school_id,
            )
            .options(*exam_load_options())
        )
        for exam in (await session.execute(late_stmt)).scalars().unique().all():
            by_id[exam.id] = exam

    exams = sorted(
        by_id.values(),
        key=lambda e: (e.year, e.exam_type or "", e.exam_series or ""),
        reverse=True,
    )
    responses = []
    for exam in exams:
        allows_free = await school_allows_free_tvet_for_exam(session, exam.id, school_id)
        expected_total = next(
            (
                row.expected_total
                for row in (exam.eligible_schools or [])
                if row.school_id == school_id
            ),
            None,
        )
        responses.append(
            serialize_exam(
                exam,
                allows_free_tvet=allows_free,
                expected_total=expected_total,
            )
        )
    return responses


@router.get("/exams/all", response_model=list[RegistrationExamResponse])
async def list_all_exams(
    session: DBSessionDep, current_user: SchoolUserWithSchoolDep
) -> list[RegistrationExamResponse]:
    """List all eligible school and private exams (open and closed) for this school."""
    school_id = current_user.school_id
    stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .join(ExamEligibleSchool, ExamEligibleSchool.exam_id == RegistrationExam.id)
        .where(
            ExamEligibleSchool.school_id == school_id,
        )
        .options(*exam_load_options())
        .order_by(RegistrationExam.year.desc(), RegistrationExam.exam_type, RegistrationExam.exam_series)
    )
    result = await session.execute(stmt)
    exams = result.scalars().unique().all()

    responses = []
    for exam in exams:
        allows_free = await school_allows_free_tvet_for_exam(session, exam.id, school_id)
        expected_total = next(
            (
                row.expected_total
                for row in (exam.eligible_schools or [])
                if row.school_id == school_id
            ),
            None,
        )
        responses.append(
            serialize_exam(
                exam,
                allows_free_tvet=allows_free,
                expected_total=expected_total,
            )
        )
    return responses


@router.get(
    "/exams/{exam_id}/expectations",
    response_model=SchoolExamExpectationsResponse,
)
async def get_exam_expectations(
    exam_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> SchoolExamExpectationsResponse:
    """Get optional expected registration counts and live progress for an exam."""
    return await get_school_exam_expectations(
        session, exam_id=exam_id, school_id=current_user.school_id
    )


@router.put(
    "/exams/{exam_id}/expectations",
    response_model=SchoolExamExpectationsResponse,
)
async def put_exam_expectations(
    exam_id: int,
    payload: SchoolExamExpectationsUpdate,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> SchoolExamExpectationsResponse:
    """Create, update, or clear optional expected registration counts for an exam."""
    return await upsert_school_exam_expectations(
        session,
        exam_id=exam_id,
        school_id=current_user.school_id,
        payload=payload,
        user_id=current_user.id,
    )


@router.get(
    "/exams/{exam_id}/duplicates",
    response_model=DuplicateMatchesResponse,
)
async def list_exam_duplicate_candidates(
    exam_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    same_programme: bool = Query(False, description="Require matching programme_id"),
    same_dob: bool = Query(True, description="Require matching non-null date of birth"),
    threshold: float = Query(
        DEFAULT_NAME_THRESHOLD,
        ge=0.5,
        le=1.0,
        description="Minimum name similarity ratio (0.5–1.0)",
    ),
) -> DuplicateMatchesResponse:
    """Find likely duplicate registrations for this school on one exam (name similarity)."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="School user is not associated with a school",
        )

    exam_stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    exam = (await session.execute(exam_stmt)).scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")

    if not await is_school_eligible_for_exam(session, exam_id, current_user.school_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your school is not eligible for this examination",
        )

    return await find_school_exam_duplicates(
        session,
        school_id=current_user.school_id,
        exam=exam,
        same_programme=same_programme,
        same_dob=same_dob,
        threshold=threshold,
    )


@router.get("/candidates", response_model=list[RegistrationCandidateResponse])
async def list_candidates(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    exam_id: int | None = None,
) -> list[RegistrationCandidateResponse]:
    """List registered candidates for the school (scoped by exam kind when exam_id given)."""
    query = select(RegistrationCandidate).where(RegistrationCandidate.school_id == current_user.school_id)

    if exam_id:
        exam = (
            await session.execute(select(RegistrationExam).where(RegistrationExam.id == exam_id))
        ).scalar_one_or_none()
        query = query.where(RegistrationCandidate.registration_exam_id == exam_id)
        if exam is not None:
            from app.services.registration_cohorts import candidate_type_filter_for_exam

            query = query.where(candidate_type_filter_for_exam(exam))
    else:
        # Without exam filter, show school-mediated + private candidates at this school/center
        pass

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
                "exam_kind": (
                    candidate.exam.exam_kind.value
                    if hasattr(candidate.exam.exam_kind, "value")
                    else str(candidate.exam.exam_kind)
                ),
                "allows_referral_registration": bool(candidate.exam.allows_referral_registration),
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


def validate_registration_type_and_guardian(
    exam: RegistrationExam,
    registration_type: str | None,
    guardian_name: str | None,
    guardian_phone: str | None,
    *,
    is_school_registration: bool = False,
    allows_free_tvet: bool | None = None,
) -> str:
    """
    Validate registration_type against exam kind, Free TVET eligibility, and guardian requirements.
    """
    resolved = validate_registration_type_for_exam(
        exam,
        registration_type,
        is_school_registration=is_school_registration,
        allows_free_tvet=allows_free_tvet,
    )

    if resolved == RegistrationType.PRIVATE.value and not is_school_registration:
        if not guardian_name or not guardian_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Guardian name and phone are required for private registration type",
            )
    return resolved


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

    if not await is_school_eligible_for_exam(session, exam_id, current_user.school_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your school is not eligible to register candidates for this examination",
        )

    if not await is_registration_open_for_school(session, exam, current_user.school_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Registration period is not open")

    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="School ID is required for candidate registration",
        )

    allows_free_tvet = await school_allows_free_tvet_for_exam(
        session, exam_id, current_user.school_id
    )

    # Validate registration_type against exam kind + Free TVET eligibility
    registration_type = validate_registration_type_and_guardian(
        exam,
        candidate_data.registration_type,
        candidate_data.guardian_name,
        candidate_data.guardian_phone,
        is_school_registration=True,
        allows_free_tvet=allows_free_tvet,
    )

    # Resolve school_id: registering school for school exams; examination center for private exams
    if is_private_exam(exam):
        center = await resolve_examination_center(
            session,
            school_id=candidate_data.school_id,
            registering_school_id=current_user.school_id,
        )
        candidate_school_id = center.id
    else:
        candidate_school_id = current_user.school_id

    # Programme is required for all registration types
    programme_id = candidate_data.programme_id
    if not programme_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Programme selection is required",
        )

    programme_stmt = select(Programme).where(Programme.id == programme_id)
    programme_result = await session.execute(programme_stmt)
    programme = programme_result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    if current_user.school_id:
        assoc_stmt = select(school_programmes).where(
            school_programmes.c.school_id == current_user.school_id,
            school_programmes.c.programme_id == programme_id,
        )
        assoc_result = await session.execute(assoc_stmt)
        if not assoc_result.first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Programme is not available for your school. Please contact your administrator.",
            )

    from app.services.programme_type_service import is_programme_enabled_for_exam

    if not await is_programme_enabled_for_exam(session, exam.id, programme_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Programme is not enabled for this examination",
        )

    registration_number = await generate_unique_registration_number(
        session, exam_id, candidate_school_id, registration_type
    )
    is_referral = registration_type == RegistrationType.REFERRAL.value
    is_private_type = registration_type == RegistrationType.PRIVATE.value
    is_structured_type = registration_type in (
        RegistrationType.FREE_TVET.value,
        RegistrationType.REGULAR.value,
    )

    # Create candidate
    try:
        new_candidate = RegistrationCandidate(
            registration_exam_id=exam_id,
            school_id=candidate_school_id,
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
            registration_status=RegistrationStatus.INCOMPLETE,
            fee_payment_status=default_fee_payment_status(registration_type),
        )
        session.add(new_candidate)
        await session.flush()

        # Handle subject selections
        selected_subject_ids: list[int] = []

        # Referral/private: lenient (no auto-select). Regular/FreeTVET: auto-select cores + electives.
        if is_structured_type:
            auto_selected = await auto_select_subjects_for_programme(
                session, programme_id, current_user.school_id
            )
            selected_subject_ids.extend(auto_selected)

        if candidate_data.subject_ids:
            selected_subject_ids.extend(candidate_data.subject_ids)

        selected_subject_ids = list(set(selected_subject_ids))

        is_valid, validation_errors = await validate_subject_selections(
            session,
            programme_id,
            selected_subject_ids,
            registration_type=registration_type,
        )
        if not is_valid:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Subject selections do not meet programme requirements: "
                    f"{'; '.join(validation_errors)}"
                ),
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

        if not await is_registration_open_for_school(
            session, candidate.exam, current_user.school_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot update subject selections: registration period is not open",
            )

    try:
        # Reject clearing required bio fields when explicitly sent as null/empty
        fields_set = candidate_update.model_fields_set
        if "date_of_birth" in fields_set and candidate_update.date_of_birth is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Date of birth is required",
            )
        if "gender" in fields_set and (
            candidate_update.gender is None or not str(candidate_update.gender).strip()
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Gender is required",
            )

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

            if not programme_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Programme selection is required",
                )

            registration_type = (
                candidate.registration_type.value if candidate.registration_type else None
            )
            is_valid, validation_errors = await validate_subject_selections(
                session,
                programme_id,
                candidate_update.subject_ids,
                registration_type=registration_type,
            )
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Subject selections do not meet programme requirements: "
                        f"{'; '.join(validation_errors)}"
                    ),
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

        # Identity edit: re-open this candidate for duplicate matching
        await clear_not_duplicate_marks_for_candidate(session, candidate.id)

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


@router.post(
    "/candidates/not-duplicates",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def mark_candidates_not_duplicates(
    payload: CandidateNotDuplicateCreate,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> None:
    """Mark a candidate pair as not duplicates (excluded from future scans until edited)."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="School user is not associated with a school",
        )
    if payload.candidate_a_id == payload.candidate_b_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot mark a candidate as not a duplicate of itself",
        )

    a_id, b_id = sorted((payload.candidate_a_id, payload.candidate_b_id))
    stmt = select(RegistrationCandidate).where(
        RegistrationCandidate.id.in_([a_id, b_id])
    )
    candidates = list((await session.execute(stmt)).scalars().all())
    by_id = {c.id: c for c in candidates}
    if a_id not in by_id or b_id not in by_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    for cid in (a_id, b_id):
        if by_id[cid].school_id != current_user.school_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Candidate does not belong to your school",
            )

    if by_id[a_id].registration_exam_id != by_id[b_id].registration_exam_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidates must belong to the same examination",
        )

    existing_stmt = select(RegistrationCandidateNotDuplicate).where(
        RegistrationCandidateNotDuplicate.candidate_a_id == a_id,
        RegistrationCandidateNotDuplicate.candidate_b_id == b_id,
    )
    existing = (await session.execute(existing_stmt)).scalar_one_or_none()
    if existing is None:
        session.add(
            RegistrationCandidateNotDuplicate(
                school_id=current_user.school_id,
                candidate_a_id=a_id,
                candidate_b_id=b_id,
                created_by_user_id=current_user.id,
            )
        )
        await session.commit()


@router.delete(
    "/candidates/{candidate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_candidate(
    candidate_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> None:
    """Hard-delete a school registration when open and unpaid (duplicate cleanup)."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="School user is not associated with a school",
        )

    candidate_stmt = (
        select(RegistrationCandidate)
        .where(RegistrationCandidate.id == candidate_id)
        .options(
            selectinload(RegistrationCandidate.photo),
            selectinload(RegistrationCandidate.exam).selectinload(
                RegistrationExam.registration_period
            ),
        )
    )
    candidate = (await session.execute(candidate_stmt)).scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if candidate.school_id != current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidate does not belong to your school",
        )

    if not candidate.exam:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete candidate: examination not found",
        )

    registration_open = await is_registration_open_for_school(
        session, candidate.exam, current_user.school_id
    )
    blocked = removal_block_reason(candidate, registration_open=registration_open)
    if blocked:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=blocked)

    photo = candidate.photo
    if photo is not None:
        try:
            await photo_storage_service.delete(photo.file_path)
        except Exception as e:
            logger.warning(f"Failed to delete photo file {photo.file_path}: {e}")

    await session.delete(candidate)
    await session.commit()


def _school_candidate_load_options():
    """Eager loads needed for RegistrationCandidateResponse (avoids MissingGreenlet)."""
    return (
        selectinload(RegistrationCandidate.subject_selections),
        selectinload(RegistrationCandidate.exam).options(*exam_load_options()),
    )


async def _get_school_candidate_or_404(
    session: DBSessionDep,
    candidate_id: int,
    school_id: int | None,
) -> RegistrationCandidate:
    candidate_stmt = (
        select(RegistrationCandidate)
        .where(RegistrationCandidate.id == candidate_id)
        .options(*_school_candidate_load_options())
    )
    candidate = (await session.execute(candidate_stmt)).scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    if school_id and candidate.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidate does not belong to your school",
        )
    return candidate


@router.post(
    "/candidates/{candidate_id}/fee/paid",
    response_model=RegistrationCandidateResponse,
    status_code=status.HTTP_200_OK,
)
async def mark_candidate_fee_paid(
    candidate_id: int,
    session: DBSessionDep,
    current_user: SchoolAdminDep,
) -> RegistrationCandidateResponse:
    """Mark a candidate's registration fee as paid and recompute completeness."""
    candidate = await _get_school_candidate_or_404(
        session, candidate_id, current_user.school_id
    )
    try:
        apply_fee_paid(candidate, user_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    await recompute_registration_status(session, candidate)
    await session.commit()
    # Re-load after commit so exam (+ nested) are available for response serialization
    candidate = await _get_school_candidate_or_404(
        session, candidate_id, current_user.school_id
    )
    return RegistrationCandidateResponse.model_validate(candidate)


@router.post(
    "/candidates/{candidate_id}/fee/waived",
    response_model=RegistrationCandidateResponse,
    status_code=status.HTTP_200_OK,
)
async def mark_candidate_fee_waived(
    candidate_id: int,
    session: DBSessionDep,
    current_user: SchoolAdminDep,
) -> RegistrationCandidateResponse:
    """Waive a candidate's registration fee and recompute completeness."""
    candidate = await _get_school_candidate_or_404(
        session, candidate_id, current_user.school_id
    )
    try:
        apply_fee_waived(candidate, user_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    await recompute_registration_status(session, candidate)
    await session.commit()
    candidate = await _get_school_candidate_or_404(
        session, candidate_id, current_user.school_id
    )
    return RegistrationCandidateResponse.model_validate(candidate)


@router.post(
    "/candidates/fee/bulk",
    response_model=list[RegistrationCandidateResponse],
    status_code=status.HTTP_200_OK,
)
async def bulk_update_candidate_fees(
    payload: CandidateFeeBulkUpdate,
    session: DBSessionDep,
    current_user: SchoolAdminDep,
) -> list[RegistrationCandidateResponse]:
    """Mark fees paid or waived for multiple candidates belonging to the school."""
    action = (payload.action or "").strip().lower()
    if action not in {"paid", "waived"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="action must be 'paid' or 'waived'",
        )

    stmt = (
        select(RegistrationCandidate)
        .where(RegistrationCandidate.id.in_(payload.candidate_ids))
        .options(*_school_candidate_load_options())
    )
    if current_user.school_id is not None:
        stmt = stmt.where(RegistrationCandidate.school_id == current_user.school_id)

    candidates = list((await session.execute(stmt)).scalars().unique().all())
    found_ids = {c.id for c in candidates}
    missing = [cid for cid in payload.candidate_ids if cid not in found_ids]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidates not found for this school: {missing}",
        )

    free_tvet_ids = [
        c.id
        for c in candidates
        if (
            c.registration_type.value
            if hasattr(c.registration_type, "value")
            else str(c.registration_type or "")
        )
        == RegistrationType.FREE_TVET.value
    ]
    if free_tvet_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Free TVET candidates do not require a registration fee. "
                f"Remove these candidate ids: {free_tvet_ids}"
            ),
        )

    for candidate in candidates:
        try:
            if action == "paid":
                apply_fee_paid(candidate, user_id=current_user.id)
            else:
                apply_fee_waived(candidate, user_id=current_user.id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        await recompute_registration_status(session, candidate)

    await session.commit()
    reload_stmt = (
        select(RegistrationCandidate)
        .where(RegistrationCandidate.id.in_(payload.candidate_ids))
        .options(*_school_candidate_load_options())
    )
    if current_user.school_id is not None:
        reload_stmt = reload_stmt.where(
            RegistrationCandidate.school_id == current_user.school_id
        )
    reloaded = list((await session.execute(reload_stmt)).scalars().unique().all())
    by_id = {c.id: c for c in reloaded}
    return [
        RegistrationCandidateResponse.model_validate(by_id[cid])
        for cid in payload.candidate_ids
        if cid in by_id
    ]


async def _load_bulk_exam_for_school(
    session: DBSessionDep,
    exam_id: int,
    school_id: int,
) -> RegistrationExam:
    exam_stmt = (
        select(RegistrationExam)
        .join(
            ExamRegistrationPeriod,
            RegistrationExam.registration_period_id == ExamRegistrationPeriod.id,
        )
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    if not await is_school_eligible_for_exam(session, exam_id, school_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your school is not eligible to register candidates for this examination",
        )

    if not await is_registration_open_for_school(session, exam, school_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration period is not open",
        )

    if not exam.registration_period.allows_bulk_registration:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bulk registration is not allowed for this exam",
        )
    return exam


_PHONE_LIKE_COLUMNS = {
    "contact_phone",
    "phone",
    "guardian_phone",
    "guardian phone",
}


def _excel_scalar_to_text(value: object, *, column: str | None = None) -> str | None:
    """Convert a spreadsheet cell to text, preserving phone leading zeros when possible."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if hasattr(value, "isoformat"):
        try:
            if hasattr(value, "strftime"):
                return value.strftime("%d/%m/%Y")
            return str(value)
        except Exception:
            return str(value)

    text: str
    if isinstance(value, bool):
        text = str(value)
    elif isinstance(value, float):
        if value != value:  # NaN
            return None
        text = str(int(value)) if value == int(value) else str(value)
    elif isinstance(value, int):
        text = str(value)
    else:
        text = str(value).strip()
        if re.fullmatch(r"\d+\.0+", text):
            text = text.split(".", 1)[0]

    if not text or text.lower() in {"nan", "none"}:
        return None

    col = (column or "").lower().strip()
    if col in _PHONE_LIKE_COLUMNS:
        digits = re.sub(r"[\s\-]", "", text)
        # Excel numeric cells drop the leading 0 from Ghana numbers
        if re.fullmatch(r"[2-9]\d{8}", digits):
            return "0" + digits
        return digits
    return text


def _parse_bulk_upload_file_to_rows(file_content: bytes, filename: str) -> list[dict]:
    """Parse CSV/Excel bytes into normalized row dicts with row_number."""
    try:
        if filename.endswith(".csv"):
            try:
                text_content = file_content.decode("utf-8")
            except UnicodeDecodeError:
                text_content = file_content.decode("latin-1")
            csv_reader = csv.DictReader(io.StringIO(text_content))
            raw_rows = list(csv_reader)
            if not raw_rows:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="CSV file is empty or has no data rows",
                )
            df = pd.DataFrame(raw_rows)
        elif filename.endswith((".xlsx", ".xls")):
            # Prefer string dtypes so text-formatted phones keep leading zeros
            df = pd.read_excel(
                io.BytesIO(file_content), engine="openpyxl", dtype=str
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be CSV or Excel format (.csv, .xlsx, .xls)",
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error parsing file: {str(exc)}",
        ) from exc

    df.columns = df.columns.str.strip()
    column_mapping = {col.lower(): col for col in df.columns}
    # Drop helper/test-only columns
    column_mapping = {
        k: v for k, v in column_mapping.items() if k not in {"_test_note", "test_note"}
    }
    missing_columns = []
    if "firstname" not in column_mapping:
        missing_columns.append("firstname")
    if "lastname" not in column_mapping:
        missing_columns.append("lastname")
    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required columns: {', '.join(missing_columns)}",
        )

    rows: list[dict] = []
    for idx, series in df.iterrows():
        row_number = int(idx) + 2
        payload: dict = {"row_number": row_number}
        for lower_key, original in column_mapping.items():
            value = series[original]
            if pd.isna(value):
                continue
            text = _excel_scalar_to_text(value, column=lower_key)
            if text:
                payload[lower_key] = text
        rows.append(payload)
    return rows


@router.post("/candidates/bulk", response_model=BulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_candidates(
    exam_id: int = Form(...),
    file: UploadFile = File(...),
    default_choice_group_selection: str | None = Form(None, description="Optional JSON mapping of {choice_group_id: subject_code} for default selections"),
    registration_type: str | None = Form(None, description="Default registration type (free_tvet or referral) to apply to all candidates"),
    dry_run: bool = Form(False, description="Validate only — do not create candidates"),
    session: DBSessionDep = None,
    current_user: SchoolUserWithSchoolDep = None,
) -> BulkUploadResponse:
    """Bulk upload candidates via CSV/Excel (single-request path)."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    _ = default_choice_group_selection
    exam = await _load_bulk_exam_for_school(session, exam_id, current_user.school_id)

    file_content = await file.read()
    filename = file.filename or "unknown"
    rows = _parse_bulk_upload_file_to_rows(file_content, filename)

    return await process_bulk_candidate_rows(
        session,
        exam=exam,
        current_user=current_user,
        rows=rows,
        default_registration_type=registration_type,
        commit=not dry_run,
        dry_run=dry_run,
    )


@router.post(
    "/candidates/bulk/parse",
    response_model=BulkCandidateParseResponse,
    status_code=status.HTTP_200_OK,
)
async def parse_bulk_upload_file(
    exam_id: int = Form(...),
    file: UploadFile = File(...),
    session: DBSessionDep = None,
    current_user: SchoolUserWithSchoolDep = None,
) -> BulkCandidateParseResponse:
    """Parse a CSV/Excel bulk file into row JSON for chunked upload."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )
    await _load_bulk_exam_for_school(session, exam_id, current_user.school_id)
    file_content = await file.read()
    filename = file.filename or "unknown"
    rows = _parse_bulk_upload_file_to_rows(file_content, filename)
    return BulkCandidateParseResponse(total_rows=len(rows), rows=rows)


@router.post(
    "/candidates/bulk/chunk",
    response_model=BulkUploadResponse,
    status_code=status.HTTP_200_OK,
)
async def bulk_upload_candidates_chunk(
    payload: BulkCandidateChunkRequest,
    session: DBSessionDep = None,
    current_user: SchoolUserWithSchoolDep = None,
) -> BulkUploadResponse:
    """Process a chunk of candidate rows (JSON) for resilient bulk upload."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )
    if not payload.rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No rows provided in this chunk",
        )
    if len(payload.rows) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chunk may contain at most 100 rows",
        )

    exam = await _load_bulk_exam_for_school(
        session, payload.exam_id, current_user.school_id
    )
    rows = [row.model_dump(exclude_none=False) for row in payload.rows]
    return await process_bulk_candidate_rows(
        session,
        exam=exam,
        current_user=current_user,
        rows=rows,
        default_registration_type=payload.registration_type,
        commit=not payload.dry_run,
        dry_run=payload.dry_run,
    )


@router.post("/candidates/bulk/results-export")
async def export_bulk_upload_results(
    payload: BulkUploadResultsExportRequest,
    current_user: SchoolUserWithSchoolDep = None,
) -> StreamingResponse:
    """Download Excel of all submitted bulk rows with error_field / error_message."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )
    if not payload.rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No rows to export",
        )

    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.styles.numbers import FORMAT_TEXT

    errors_by_row: dict[int, list[tuple[str, str]]] = {}
    for err in payload.errors:
        errors_by_row.setdefault(err.row_number, []).append(
            (err.field or "", err.error_message)
        )

    # Preserve column order from first row, exclude internal helpers
    skip_keys = {"_test_note", "test_note", "error_field", "error_message"}
    columns: list[str] = []
    seen: set[str] = set()
    for row in payload.rows:
        for key in row.keys():
            key_str = str(key)
            if key_str in skip_keys or key_str in seen:
                continue
            seen.add(key_str)
            columns.append(key_str)
    if "row_number" in columns:
        columns = ["row_number"] + [c for c in columns if c != "row_number"]
    columns.extend(["error_field", "error_message"])

    wb = Workbook()
    ws = wb.active
    ws.title = "Upload results"

    header_font = Font(bold=True)
    error_fill = PatternFill(start_color="FFEBEE", end_color="FFEBEE", fill_type="solid")
    ok_fill = PatternFill(start_color="E8F5E9", end_color="E8F5E9", fill_type="solid")
    header_fill = PatternFill(start_color="E3F2FD", end_color="E3F2FD", fill_type="solid")

    for col_idx, name in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=col_idx, value=name)
        cell.font = header_font
        cell.fill = header_fill

    for row_idx, row in enumerate(payload.rows, start=2):
        row_number_raw = row.get("row_number")
        try:
            row_number = int(row_number_raw) if row_number_raw is not None else row_idx
        except (TypeError, ValueError):
            row_number = row_idx
        row_errors = errors_by_row.get(row_number, [])
        error_fields = "; ".join(f for f, _ in row_errors if f)
        error_messages = "; ".join(m for _, m in row_errors if m)
        has_error = bool(row_errors)

        for col_idx, name in enumerate(columns, start=1):
            if name == "error_field":
                value = error_fields
            elif name == "error_message":
                value = error_messages
            else:
                raw = row.get(name)
                value = "" if raw is None else str(raw)
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.number_format = FORMAT_TEXT
            cell.fill = error_fill if has_error else ok_fill

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="bulk_upload_results.xlsx"'
        },
    )


def _template_exam_context(
    exam: RegistrationExam | None,
) -> tuple[str | None, str | None, int | None, str | None, bool, str]:
    """Return exam_series, exam_type, year, exam_kind, allows_referral, excel_filename."""
    exam_series = None
    exam_type = None
    year = None
    exam_kind = None
    allows_referral = True
    filename = "candidate_upload_template.xlsx"
    if exam:
        exam_series = exam.exam_series
        exam_type = exam.exam_type
        year = exam.year
        exam_kind = exam.exam_kind.value if hasattr(exam.exam_kind, "value") else str(exam.exam_kind)
        allows_referral = bool(exam.allows_referral_registration)
        exam_type_safe = exam_type.replace(" ", "_").replace("/", "_")
        exam_series_safe = exam_series.replace("/", "_") if exam_series else ""
        if exam_series_safe:
            filename = f"{year}_{exam_series_safe}_{exam_type_safe}.xlsx"
        else:
            filename = f"{year}_{exam_type_safe}.xlsx"
    return exam_series, exam_type, year, exam_kind, allows_referral, filename


@router.get("/candidates/template")
async def download_candidate_template(
    exam_id: int | None = Query(None, description="Optional exam ID to generate template specific to exam series"),
    session: DBSessionDep = None,
    current_user: SchoolUserWithSchoolDep = None,
) -> StreamingResponse:
    """Download Excel template for candidate bulk upload."""
    try:
        exam = None
        allows_free_tvet = False
        if exam_id:
            exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
            exam_result = await session.execute(exam_stmt)
            exam = exam_result.scalar_one_or_none()
            if exam:
                allows_free_tvet = await school_allows_free_tvet_for_exam(
                    session, exam_id, current_user.school_id
                )

        exam_series, _exam_type, _year, exam_kind, allows_referral, filename = _template_exam_context(exam)

        template_bytes = generate_candidate_template(
            exam_series=exam_series,
            exam_kind=exam_kind,
            allows_referral_registration=allows_referral,
            allows_free_tvet=allows_free_tvet,
        )
        return StreamingResponse(
            iter([template_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}",
        )


@router.get("/candidates/template/instructions.pdf")
async def download_candidate_template_instructions_pdf(
    exam_id: int | None = Query(None, description="Optional exam ID for exam-specific instructions"),
    session: DBSessionDep = None,
    current_user: SchoolUserWithSchoolDep = None,
) -> StreamingResponse:
    """Download PDF guide for candidate bulk upload."""
    try:
        exam = None
        allows_free_tvet = False
        if exam_id:
            exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
            exam_result = await session.execute(exam_stmt)
            exam = exam_result.scalar_one_or_none()
            if exam:
                allows_free_tvet = await school_allows_free_tvet_for_exam(
                    session, exam_id, current_user.school_id
                )

        exam_series, exam_type, year, exam_kind, allows_referral, excel_filename = _template_exam_context(exam)
        pdf_filename = "bulk_upload_instructions.pdf"
        if excel_filename != "candidate_upload_template.xlsx":
            pdf_filename = excel_filename.replace(".xlsx", "_instructions.pdf")

        pdf_bytes = generate_bulk_upload_instructions_pdf(
            exam_year=year,
            exam_series=exam_series,
            exam_type=exam_type,
            exam_kind=exam_kind,
            allows_referral_registration=allows_referral,
            allows_free_tvet=allows_free_tvet,
        )
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{pdf_filename}"'},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate instructions PDF: {str(e)}",
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


@router.get("/profile", response_model=SchoolResponse)
async def get_school_profile(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> SchoolResponse:
    """Get school profile (school users can only view their own school)."""
    # Ensure user has a school
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School user must be associated with a school",
        )

    # Get school
    school_stmt = select(School).where(School.id == current_user.school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()

    if not school:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="School not found",
        )

    return SchoolResponse.model_validate(school)


@router.put("/profile", response_model=SchoolResponse)
async def update_school_profile(
    school_update: SchoolUpdate,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> SchoolResponse:
    """Update school profile (school users can only update their own school)."""
    # Ensure user has a school
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School user must be associated with a school",
        )

    # Get school and verify it belongs to the user
    school_stmt = select(School).where(School.id == current_user.school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()

    if not school:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="School not found",
        )

    # Update profile fields if provided (school users can only update profile fields, not name, is_active, etc.)
    # Only allow updating profile-related fields
    if school_update.email is not None:
        school.email = school_update.email
    if school_update.phone is not None:
        school.phone = school_update.phone
    if school_update.digital_address is not None:
        school.digital_address = school_update.digital_address
    if school_update.post_office_address is not None:
        school.post_office_address = school_update.post_office_address
    if school_update.is_private is not None:
        school.is_private = school_update.is_private
    if school_update.principal_name is not None:
        school.principal_name = school_update.principal_name
    if school_update.principal_email is not None:
        school.principal_email = school_update.principal_email
    if school_update.principal_phone is not None:
        school.principal_phone = school_update.principal_phone

    # Automatically calculate and set profile completion status
    school.profile_completed = check_school_profile_completion(school)

    await session.commit()
    await session.refresh(school)

    return SchoolResponse.model_validate(school)


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

    # School dashboard: school-mediated registrations only (exclude private sitters)
    school_type_filter = school_mediated_type_filter()

    # Count total candidates
    total_candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
        RegistrationCandidate.school_id == current_user.school_id,
        school_type_filter,
    )
    total_result = await session.execute(total_candidates_stmt)
    total_candidates = total_result.scalar_one() or 0

    # Count candidates by status
    candidates_by_status_stmt = (
        select(RegistrationCandidate.registration_status, func.count(RegistrationCandidate.id))
        .where(
            RegistrationCandidate.school_id == current_user.school_id,
            school_type_filter,
        )
        .group_by(RegistrationCandidate.registration_status)
    )
    status_result = await session.execute(candidates_by_status_stmt)
    candidates_by_status = {row[0].value: row[1] for row in status_result.all()}

    # Count distinct exams
    total_exams_stmt = select(func.count(func.distinct(RegistrationCandidate.registration_exam_id))).where(
        RegistrationCandidate.school_id == current_user.school_id,
        school_type_filter,
    )
    exams_result = await session.execute(total_exams_stmt)
    total_exams = exams_result.scalar_one() or 0

    # Get programmes summary with candidate counts
    # First, get all programmes for this school
    programme_stmt = (
        select(Programme)
        .join(school_programmes, Programme.id == school_programmes.c.programme_id)
        .where(school_programmes.c.school_id == current_user.school_id)
        .order_by(Programme.code)
    )
    programme_result = await session.execute(programme_stmt)
    programmes = programme_result.scalars().all()

    # For each programme, count school-mediated candidates
    programmes_summary = []
    for programme in programmes:
        # Count total candidates for this programme
        total_candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
            RegistrationCandidate.school_id == current_user.school_id,
            RegistrationCandidate.programme_id == programme.id,
            school_type_filter,
        )
        total_result = await session.execute(total_candidates_stmt)
        total_prog_candidates = total_result.scalar_one() or 0

        # Count approved (completed) candidates for this programme
        completed_candidates_stmt = select(func.count(RegistrationCandidate.id)).where(
            RegistrationCandidate.school_id == current_user.school_id,
            RegistrationCandidate.programme_id == programme.id,
            RegistrationCandidate.registration_status == RegistrationStatus.COMPLETE,
            school_type_filter,
        )
        completed_result = await session.execute(completed_candidates_stmt)
        completed_candidates = completed_result.scalar_one() or 0

        programmes_summary.append({
            "id": programme.id,
            "code": programme.code,
            "name": programme.name,
            "total_candidates": total_prog_candidates,
            "completed_candidates": completed_candidates,
        })

    return {
        "school": {
            "id": school.id,
            "code": school.code,
            "name": school.name,
            "is_active": school.is_active,
            "profile_completed": school.profile_completed,
        },
        "active_user_count": active_user_count,
        "max_active_users": MAX_ACTIVE_USERS_PER_SCHOOL,
        "total_candidates": total_candidates,
        "candidates_by_status": candidates_by_status,
        "total_exams": total_exams,
        "programmes_summary": programmes_summary,
    }


# Programme Management Endpoints

def _school_programme_response(programme: Programme) -> ProgrammeResponse:
    return ProgrammeResponse(
        id=programme.id,
        code=programme.code,
        name=programme.name,
        programme_type_id=programme.programme_type_id,
        programme_type_name=programme.programme_type.name if programme.programme_type else None,
        programme_type_path=None,
        created_at=programme.created_at,
        updated_at=programme.updated_at,
    )


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
    programme_stmt = (
        select(Programme)
        .options(selectinload(Programme.programme_type))
        .order_by(Programme.code)
    )
    programme_result = await session.execute(programme_stmt)
    programmes = programme_result.scalars().all()

    return [_school_programme_response(programme) for programme in programmes]


@router.get("/programmes", response_model=list[ProgrammeResponse])
async def list_school_programmes(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    exam_id: int | None = Query(None, description="When set, only programmes enabled for this exam"),
) -> list[ProgrammeResponse]:
    """List programmes available to the school (optionally filtered by exam enablement)."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    if exam_id is not None:
        from app.services.programme_type_service import list_programmes_for_exam

        programmes = await list_programmes_for_exam(
            session, exam_id=exam_id, school_id=current_user.school_id
        )
        return [_school_programme_response(programme) for programme in programmes]

    programme_stmt = (
        select(Programme)
        .options(selectinload(Programme.programme_type))
        .join(school_programmes, Programme.id == school_programmes.c.programme_id)
        .where(school_programmes.c.school_id == current_user.school_id)
        .order_by(Programme.code)
    )
    programme_result = await session.execute(programme_stmt)
    programmes = programme_result.scalars().all()

    return [_school_programme_response(programme) for programme in programmes]


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
    stmt = (
        select(Programme)
        .options(selectinload(Programme.programme_type))
        .where(Programme.id == programme_id)
    )
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    return _school_programme_response(programme)


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
    validation_level: str = Form("strict", description="Validation level: 'basic', 'standard', or 'strict' (default: strict for passport photos)"),
    replace_background: bool = Form(False, description="Replace background with white color if checked"),
) -> RegistrationCandidatePhotoResponse:
    """Upload/replace photo for a candidate (automatically deletes existing photo if present).

    Args:
        candidate_id: ID of the candidate
        file: Photo file to upload
        validation_level: Validation level - 'basic' (file type/size/dimensions only),
            'standard' (basic + face detection), or 'strict' (all validations including
            MediaPipe face detection, pose, eyes, background). Defaults to 'strict' for passport photos.
    """
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

    # Replace background if requested
    if replace_background:
        try:
            content = replace_background(content, background_color=(255, 255, 255))  # White background
            logger.info(f"Background replaced with white for candidate {candidate_id}")
        except Exception as e:
            logger.warning(f"Failed to replace background for candidate {candidate_id}: {e}")
            # Continue with original image if replacement fails
            pass

    # Validate photo with specified validation level
    # This now includes MediaPipe validation if validation_level is 'standard' or 'strict'
    PhotoValidationService.validate_all(content, file.content_type or "", validation_level=validation_level)

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
    await session.flush()
    await recompute_registration_status(session, candidate, has_photo=True)
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


@router.get("/exams/{exam_id}/candidates/missing-photos.pdf")
async def download_missing_photos_summary(
    exam_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> StreamingResponse:
    """Download PDF of candidates without photos, grouped by programme."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    try:
        pdf_bytes = await generate_missing_photos_summary_pdf(
            session, exam_id, current_user.school_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate missing photos PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate missing photos PDF",
        )

    filename = (
        f"missing_photos_{exam.exam_type}_{exam.year}_{exam.exam_series or ''}.pdf"
    )
    filename = filename.replace("/", "_").replace("\\", "_").replace("__", "_")

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
    )

    if programme_id:
        candidate_stmt = candidate_stmt.where(RegistrationCandidate.programme_id == programme_id)

    candidate_result = await session.execute(candidate_stmt)
    candidates = candidate_result.scalars().all()

    # Sort by name property (firstname + othername + lastname) in Python
    candidates = sorted(candidates, key=lambda c: c.name)

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
    # Sanitize exam fields
    exam_type_safe = (exam.exam_type or "").replace(" ", "_").replace("/", "_").replace("\\", "_")
    exam_series_safe = (exam.exam_series or "").replace("/", "_").replace("\\", "_") if exam.exam_series else ""
    # Build filename parts
    parts = ["index_slips", exam_type_safe, str(exam.year)]
    if exam_series_safe:
        parts.append(exam_series_safe)
    if programme_suffix:
        parts.append(programme_suffix.strip("_"))  # Remove leading underscore from programme_suffix if present
    zip_filename = "_".join(parts) + ".zip"
    # Remove any double underscores and trailing underscores before the extension
    zip_filename = zip_filename.replace("__", "_").replace("_.zip", ".zip").replace("_.ZIP", ".ZIP")

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
    await session.flush()
    await recompute_registration_status(session, candidate, has_photo=False)
    await session.commit()


@router.post("/candidates/photos/bulk-upload", response_model=PhotoBulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_photos(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    exam_id: int = Form(...),
    files: list[UploadFile] = File(...),
) -> PhotoBulkUploadResponse:
    """Bulk upload photos matched by registration number (exact or last 4 characters of filename stem).

    Files named like ``0000.jpg`` match registration number ``F17090260000``.
    Matched photos are renamed to ``{registration_number}{ext}`` before saving.
    """
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

    candidates_result = await session.execute(
        select(RegistrationCandidate).where(
            and_(
                RegistrationCandidate.registration_exam_id == exam_id,
                RegistrationCandidate.school_id == current_user.school_id,
            )
        )
    )
    candidates = list(candidates_result.scalars().all())

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

            stem = Path(filename).stem
            matches = [
                c
                for c in candidates
                if c.registration_number
                and (
                    c.registration_number == stem
                    or (len(stem) == 4 and c.registration_number.endswith(stem))
                )
            ]

            if not matches:
                errors.append(
                    PhotoBulkUploadError(
                        filename=filename,
                        registration_number=None,
                        index_number=None,
                        error_message=(
                            f"No candidate found with registration number matching '{stem}' "
                            "(exact match or last 4 characters)"
                        ),
                    )
                )
                failed += 1
                continue

            if len(matches) > 1:
                matched_regs = ", ".join(
                    sorted({c.registration_number for c in matches if c.registration_number})
                )
                errors.append(
                    PhotoBulkUploadError(
                        filename=filename,
                        registration_number=None,
                        index_number=None,
                        error_message=(
                            f"Ambiguous match for '{stem}': multiple candidates share this "
                            f"registration suffix ({matched_regs})"
                        ),
                    )
                )
                failed += 1
                continue

            candidate = matches[0]

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
            await session.flush()
            await recompute_registration_status(session, candidate, has_photo=True)
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


@router.get("/candidates/photos/summary", response_model=PhotoExamSummaryResponse)
async def get_photo_album_summary(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    exam_id: int | None = Query(None, description="Filter to a single exam ID"),
) -> PhotoExamSummaryResponse:
    """Return per-exam photo coverage counts for the current school."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    stmt = (
        select(
            RegistrationCandidate.registration_exam_id,
            func.count(RegistrationCandidate.id).label("total"),
            func.count(RegistrationCandidatePhoto.id).label("with_photo"),
        )
        .outerjoin(
            RegistrationCandidatePhoto,
            RegistrationCandidatePhoto.registration_candidate_id == RegistrationCandidate.id,
        )
        .where(RegistrationCandidate.school_id == current_user.school_id)
        .group_by(RegistrationCandidate.registration_exam_id)
        .order_by(RegistrationCandidate.registration_exam_id)
    )
    if exam_id is not None:
        stmt = stmt.where(RegistrationCandidate.registration_exam_id == exam_id)

    result = await session.execute(stmt)
    rows = result.all()

    items = [
        PhotoExamSummaryItem(
            exam_id=row.registration_exam_id,
            total=int(row.total or 0),
            with_photo=int(row.with_photo or 0),
            without_photo=max(0, int(row.total or 0) - int(row.with_photo or 0)),
        )
        for row in rows
        if row.registration_exam_id is not None
    ]
    return PhotoExamSummaryResponse(items=items)


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


@router.post("/photos/bulk-validate", response_model=PhotoValidationJobResponse, status_code=status.HTTP_201_CREATED)
async def create_bulk_photo_validation_job(
    background_tasks: BackgroundTasks,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    files: list[UploadFile] = File(...),
    validation_level: str = Form("strict", description="Validation level: 'basic', 'standard', or 'strict'"),
) -> PhotoValidationJobResponse:
    """
    Create a bulk photo validation job. Photos are validated in the background.
    Use GET /photos/bulk-validate/{job_id}/status to check progress and GET /photos/bulk-validate/{job_id}/download to get results.
    """
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    if validation_level not in ("basic", "standard", "strict"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="validation_level must be 'basic', 'standard', or 'strict'"
        )

    # Read all files
    file_data: list[tuple[str, bytes]] = []
    for file in files:
        try:
            content = await file.read()
            filename = file.filename or "unknown.jpg"
            file_data.append((filename, content))
        except Exception as e:
            logger.error(f"Error reading file {file.filename}: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error reading file {file.filename}: {str(e)}"
            )

    if not file_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided"
        )

    # Create job record
    job = PhotoValidationJob(
        status=PhotoValidationJobStatus.PENDING,
        validation_level=validation_level,
        progress_current=0,
        progress_total=len(file_data),
        total_photos=len(file_data),
        valid_count=0,
        invalid_count=0,
        school_id=current_user.school_id,
        created_by_user_id=current_user.id,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    # Start background task
    background_tasks.add_task(_process_bulk_photo_validation_background, job.id, file_data, validation_level)

    return PhotoValidationJobResponse.model_validate(job)


@router.get("/photos/bulk-validate/{job_id}/status", response_model=PhotoValidationJobResponse)
async def get_bulk_photo_validation_status(
    job_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> PhotoValidationJobResponse:
    """Get the status of a bulk photo validation job."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Get job
    job_stmt = select(PhotoValidationJob).where(
        PhotoValidationJob.id == job_id,
        PhotoValidationJob.school_id == current_user.school_id,
    )
    job_result = await session.execute(job_stmt)
    job = job_result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    return PhotoValidationJobResponse.model_validate(job)


@router.get("/photos/bulk-validate/{job_id}/download")
async def download_bulk_photo_validation_results(
    job_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> StreamingResponse:
    """Download the zip file containing validated photos (valid and invalid folders)."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Get job
    job_stmt = select(PhotoValidationJob).where(
        PhotoValidationJob.id == job_id,
        PhotoValidationJob.school_id == current_user.school_id,
    )
    job_result = await session.execute(job_stmt)
    job = job_result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if job.status != PhotoValidationJobStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job is not completed yet. Current status: {job.status.value}"
        )

    if not job.result_zip_path or not os.path.exists(job.result_zip_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Result file not found. Job may have been cleaned up."
        )

    # Read and return zip file
    def generate():
        with open(job.result_zip_path, "rb") as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                yield chunk

    filename = f"photo_validation_results_{job_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip"

    return StreamingResponse(
        generate(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


async def _process_bulk_photo_validation_background(job_id: int, file_data: list[tuple[str, bytes]], validation_level: str) -> None:
    """Background task to process bulk photo validation."""
    from app.dependencies.database import get_sessionmanager

    sessionmanager = get_sessionmanager()
    async with sessionmanager.session() as session:
        try:
            # Get job record
            job_stmt = select(PhotoValidationJob).where(PhotoValidationJob.id == job_id)
            job_result = await session.execute(job_stmt)
            job = job_result.scalar_one_or_none()

            if not job:
                logger.error(f"Job {job_id} not found")
                return

            # Update job status to processing
            job.status = PhotoValidationJobStatus.PROCESSING
            job.updated_at = datetime.utcnow()
            await session.commit()

            # Process validation with progress callback
            def progress_callback(current: int, total: int):
                # Update job progress (this is synchronous callback, so we can't update DB here)
                # Progress will be updated after processing completes
                pass

            # Process bulk validation
            results, zip_bytes = await process_bulk_photo_validation(
                file_data, validation_level, progress_callback
            )

            # Save zip file
            from app.config import settings
            storage_dir = getattr(settings, 'photo_storage_path', 'storage/photos/validation_results')
            os.makedirs(storage_dir, exist_ok=True)

            zip_filename = f"validation_results_{job_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip"
            zip_path = os.path.join(storage_dir, zip_filename)

            with open(zip_path, "wb") as f:
                f.write(zip_bytes)

            # Calculate statistics
            valid_count = sum(1 for r in results if r.is_valid)
            invalid_count = len(results) - valid_count

            # Update job with results
            job.status = PhotoValidationJobStatus.COMPLETED
            job.progress_current = len(results)
            job.progress_total = len(results)
            job.valid_count = valid_count
            job.invalid_count = invalid_count
            job.result_zip_path = zip_path
            job.completed_at = datetime.utcnow()
            job.updated_at = datetime.utcnow()

            await session.commit()

        except Exception as e:
            logger.error(f"Error processing bulk photo validation job {job_id}: {e}", exc_info=True)
            # Update job with error
            try:
                job.status = PhotoValidationJobStatus.FAILED
                job.error_message = str(e)
                job.completed_at = datetime.utcnow()
                job.updated_at = datetime.utcnow()
                await session.commit()
            except Exception as commit_error:
                logger.error(f"Error updating failed job {job_id}: {commit_error}")


@router.post("/photos/bulk-resize")
async def bulk_resize_photos(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    files: list[UploadFile] = File(...),
    target_width: int = Form(155, description="Target width in pixels (default: 155 for passport photos)"),
    target_height: int = Form(191, description="Target height in pixels (default: 191 for passport photos)"),
    maintain_aspect_ratio: bool = Form(True, description="Maintain aspect ratio (default: True, adds white padding if needed)"),
) -> StreamingResponse:
    """
    Resize photos in bulk to specified dimensions. Returns a zip file with resized photos and a report.
    """
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Validate dimensions
    if target_width <= 0 or target_height <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target width and height must be positive integers"
        )

    # Read all files
    file_data: list[tuple[str, bytes]] = []
    for file in files:
        try:
            content = await file.read()
            filename = file.filename or "unknown.jpg"
            file_data.append((filename, content))
        except Exception as e:
            logger.error(f"Error reading file {file.filename}: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error reading file {file.filename}: {str(e)}"
            )

    if not file_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided"
        )

    try:
        # Process bulk resize
        results, file_bytes, content_type, filename = await process_bulk_photo_resize(
            file_data, target_width, target_height, maintain_aspect_ratio
        )

        def generate():
            yield file_bytes

        return StreamingResponse(
            generate(),
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.error(f"Error processing bulk photo resize: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing photos: {str(e)}"
        )


@router.post("/photos/bulk-replace-background")
async def bulk_replace_background(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    files: list[UploadFile] = File(...),
    background_color_r: int = Form(255, description="Background color red component (0-255, default: 255)"),
    background_color_g: int = Form(255, description="Background color green component (0-255, default: 255)"),
    background_color_b: int = Form(255, description="Background color blue component (0-255, default: 255)"),
) -> StreamingResponse:
    """
    Replace background of photos in bulk with specified color. Returns a zip file with processed photos and a report.
    """
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Validate color components
    if not (0 <= background_color_r <= 255 and 0 <= background_color_g <= 255 and 0 <= background_color_b <= 255):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Background color components must be between 0 and 255"
        )

    background_color = (background_color_r, background_color_g, background_color_b)

    # Read all files
    file_data: list[tuple[str, bytes]] = []
    for file in files:
        try:
            content = await file.read()
            filename = file.filename or "unknown.jpg"
            file_data.append((filename, content))
        except Exception as e:
            logger.error(f"Error reading file {file.filename}: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error reading file {file.filename}: {str(e)}"
            )

    if not file_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided"
        )

    try:
        # Process bulk background replacement
        results, file_bytes, content_type, filename = await process_bulk_background_replacement(
            file_data, background_color
        )

        def generate():
            yield file_bytes

        return StreamingResponse(
            generate(),
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.error(f"Error processing bulk background replacement: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing photos: {str(e)}"
        )


@router.get("/invoices/regular/by-examination", response_model=SchoolInvoiceResponse)
async def get_regular_invoice_by_examination(
    session: DBSessionDep,
    current_user: SchoolAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
) -> SchoolInvoiceResponse:
    """Generate invoice for regular candidates by examination."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not associated with a school",
        )

    school_stmt = select(School).where(School.id == current_user.school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    invoice_data = await aggregate_candidates_by_examination(
        session, current_user.school_id, exam_id, RegistrationType.REGULAR.value
    )

    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    return SchoolInvoiceResponse(
        school_id=school.id,
        school_code=school.code,
        school_name=school.name,
        registration_type=RegistrationType.REGULAR.value,
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


@router.get("/invoices/regular/by-examination-grouped-by-programme", response_model=SchoolInvoiceResponse)
async def get_regular_invoice_by_examination_grouped_by_programme(
    session: DBSessionDep,
    current_user: SchoolAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
) -> SchoolInvoiceResponse:
    """Generate invoice for regular candidates by examination grouped by programme."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not associated with a school",
        )

    school_stmt = select(School).where(School.id == current_user.school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    invoice_data = await aggregate_candidates_by_examination_and_programme(
        session, current_user.school_id, exam_id, RegistrationType.REGULAR.value
    )

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
        registration_type=RegistrationType.REGULAR.value,
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


@router.get("/invoices/regular/pdf")
async def download_regular_invoice_pdf(
    session: DBSessionDep,
    current_user: SchoolAdminDep,
    exam_id: int = Query(..., description="The exam ID"),
    group_by_programme: bool = Query(False, description="Group by programme"),
) -> StreamingResponse:
    """Download PDF invoice for regular candidates."""
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
            RegistrationType.REGULAR.value,
            group_by_programme=group_by_programme,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    filename = f"regular_invoice_exam_{exam_id}"
    if group_by_programme:
        filename += "_by_programme"
    filename += ".pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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


# Timetable Download Endpoints

@router.get("/exams/{exam_id}/timetable")
async def download_school_timetable(
    exam_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL, description="Filter by subject type: ALL, CORE_ONLY, or ELECTIVE_ONLY"),
    programme_id: int | None = Query(default=None, description="Optional programme ID to filter timetable"),
    merge_by_date: bool = Query(default=False, description="Merge subjects written on the same day"),
    orientation: str = Query(default="portrait", description="Page orientation: portrait or landscape"),
) -> StreamingResponse:
    """Download timetable for the school's subjects."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # If programme_id is provided, verify it's associated with the school
    if programme_id:
        assoc_stmt = select(school_programmes).where(
            school_programmes.c.school_id == current_user.school_id,
            school_programmes.c.programme_id == programme_id
        )
        result = await session.execute(assoc_stmt)
        existing = result.first()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Programme not found or not associated with school"
            )

    try:
        pdf_bytes = await generate_timetable_pdf(
            session,
            exam_id=exam_id,
            school_id=current_user.school_id,
            programme_id=programme_id,
            subject_filter=subject_filter,
            merge_by_date=merge_by_date,
            orientation=orientation,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    # Generate filename: {exam_year}_{exam_series}_{exam_type}{programme_name if selected}{subject_filter if not ALL}
    # Sanitize filename parts
    def sanitize_filename_part(text: str | None) -> str:
        """Sanitize a filename part by removing/replacing problematic characters."""
        if not text:
            return ""
        # Remove or replace problematic characters: / \ : * ? " < > |
        sanitized = re.sub(r'[<>:"/\\|?*]', '_', str(text))
        # Replace spaces with underscores
        sanitized = sanitized.replace(" ", "_")
        # Remove multiple consecutive underscores
        sanitized = re.sub(r'_+', '_', sanitized)
        # Remove leading/trailing underscores
        sanitized = sanitized.strip('_')
        return sanitized

    exam_year = str(exam.year)
    exam_series = sanitize_filename_part(exam.exam_series).upper() if exam.exam_series else ""
    exam_type_safe = sanitize_filename_part(exam.exam_type)

    # Build filename parts
    filename_parts = [exam_year]
    if exam_series:
        filename_parts.append(exam_series)
    filename_parts.append(exam_type_safe)

    # Add programme name if selected
    if programme_id:
        programme_stmt = select(Programme).where(Programme.id == programme_id)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if programme:
            programme_name_safe = sanitize_filename_part(programme.name)
            if programme_name_safe:
                filename_parts.append(programme_name_safe)

    # Add subject filter if not ALL
    if subject_filter != TimetableDownloadFilter.ALL:
        filename_parts.append(subject_filter.value)

    # Join parts and ensure we have at least one part
    if not filename_parts:
        filename = "timetable.pdf"
    else:
        filename = "_".join(filter(None, filename_parts)) + ".pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exams/{exam_id}/timetable/preview")
async def preview_school_timetable(
    exam_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL, description="Filter by subject type: ALL, CORE_ONLY, or ELECTIVE_ONLY"),
    programme_id: int | None = Query(default=None, description="Optional programme ID to filter timetable"),
) -> dict[str, Any]:
    """Preview timetable data (JSON) for the school's subjects."""
    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )

    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # If programme_id is provided, verify it's associated with the school
    if programme_id:
        assoc_stmt = select(school_programmes).where(
            school_programmes.c.school_id == current_user.school_id,
            school_programmes.c.programme_id == programme_id
        )
        result = await session.execute(assoc_stmt)
        existing = result.first()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Programme not found or not associated with school"
            )

    # Import here to avoid circular dependency
    from app.models import ExaminationSchedule
    from app.schemas.schedule import TimetableEntry, TimetableResponse
    from app.services.timetable_service import (
        get_school_subject_schedule_codes,
        get_programme_subject_schedule_codes,
        filter_schedules_by_subject_type,
        parse_schedule_date,
    )

    # Get all schedules for the exam
    schedules_stmt = select(ExaminationSchedule).where(
        ExaminationSchedule.registration_exam_id == exam_id
    )
    schedules_result = await session.execute(schedules_stmt)
    all_schedules = schedules_result.scalars().all()

    # Get all schedule codes (schedules store original_code if available, otherwise code)
    schedule_codes = {schedule.subject_code for schedule in all_schedules}

    # Apply filters - get schedule codes for school/programme subjects
    filtered_schedule_codes: set[str] | None = None

    if programme_id:
        # Filter to programme's subjects - get codes that schedules would use
        programme_schedule_codes = await get_programme_subject_schedule_codes(session, programme_id)
        # Only include codes that have schedules
        filtered_schedule_codes = programme_schedule_codes & schedule_codes
    else:
        # Filter to school's subjects - get codes that schedules would use
        school_schedule_codes = await get_school_subject_schedule_codes(session, current_user.school_id)
        # Only include codes that have schedules
        filtered_schedule_codes = school_schedule_codes & schedule_codes

    # Apply subject type filter if needed
    if filtered_schedule_codes is not None:
        # Filter by subject type using schedule codes
        filtered_schedule_codes = await filter_schedules_by_subject_type(
            session, filtered_schedule_codes, subject_filter
        )
    elif subject_filter != TimetableDownloadFilter.ALL:
        # No school/programme filter, but need to filter by subject type
        # Filter schedule codes by subject type
        filtered_schedule_codes = await filter_schedules_by_subject_type(
            session, schedule_codes, subject_filter
        )
    else:
        # No filtering - we'll show all schedules
        filtered_schedule_codes = None

    # Filter schedules by schedule codes
    # schedule.subject_code contains original_code (if available) or code
    if filtered_schedule_codes is not None:
        # We have filters (school/programme/subject type)
        # Match schedules directly by their subject_code
        schedules = [s for s in all_schedules if s.subject_code in filtered_schedule_codes]
    else:
        schedules = list(all_schedules)

    # Expand schedules into paper entries (one entry per paper with its date/time)
    paper_entries = []
    for schedule in schedules:
        papers_list = schedule.papers if schedule.papers else []
        # schedule.subject_code is now original_code, use it directly for display
        display_subject_code = schedule.subject_code

        for paper_info in papers_list:
            paper_num = paper_info.get("paper", 1)
            paper_date_str = paper_info.get("date")
            paper_start_time_str = paper_info.get("start_time")
            paper_end_time_str = paper_info.get("end_time")

            if not paper_date_str or not paper_start_time_str:
                continue  # Skip invalid papers (shouldn't happen after validation)

            # Parse date and time
            try:
                paper_date = parse_schedule_date(paper_date_str)
                paper_start_time = time.fromisoformat(paper_start_time_str)
                paper_end_time = None
                if paper_end_time_str:
                    paper_end_time = time.fromisoformat(paper_end_time_str)
            except (ValueError, TypeError):
                continue  # Skip invalid entries

            paper_entries.append({
                "schedule": schedule,
                "display_subject_code": display_subject_code,
                "paper": paper_num,
                "date": paper_date,
                "start_time": paper_start_time,
                "end_time": paper_end_time,
            })

    # Sort paper entries by date, then by time
    paper_entries.sort(key=lambda e: (e["date"], e["start_time"]))

    # Convert to TimetableEntry, using original_code if available
    entries = [
        TimetableEntry(
            subject_code=entry["display_subject_code"],
            subject_name=entry["schedule"].subject_name,
            examination_date=entry["date"],
            examination_time=entry["start_time"],
            examination_end_time=entry["end_time"],
            venue=entry["schedule"].venue,
            duration_minutes=entry["schedule"].duration_minutes,
            instructions=entry["schedule"].instructions,
        )
        for entry in paper_entries
    ]

    timetable_response = TimetableResponse(
        exam_id=exam.id,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series or "",
        year=exam.year,
        entries=entries,
    )

    return timetable_response.model_dump()
