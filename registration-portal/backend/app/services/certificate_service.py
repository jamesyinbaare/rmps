"""Service for certificate request management and workflow."""

import logging
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    CertificateRequest,
    Invoice,
    Payment,
    School,
    CertificateRequestType,
    RequestStatus,
    DeliveryMethod,
    ServiceType,
    TicketActivity,
    TicketStatusHistory,
    TicketActivityType,
    TicketPriority,
)
from uuid import UUID
from app.services.invoice_service import generate_invoice_number, calculate_invoice_amount
from app.services.certificate_file_storage import CertificateFileStorageService

logger = logging.getLogger(__name__)


async def generate_request_number(session: AsyncSession) -> str:
    """
    Generate a unique request number in format REQ-YYYYMMDD-XXXXXX.

    Args:
        session: Database session

    Returns:
        Unique request number string
    """
    today = datetime.utcnow().date()
    date_prefix = today.strftime("%Y%m%d")
    prefix = f"REQ-{date_prefix}-"

    # Count existing requests with same date prefix
    stmt = select(func.count(CertificateRequest.id)).where(CertificateRequest.request_number.like(f"{prefix}%"))
    result = await session.execute(stmt)
    count = result.scalar() or 0

    # Generate 6-digit sequential number
    sequence = str(count + 1).zfill(6)
    request_number = f"{prefix}{sequence}"

    # Ensure uniqueness (in case of race condition)
    existing_stmt = select(CertificateRequest).where(CertificateRequest.request_number == request_number)
    existing_result = await session.execute(existing_stmt)
    if existing_result.scalar_one_or_none():
        # If exists, increment and try again (should be rare)
        sequence = str(count + 2).zfill(6)
        request_number = f"{prefix}{sequence}"

    return request_number


async def validate_request_data(
    session: AsyncSession,
    request_type: CertificateRequestType,
    exam_year: int,
    examination_center_id: int,
    index_number: str,
) -> tuple[bool, str | None]:
    """
    Validate certificate request data.

    Args:
        session: Database session
        request_type: Certificate or Attestation
        exam_year: Year of examination
        examination_center_id: Examination center (school) ID
        index_number: Candidate index number

    Returns:
        Tuple of (is_valid, error_message)
    """
    # Validate examination center exists
    center_stmt = select(School).where(School.id == examination_center_id, School.is_active == True)
    center_result = await session.execute(center_stmt)
    center = center_result.scalar_one_or_none()

    if not center:
        return False, "Examination center not found or inactive"

    # Validate request type restrictions
    # Certificate requests are only for NOV/DEC exams
    # This validation can be enhanced to check actual exam records if needed
    # For now, we'll allow the request and let the admin validate later

    # Validate year is reasonable
    current_year = datetime.utcnow().year
    if exam_year < 2000 or exam_year > current_year:
        return False, f"Invalid examination year. Must be between 2000 and {current_year}"

    return True, None


