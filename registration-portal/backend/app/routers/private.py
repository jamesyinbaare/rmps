"""Private registration endpoints for individual users."""
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, status, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import (
    PortalUser,
    Role,
    RegistrationExam,
    ExamRegistrationPeriod,
    RegistrationCandidate,
    RegistrationStatus,
    ExaminationSchedule,
    Subject,
    RegistrationSubjectSelection,
    RegistrationCandidatePhoto,
    School,
    Programme,
)
from app.services.photo_storage import PhotoStorageService, calculate_checksum
from app.services.photo_validation import PhotoValidationService
from app.schemas.registration import RegistrationCandidatePhotoResponse
import logging

logger = logging.getLogger(__name__)

# Create photo storage service instance
photo_storage_service = PhotoStorageService()
from app.schemas.registration import (
    RegistrationCandidateCreate,
    RegistrationCandidateUpdate,
    RegistrationCandidateResponse,
    RegistrationExamResponse,
)
from app.schemas.programme import ProgrammeSubjectRequirements, ProgrammeSubjectResponse, SubjectChoiceGroup
from app.models import programme_subjects
from app.schemas.schedule import TimetableResponse, TimetableEntry
from app.utils.registration import generate_unique_registration_number
from app.services.subject_selection import (
    auto_select_subjects_for_programme,
    validate_subject_selections,
    get_programme_subjects_for_registration,
    normalize_exam_series,
)

router = APIRouter(prefix="/api/v1/private", tags=["private"])


@router.get("/examination-centers", response_model=list[dict])
async def list_examination_centers(
    session: DBSessionDep,
    exam_id: int | None = Query(None, description="Optional exam ID to filter centers"),
) -> list[dict]:
    """List available examination centers for private candidates."""
    stmt = select(School).where(
        School.is_active == True,
        School.is_private_examination_center == True,
    )

    result = await session.execute(stmt)
    schools = result.scalars().all()

    return [
        {
            "id": school.id,
            "code": school.code,
            "name": school.name,
        }
        for school in schools
    ]


@router.get("/programmes", response_model=list[dict])
async def list_programmes(session: DBSessionDep) -> list[dict]:
    """List all available programmes for private candidate registration."""
    stmt = select(Programme).order_by(Programme.code)
    result = await session.execute(stmt)
    programmes = result.scalars().all()

    return [
        {
            "id": programme.id,
            "code": programme.code,
            "name": programme.name,
        }
        for programme in programmes
    ]


@router.get("/programmes/{programme_id}/subjects", response_model=ProgrammeSubjectRequirements)
async def get_programme_subjects(
    programme_id: int, session: DBSessionDep
) -> ProgrammeSubjectRequirements:
    """Get programme subject requirements for private candidate registration."""
    # Check programme exists
    programme_stmt = select(Programme).where(Programme.id == programme_id)
    programme_result = await session.execute(programme_stmt)
    programme = programme_result.scalar_one_or_none()

    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Get programme subjects
    stmt = (
        select(
            Subject.id,
            Subject.code,
            Subject.name,
            Subject.subject_type,
            programme_subjects.c.created_at,
            programme_subjects.c.is_compulsory,
            programme_subjects.c.choice_group_id,
        )
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .where(programme_subjects.c.programme_id == programme_id)
        .order_by(Subject.code)
    )
    result = await session.execute(stmt)
    rows = result.all()

    # Organize subjects by type
    compulsory_core: list[ProgrammeSubjectResponse] = []
    optional_core_by_group: dict[int, list[ProgrammeSubjectResponse]] = {}
    electives: list[ProgrammeSubjectResponse] = []

    for row in rows:
        subject_response = ProgrammeSubjectResponse(
            subject_id=row.id,
            subject_code=row.code,
            subject_name=row.name,
            subject_type=row.subject_type,
            is_compulsory=row.is_compulsory,
            choice_group_id=row.choice_group_id,
            created_at=row.created_at,
        )

        if row.is_compulsory is True:
            compulsory_core.append(subject_response)
        elif row.is_compulsory is False and row.choice_group_id is not None:
            if row.choice_group_id not in optional_core_by_group:
                optional_core_by_group[row.choice_group_id] = []
            optional_core_by_group[row.choice_group_id].append(subject_response)
        else:
            electives.append(subject_response)

    # Convert optional core groups to list
    optional_core_groups: list[SubjectChoiceGroup] = [
        SubjectChoiceGroup(choice_group_id=group_id, subjects=subjects)
        for group_id, subjects in sorted(optional_core_by_group.items())
    ]

    return ProgrammeSubjectRequirements(
        compulsory_core=compulsory_core,
        optional_core_groups=optional_core_groups,
        electives=electives,
    )


@router.get("/subjects", response_model=list[dict])
async def list_subjects(
    session: DBSessionDep,
    search: str | None = Query(None, description="Search by code or name"),
) -> list[dict]:
    """List all available subjects for manual selection."""
    stmt = select(Subject)

    if search:
        stmt = stmt.where(
            (Subject.code.ilike(f"%{search}%")) | (Subject.name.ilike(f"%{search}%"))
        )

    stmt = stmt.order_by(Subject.code)

    result = await session.execute(stmt)
    subjects = result.scalars().all()

    return [
        {
            "id": subject.id,
            "code": subject.code,
            "name": subject.name,
            "subject_type": subject.subject_type.value,
        }
        for subject in subjects
    ]


