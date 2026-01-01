"""Utility functions for registration number generation."""
import secrets
import string

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RegistrationCandidate


def generate_registration_number(length: int = 10) -> str:
    """
    Generate a unique registration number.

    Args:
        length: Length of the registration number (default: 10)

    Returns:
        A random alphanumeric registration number
    """
    characters = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(characters) for _ in range(length))


async def generate_unique_registration_number(
    session: AsyncSession, exam_id: int, length: int = 10, max_attempts: int = 100
) -> str:
    """
    Generate a unique registration number that doesn't exist in the database.

    Args:
        session: Database session
        exam_id: Exam ID (for context, but checking globally unique)
        length: Length of the registration number
        max_attempts: Maximum attempts to generate a unique number

    Returns:
        A unique registration number

    Raises:
        RuntimeError: If unable to generate a unique number after max_attempts
    """
    for _ in range(max_attempts):
        reg_number = generate_registration_number(length)
        # Check if this registration number already exists
        stmt = select(RegistrationCandidate).where(RegistrationCandidate.registration_number == reg_number)
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing is None:
            return reg_number

    raise RuntimeError(f"Unable to generate unique registration number after {max_attempts} attempts")