async def create_certificate_request(
    session: AsyncSession,
    request_data: dict,
    photo_file_path: str,
    id_scan_file_path: str,
) -> CertificateRequest:
    """
    Create a certificate request with invoice.

    Args:
        session: Database session
        request_data: Dictionary with request fields
        photo_file_path: Path to uploaded photograph
        id_scan_file_path: Path to uploaded ID scan

    Returns:
        Created CertificateRequest instance
    """
    # Generate request number
    request_number = await generate_request_number(session)

    # Validate request data
    is_valid, error_message = await validate_request_data(
        session,
        request_data["request_type"],
        request_data["exam_year"],
        request_data["examination_center_id"],
        request_data["index_number"],
    )
    if not is_valid:
        raise ValueError(error_message or "Invalid request data")

    # Get service type from request data, default to STANDARD
    service_type = request_data.get("service_type", ServiceType.STANDARD)
    if isinstance(service_type, str):
        service_type = ServiceType(service_type.lower())

    # Calculate invoice amount
    amount = calculate_invoice_amount(
        request_data["request_type"],
        request_data["delivery_method"],
        service_type,
    )

    # Create certificate request first (without invoice_id)
    certificate_request = CertificateRequest(
        request_type=request_data["request_type"],
        request_number=request_number,
        index_number=request_data["index_number"],
        exam_year=request_data["exam_year"],
        examination_center_id=request_data["examination_center_id"],
        national_id_number=request_data["national_id_number"],
        national_id_file_path=id_scan_file_path,
        photograph_file_path=photo_file_path,
        delivery_method=request_data["delivery_method"],
        contact_phone=request_data["contact_phone"],
        contact_email=request_data.get("contact_email"),
        courier_address_line1=request_data.get("courier_address_line1"),
        courier_address_line2=request_data.get("courier_address_line2"),
        courier_city=request_data.get("courier_city"),
        courier_region=request_data.get("courier_region"),
        courier_postal_code=request_data.get("courier_postal_code"),
        status=RequestStatus.PENDING_PAYMENT,
        service_type=service_type,
    )
    session.add(certificate_request)
    await session.flush()
    await session.refresh(certificate_request)

    # Create invoice with certificate_request_id
    invoice_number = await generate_invoice_number(session)
    invoice = Invoice(
        invoice_number=invoice_number,
        certificate_request_id=certificate_request.id,
        amount=amount,
        currency="GHS",
        status="pending",
        due_date=datetime.utcnow().date() + timedelta(days=7),  # 7 days from now
    )
    session.add(invoice)
    await session.flush()
    await session.refresh(invoice)

    # Update certificate request with invoice_id
    certificate_request.invoice_id = invoice.id
    await session.flush()
    await session.refresh(certificate_request)

    logger.info(f"Created certificate request {request_number} with invoice {invoice_number}")
    return certificate_request