@router.get("/exams", response_model=list[RegistrationExamResponse])
async def list_available_exams(
    session: DBSessionDep,
) -> list[RegistrationExamResponse]:
    """List available exams for private registration. Public endpoint for registration flow."""

    now = datetime.utcnow()

    stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .where(
            ExamRegistrationPeriod.is_active == True,
            ExamRegistrationPeriod.allows_private_registration == True,
            ExamRegistrationPeriod.registration_start_date <= now,
            ExamRegistrationPeriod.registration_end_date >= now,
        )
        .options(selectinload(RegistrationExam.registration_period))
    )
    result = await session.execute(stmt)
    exams = result.scalars().all()

    return [RegistrationExamResponse.model_validate(exam) for exam in exams]


@router.post("/register", response_model=RegistrationCandidateResponse, status_code=status.HTTP_201_CREATED)
async def register_self(
    candidate_data: RegistrationCandidateCreate,
    exam_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> RegistrationCandidateResponse:
    """Register self for an exam."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    # Validate exam exists and registration is open
    exam_stmt = (
        select(RegistrationExam)
        .join(ExamRegistrationPeriod, RegistrationExam.registration_period_id == ExamRegistrationPeriod.id)
        .where(RegistrationExam.id == exam_id)
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

    # Check if user already registered for this exam (excluding drafts)
    existing_stmt = select(RegistrationCandidate).where(
        RegistrationCandidate.portal_user_id == current_user.id,
        RegistrationCandidate.registration_exam_id == exam_id,
        RegistrationCandidate.registration_status != RegistrationStatus.DRAFT,
    )
    existing_result = await session.execute(existing_stmt)
    existing = existing_result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="You are already registered for this exam"
        )

    # Generate unique registration number
    registration_number = await generate_unique_registration_number(session, exam_id)

    # Validate school_id is provided and is a private examination center
    if not hasattr(candidate_data, 'school_id') or candidate_data.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Examination center (school_id) is required for private candidate registration",
        )

    school_stmt = select(School).where(
        School.id == candidate_data.school_id,
        School.is_active == True,
        School.is_private_examination_center == True,
    )
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()

    if not school:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected school is not available as an examination center for private candidates",
        )

    # Get programme_id if programme_code is provided
    programme_id = candidate_data.programme_id
    if not programme_id and candidate_data.programme_code:
        from app.models import Programme
        programme_stmt = select(Programme).where(Programme.code == candidate_data.programme_code)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if programme:
            programme_id = programme.id

    # For NOV/DEC: require programme_id
    normalized_series = normalize_exam_series(exam.exam_series)
    is_nov_dec = normalized_series == "NOV/DEC"
    if is_nov_dec and not programme_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Programme selection is required for NOV/DEC exams",
        )

    # Create candidate with examination center
    new_candidate = RegistrationCandidate(
        registration_exam_id=exam_id,
        school_id=candidate_data.school_id,
        portal_user_id=current_user.id,
        name=candidate_data.name,
        registration_number=registration_number,
        date_of_birth=candidate_data.date_of_birth,
        gender=candidate_data.gender,
        programme_code=candidate_data.programme_code,
        programme_id=programme_id,
        contact_email=candidate_data.contact_email,
        contact_phone=candidate_data.contact_phone,
        address=candidate_data.address,
        national_id=candidate_data.national_id,
        registration_status=RegistrationStatus.PENDING,
    )
    session.add(new_candidate)
    await session.flush()

    # Add subject selections
    selected_subject_ids: list[int] = []

    # For NOV/DEC: skip auto-selection (all subjects are optional)
    # For MAY/JUNE: auto-select compulsory core and all electives
    if programme_id and not is_nov_dec:
        # Auto-select compulsory core subjects only (not optional core subjects)
        auto_selected = await auto_select_subjects_for_programme(session, programme_id, None)
        selected_subject_ids.extend(auto_selected)

        # For MAY/JUNE: Auto-select ALL elective subjects (they are compulsory)
        is_may_june = normalized_series == "MAY/JUNE"
        if is_may_june:
            subjects_info = await get_programme_subjects_for_registration(session, programme_id)
            selected_subject_ids.extend(subjects_info["electives"])

    # Add any additional subjects from subject_ids (including optional core subjects selected by user)
    if candidate_data.subject_ids:
        selected_subject_ids.extend(candidate_data.subject_ids)

    # Remove duplicates
    selected_subject_ids = list(set(selected_subject_ids))

    # Validate subject selections if programme is provided
    # For NOV/DEC: lenient validation (only enforce "at most one per group")
    # For MAY/JUNE: strict validation (compulsory core + all electives required)
    if programme_id:
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

    await session.commit()
    await session.refresh(new_candidate, ["subject_selections"])

    # Build response with subject selections
    candidate_dict = {
        "id": new_candidate.id,
        "registration_exam_id": new_candidate.registration_exam_id,
        "school_id": new_candidate.school_id,
        "name": new_candidate.name,
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


@router.get("/registrations", response_model=list[RegistrationCandidateResponse])
async def list_own_registrations(
    session: DBSessionDep, current_user: CurrentUserDep
) -> list[RegistrationCandidateResponse]:
    """List own registrations."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    stmt = (
        select(RegistrationCandidate)
        .where(RegistrationCandidate.portal_user_id == current_user.id)
        .options(
            selectinload(RegistrationCandidate.subject_selections),
            selectinload(RegistrationCandidate.exam).selectinload(RegistrationExam.registration_period),
        )
    )
    result = await session.execute(stmt)
    candidates = result.scalars().all()

    return [RegistrationCandidateResponse.model_validate(candidate) for candidate in candidates]


