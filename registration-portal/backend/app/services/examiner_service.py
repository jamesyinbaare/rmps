"""Service for examiner application business logic."""
import logging
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    ExaminerApplication,
    ExaminerApplicationStatus,
    Invoice,
    PaymentStatus,
)
from app.services.invoice_service import generate_invoice_number

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
    if not application.email_address:
        errors.append("Email address is required")
    if not application.telephone_cell and not application.telephone_office:
        errors.append("At least one telephone number is required")

    # At least one academic qualification
    if not application.qualifications or len(application.qualifications) == 0:
        errors.append("At least one academic qualification is required")

    # At least one subject preference
    if not application.subject_preferences or len(application.subject_preferences) == 0:
        errors.append("At least one subject preference is required")

    # Photograph is required
    has_photograph = any(
        doc.document_type.value == "PHOTOGRAPH" for doc in (application.documents or [])
    )
    if not has_photograph:
        errors.append("A passport-size photograph is required")

    # Certificates/transcripts should be attached (at least one)
    has_certificate_or_transcript = any(
        doc.document_type.value in ("CERTIFICATE", "TRANSCRIPT")
        for doc in (application.documents or [])
    )
    if not has_certificate_or_transcript:
        errors.append("At least one certificate or transcript is required")

    return len(errors) == 0, errors


async def create_application_invoice(
    session: AsyncSession,
    application: ExaminerApplication,
) -> Invoice:
    """
    Create an invoice for examiner application fee.

    Args:
        session: Database session
        application: ExaminerApplication instance

    Returns:
        Created Invoice instance
    """
    # Get application fee from settings (default to 30.00)
    application_fee = Decimal(str(getattr(settings, "examiner_application_fee", 30.00)))

    # Generate invoice number
    invoice_number = await generate_invoice_number(session)

    # Create invoice
    invoice = Invoice(
        invoice_number=invoice_number,
        amount=application_fee,
        currency="GHS",
        status="pending",
        due_date=datetime.utcnow().date() + timedelta(days=7),  # 7 days from now
    )

    session.add(invoice)
    await session.flush()

    # Link invoice to application
    application.invoice_id = invoice.id
    application.payment_status = PaymentStatus.PENDING

    return invoice