async def get_certificate_request_by_number(
    session: AsyncSession,
    request_number: str,
) -> CertificateRequest | None:
    """
    Get certificate request by request number.

    Args:
        session: Database session
        request_number: Request number

    Returns:
        CertificateRequest instance or None
    """
    stmt = (
        select(CertificateRequest)
        .where(CertificateRequest.request_number == request_number)
        .options(
            selectinload(CertificateRequest.examination_center),
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_certificate_request_by_id(
    session: AsyncSession,
    request_id: int,
) -> CertificateRequest | None:
    """
    Get certificate request by ID.

    Args:
        session: Database session
        request_id: Request ID

    Returns:
        CertificateRequest instance or None
    """
    stmt = (
        select(CertificateRequest)
        .where(CertificateRequest.id == request_id)
        .options(
            selectinload(CertificateRequest.examination_center),
            selectinload(CertificateRequest.processed_by),
            selectinload(CertificateRequest.dispatched_by),
            selectinload(CertificateRequest.assigned_to),
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def update_request_status(
    session: AsyncSession,
    request_id: int,
    status: RequestStatus,
    user_id: str | None = None,
    notes: str | None = None,
) -> CertificateRequest:
    """
    Update certificate request status with history tracking.

    Args:
        session: Database session
        request_id: Request ID
        status: New status
        user_id: User ID performing the update (optional)
        notes: Additional notes (optional)

    Returns:
        Updated CertificateRequest instance
    """
    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise ValueError(f"Certificate request {request_id} not found")

    old_status = request.status
    request.status = status

    # Update status-specific timestamp
    now = datetime.utcnow()
    if status == RequestStatus.PAID:
        request.paid_at = now
    elif status == RequestStatus.IN_PROCESS:
        request.in_process_at = now
    elif status == RequestStatus.READY_FOR_DISPATCH:
        request.ready_for_dispatch_at = now
    elif status == RequestStatus.RECEIVED:
        request.received_at = now
    elif status == RequestStatus.COMPLETED:
        request.completed_at = now

    # Record status history
    status_history = TicketStatusHistory(
        ticket_id=request_id,
        from_status=old_status.value if old_status else None,
        to_status=status.value,
        changed_by_user_id=UUID(user_id) if user_id else None,
        reason=notes,
    )
    session.add(status_history)

    # Record activity
    activity = TicketActivity(
        ticket_id=request_id,
        activity_type=TicketActivityType.STATUS_CHANGE,
        user_id=UUID(user_id) if user_id else None,
        old_status=old_status.value if old_status else None,
        new_status=status.value,
        comment=notes,
    )
    session.add(activity)

    if notes:
        request.notes = (request.notes or "") + f"\n{datetime.utcnow().isoformat()}: {notes}"

    await session.flush()
    await session.refresh(request)

    logger.info(f"Updated certificate request {request.request_number} status from {old_status.value} to {status.value}")
    return request


async def begin_processing(
    session: AsyncSession,
    request_id: int,
    user_id: str,
) -> CertificateRequest:
    """
    Begin processing a certificate request (System Admin action).

    Args:
        session: Database session
        request_id: Request ID
        user_id: System Admin user ID

    Returns:
        Updated CertificateRequest instance
    """
    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise ValueError(f"Certificate request {request_id} not found")

    if request.status != RequestStatus.PAID:
        raise ValueError(f"Request must be in PAID status to begin processing. Current status: {request.status.value}")

    old_status = request.status
    request.status = RequestStatus.IN_PROCESS
    request.processed_by_user_id = UUID(user_id) if user_id else None
    request.in_process_at = datetime.utcnow()

    # Record status history
    status_history = TicketStatusHistory(
        ticket_id=request_id,
        from_status=old_status.value,
        to_status=RequestStatus.IN_PROCESS.value,
        changed_by_user_id=UUID(user_id) if user_id else None,
    )
    session.add(status_history)

    # Record activity
    activity = TicketActivity(
        ticket_id=request_id,
        activity_type=TicketActivityType.STATUS_CHANGE,
        user_id=UUID(user_id) if user_id else None,
        old_status=old_status.value,
        new_status=RequestStatus.IN_PROCESS.value,
    )
    session.add(activity)

    await session.flush()
    await session.refresh(request)

    logger.info(f"Started processing certificate request {request.request_number} by user {user_id}")
    return request


async def send_to_dispatch(
    session: AsyncSession,
    request_id: int,
    user_id: str,
) -> CertificateRequest:
    """
    Mark request as ready for dispatch (System Admin action).

    Args:
        session: Database session
        request_id: Request ID
        user_id: System Admin user ID

    Returns:
        Updated CertificateRequest instance
    """
    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise ValueError(f"Certificate request {request_id} not found")

    if request.status != RequestStatus.IN_PROCESS:
        raise ValueError(f"Request must be in IN_PROCESS status. Current status: {request.status.value}")

    old_status = request.status
    request.status = RequestStatus.READY_FOR_DISPATCH
    request.ready_for_dispatch_at = datetime.utcnow()

    # Record status history
    status_history = TicketStatusHistory(
        ticket_id=request_id,
        from_status=old_status.value,
        to_status=RequestStatus.READY_FOR_DISPATCH.value,
        changed_by_user_id=UUID(user_id) if user_id else None,
    )
    session.add(status_history)

    # Record activity
    activity = TicketActivity(
        ticket_id=request_id,
        activity_type=TicketActivityType.STATUS_CHANGE,
        user_id=UUID(user_id) if user_id else None,
        old_status=old_status.value,
        new_status=RequestStatus.READY_FOR_DISPATCH.value,
    )
    session.add(activity)

    await session.flush()
    await session.refresh(request)

    logger.info(f"Sent certificate request {request.request_number} to dispatch")
    return request


async def dispatch_request(
    session: AsyncSession,
    request_id: int,
    user_id: str,
    tracking_number: str | None = None,
) -> CertificateRequest:
    """
    Dispatch a certificate request (Admin action).

    Args:
        session: Database session
        request_id: Request ID
        user_id: Admin user ID
        tracking_number: Tracking number for courier delivery (optional)

    Returns:
        Updated CertificateRequest instance
    """
    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise ValueError(f"Certificate request {request_id} not found")

    if request.status != RequestStatus.READY_FOR_DISPATCH:
        raise ValueError(f"Request must be in READY_FOR_DISPATCH status. Current status: {request.status.value}")

    old_status = request.status
    request.status = RequestStatus.DISPATCHED
    request.dispatched_by_user_id = UUID(user_id) if user_id else None
    request.dispatched_at = datetime.utcnow()
    if tracking_number:
        request.tracking_number = tracking_number

    # Record status history
    status_history = TicketStatusHistory(
        ticket_id=request_id,
        from_status=old_status.value,
        to_status=RequestStatus.DISPATCHED.value,
        changed_by_user_id=UUID(user_id) if user_id else None,
    )
    session.add(status_history)

    # Record activity
    activity = TicketActivity(
        ticket_id=request_id,
        activity_type=TicketActivityType.STATUS_CHANGE,
        user_id=UUID(user_id) if user_id else None,
        old_status=old_status.value,
        new_status=RequestStatus.DISPATCHED.value,
        comment=f"Tracking number: {tracking_number}" if tracking_number else None,
    )
    session.add(activity)

    await session.flush()
    await session.refresh(request)

    logger.info(f"Dispatched certificate request {request.request_number} by user {user_id}")
    return request


async def mark_received(
    session: AsyncSession,
    request_id: int,
    user_id: str,
) -> CertificateRequest:
    """
    Mark request as received (Admin action).

    Args:
        session: Database session
        request_id: Request ID
        user_id: Admin user ID

    Returns:
        Updated CertificateRequest instance
    """
    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise ValueError(f"Certificate request {request_id} not found")

    if request.status != RequestStatus.DISPATCHED:
        raise ValueError(f"Request must be in DISPATCHED status. Current status: {request.status.value}")

    old_status = request.status
    request.status = RequestStatus.RECEIVED
    request.received_at = datetime.utcnow()

    # Record status history
    status_history = TicketStatusHistory(
        ticket_id=request_id,
        from_status=old_status.value,
        to_status=RequestStatus.RECEIVED.value,
        changed_by_user_id=UUID(user_id) if user_id else None,
    )
    session.add(status_history)

    # Record activity
    activity = TicketActivity(
        ticket_id=request_id,
        activity_type=TicketActivityType.STATUS_CHANGE,
        user_id=UUID(user_id) if user_id else None,
        old_status=old_status.value,
        new_status=RequestStatus.RECEIVED.value,
    )
    session.add(activity)

    await session.flush()
    await session.refresh(request)

    logger.info(f"Marked certificate request {request.request_number} as received")
    return request


async def complete_request(
    session: AsyncSession,
    request_id: int,
    user_id: str,
) -> CertificateRequest:
    """
    Mark request as completed (Admin action).

    Args:
        session: Database session
        request_id: Request ID
        user_id: Admin user ID

    Returns:
        Updated CertificateRequest instance
    """
    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise ValueError(f"Certificate request {request_id} not found")

    if request.status != RequestStatus.RECEIVED:
        raise ValueError(f"Request must be in RECEIVED status. Current status: {request.status.value}")

    old_status = request.status
    request.status = RequestStatus.COMPLETED
    request.completed_at = datetime.utcnow()

    # Record status history
    status_history = TicketStatusHistory(
        ticket_id=request_id,
        from_status=old_status.value,
        to_status=RequestStatus.COMPLETED.value,
        changed_by_user_id=UUID(user_id) if user_id else None,
    )
    session.add(status_history)

    # Record activity
    activity = TicketActivity(
        ticket_id=request_id,
        activity_type=TicketActivityType.STATUS_CHANGE,
        user_id=UUID(user_id) if user_id else None,
        old_status=old_status.value,
        new_status=RequestStatus.COMPLETED.value,
    )
    session.add(activity)

    await session.flush()
    await session.refresh(request)

    logger.info(f"Completed certificate request {request.request_number}")
    return request


async def cancel_request(
    session: AsyncSession,
    request_id: int,
    user_id: str,
    reason: str | None = None,
) -> CertificateRequest:
    """
    Cancel a certificate request (Admin action).

    Can be cancelled from any status except COMPLETED or CANCELLED.

    Args:
        session: Database session
        request_id: Request ID
        user_id: Admin user ID
        reason: Optional cancellation reason

    Returns:
        Updated CertificateRequest instance
    """
    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise ValueError(f"Certificate request {request_id} not found")

    if request.status == RequestStatus.COMPLETED:
        raise ValueError("Cannot cancel a completed request")
    if request.status == RequestStatus.CANCELLED:
        raise ValueError("Request is already cancelled")

    old_status = request.status
    request.status = RequestStatus.CANCELLED

    # Record status history
    status_history = TicketStatusHistory(
        ticket_id=request_id,
        from_status=old_status.value,
        to_status=RequestStatus.CANCELLED.value,
        changed_by_user_id=UUID(user_id) if user_id else None,
        reason=reason,
    )
    session.add(status_history)

    # Record activity
    activity = TicketActivity(
        ticket_id=request_id,
        activity_type=TicketActivityType.STATUS_CHANGE,
        user_id=UUID(user_id) if user_id else None,
        old_status=old_status.value,
        new_status=RequestStatus.CANCELLED.value,
        comment=reason or "Request cancelled",
    )
    session.add(activity)

    await session.flush()
    await session.refresh(request)

    logger.info(f"Cancelled certificate request {request.request_number}")
    return request


async def assign_ticket(
    session: AsyncSession,
    request_id: int,
    user_id: str,
    assigned_to_user_id: str,
) -> CertificateRequest:
    """
    Assign ticket to a user.

    Args:
        session: Database session
        request_id: Request ID
        user_id: User ID performing the assignment
        assigned_to_user_id: User ID to assign ticket to

    Returns:
        Updated CertificateRequest instance
    """
    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise ValueError(f"Certificate request {request_id} not found")

    old_assigned_to = request.assigned_to_user_id
    request.assigned_to_user_id = UUID(assigned_to_user_id) if assigned_to_user_id else None

    # Record activity
    activity = TicketActivity(
        ticket_id=request_id,
        activity_type=TicketActivityType.ASSIGNMENT,
        user_id=UUID(user_id) if user_id else None,
        old_assigned_to=old_assigned_to,
        new_assigned_to=request.assigned_to_user_id,
    )
    session.add(activity)

    await session.flush()
    await session.refresh(request)

    logger.info(f"Assigned ticket {request.request_number} to user {assigned_to_user_id}")
    return request


async def unassign_ticket(
    session: AsyncSession,
    request_id: int,
    user_id: str,
) -> CertificateRequest:
    """
    Unassign ticket (remove assignment).

    Args:
        session: Database session
        request_id: Request ID
        user_id: User ID performing the unassignment

    Returns:
        Updated CertificateRequest instance
    """
    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise ValueError(f"Certificate request {request_id} not found")

    old_assigned_to = request.assigned_to_user_id
    request.assigned_to_user_id = None

    # Record activity
    activity = TicketActivity(
        ticket_id=request_id,
        activity_type=TicketActivityType.ASSIGNMENT,
        user_id=UUID(user_id) if user_id else None,
        old_assigned_to=old_assigned_to,
        new_assigned_to=None,
    )
    session.add(activity)

    await session.flush()
    await session.refresh(request)

    logger.info(f"Unassigned ticket {request.request_number}")
    return request


async def add_ticket_comment(
    session: AsyncSession,
    request_id: int,
    user_id: str,
    comment: str,
) -> TicketActivity:
    """
    Add a comment to a ticket.

    Args:
        session: Database session
        request_id: Request ID
        user_id: User ID adding the comment
        comment: Comment text

    Returns:
        Created TicketActivity instance
    """
    request = await get_certificate_request_by_id(session, request_id)
    if not request:
        raise ValueError(f"Certificate request {request_id} not found")

    activity = TicketActivity(
        ticket_id=request_id,
        activity_type=TicketActivityType.COMMENT,
        user_id=UUID(user_id) if user_id else None,
        comment=comment,
    )
    session.add(activity)
    await session.flush()
    await session.refresh(activity)

    logger.info(f"Added comment to ticket {request.request_number} by user {user_id}")
    return activity


async def get_ticket_activities(
    session: AsyncSession,
    request_id: int,
    limit: int = 100,
) -> list[TicketActivity]:
    """
    Get activity feed for a ticket.

    Args:
        session: Database session
        request_id: Request ID
        limit: Maximum number of activities to return

    Returns:
        List of TicketActivity instances
    """
    stmt = (
        select(TicketActivity)
        .where(TicketActivity.ticket_id == request_id)
        .options(
            selectinload(TicketActivity.user),
        )
        .order_by(TicketActivity.created_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_ticket_status_history(
    session: AsyncSession,
    request_id: int,
    limit: int = 100,
) -> list[TicketStatusHistory]:
    """
    Get status transition history for a ticket.

    Args:
        session: Database session
        request_id: Request ID
        limit: Maximum number of history entries to return

    Returns:
        List of TicketStatusHistory instances
    """
    stmt = (
        select(TicketStatusHistory)
        .where(TicketStatusHistory.ticket_id == request_id)
        .options(
            selectinload(TicketStatusHistory.changed_by),
        )
        .order_by(TicketStatusHistory.created_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())