@router.get("/registrations/draft", response_model=RegistrationCandidateResponse | None)
async def get_draft_registration(
    exam_id: int | None = Query(None, description="Optional exam ID to filter draft"),
    session: DBSessionDep = None,
    current_user: CurrentUserDep = None,
) -> RegistrationCandidateResponse | None:
    """Get draft registration for the current user."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    stmt = (
        select(RegistrationCandidate)
        .where(
            RegistrationCandidate.portal_user_id == current_user.id,
            RegistrationCandidate.registration_status == RegistrationStatus.DRAFT,
        )
        .options(
            selectinload(RegistrationCandidate.subject_selections),
            selectinload(RegistrationCandidate.exam).selectinload(RegistrationExam.registration_period),
        )
        .order_by(RegistrationCandidate.created_at.desc())
    )

    if exam_id:
        stmt = stmt.where(RegistrationCandidate.registration_exam_id == exam_id)

    result = await session.execute(stmt)
    all_drafts = result.scalars().all()

    # Use first() instead of scalar_one_or_none() to handle multiple drafts gracefully
    # Order by created_at DESC ensures we get the most recent draft
    draft = all_drafts[0] if all_drafts else None

    if not draft:
        return None

    return RegistrationCandidateResponse.model_validate(draft)


@router.post("/registrations/draft", response_model=RegistrationCandidateResponse, status_code=status.HTTP_201_CREATED)
async def save_draft_registration(
    candidate_data: RegistrationCandidateCreate,
    exam_id: int = Query(..., description="The exam ID to register for"),
    session: DBSessionDep = None,
    current_user: CurrentUserDep = None,
) -> RegistrationCandidateResponse:
    """Save or update draft registration."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    # Validate exam exists
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

    # Check if draft already exists
    existing_draft_stmt = (
        select(RegistrationCandidate)
        .where(
            RegistrationCandidate.portal_user_id == current_user.id,
            RegistrationCandidate.registration_exam_id == exam_id,
            RegistrationCandidate.registration_status == RegistrationStatus.DRAFT,
        )
        .options(
            selectinload(RegistrationCandidate.subject_selections),
            selectinload(RegistrationCandidate.exam).selectinload(RegistrationExam.registration_period),
        )
    )
    existing_draft_result = await session.execute(existing_draft_stmt)
    existing_draft = existing_draft_result.scalar_one_or_none()

    # Validate school_id if provided
    school_id = candidate_data.school_id
    if school_id:
        school_stmt = select(School).where(
            School.id == school_id,
            School.is_active == True,
            School.is_private_examination_center == True,
        )
        school_result = await session.execute(school_stmt)
        school = school_result.scalar_one_or_none()
        if not school:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected school is not an active private examination center",
            )

    # Handle programme
    programme_id = None
    if candidate_data.programme_code:
        programme_stmt = select(Programme).where(Programme.code == candidate_data.programme_code)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if programme:
            programme_id = programme.id
    elif candidate_data.programme_id:
        programme_stmt = select(Programme).where(Programme.id == candidate_data.programme_id)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if programme:
            programme_id = programme.id

    if existing_draft:
        # Update existing draft
        existing_draft.name = candidate_data.name
        existing_draft.date_of_birth = candidate_data.date_of_birth
        existing_draft.gender = candidate_data.gender
        existing_draft.programme_code = candidate_data.programme_code
        existing_draft.programme_id = programme_id
        existing_draft.contact_email = candidate_data.contact_email
        existing_draft.contact_phone = candidate_data.contact_phone
        existing_draft.address = candidate_data.address
        existing_draft.national_id = candidate_data.national_id
        existing_draft.school_id = school_id

        # Update subject selections
        if candidate_data.subject_ids is not None:
            # Delete existing subject selections
            existing_subjects_stmt = select(RegistrationSubjectSelection).where(
                RegistrationSubjectSelection.registration_candidate_id == existing_draft.id
            )
            existing_subjects_result = await session.execute(existing_subjects_stmt)
            for subject_selection in existing_subjects_result.scalars().all():
                await session.delete(subject_selection)

            # Add new subject selections
            for subject_id in candidate_data.subject_ids:
                subject_stmt = select(Subject).where(Subject.id == subject_id)
                subject_result = await session.execute(subject_stmt)
                subject = subject_result.scalar_one_or_none()
                if subject:
                    subject_selection = RegistrationSubjectSelection(
                        registration_candidate_id=existing_draft.id,
                        subject_id=subject_id,
                        subject_code=subject.code,
                        subject_name=subject.name,
                    )
                    session.add(subject_selection)

        await session.commit()
        await session.refresh(existing_draft)

        # Check price difference if candidate has paid and subjects changed
        response = RegistrationCandidateResponse.model_validate(existing_draft)
        if existing_draft.total_paid_amount and existing_draft.total_paid_amount > 0 and candidate_data.subject_ids is not None:
            from app.services.registration_pricing_service import calculate_price_difference
            price_diff = await calculate_price_difference(session, existing_draft.id, candidate_data.subject_ids)
            response_dict = response.model_dump()
            response_dict["price_difference"] = {
                "new_total": float(price_diff["new_total"]),
                "difference": float(price_diff["difference"]),
                "requires_additional_payment": price_diff["requires_additional_payment"],
            }
            return RegistrationCandidateResponse(**response_dict)

        return response
    else:
        # Create new draft
        # Generate temporary registration number (will be regenerated on submit)
        registration_number = await generate_unique_registration_number(session, exam_id)

        # For drafts, allow empty name (will be validated on submit)
        draft_name = candidate_data.name if candidate_data.name and candidate_data.name.strip() else "Draft Registration"

        new_draft = RegistrationCandidate(
            registration_exam_id=exam_id,
            school_id=school_id,
            portal_user_id=current_user.id,
            name=draft_name,
            registration_number=registration_number,
            date_of_birth=candidate_data.date_of_birth,
            gender=candidate_data.gender,
            programme_code=candidate_data.programme_code,
            programme_id=programme_id,
            contact_email=candidate_data.contact_email,
            contact_phone=candidate_data.contact_phone,
            address=candidate_data.address,
            national_id=candidate_data.national_id,
            registration_status=RegistrationStatus.DRAFT,
        )
        session.add(new_draft)
        await session.flush()

        # Add subject selections
        if candidate_data.subject_ids:
            for subject_id in candidate_data.subject_ids:
                subject_stmt = select(Subject).where(Subject.id == subject_id)
                subject_result = await session.execute(subject_stmt)
                subject = subject_result.scalar_one_or_none()
                if subject:
                    subject_selection = RegistrationSubjectSelection(
                        registration_candidate_id=new_draft.id,
                        subject_id=subject_id,
                        subject_code=subject.code,
                        subject_name=subject.name,
                    )
                    session.add(subject_selection)

        await session.commit()
        # Reload with all relationships
        reload_stmt = (
            select(RegistrationCandidate)
            .where(RegistrationCandidate.id == new_draft.id)
            .options(
                selectinload(RegistrationCandidate.subject_selections),
                selectinload(RegistrationCandidate.exam).selectinload(RegistrationExam.registration_period),
            )
        )
        reload_result = await session.execute(reload_stmt)
        reloaded_draft = reload_result.scalar_one_or_none()

        if not reloaded_draft:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to reload draft registration"
            )

        return RegistrationCandidateResponse.model_validate(reloaded_draft)


