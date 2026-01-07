"""Service for certificate confirmation request management."""

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    CertificateConfirmationRequest,
    Invoice,
    CertificateRequestType,
    RequestStatus,
    ServiceType,
    TicketActivity,
    TicketActivityType,
    TicketStatusHistory,
)
from app.services.invoice_service import generate_invoice_number, calculate_invoice_amount

logger = logging.getLogger(__name__)


async def generate_confirmation_request_number(session: AsyncSession, is_bulk: bool = False) -> str:
    """
    Generate a unique confirmation request number.
    Format: REQ-YYYYMMDD-XXXXXX for single, BULK-YYYYMMDD-XXXXXX for bulk.

    Args:
        session: Database session
        is_bulk: Whether this is a bulk request (multiple certificates)

    Returns:
        Unique confirmation request number string
    """
    today = datetime.utcnow().date()
    date_prefix = today.strftime("%Y%m%d")
    prefix = f"BULK-{date_prefix}-" if is_bulk else f"REQ-{date_prefix}-"

    # Count existing confirmation requests with same date prefix
    stmt = select(func.count(CertificateConfirmationRequest.id)).where(
        CertificateConfirmationRequest.request_number.like(f"{prefix}%")
    )
    result = await session.execute(stmt)
    count = result.scalar() or 0

    # Generate 6-digit sequential number
    sequence = str(count + 1).zfill(6)
    request_number = f"{prefix}{sequence}"

    # Ensure uniqueness (in case of race condition)
    existing_stmt = select(CertificateConfirmationRequest).where(
        CertificateConfirmationRequest.request_number == request_number
    )
    existing_result = await session.execute(existing_stmt)
    if existing_result.scalar_one_or_none():
        # If exists, increment and try again (should be rare)
        sequence = str(count + 2).zfill(6)
        request_number = f"{prefix}{sequence}"

    return request_number


async def create_certificate_confirmation(
    session: AsyncSession,
    request_type: CertificateRequestType,
    contact_phone: str,
    contact_email: str | None,
    service_type: ServiceType,
    certificate_details: list[dict],
    user_id: str | None = None,  # Optional user ID if request is created by logged-in user
) -> CertificateConfirmationRequest:
    """
    Create a certificate confirmation request. Single entry in certificate_details = single request,
    multiple entries = bulk request.

    Args:
        session: Database session
        request_type: CONFIRMATION or VERIFICATION (synonymous)
        contact_phone: Requester's contact phone
        contact_email: Requester's contact email
        service_type: STANDARD or EXPRESS
        certificate_details: List of dictionaries with certificate information. Each dict should contain:
            - candidate_name (required)
            - candidate_index_number (optional)
            - school_name (required)
            - programme_name (required)
            - completion_year (required)
            - certificate_file_path (optional)
            - candidate_photograph_file_path (optional)
            - request_details (optional)

    Returns:
        Created CertificateConfirmationRequest instance
    """
    # Validate request type
    if request_type not in (CertificateRequestType.CONFIRMATION, CertificateRequestType.VERIFICATION):
        raise ValueError("Confirmation requests are only supported for confirmation and verification types")

    if not certificate_details or len(certificate_details) == 0:
        raise ValueError("certificate_details must contain at least one entry")

    # Determine if this is a bulk request
    is_bulk = len(certificate_details) > 1

    # Generate request number
    request_number = await generate_confirmation_request_number(session, is_bulk=is_bulk)

    # Calculate total amount: sum of all certificate amounts
    total_amount = Decimal(0)
    for _ in certificate_details:
        amount = calculate_invoice_amount(
            request_type=request_type,
            delivery_method=None,  # Confirmation requests don't have delivery
            service_type=service_type,
        )
        total_amount += amount

    # Create confirmation request with JSON array of certificate details
    from uuid import UUID
    confirmation_request = CertificateConfirmationRequest(
        request_number=request_number,
        request_type=request_type,
        user_id=UUID(user_id) if user_id else None,
        contact_phone=contact_phone,
        contact_email=contact_email,
        certificate_details=certificate_details,  # Store as JSON array
        service_type=service_type,
        status=RequestStatus.PENDING_PAYMENT,
    )
    session.add(confirmation_request)
    await session.flush()
    await session.refresh(confirmation_request)

    # Create invoice
    invoice_number = await generate_invoice_number(session)
    invoice = Invoice(
        invoice_number=invoice_number,
        certificate_confirmation_request_id=confirmation_request.id,
        amount=total_amount,
        currency="GHS",
        status="pending",
        due_date=datetime.utcnow().date() + timedelta(days=7),  # 7 days from now
    )
    session.add(invoice)
    await session.flush()
    await session.refresh(invoice)

    # Update confirmation request with invoice_id
    confirmation_request.invoice_id = invoice.id
    await session.flush()
    await session.refresh(confirmation_request)

    logger.info(f"Created certificate confirmation request {request_number} with {len(certificate_details)} certificate(s) and invoice {invoice_number}")

    return confirmation_request


