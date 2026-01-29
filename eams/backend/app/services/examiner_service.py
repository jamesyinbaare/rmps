"""Service for examiner application business logic."""
import logging
from datetime import datetime
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ExaminerApplication,
    ExaminerApplicationDocument,
    ExaminerApplicationStatus,
    ExaminerDocumentType,
)

logger = logging.getLogger(__name__)


async def generate_application_number(session: AsyncSession) -> str:
    """
    Generate a unique application number in format EXM-YYYYMMDD-XXXXXX.

    Args:
        session: Database session

    Returns:
        Unique application number string
    """
    today = datetime.utcnow().date()
    date_prefix = today.strftime("%Y%m%d")
    prefix = f"EXM-{date_prefix}-"

    # Count existing applications with same date prefix
    stmt = select(func.count(ExaminerApplication.id)).where(
        ExaminerApplication.application_number.like(f"{prefix}%")
    )
    result = await session.execute(stmt)
    count = result.scalar() or 0

    # Generate 6-digit sequential number
    sequence = str(count + 1).zfill(6)
    application_number = f"{prefix}{sequence}"

    # Ensure uniqueness (in case of race condition)
    existing_stmt = select(ExaminerApplication).where(
        ExaminerApplication.application_number == application_number
    )
    existing_result = await session.execute(existing_stmt)
    if existing_result.scalar_one_or_none():
        # If exists, increment and try again (should be rare)
        sequence = str(count + 2).zfill(6)
        application_number = f"{prefix}{sequence}"

    return application_number


def validate_application_completeness(application: ExaminerApplication) -> tuple[bool, list[str]]:
    """
    Validate that an application has all required fields for submission.

    Args:
        application: ExaminerApplication instance

    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    errors = []

    # Required personal particulars
    if not application.full_name or not application.full_name.strip():
        errors.append("Full name is required")
    if not application.region:
        errors.append("Region is required")
    if not application.email_address:
        errors.append("Email address is required")
    if not application.telephone_cell and not application.telephone_office:
        errors.append("At least one telephone number is required")

    # At least one subject preference (subject_id or subject_area)
    has_subject = application.subject_id is not None or (
        application.subject_area and application.subject_area.strip()
    )
    if not has_subject:
        errors.append("At least one subject preference is required")

    # Documents: photograph required, at least one certificate required
    # Requires application.documents to be loaded (e.g. selectinload in submit endpoint)
    documents = getattr(application, "documents", None) or []
    has_photograph = any(d.document_type == ExaminerDocumentType.PHOTOGRAPH for d in documents)
    certificate_count = sum(1 for d in documents if d.document_type == ExaminerDocumentType.CERTIFICATE)
    if not has_photograph:
        errors.append("A photograph is required")
    if certificate_count < 1:
        errors.append("At least one certificate is required")

    return len(errors) == 0, errors