@router.get("/registrations/{registration_id}/price")
async def get_registration_price(
    registration_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """Calculate and return price for draft registration."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    # Get draft registration
    stmt = (
        select(RegistrationCandidate)
        .where(
            RegistrationCandidate.id == registration_id,
            RegistrationCandidate.portal_user_id == current_user.id,
        )
        .options(selectinload(RegistrationCandidate.subject_selections))
    )
    result = await session.execute(stmt)
    candidate = result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    from app.services.registration_pricing_service import calculate_registration_amount
    from decimal import Decimal

    price_breakdown = await calculate_registration_amount(session, candidate.id)
    total_paid = Decimal(str(candidate.total_paid_amount or 0))
    outstanding = max(Decimal("0"), price_breakdown["total"] - total_paid)

    has_pricing = price_breakdown.get("has_pricing", False)

    return {
        "application_fee": float(price_breakdown["application_fee"]),
        "subject_price": float(price_breakdown["subject_price"]) if price_breakdown["subject_price"] else None,
        "tiered_price": float(price_breakdown["tiered_price"]) if price_breakdown["tiered_price"] else None,
        "total": float(price_breakdown["total"]),
        "pricing_model_used": price_breakdown["pricing_model_used"],
        "payment_required": has_pricing,  # Only required if pricing is configured
        "has_pricing": has_pricing,
        "total_paid_amount": float(total_paid),
        "outstanding_amount": float(outstanding),
    }


@router.post("/registrations/{registration_id}/pay")
async def initialize_registration_payment(
    registration_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """Initialize payment for private candidate registration."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    # Get registration
    stmt = (
        select(RegistrationCandidate)
        .where(
            RegistrationCandidate.id == registration_id,
            RegistrationCandidate.portal_user_id == current_user.id,
        )
        .options(selectinload(RegistrationCandidate.exam))
        .options(selectinload(RegistrationCandidate.subject_selections))
    )
    result = await session.execute(stmt)
    candidate = result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    from app.services.registration_pricing_service import calculate_registration_amount
    from app.services.registration_invoice_service import (
        create_registration_invoice,
        create_additional_charge_invoice,
    )
    from app.services.payment_service import initialize_payment
    from app.models import Invoice
    from decimal import Decimal

    # Calculate current total price
    price_breakdown = await calculate_registration_amount(session, candidate.id)
    current_total = price_breakdown["total"]
    total_paid = Decimal(str(candidate.total_paid_amount or 0))
    amount_to_pay = current_total - total_paid

    if amount_to_pay <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No payment required. Registration is already fully paid.",
        )

    # Get or create invoice
    invoice_stmt = select(Invoice).where(
        Invoice.registration_candidate_id == candidate.id,
        Invoice.status == "pending"
    ).order_by(Invoice.created_at.desc())
    invoice_result = await session.execute(invoice_stmt)
    invoice = invoice_result.scalar_one_or_none()

    if not invoice:
        # Create new invoice
        if total_paid > 0:
            # This is an additional charge
            invoice = await create_additional_charge_invoice(session, candidate, amount_to_pay)
        else:
            # This is the initial invoice
            invoice = await create_registration_invoice(session, candidate, current_total)
    else:
        # Update existing invoice amount if needed
        if invoice.amount != amount_to_pay:
            invoice.amount = amount_to_pay
            await session.flush()

    # Initialize payment
    try:
        payment_result = await initialize_payment(
            session,
            invoice,
            amount_to_pay,
            email=candidate.contact_email or current_user.email,
            metadata={"registration_candidate_id": candidate.id},
        )
        await session.commit()
        return payment_result
    except Exception as e:
        await session.rollback()
        logger.error(f"Error initializing payment: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initialize payment: {str(e)}",
        )