async def get_certificate_confirmation_by_number(
    session: AsyncSession,
    request_number: str,
) -> CertificateConfirmationRequest | None:
    """
    Get certificate confirmation request by request number.

    Args:
        session: Database session
        request_number: Request number

    Returns:
        CertificateConfirmationRequest instance or None if not found
    """
    stmt = select(CertificateConfirmationRequest).where(
        CertificateConfirmationRequest.request_number == request_number
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_certificate_confirmation_by_id(
    session: AsyncSession,
    confirmation_id: int,
) -> CertificateConfirmationRequest | None:
    """
    Get certificate confirmation request by ID.

    Args:
        session: Database session
        confirmation_id: Confirmation request ID

    Returns:
        CertificateConfirmationRequest instance or None if not found
    """
    stmt = select(CertificateConfirmationRequest).where(
        CertificateConfirmationRequest.id == confirmation_id
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def update_confirmation_request_status(
    session: AsyncSession,
    confirmation_request: CertificateConfirmationRequest,
    status: RequestStatus,
    user_id: str | None = None,
    notes: str | None = None,
) -> CertificateConfirmationRequest:
    """
    Update confirmation request status with audit trail (TicketStatusHistory + TicketActivity).
    """
    old_status = confirmation_request.status
    confirmation_request.status = status

    now = datetime.utcnow()
    if status == RequestStatus.PAID:
        confirmation_request.paid_at = now
    elif status == RequestStatus.IN_PROCESS:
        confirmation_request.in_process_at = now
    elif status == RequestStatus.READY_FOR_DISPATCH:
        confirmation_request.ready_for_dispatch_at = now
    elif status == RequestStatus.RECEIVED:
        confirmation_request.received_at = now
    elif status == RequestStatus.COMPLETED:
        confirmation_request.completed_at = now

    status_history = TicketStatusHistory(
        ticket_type="certificate_confirmation_request",
        ticket_id=confirmation_request.id,
        from_status=old_status.value if old_status else None,
        to_status=status.value,
        changed_by_user_id=UUID(user_id) if user_id else None,
        reason=notes,
    )
    session.add(status_history)

    activity = TicketActivity(
        ticket_type="certificate_confirmation_request",
        ticket_id=confirmation_request.id,
        activity_type=TicketActivityType.STATUS_CHANGE,
        user_id=UUID(user_id) if user_id else None,
        old_status=old_status.value if old_status else None,
        new_status=status.value,
        comment=notes,
    )
    session.add(activity)

    return confirmation_request


async def begin_processing_confirmation(
    session: AsyncSession,
    confirmation_id: int,
    user_id: str,
) -> CertificateConfirmationRequest:
    """Begin processing a confirmation/verification request (System Admin action)."""
    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise ValueError(f"Certificate confirmation request {confirmation_id} not found")

    if confirmation_request.status != RequestStatus.PAID:
        raise ValueError(
            f"Request must be in PAID status to begin processing. Current status: {confirmation_request.status.value}"
        )

    confirmation_request.processed_by_user_id = UUID(user_id) if user_id else None
    await update_confirmation_request_status(
        session=session,
        confirmation_request=confirmation_request,
        status=RequestStatus.IN_PROCESS,
        user_id=user_id,
        notes=None,
    )

    await session.flush()
    await session.refresh(confirmation_request)
    logger.info(f"Started processing confirmation request {confirmation_request.request_number} by user {user_id}")
    return confirmation_request


async def send_confirmation_to_dispatch(
    session: AsyncSession,
    confirmation_id: int,
    user_id: str,
) -> CertificateConfirmationRequest:
    """Mark confirmation/verification request as ready for dispatch (System Admin action)."""
    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise ValueError(f"Certificate confirmation request {confirmation_id} not found")

    if confirmation_request.status != RequestStatus.IN_PROCESS:
        raise ValueError(
            f"Request must be in IN_PROCESS status. Current status: {confirmation_request.status.value}"
        )

    await update_confirmation_request_status(
        session=session,
        confirmation_request=confirmation_request,
        status=RequestStatus.READY_FOR_DISPATCH,
        user_id=user_id,
        notes=None,
    )

    await session.flush()
    await session.refresh(confirmation_request)
    logger.info(f"Sent confirmation request {confirmation_request.request_number} to dispatch")
    return confirmation_request


async def dispatch_confirmation_request(
    session: AsyncSession,
    confirmation_id: int,
    user_id: str,
    tracking_number: str | None = None,
) -> CertificateConfirmationRequest:
    """Dispatch a confirmation/verification request (Admin action)."""
    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise ValueError(f"Certificate confirmation request {confirmation_id} not found")

    if confirmation_request.status != RequestStatus.READY_FOR_DISPATCH:
        raise ValueError(
            f"Request must be in READY_FOR_DISPATCH status. Current status: {confirmation_request.status.value}"
        )

    old_status = confirmation_request.status
    confirmation_request.status = RequestStatus.DISPATCHED
    confirmation_request.dispatched_by_user_id = UUID(user_id) if user_id else None
    confirmation_request.dispatched_at = datetime.utcnow()
    if tracking_number:
        confirmation_request.tracking_number = tracking_number

    await update_confirmation_request_status(
        session=session,
        confirmation_request=confirmation_request,
        status=RequestStatus.DISPATCHED,
        user_id=user_id,
        notes=f"Tracking number: {tracking_number}" if tracking_number else None,
    )

    await session.flush()
    await session.refresh(confirmation_request)
    logger.info(f"Dispatched confirmation request {confirmation_request.request_number} by user {user_id}")
    return confirmation_request


async def mark_confirmation_received(
    session: AsyncSession,
    confirmation_id: int,
    user_id: str,
) -> CertificateConfirmationRequest:
    """Mark confirmation/verification request as received (Admin action)."""
    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise ValueError(f"Certificate confirmation request {confirmation_id} not found")

    if confirmation_request.status != RequestStatus.DISPATCHED:
        raise ValueError(
            f"Request must be in DISPATCHED status. Current status: {confirmation_request.status.value}"
        )

    await update_confirmation_request_status(
        session=session,
        confirmation_request=confirmation_request,
        status=RequestStatus.RECEIVED,
        user_id=user_id,
        notes=None,
    )

    await session.flush()
    await session.refresh(confirmation_request)
    logger.info(f"Marked confirmation request {confirmation_request.request_number} as received")
    return confirmation_request


async def complete_confirmation_request(
    session: AsyncSession,
    confirmation_id: int,
    user_id: str,
) -> CertificateConfirmationRequest:
    """Mark confirmation/verification request as completed (Admin action)."""
    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise ValueError(f"Certificate confirmation request {confirmation_id} not found")

    if confirmation_request.status != RequestStatus.RECEIVED:
        raise ValueError(
            f"Request must be in RECEIVED status. Current status: {confirmation_request.status.value}"
        )

    await update_confirmation_request_status(
        session=session,
        confirmation_request=confirmation_request,
        status=RequestStatus.COMPLETED,
        user_id=user_id,
        notes=None,
    )

    await session.flush()
    await session.refresh(confirmation_request)
    logger.info(f"Completed confirmation request {confirmation_request.request_number}")
    return confirmation_request


async def cancel_confirmation_request(
    session: AsyncSession,
    confirmation_id: int,
    user_id: str,
    reason: str | None = None,
) -> CertificateConfirmationRequest:
    """Cancel a confirmation/verification request (Admin action)."""
    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise ValueError(f"Certificate confirmation request {confirmation_id} not found")

    if confirmation_request.status == RequestStatus.COMPLETED:
        raise ValueError("Cannot cancel a completed request")
    if confirmation_request.status == RequestStatus.CANCELLED:
        raise ValueError("Request is already cancelled")

    old_status = confirmation_request.status
    confirmation_request.status = RequestStatus.CANCELLED

    await update_confirmation_request_status(
        session=session,
        confirmation_request=confirmation_request,
        status=RequestStatus.CANCELLED,
        user_id=user_id,
        notes=reason or "Request cancelled",
    )

    await session.flush()
    await session.refresh(confirmation_request)
    logger.info(f"Cancelled confirmation request {confirmation_request.request_number}")
    return confirmation_request


async def set_confirmation_status_manual(
    session: AsyncSession,
    confirmation_id: int,
    new_status: RequestStatus,
    user_id: str,
    reason: str,
) -> CertificateConfirmationRequest:
    """
    Manually set confirmation status with limited transitions after Begin Process.
    Allowed transitions:
      IN_PROCESS <-> READY_FOR_DISPATCH
      READY_FOR_DISPATCH -> DISPATCHED
      DISPATCHED <-> RECEIVED
      RECEIVED -> COMPLETED
    """
    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise ValueError(f"Certificate confirmation request {confirmation_id} not found")

    if confirmation_request.status in (RequestStatus.PENDING_PAYMENT, RequestStatus.PAID):
        raise ValueError("Manual status changes are only allowed after processing has begun (IN_PROCESS or later)")

    if new_status == RequestStatus.CANCELLED:
        raise ValueError("Use the cancel endpoint to cancel a request")

    allowed_map: dict[RequestStatus, set[RequestStatus]] = {
        RequestStatus.IN_PROCESS: {RequestStatus.READY_FOR_DISPATCH},
        RequestStatus.READY_FOR_DISPATCH: {RequestStatus.IN_PROCESS, RequestStatus.DISPATCHED},
        RequestStatus.DISPATCHED: {RequestStatus.RECEIVED},
        RequestStatus.RECEIVED: {RequestStatus.DISPATCHED, RequestStatus.COMPLETED},
    }
    allowed_next = allowed_map.get(confirmation_request.status, set())
    if new_status not in allowed_next:
        raise ValueError(f"Manual transition from {confirmation_request.status.value} to {new_status.value} is not allowed")

    await update_confirmation_request_status(
        session=session,
        confirmation_request=confirmation_request,
        status=new_status,
        user_id=user_id,
        notes=f"Manual: {reason}",
    )
    await session.flush()
    await session.refresh(confirmation_request)
    return confirmation_request

async def assign_confirmation_ticket(
    session: AsyncSession,
    confirmation_id: int,
    user_id: str,
    assigned_to_user_id: str,
) -> CertificateConfirmationRequest:
    """Assign confirmation ticket to a user."""
    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise ValueError(f"Certificate confirmation request {confirmation_id} not found")

    old_assigned_to = confirmation_request.assigned_to_user_id
    confirmation_request.assigned_to_user_id = UUID(assigned_to_user_id) if assigned_to_user_id else None

    activity = TicketActivity(
        ticket_type="certificate_confirmation_request",
        ticket_id=confirmation_id,
        activity_type=TicketActivityType.ASSIGNMENT,
        user_id=UUID(user_id) if user_id else None,
        old_assigned_to=old_assigned_to,
        new_assigned_to=confirmation_request.assigned_to_user_id,
    )
    session.add(activity)

    await session.flush()
    await session.refresh(confirmation_request)
    logger.info(f"Assigned confirmation ticket {confirmation_request.request_number} to user {assigned_to_user_id}")
    return confirmation_request


async def unassign_confirmation_ticket(
    session: AsyncSession,
    confirmation_id: int,
    user_id: str,
) -> CertificateConfirmationRequest:
    """Unassign confirmation ticket (remove assignment)."""
    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise ValueError(f"Certificate confirmation request {confirmation_id} not found")

    old_assigned_to = confirmation_request.assigned_to_user_id
    confirmation_request.assigned_to_user_id = None

    activity = TicketActivity(
        ticket_type="certificate_confirmation_request",
        ticket_id=confirmation_id,
        activity_type=TicketActivityType.ASSIGNMENT,
        user_id=UUID(user_id) if user_id else None,
        old_assigned_to=old_assigned_to,
        new_assigned_to=None,
    )
    session.add(activity)

    await session.flush()
    await session.refresh(confirmation_request)
    logger.info(f"Unassigned confirmation ticket {confirmation_request.request_number}")
    return confirmation_request


async def add_confirmation_comment(
    session: AsyncSession,
    confirmation_id: int,
    user_id: str,
    comment: str,
) -> TicketActivity:
    """Add a comment to a confirmation ticket."""
    confirmation_request = await get_certificate_confirmation_by_id(session, confirmation_id)
    if not confirmation_request:
        raise ValueError(f"Certificate confirmation request {confirmation_id} not found")

    activity = TicketActivity(
        ticket_type="certificate_confirmation_request",
        ticket_id=confirmation_id,
        activity_type=TicketActivityType.COMMENT,
        user_id=UUID(user_id) if user_id else None,
        comment=comment,
    )
    session.add(activity)
    await session.flush()
    await session.refresh(activity)

    logger.info(f"Added comment to confirmation ticket {confirmation_request.request_number} by user {user_id}")
    return activity
