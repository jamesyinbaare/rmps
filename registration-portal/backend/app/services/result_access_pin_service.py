"""Service for managing PIN and serial number combinations for result access control."""
import logging
import random
import string
from datetime import datetime
from typing import Optional, Tuple
from uuid import UUID

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import ResultAccessPin

logger = logging.getLogger(__name__)


def _generate_pin(length: int = None) -> str:
    """Generate a random numeric PIN of specified length."""
    if length is None:
        length = settings.result_access_pin_length
    return "".join([str(random.randint(0, 9)) for _ in range(length)])


def _generate_serial(length: int = None) -> str:
    """Generate a random alphanumeric serial number of specified length."""
    if length is None:
        length = settings.result_access_serial_length
    # Use uppercase letters and digits
    chars = string.ascii_uppercase + string.digits
    # Exclude ambiguous characters: 0, O, I, 1
    chars = chars.replace("0", "").replace("O", "").replace("I", "").replace("1", "")
    return "".join(random.choice(chars) for _ in range(length))


async def generate_pin_serial_combinations(
    session: AsyncSession,
    count: int,
    max_uses: Optional[int] = None,
    created_by_user_id: Optional[UUID] = None,
) -> list[ResultAccessPin]:
    """
    Generate multiple unique PIN/Serial combinations.

    Args:
        session: Database session
        count: Number of combinations to generate
        max_uses: Maximum number of uses per combination (defaults to config)
        created_by_user_id: User ID who is creating these combinations

    Returns:
        List of created ResultAccessPin instances
    """
    if max_uses is None:
        max_uses = settings.result_access_pin_default_max_uses

    generated = []
    attempts = 0
    max_attempts = count * 100  # Prevent infinite loops

    while len(generated) < count and attempts < max_attempts:
        attempts += 1

        # Generate PIN and Serial
        pin = _generate_pin()
        serial = _generate_serial()

        # Check if combination already exists
        existing_stmt = select(ResultAccessPin).where(
            and_(
                ResultAccessPin.pin == pin,
                ResultAccessPin.serial_number == serial,
            )
        )
        existing_result = await session.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()

        if existing:
            # Combination already exists, try again
            continue

        # Create new PIN/Serial combination
        pin_serial = ResultAccessPin(
            pin=pin,
            serial_number=serial,
            max_uses=max_uses,
            current_uses=0,
            is_active=True,
            created_by_user_id=created_by_user_id,
        )
        session.add(pin_serial)
        generated.append(pin_serial)

    if len(generated) < count:
        raise ValueError(
            f"Failed to generate {count} unique combinations after {max_attempts} attempts. "
            f"Only generated {len(generated)} combinations."
        )

    await session.flush()
    logger.info(
        f"Generated {len(generated)} PIN/Serial combinations",
        extra={
            "count": len(generated),
            "max_uses": max_uses,
            "created_by_user_id": str(created_by_user_id) if created_by_user_id else None,
        },
    )

    return generated


async def validate_pin_serial(
    session: AsyncSession,
    pin: str,
    serial_number: str,
    registration_number: str,
    exam_id: int,
) -> Tuple[bool, Optional[str]]:
    """
    Validate PIN/Serial combination and increment usage.

    Once a PIN/Serial is first used for a candidate, it becomes tied to that candidate
    and can only be reused for the same candidate's results.

    Args:
        session: Database session
        pin: PIN number
        serial_number: Serial number
        registration_number: Candidate registration number
        exam_id: Exam ID

    Returns:
        Tuple of (is_valid, error_message)
        - If valid: (True, None)
        - If invalid: (False, error_message)
    """
    if not pin or not serial_number:
        return False, "PIN and Serial Number are required"

    if not registration_number or not exam_id:
        return False, "Registration number and exam ID are required"

    # Find PIN/Serial combination with row-level lock to prevent race conditions
    stmt = select(ResultAccessPin).where(
        and_(
            ResultAccessPin.pin == pin.strip(),
            ResultAccessPin.serial_number == serial_number.strip().upper(),
        )
    ).with_for_update()
    result = await session.execute(stmt)
    pin_serial = result.scalar_one_or_none()

    if not pin_serial:
        logger.warning(
            "Invalid PIN/Serial combination attempted",
            extra={"pin": pin[:2] + "****", "serial": serial_number[:2] + "****"},
        )
        return False, "Invalid PIN or Serial Number"

    # Check if active
    if not pin_serial.is_active:
        logger.warning(
            "Inactive PIN/Serial combination attempted",
            extra={"pin_id": pin_serial.id},
        )
        return False, "This access code is no longer active"

    # Check if expired
    if pin_serial.expires_at and pin_serial.expires_at < datetime.utcnow():
        logger.warning(
            "Expired PIN/Serial combination attempted",
            extra={"pin_id": pin_serial.id, "expires_at": pin_serial.expires_at.isoformat()},
        )
        return False, "This access code has expired"

    # Check if max uses reached
    if pin_serial.current_uses >= pin_serial.max_uses:
        logger.warning(
            "Max uses reached for PIN/Serial combination",
            extra={
                "pin_id": pin_serial.id,
                "current_uses": pin_serial.current_uses,
                "max_uses": pin_serial.max_uses,
            },
        )
        return False, "This access code has reached its usage limit"

    # Check if PIN/Serial has been used before
    if pin_serial.first_used_registration_number is not None:
        # PIN/Serial has been used - verify it's for the same candidate
        if (
            pin_serial.first_used_registration_number != registration_number.strip()
            or pin_serial.first_used_exam_id != exam_id
        ):
            logger.warning(
                "PIN/Serial used for different candidate",
                extra={
                    "pin_id": pin_serial.id,
                    "first_used_registration_number": pin_serial.first_used_registration_number,
                    "attempted_registration_number": registration_number,
                    "first_used_exam_id": pin_serial.first_used_exam_id,
                    "attempted_exam_id": exam_id,
                },
            )
            return False, "This access code has been used"

    # First use - record the candidate
    if pin_serial.first_used_registration_number is None:
        pin_serial.first_used_registration_number = registration_number.strip()
        pin_serial.first_used_exam_id = exam_id
        pin_serial.first_used_at = datetime.utcnow()
        logger.info(
            "PIN/Serial first use recorded",
            extra={
                "pin_id": pin_serial.id,
                "registration_number": registration_number,
                "exam_id": exam_id,
            },
        )

    # Increment usage
    pin_serial.current_uses += 1
    pin_serial.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(pin_serial)

    logger.info(
        "PIN/Serial combination validated successfully",
        extra={
            "pin_id": pin_serial.id,
            "current_uses": pin_serial.current_uses,
            "max_uses": pin_serial.max_uses,
            "registration_number": registration_number,
            "exam_id": exam_id,
        },
    )

    return True, None
