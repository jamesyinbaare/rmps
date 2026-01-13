"""Utility functions for registration number generation."""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RegistrationCandidate, RegistrationExam, RegistrationType, School


def generate_registration_number(length: int = 10) -> str:
    """
    Generate a random alphanumeric registration number (legacy function, kept for backward compatibility).

    Note: This function is deprecated. Use generate_unique_registration_number instead.

    Args:
        length: Length of the registration number (default: 10)

    Returns:
        A random alphanumeric registration number
    """
    import secrets
    import string
    characters = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(characters) for _ in range(length))


async def generate_unique_registration_number(
    session: AsyncSession,
    exam_id: int,
    school_id: int,
    registration_type: Optional[str] = None,
    length: Optional[int] = None,  # Deprecated, kept for backward compatibility
    max_attempts: int = 100
) -> str:
    """
    Generate a unique registration number using the structured format:
    [F/R/P][last 5 chars of school code][2-digit year][4-digit sequential number]

    Format:
    - Prefix: "F" for FREE_TVET, "R" for REFERRAL, "P" for PRIVATE
    - School code: Last 5 characters of the 6-character school code
    - Year: Last 2 digits of the exam year (e.g., "25" for 2025)
    - Sequential number: 4-digit number (0000-9999) per school, per exam, per year, per registration_type

    Example: FCH001251234 (F + CH001 + 25 + 1234)

    Args:
        session: Database session
        exam_id: Exam ID to get exam year
        school_id: School ID to get school code
        registration_type: Registration type (FREE_TVET, REFERRAL, or PRIVATE). Defaults to FREE_TVET if not provided.
        length: Deprecated parameter (kept for backward compatibility, ignored)
        max_attempts: Maximum attempts to generate a unique number (should not be needed with sequential logic)

    Returns:
        A unique registration number in the format specified

    Raises:
        ValueError: If school_id is None or invalid, or if exam not found, or if school not found, or if registration_type is invalid
        RuntimeError: If unable to generate a unique number (e.g., sequence exceeded 9999)
    """
    if school_id is None:
        raise ValueError("school_id is required for registration number generation")

    # Fetch exam to get year
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise ValueError(f"Exam with id {exam_id} not found")

    # Fetch school to get code
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()

    if not school:
        raise ValueError(f"School with id {school_id} not found")

    # Determine prefix based on registration_type
    # Default to FREE_TVET if not provided
    if registration_type is None:
        registration_type = RegistrationType.FREE_TVET.value

    # Normalize registration_type to handle enum values or strings
    registration_type_value = registration_type
    if hasattr(registration_type, 'value'):
        registration_type_value = registration_type.value

    # Map registration_type to prefix
    if registration_type_value == RegistrationType.FREE_TVET.value:
        prefix = "F"
    elif registration_type_value == RegistrationType.REFERRAL.value:
        prefix = "R"
    elif registration_type_value == RegistrationType.PRIVATE.value:
        prefix = "P"
    else:
        raise ValueError(f"Invalid registration_type: {registration_type_value}. Must be one of: FREE_TVET, REFERRAL, PRIVATE")

    # Extract last 5 characters of school code
    school_code = school.code
    if len(school_code) >= 5:
        school_code_part = school_code[-5:]
    else:
        # If school code is shorter than 5 characters, right-pad with zeros
        school_code_part = school_code.rjust(5, "0")

    # Extract last 2 digits of exam year
    year_part = str(exam.year)[-2:]

    # Build the prefix pattern for querying existing registration numbers
    # Format: [F/R/P][school_code][year] (e.g., "FCH00125")
    base_prefix = f"{prefix}{school_code_part}{year_part}"

    # Find all existing registration numbers with this prefix
    # We need to extract the sequential part (last 4 digits) to determine the next number
    # Also filter by registration_type to ensure sequences are per type
    stmt = select(RegistrationCandidate.registration_number).where(
        RegistrationCandidate.registration_number.like(f"{base_prefix}%"),
        RegistrationCandidate.registration_exam_id == exam_id,
        RegistrationCandidate.school_id == school_id,
        RegistrationCandidate.registration_type == registration_type_value,
    )
    result = await session.execute(stmt)
    existing_numbers = [row[0] for row in result.fetchall()]

    # Extract sequential numbers from existing registration numbers
    # The sequential part should be the last 4 digits
    sequential_numbers = []
    expected_length = len(base_prefix) + 4  # base_prefix + 4 digits

    for reg_num in existing_numbers:
        # Validate format: should be exactly expected_length characters
        if len(reg_num) == expected_length and reg_num.startswith(base_prefix):
            # Extract the last 4 characters as the sequential number
            seq_part = reg_num[-4:]
            # Verify it's numeric
            if seq_part.isdigit():
                sequential_numbers.append(int(seq_part))

    # Determine next sequential number
    if sequential_numbers:
        max_seq = max(sequential_numbers)
        next_seq = max_seq + 1
    else:
        next_seq = 0

    # Check for overflow
    if next_seq > 9999:
        raise RuntimeError(
            f"Registration number sequence exceeded maximum (9999) for school {school.code}, "
            f"exam {exam_id}, year {exam.year}. Cannot generate more registration numbers."
        )

    # Generate the registration number
    sequential_part = str(next_seq).zfill(4)
    registration_number = f"{base_prefix}{sequential_part}"

    # Verify uniqueness (should be unique by construction, but double-check for safety)
    check_stmt = select(RegistrationCandidate).where(
        RegistrationCandidate.registration_number == registration_number
    )
    check_result = await session.execute(check_stmt)
    existing = check_result.scalar_one_or_none()

    if existing:
        # This should rarely happen, but if it does, try incrementing
        for _ in range(max_attempts):
            next_seq += 1
            if next_seq > 9999:
                raise RuntimeError(
                    f"Unable to generate unique registration number after {max_attempts} attempts. "
                    f"Sequence overflow for school {school.code}, exam {exam_id}, year {exam.year}."
                )
            sequential_part = str(next_seq).zfill(4)
            registration_number = f"{base_prefix}{sequential_part}"

            check_stmt = select(RegistrationCandidate).where(
                RegistrationCandidate.registration_number == registration_number
            )
            check_result = await session.execute(check_stmt)
            existing = check_result.scalar_one_or_none()
            if existing is None:
                return registration_number

        raise RuntimeError(
            f"Unable to generate unique registration number after {max_attempts} attempts. "
            f"School: {school.code}, Exam: {exam_id}, Year: {exam.year}."
        )

    return registration_number
