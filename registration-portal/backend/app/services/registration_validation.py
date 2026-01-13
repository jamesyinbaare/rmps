"""Service for validating registration approval requirements."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RegistrationCandidate, RegistrationCandidatePhoto
from app.services.subject_selection import validate_subject_selections


async def can_approve_registration(
    session: AsyncSession, candidate: RegistrationCandidate
) -> tuple[bool, list[str]]:
    """
    Validate that a registration meets all approval requirements.

    Requirements:
    - Required bio data: name (not null/empty), date_of_birth (not null), gender (not null/empty)
    - Photo exists: RegistrationCandidatePhoto record exists
    - Subject selections are valid: If programme_id exists, validate using validate_subject_selections()

    Args:
        session: Database session
        candidate: RegistrationCandidate instance to validate

    Returns:
        Tuple of (is_valid, list of error messages)
    """
    errors: list[str] = []

    # Check required bio data fields
    if not candidate.name or not candidate.name.strip():
        errors.append("Name is required")

    if not candidate.date_of_birth:
        errors.append("Date of birth is required")

    if not candidate.gender or not candidate.gender.strip():
        errors.append("Gender is required")

    # Check photo exists
    photo_stmt = select(RegistrationCandidatePhoto).where(
        RegistrationCandidatePhoto.registration_candidate_id == candidate.id
    )
    photo_result = await session.execute(photo_stmt)
    photo = photo_result.scalar_one_or_none()

    if not photo:
        errors.append("Photo is required for approval")

    # Validate subject selections if programme_id exists
    if candidate.programme_id:
        # Get subject IDs from subject selections
        selected_subject_ids = [
            sel.subject_id
            for sel in (candidate.subject_selections or [])
            if sel.subject_id is not None
        ]

        # Get exam series from exam if available
        exam_series = None
        if candidate.exam:
            exam_series = candidate.exam.exam_series

        # Validate subject selections
        is_valid_subjects, subject_errors = await validate_subject_selections(
            session, candidate.programme_id, selected_subject_ids, exam_series
        )
        if not is_valid_subjects:
            errors.extend(subject_errors)

    return len(errors) == 0, errors
