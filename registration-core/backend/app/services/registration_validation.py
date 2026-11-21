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
    - Required bio data: name, date_of_birth, gender
    - Photo exists
    - Programme is set
    - Subject selections are valid for the candidate's registration type
    """
    errors: list[str] = []

    if not candidate.name or not candidate.name.strip():
        errors.append("Name is required")

    if not candidate.date_of_birth:
        errors.append("Date of birth is required")

    if not candidate.gender or not candidate.gender.strip():
        errors.append("Gender is required")

    photo_stmt = select(RegistrationCandidatePhoto).where(
        RegistrationCandidatePhoto.registration_candidate_id == candidate.id
    )
    photo_result = await session.execute(photo_stmt)
    photo = photo_result.scalar_one_or_none()

    if not photo:
        errors.append("Photo is required for approval")

    if not candidate.programme_id:
        errors.append("Programme is required")
    else:
        selected_subject_ids = [
            sel.subject_id
            for sel in (candidate.subject_selections or [])
            if sel.subject_id is not None
        ]
        registration_type = (
            candidate.registration_type.value if candidate.registration_type else None
        )
        is_valid_subjects, subject_errors = await validate_subject_selections(
            session,
            candidate.programme_id,
            selected_subject_ids,
            registration_type=registration_type,
        )
        if not is_valid_subjects:
            errors.extend(subject_errors)

    return len(errors) == 0, errors