@router.post("/registrations/{registration_id}/submit", response_model=RegistrationCandidateResponse)
async def submit_draft_registration(
    registration_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> RegistrationCandidateResponse:
    """Submit a draft registration (convert to PENDING)."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    # Get draft registration
    stmt = (
        select(RegistrationCandidate)
        .where(
            RegistrationCandidate.id == registration_id,
            RegistrationCandidate.portal_user_id == current_user.id,
            RegistrationCandidate.registration_status == RegistrationStatus.DRAFT,
        )
        .options(selectinload(RegistrationCandidate.exam).selectinload(RegistrationExam.registration_period))
        .options(selectinload(RegistrationCandidate.subject_selections))
    )
    result = await session.execute(stmt)
    draft = result.scalar_one_or_none()

    if not draft:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft registration not found")

    # Check if user already has a submitted registration for this exam (excluding the current draft)
    existing_submitted_stmt = select(RegistrationCandidate).where(
        RegistrationCandidate.portal_user_id == current_user.id,
        RegistrationCandidate.registration_exam_id == draft.registration_exam_id,
        RegistrationCandidate.registration_status != RegistrationStatus.DRAFT,
        RegistrationCandidate.id != registration_id,  # Exclude current draft
    )
    existing_submitted_result = await session.execute(existing_submitted_stmt)
    existing_submitted = existing_submitted_result.scalar_one_or_none()

    if existing_submitted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have a submitted registration for this examination. Only one application per examination is allowed.",
        )

    # Validate exam and registration period
    exam = draft.exam
    now = datetime.utcnow()
    if (
        not exam.registration_period.is_active
        or exam.registration_period.registration_start_date > now
        or exam.registration_period.registration_end_date < now
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Registration period is not open")

    if not exam.registration_period.allows_private_registration:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This exam does not allow private registration"
        )

    # Validate required fields
    if not draft.school_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Examination center is required")
    if not draft.name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name is required")
    if not draft.subject_selections:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one subject must be selected")

    # Validate school is still a valid examination center
    school_stmt = select(School).where(
        School.id == draft.school_id,
        School.is_active == True,
        School.is_private_examination_center == True,
    )
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Selected school is not an active private examination center"
        )

    # Validate subject selections if programme is provided
    if draft.programme_id:
        subject_ids = [s.subject_id for s in draft.subject_selections if s.subject_id]
        is_valid, validation_errors = await validate_subject_selections(
            session, draft.programme_id, subject_ids, exam.exam_series
        )
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Subject selections do not meet programme requirements: {'; '.join(validation_errors)}",
            )

    # Only generate registration number if it doesn't already exist (preserve existing number when editing)
    if not draft.registration_number:
        registration_number = await generate_unique_registration_number(session, draft.registration_exam_id)
        draft.registration_number = registration_number

    # For private candidates: Verify payment is completed
    from app.services.registration_pricing_service import calculate_registration_amount
    from decimal import Decimal

    price_breakdown = await calculate_registration_amount(session, draft.id)
    calculated_total = price_breakdown["total"]
    total_paid = Decimal(str(draft.total_paid_amount or 0))

    if total_paid < calculated_total:
        outstanding = calculated_total - total_paid
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment required. Outstanding amount: {outstanding:.2f} GHS. Please complete payment before submitting.",
        )

    # Change status to PENDING
    draft.registration_status = RegistrationStatus.PENDING
    draft.registration_date = datetime.utcnow()

    await session.commit()
    await session.refresh(draft, ["subject_selections"])

    return RegistrationCandidateResponse.model_validate(draft)


@router.post("/registrations/{registration_id}/edit", response_model=RegistrationCandidateResponse)
async def enable_edit_registration(
    registration_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> RegistrationCandidateResponse:
    """Enable editing of a submitted registration by converting it back to DRAFT if registration period is still open."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    # Get registration - allow PENDING, APPROVED, or DRAFT (in case it was already converted)
    stmt = (
        select(RegistrationCandidate)
        .where(
            RegistrationCandidate.id == registration_id,
            RegistrationCandidate.portal_user_id == current_user.id,
            RegistrationCandidate.registration_status.in_([RegistrationStatus.PENDING, RegistrationStatus.APPROVED, RegistrationStatus.DRAFT]),
        )
        .options(
            selectinload(RegistrationCandidate.exam).selectinload(RegistrationExam.registration_period),
            selectinload(RegistrationCandidate.subject_selections)
        )
    )
    result = await session.execute(stmt)
    registration = result.scalar_one_or_none()

    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found or cannot be edited",
        )

    # If already DRAFT, just return it (no need to convert)
    if registration.registration_status == RegistrationStatus.DRAFT:
        return RegistrationCandidateResponse.model_validate(registration)

    # For PENDING/APPROVED, check if registration period is still open
    exam = registration.exam
    now = datetime.utcnow()
    if (
        not exam.registration_period.is_active
        or exam.registration_period.registration_start_date > now
        or exam.registration_period.registration_end_date < now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit registration: registration period is closed",
        )

    if not exam.registration_period.allows_private_registration:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This exam does not allow private registration editing",
        )

    # Convert to DRAFT to allow editing
    registration.registration_status = RegistrationStatus.DRAFT

    # Check price difference if candidate has paid
    from app.services.registration_pricing_service import calculate_price_difference
    from decimal import Decimal

    if registration.total_paid_amount and registration.total_paid_amount > 0:
        subject_ids = [s.subject_id for s in registration.subject_selections if s.subject_id]
        price_diff = await calculate_price_difference(session, registration.id, subject_ids)

        await session.commit()

        response = RegistrationCandidateResponse.model_validate(registration)
        # Add price difference info to response
        response_dict = response.model_dump()
        response_dict["price_difference"] = {
            "new_total": float(price_diff["new_total"]),
            "difference": float(price_diff["difference"]),
            "requires_additional_payment": price_diff["requires_additional_payment"],
        }
        return RegistrationCandidateResponse(**response_dict)

    await session.commit()

    return RegistrationCandidateResponse.model_validate(registration)


