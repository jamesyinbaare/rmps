"""Service for certificate request reporting and statistics."""

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    CertificateRequest,
    Payment,
    RequestStatus,
    CertificateRequestType,
    DeliveryMethod,
    PaymentStatus,
)

logger = logging.getLogger(__name__)


async def get_request_statistics(
    session: AsyncSession,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> dict[str, Any]:
    """
    Get comprehensive statistics for certificate requests.

    Args:
        session: Database session
        start_date: Start date for filtering (optional)
        end_date: End date for filtering (optional)
        period: Period type for automatic date range (optional)

    Returns:
        Dictionary with statistics breakdowns
    """
    # Build base query
    base_stmt = select(CertificateRequest)

    # Apply date filters
    conditions = []
    if start_date:
        conditions.append(CertificateRequest.created_at >= start_date)
    if end_date:
        conditions.append(CertificateRequest.created_at <= end_date)

    if conditions:
        base_stmt = base_stmt.where(and_(*conditions))

    # Get total count
    count_stmt = select(func.count(CertificateRequest.id))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    total_result = await session.execute(count_stmt)
    total_requests = total_result.scalar() or 0

    # Counts by status
    status_counts = {}
    for status in RequestStatus:
        status_stmt = select(func.count(CertificateRequest.id)).where(CertificateRequest.status == status)
        if conditions:
            status_stmt = status_stmt.where(and_(*conditions))
        status_result = await session.execute(status_stmt)
        status_counts[status.value] = status_result.scalar() or 0

    # Counts by request type
    type_counts = {}
    for req_type in CertificateRequestType:
        type_stmt = select(func.count(CertificateRequest.id)).where(CertificateRequest.request_type == req_type)
        if conditions:
            type_stmt = type_stmt.where(and_(*conditions))
        type_result = await session.execute(type_stmt)
        type_counts[req_type.value] = type_result.scalar() or 0

    # Counts by delivery method
    delivery_counts = {}
    for method in DeliveryMethod:
        method_stmt = select(func.count(CertificateRequest.id)).where(CertificateRequest.delivery_method == method)
        if conditions:
            method_stmt = method_stmt.where(and_(*conditions))
        method_result = await session.execute(method_stmt)
        delivery_counts[method.value] = method_result.scalar() or 0

    # Payment statistics
    payment_base = select(Payment).join(CertificateRequest, Payment.certificate_request_id == CertificateRequest.id)
    if conditions:
        payment_base = payment_base.where(and_(*conditions))

    # Total revenue (successful payments)
    revenue_stmt = select(func.coalesce(func.sum(Payment.amount), 0)).where(
        Payment.status == PaymentStatus.SUCCESS
    )
    if conditions:
        revenue_stmt = revenue_stmt.join(
            CertificateRequest, Payment.certificate_request_id == CertificateRequest.id
        ).where(and_(*conditions))
    revenue_result = await session.execute(revenue_stmt)
    total_revenue = float(revenue_result.scalar() or 0)

    # Payment status counts
    payment_status_counts = {}
    for pay_status in PaymentStatus:
        pay_stmt = select(func.count(Payment.id)).where(Payment.status == pay_status)
        if conditions:
            pay_stmt = pay_stmt.join(
                CertificateRequest, Payment.certificate_request_id == CertificateRequest.id
            ).where(and_(*conditions))
        pay_result = await session.execute(pay_stmt)
        payment_status_counts[pay_status.value] = pay_result.scalar() or 0

    # Calculate payment success rate
    total_payments = sum(payment_status_counts.values())
    payment_success_rate = (payment_status_counts.get("success", 0) / total_payments * 100) if total_payments > 0 else 0

    # Revenue by request type
    revenue_by_type = {}
    for req_type in CertificateRequestType:
        rev_stmt = (
            select(func.coalesce(func.sum(Payment.amount), 0))
            .join(CertificateRequest, Payment.certificate_request_id == CertificateRequest.id)
            .where(and_(Payment.status == PaymentStatus.SUCCESS, CertificateRequest.request_type == req_type))
        )
        if conditions:
            rev_stmt = rev_stmt.where(and_(*conditions))
        rev_result = await session.execute(rev_stmt)
        revenue_by_type[req_type.value] = float(rev_result.scalar() or 0)

    return {
        "total_requests": total_requests,
        "by_status": status_counts,
        "by_type": type_counts,
        "by_delivery_method": delivery_counts,
        "payment_statistics": {
            "total_revenue": total_revenue,
            "by_status": payment_status_counts,
            "success_rate": round(payment_success_rate, 2),
            "revenue_by_type": revenue_by_type,
        },
        "processed_count": status_counts.get("in_process", 0) + status_counts.get("ready_for_dispatch", 0) + status_counts.get("dispatched", 0) + status_counts.get("received", 0) + status_counts.get("completed", 0),
        "completed_count": status_counts.get("completed", 0),
        "pending_count": status_counts.get("pending_payment", 0) + status_counts.get("paid", 0),
    }


async def export_request_data(
    session: AsyncSession,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> list[dict[str, Any]]:
    """
    Export certificate request data for CSV export.

    Args:
        session: Database session
        start_date: Start date for filtering (optional)
        end_date: End date for filtering (optional)

    Returns:
        List of dictionaries with request data
    """
    stmt = select(CertificateRequest).options(
        selectinload(CertificateRequest.invoice),
        selectinload(CertificateRequest.payment),
        selectinload(CertificateRequest.examination_center),
    )

    conditions = []
    if start_date:
        conditions.append(CertificateRequest.created_at >= start_date)
    if end_date:
        conditions.append(CertificateRequest.created_at <= end_date)

    if conditions:
        stmt = stmt.where(and_(*conditions))

    stmt = stmt.order_by(CertificateRequest.created_at.desc())
    result = await session.execute(stmt)
    requests = result.scalars().all()

    export_data = []
    for req in requests:
        export_data.append({
            "request_number": req.request_number,
            "request_type": req.request_type.value,
            "index_number": req.index_number,
            "exam_year": req.exam_year,
            "examination_center": req.examination_center.name if req.examination_center else None,
            "national_id_number": req.national_id_number,
            "delivery_method": req.delivery_method.value,
            "contact_phone": req.contact_phone,
            "contact_email": req.contact_email,
            "status": req.status.value,
            "invoice_number": req.invoice.invoice_number if req.invoice else None,
            "invoice_amount": float(req.invoice.amount) if req.invoice else None,
            "payment_status": req.payment.status.value if req.payment else None,
            "tracking_number": req.tracking_number,
            "created_at": req.created_at.isoformat() if req.created_at else None,
            "updated_at": req.updated_at.isoformat() if req.updated_at else None,
        })

    return export_data