# Photo Management Endpoints for Private Users

@router.post("/registrations/{registration_id}/photos", response_model=RegistrationCandidatePhotoResponse, status_code=status.HTTP_201_CREATED)
async def upload_private_candidate_photo(
    registration_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
    file: UploadFile = File(...),
) -> RegistrationCandidatePhotoResponse:
    """Upload/replace photo for a draft registration (automatically deletes existing photo if present)."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    # Validate registration exists and belongs to current user
    candidate_stmt = select(RegistrationCandidate).where(
        RegistrationCandidate.id == registration_id,
        RegistrationCandidate.portal_user_id == current_user.id,
    )
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    # Only allow photo upload for DRAFT registrations
    if candidate.registration_status != RegistrationStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Photo can only be uploaded for draft registrations",
        )

    # Read file content
    content = await file.read()

    # Validate photo (file type, dimensions, file size)
    PhotoValidationService.validate_all(content, file.content_type or "")

    # Delete existing photo if present (one photo per candidate)
    existing_photo_stmt = select(RegistrationCandidatePhoto).where(
        RegistrationCandidatePhoto.registration_candidate_id == registration_id
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
        content, new_filename, registration_id, candidate.registration_exam_id, candidate.registration_number
    )

    # Create photo record
    db_photo = RegistrationCandidatePhoto(
        registration_candidate_id=registration_id,
        file_path=file_path,
        file_name=new_filename,
        mime_type=file.content_type or "image/jpeg",
        checksum=checksum,
    )
    session.add(db_photo)
    await session.commit()
    await session.refresh(db_photo)

    return RegistrationCandidatePhotoResponse.model_validate(db_photo)


@router.get("/registrations/{registration_id}/photos", response_model=RegistrationCandidatePhotoResponse | None)
async def get_private_candidate_photo(
    registration_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> RegistrationCandidatePhotoResponse | None:
    """Get candidate's photo (returns single photo or null)."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    # Validate registration exists and belongs to current user
    candidate_stmt = select(RegistrationCandidate).where(
        RegistrationCandidate.id == registration_id,
        RegistrationCandidate.portal_user_id == current_user.id,
    )
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    # Get photo
    photo_stmt = select(RegistrationCandidatePhoto).where(
        RegistrationCandidatePhoto.registration_candidate_id == registration_id
    )
    photo_result = await session.execute(photo_stmt)
    photo = photo_result.scalar_one_or_none()

    if not photo:
        return None

    return RegistrationCandidatePhotoResponse.model_validate(photo)


@router.get("/registrations/{registration_id}/photos/file")
async def get_private_candidate_photo_file(
    registration_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> StreamingResponse:
    """Get photo file."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    # Validate registration exists and belongs to current user
    candidate_stmt = select(RegistrationCandidate).where(
        RegistrationCandidate.id == registration_id,
        RegistrationCandidate.portal_user_id == current_user.id,
    )
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    # Get photo
    photo_stmt = select(RegistrationCandidatePhoto).where(
        RegistrationCandidatePhoto.registration_candidate_id == registration_id
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


# Certificate Confirmation/Verification Endpoints

@router.get("/certificate-requests", response_model=dict)
async def list_my_certificate_requests(
    session: DBSessionDep,
    current_user: CurrentUserDep,
    request_type: str | None = Query(None, description="Filter by request type (confirmation/verification)"),
    status_filter: str | None = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    """List certificate confirmation/verification requests for the current private user (includes both individual and bulk requests)."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    from app.models import CertificateRequest, CertificateConfirmationRequest, CertificateRequestType, RequestStatus
    from app.schemas.certificate import CertificateRequestResponse, CertificateConfirmationRequestResponse
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_id
    from sqlalchemy import and_, or_, func, cast, String
    from sqlalchemy.orm import selectinload
    import logging

    logger = logging.getLogger(__name__)

    # Filter by user_id for confirmation requests (primary method)
    # Also filter by email for backward compatibility with old requests
    user_email_lower = current_user.email.lower().strip() if current_user.email else None

    # For certificate requests, filter by email (they don't have user_id yet)
    cert_conditions = []
    if user_email_lower:
        cert_conditions.append(
            func.lower(func.trim(func.coalesce(CertificateRequest.contact_email, ""))) == user_email_lower
        )

    # For confirmation requests, filter by user_id (primary) or email (fallback)
    from sqlalchemy import or_
    conf_conditions_user = [CertificateConfirmationRequest.user_id == current_user.id]
    if user_email_lower:
        # Also include requests with matching email for backward compatibility
        conf_conditions_user.append(
            func.lower(func.trim(func.coalesce(CertificateConfirmationRequest.contact_email, ""))) == user_email_lower
        )

    # Filter by request type (only confirmation/verification for private users)
    request_type_enum = None
    if request_type:
        try:
            request_type_enum = CertificateRequestType(request_type.lower())
            if request_type_enum not in (CertificateRequestType.CONFIRMATION, CertificateRequestType.VERIFICATION):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Private users can only view confirmation and verification requests",
                )
            cert_conditions.append(cast(CertificateRequest.request_type, String).ilike(request_type_enum.value))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid request_type: {request_type}",
            )
    else:
        # Default to only confirmation/verification
        cert_conditions.append(
            CertificateRequest.request_type.in_([CertificateRequestType.CONFIRMATION, CertificateRequestType.VERIFICATION])
        )

    # Filter by status for certificate requests
    if status_filter:
        try:
            status_enum = RequestStatus(status_filter.lower())
            cert_conditions.append(cast(CertificateRequest.status, String).ilike(status_enum.value))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {status_filter}",
            )

    # Build query for individual certificate requests
    cert_stmt = (
        select(CertificateRequest)
        .where(and_(*cert_conditions))
        .options(
            selectinload(CertificateRequest.examination_center),
        )
        .order_by(CertificateRequest.created_at.desc())
    )

    # Count total for certificate requests
    cert_count_stmt = select(func.count()).select_from(CertificateRequest).where(and_(*cert_conditions))
    cert_count_result = await session.execute(cert_count_stmt)
    cert_total = cert_count_result.scalar() or 0

    # Build query for confirmation requests - use user_id (primary) or email (fallback)
    # Build the base condition: user_id match OR email match
    base_conf_condition = None
    if len(conf_conditions_user) > 1:
        base_conf_condition = or_(*conf_conditions_user)
    elif len(conf_conditions_user) == 1:
        base_conf_condition = conf_conditions_user[0]

    # If we have a base condition, add it to conf_conditions
    conf_conditions = []
    if base_conf_condition is not None:
        conf_conditions.append(base_conf_condition)

    if request_type_enum:
        conf_conditions.append(cast(CertificateConfirmationRequest.request_type, String).ilike(request_type_enum.value))
    else:
        conf_conditions.append(
            CertificateConfirmationRequest.request_type.in_([CertificateRequestType.CONFIRMATION, CertificateRequestType.VERIFICATION])
        )

    if status_filter:
        try:
            status_enum = RequestStatus(status_filter.lower())
            conf_conditions.append(cast(CertificateConfirmationRequest.status, String).ilike(status_enum.value))
        except ValueError:
            pass  # Already validated above

    conf_stmt = (
        select(CertificateConfirmationRequest)
        .where(and_(*conf_conditions) if conf_conditions else True)
        .options(
            selectinload(CertificateConfirmationRequest.invoice),
            selectinload(CertificateConfirmationRequest.payment),
        )
        .order_by(CertificateConfirmationRequest.created_at.desc())
    )

    # Count total for confirmation requests
    if conf_conditions:
        conf_count_stmt = select(func.count()).select_from(CertificateConfirmationRequest).where(and_(*conf_conditions))
    else:
        conf_count_stmt = select(func.count()).select_from(CertificateConfirmationRequest)
    conf_count_result = await session.execute(conf_count_stmt)
    conf_total = conf_count_result.scalar() or 0

    # Calculate total
    total = cert_total + conf_total
    offset = (page - 1) * page_size

    # Fetch ALL results for both types (don't paginate here, paginate after combining)
    cert_result = await session.execute(cert_stmt)
    cert_requests = list(cert_result.scalars().all())

    conf_result = await session.execute(conf_stmt)
    confirmation_requests = list(conf_result.scalars().all())

    # Convert to response models
    request_responses = []

    # Add individual certificate requests
    for req in cert_requests:
        response_data = CertificateRequestResponse.model_validate(req)
        if req.examination_center:
            response_data.examination_center_name = req.examination_center.name
        request_responses.append(response_data.model_dump())

    # Add confirmation requests (mark type based on certificate_details length)
    for conf_req in confirmation_requests:
        conf_response = CertificateConfirmationRequestResponse.model_validate(conf_req)
        conf_dict = conf_response.model_dump()
        conf_dict["has_response"] = bool(getattr(conf_req, "response_file_path", None))
        # Do not expose internal storage paths to clients
        conf_dict["response_file_path"] = None
        # Mark as bulk if multiple certificate details, otherwise single confirmation
        is_bulk = len(conf_req.certificate_details) > 1 if isinstance(conf_req.certificate_details, list) else False
        conf_dict["_type"] = "bulk_confirmation" if is_bulk else "certificate_confirmation"
        request_responses.append(conf_dict)

    # Sort by created_at descending (most recent first)
    request_responses.sort(key=lambda x: x["created_at"], reverse=True)

    # Apply pagination to combined results
    paginated_items = request_responses[offset:offset + page_size]

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return {
        "items": paginated_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/certificate-confirmations/{confirmation_id}/details.pdf", status_code=status.HTTP_200_OK)
async def download_my_confirmation_details_pdf(
    confirmation_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> StreamingResponse:
    """Download confirmation/verification request details as a PDF (generated on demand; not saved)."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    from app.models import CertificateConfirmationRequest, Invoice, Payment
    from app.services.bulk_certificate_confirmation_pdf_service import generate_bulk_certificate_confirmation_pdf
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    stmt = (
        select(CertificateConfirmationRequest)
        .where(CertificateConfirmationRequest.id == confirmation_id)
        .options(
            selectinload(CertificateConfirmationRequest.invoice),
            selectinload(CertificateConfirmationRequest.payment),
        )
    )
    result = await session.execute(stmt)
    confirmation_request = result.scalar_one_or_none()
    if not confirmation_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")

    if not confirmation_request.user_id or confirmation_request.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this request")

    invoice = confirmation_request.invoice
    if not invoice and confirmation_request.invoice_id:
        invoice_result = await session.execute(select(Invoice).where(Invoice.id == confirmation_request.invoice_id))
        invoice = invoice_result.scalar_one_or_none()

    payment = confirmation_request.payment
    if not payment and confirmation_request.payment_id:
        payment_result = await session.execute(select(Payment).where(Payment.id == confirmation_request.payment_id))
        payment = payment_result.scalar_one_or_none()

    certificate_details = (
        confirmation_request.certificate_details
        if isinstance(confirmation_request.certificate_details, list)
        else []
    )

    try:
        pdf_bytes = await generate_bulk_certificate_confirmation_pdf(
            confirmation_request,
            invoice=invoice,
            payment=payment,
            certificate_details=certificate_details,
        )
    except Exception as e:
        logger.error(f"Failed to generate confirmation details PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PDF document",
        )

    filename = f"confirmation_details_{confirmation_request.request_number}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/certificate-confirmations/{confirmation_id}/response", status_code=status.HTTP_200_OK)
async def download_my_confirmation_response(
    confirmation_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> StreamingResponse:
    """Download the stored admin response file for a confirmation/verification request (authenticated requester only)."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    from app.models import CertificateConfirmationRequest
    from app.services.certificate_file_storage import CertificateFileStorageService
    from sqlalchemy import select

    result = await session.execute(
        select(CertificateConfirmationRequest).where(CertificateConfirmationRequest.id == confirmation_id)
    )
    confirmation_request = result.scalar_one_or_none()
    if not confirmation_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")

    if not confirmation_request.user_id or confirmation_request.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this request")

    if not confirmation_request.response_file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Response not available for this request")

    if not confirmation_request.response_signed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Response is not yet signed. Please wait for the response to be signed before downloading.",
        )

    if confirmation_request.response_revoked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Response has been revoked and is no longer available for download.",
        )

    storage = CertificateFileStorageService()
    try:
        file_bytes = await storage.retrieve(confirmation_request.response_file_path)
    except Exception as e:
        logger.error(f"Failed to retrieve response file: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve response file")

    filename = confirmation_request.response_file_name or f"confirmation_response_{confirmation_request.request_number}"
    media_type = confirmation_request.response_mime_type or "application/octet-stream"
    return StreamingResponse(
        iter([file_bytes]),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/certificate-confirmations/request/{request_number}/response", status_code=status.HTTP_200_OK)
async def download_my_confirmation_response_by_number(
    request_number: str,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> StreamingResponse:
    """Download the stored admin response file for a confirmation/verification request by request number (authenticated requester only)."""
    if current_user.role != Role.PublicUser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for private users only")

    from app.models import CertificateConfirmationRequest
    from app.services.certificate_file_storage import CertificateFileStorageService
    from app.services.certificate_confirmation_service import get_certificate_confirmation_by_number

    confirmation_request = await get_certificate_confirmation_by_number(session, request_number)
    if not confirmation_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate confirmation request not found")

    if not confirmation_request.user_id or confirmation_request.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this request")

    if not confirmation_request.response_file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Response not available for this request")

    if not confirmation_request.response_signed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Response is not yet signed. Please wait for the response to be signed before downloading.",
        )

    if confirmation_request.response_revoked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Response has been revoked and is no longer available for download.",
        )

    storage = CertificateFileStorageService()
    try:
        file_bytes = await storage.retrieve(confirmation_request.response_file_path)
    except Exception as e:
        logger.error(f"Failed to retrieve response file: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve response file")

    filename = confirmation_request.response_file_name or f"confirmation_response_{confirmation_request.request_number}"
    media_type = confirmation_request.response_mime_type or "application/octet-stream"
    return StreamingResponse(
        iter([file_bytes]),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
