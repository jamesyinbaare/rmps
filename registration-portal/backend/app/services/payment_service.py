"""Service for Paystack payment integration."""

import hashlib
import hmac
import json
import logging
from decimal import Decimal
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.models import Payment, Invoice, PaymentStatus

logger = logging.getLogger(__name__)

PAYSTACK_API_BASE_URL = "https://api.paystack.co"


async def initialize_payment(
    session: AsyncSession,
    invoice: Invoice,
    amount: Decimal,
    email: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Initialize Paystack payment and create Payment record.

    Args:
        session: Database session
        invoice: Invoice instance
        amount: Payment amount
        email: Customer email (optional)
        metadata: Additional metadata for Paystack (optional)

    Returns:
        Dictionary with authorization_url and reference
    """
    if not settings.paystack_secret_key:
        raise ValueError("Paystack secret key is not configured")

    # Check if there's already a pending payment for this invoice
    existing_payment_stmt = select(Payment).where(
        Payment.invoice_id == invoice.id,
        Payment.status == PaymentStatus.PENDING
    ).order_by(Payment.created_at.desc())
    existing_payment_result = await session.execute(existing_payment_stmt)
    existing_payment = existing_payment_result.scalar_one_or_none()

    # If a pending payment exists and has an authorization URL, return it
    if existing_payment and existing_payment.paystack_authorization_url:
        logger.info(f"Reusing existing pending payment {existing_payment.id} for invoice {invoice.id}")
        return {
            "payment_id": existing_payment.id,
            "authorization_url": existing_payment.paystack_authorization_url,
            "paystack_reference": existing_payment.paystack_reference or "",
        }

    # Prepare Paystack transaction data
    # Get callback URL from settings or use default
    callback_url = None
    if hasattr(settings, 'paystack_callback_base_url') and settings.paystack_callback_base_url:
        # Build callback URL based on invoice type
        if invoice.registration_candidate_id:
            # For registration candidates, redirect to registration page with registration_number
            # Payment status will be updated via webhook, and frontend will check status on return
            # Get the registration candidate to get the registration_number
            from app.models import RegistrationCandidate
            candidate_stmt = select(RegistrationCandidate).where(
                RegistrationCandidate.id == invoice.registration_candidate_id
            )
            candidate_result = await session.execute(candidate_stmt)
            candidate = candidate_result.scalar_one_or_none()
            if candidate and candidate.registration_number:
                callback_url = f"{settings.paystack_callback_base_url}/dashboard/private/register?registration_number={candidate.registration_number}"
            else:
                # Registration number should always exist, but if not, redirect without params
                # Frontend will load draft normally
                callback_url = f"{settings.paystack_callback_base_url}/dashboard/private/register"
        else:
            # For certificate requests, use existing logic
            request_number = metadata.get("request_number") if metadata else None
            if request_number:
                # Redirect to receipt page with request number
                callback_url = f"{settings.paystack_callback_base_url}/certificate-request/receipt?request_number={request_number}"
            else:
                # Fallback to receipt page
                callback_url = f"{settings.paystack_callback_base_url}/certificate-request/receipt"

    # Generate unique reference with timestamp to avoid duplicates
    from datetime import datetime
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    reference = f"INV-{invoice.invoice_number}-{timestamp}"

    paystack_data = {
        "amount": int(amount * 100),  # Convert to kobo (cents) - Paystack uses smallest currency unit
        "currency": invoice.currency,
        "reference": reference,
        "callback_url": callback_url,  # Redirect URL after payment
        "metadata": {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "certificate_request_id": invoice.certificate_request_id,
            "certificate_confirmation_request_id": invoice.certificate_confirmation_request_id,
            "registration_candidate_id": invoice.registration_candidate_id,
            **(metadata or {}),
        },
    }

    if email:
        paystack_data["email"] = email

    # Call Paystack API
    headers = {
        "Authorization": f"Bearer {settings.paystack_secret_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{PAYSTACK_API_BASE_URL}/transaction/initialize",
                json=paystack_data,
                headers=headers,
            )
            response.raise_for_status()
            paystack_response = response.json()

            if not paystack_response.get("status"):
                error_message = paystack_response.get("message", "Unknown error")
                logger.error(f"Paystack initialization failed: {error_message}")
                raise ValueError(f"Paystack initialization failed: {error_message}")

            data = paystack_response["data"]
            authorization_url = data["authorization_url"]
            reference = data["reference"]

            # Create Payment record
            # Determine which foreign key to use based on invoice relationships
            payment = Payment(
                invoice_id=invoice.id,
                certificate_request_id=invoice.certificate_request_id,
                certificate_confirmation_request_id=invoice.certificate_confirmation_request_id,
                registration_candidate_id=invoice.registration_candidate_id,
                paystack_reference=reference,
                paystack_authorization_url=authorization_url,
                amount=amount,
                currency=invoice.currency,
                status=PaymentStatus.PENDING,
                paystack_response=paystack_response,
            )
            session.add(payment)
            await session.flush()
            # No need to refresh - payment.id is available after flush

            return {
                "payment_id": payment.id,
                "authorization_url": authorization_url,
                "paystack_reference": reference,
            }

    except httpx.HTTPStatusError as e:
        logger.error(f"Paystack API error: {e.response.text}", exc_info=True)
        raise ValueError(f"Paystack API error: {e.response.text}")
    except Exception as e:
        logger.error(f"Error initializing Paystack payment: {e}", exc_info=True)
        raise


async def verify_payment(session: AsyncSession, reference: str) -> dict[str, Any]:
    """
    Verify payment status with Paystack.

    Args:
        session: Database session
        reference: Paystack transaction reference

    Returns:
        Payment verification data
    """
    if not settings.paystack_secret_key:
        raise ValueError("Paystack secret key is not configured")

    headers = {
        "Authorization": f"Bearer {settings.paystack_secret_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{PAYSTACK_API_BASE_URL}/transaction/verify/{reference}",
                headers=headers,
            )
            response.raise_for_status()
            paystack_response = response.json()

            if not paystack_response.get("status"):
                error_message = paystack_response.get("message", "Unknown error")
                logger.error(f"Paystack verification failed: {error_message}")
                return {"status": False, "message": error_message}

            return paystack_response

    except httpx.HTTPStatusError as e:
        logger.error(f"Paystack API error: {e.response.text}", exc_info=True)
        raise ValueError(f"Paystack API error: {e.response.text}")
    except Exception as e:
        logger.error(f"Error verifying Paystack payment: {e}", exc_info=True)
        raise


def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    """
    Verify Paystack webhook signature.

    Args:
        payload: Raw request body as bytes
        signature: X-Paystack-Signature header value

    Returns:
        True if signature is valid
    """
    if not settings.paystack_webhook_secret:
        logger.warning("Paystack webhook secret not configured, skipping signature verification")
        return True  # Allow if not configured (for development)

    try:
        computed_signature = hmac.new(
            settings.paystack_webhook_secret.encode("utf-8"),
            payload,
            hashlib.sha512,
        ).hexdigest()

        return hmac.compare_digest(computed_signature, signature)
    except Exception as e:
        logger.error(f"Error verifying webhook signature: {e}", exc_info=True)
        return False


async def process_webhook_event(
    session: AsyncSession,
    event_data: dict[str, Any],
) -> Payment | None:
    """
    Process Paystack webhook event and update payment status.

    Args:
        session: Database session
        event_data: Paystack webhook event data

    Returns:
        Updated Payment instance or None
    """
    event_type = event_data.get("event")
    data = event_data.get("data", {})

    if event_type not in ["charge.success", "charge.failure"]:
        logger.info(f"Ignoring webhook event type: {event_type}")
        return None

    reference = data.get("reference")
    if not reference:
        logger.error("Webhook event missing reference")
        return None

    # Find payment by reference
    stmt = select(Payment).where(Payment.paystack_reference == reference)
    result = await session.execute(stmt)
    payment = result.scalar_one_or_none()

    if not payment:
        logger.warning(f"Payment not found for reference: {reference}")
        return None

    # Update payment status based on event
    if event_type == "charge.success":
        payment.status = PaymentStatus.SUCCESS
        paid_at_value = data.get("paid_at")
        if paid_at_value:
            from datetime import datetime
            # Parse Paystack datetime string if needed
            if isinstance(paid_at_value, str):
                try:
                    # Parse as timezone-aware datetime
                    parsed_dt = datetime.fromisoformat(paid_at_value.replace("Z", "+00:00"))
                    # Convert to UTC and remove timezone info (make it naive)
                    if parsed_dt.tzinfo:
                        parsed_dt = parsed_dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
                    payment.paid_at = parsed_dt
                except Exception as e:
                    logger.warning(f"Failed to parse paid_at: {e}, using current time")
                    payment.paid_at = datetime.utcnow()
            elif isinstance(paid_at_value, datetime):
                # If already a datetime, ensure it's naive
                if paid_at_value.tzinfo:
                    payment.paid_at = paid_at_value.astimezone(datetime.timezone.utc).replace(tzinfo=None)
                else:
                    payment.paid_at = paid_at_value
            else:
                payment.paid_at = datetime.utcnow()
        else:
            # If no paid_at from Paystack, use current time
            payment.paid_at = datetime.utcnow()

        # Update invoice status
        if payment.invoice_id:
            invoice_stmt = select(Invoice).where(Invoice.id == payment.invoice_id)
            invoice_result = await session.execute(invoice_stmt)
            invoice = invoice_result.scalar_one_or_none()
            if invoice:
                invoice.status = "paid"
                # Use the same naive datetime for invoice
                invoice.paid_at = payment.paid_at

                # Update request/confirmation status if payment successful
                from app.models import CertificateConfirmationRequest, RequestStatus
                if invoice.certificate_confirmation_request_id:
                    confirmation_request_stmt = select(CertificateConfirmationRequest).where(
                        CertificateConfirmationRequest.id == invoice.certificate_confirmation_request_id
                    )
                    confirmation_request_result = await session.execute(confirmation_request_stmt)
                    confirmation_request = confirmation_request_result.scalar_one_or_none()
                    if confirmation_request:
                        confirmation_request.status = RequestStatus.PAID
                        confirmation_request.paid_at = payment.paid_at
                elif invoice.certificate_request_id:
                    from app.models import CertificateRequest
                    cert_request_stmt = select(CertificateRequest).where(
                        CertificateRequest.id == invoice.certificate_request_id
                    )
                    cert_request_result = await session.execute(cert_request_stmt)
                    cert_request = cert_request_result.scalar_one_or_none()
                    if cert_request:
                        cert_request.status = RequestStatus.PAID
                        cert_request.paid_at = payment.paid_at
                elif invoice.registration_candidate_id:
                    # Handle registration candidate payment
                    from app.models import RegistrationCandidate, RegistrationStatus
                    candidate_stmt = select(RegistrationCandidate).where(
                        RegistrationCandidate.id == invoice.registration_candidate_id
                    )
                    candidate_result = await session.execute(candidate_stmt)
                    candidate = candidate_result.scalar_one_or_none()
                    if candidate:
                        # Update total_paid_amount (increment by payment amount)
                        current_paid = Decimal(str(candidate.total_paid_amount or 0))
                        candidate.total_paid_amount = current_paid + payment.amount

                        # Update status to PENDING only if this is the first payment (was DRAFT)
                        # Don't change status if already PENDING or beyond (to preserve status for returning users)
                        if candidate.registration_status == RegistrationStatus.DRAFT:
                            candidate.registration_status = RegistrationStatus.PENDING
                            candidate.registration_date = payment.paid_at or datetime.utcnow()

                        logger.info(
                            f"Updated registration candidate {candidate.id}: "
                            f"total_paid_amount={candidate.total_paid_amount}, "
                            f"status={candidate.registration_status.value}, "
                            f"payment_amount={payment.amount}"
                        )

                # Handle credit purchase
                # Check if this is a credit purchase by checking payment metadata
                # Metadata can be in paystack_response or in the webhook data
                paystack_response = payment.paystack_response or {}
                paystack_metadata = paystack_response.get("data", {}).get("metadata", {}) or data.get("metadata", {})
                if paystack_metadata.get("type") == "credit_purchase":
                    from app.services.credit_service import add_credit
                    from app.models import CreditTransactionType
                    from uuid import UUID

                    user_id_str = paystack_metadata.get("user_id")
                    credits_amount = paystack_metadata.get("credits", 0)

                    if user_id_str and credits_amount:
                        try:
                            user_id = UUID(user_id_str)
                            credits_decimal = Decimal(str(credits_amount))

                            # Add credits to user account
                            await add_credit(
                                session,
                                user_id,
                                credits_decimal,
                                CreditTransactionType.PURCHASE,
                                payment_id=payment.id,
                                description=f"Credit purchase via Paystack payment {payment.paystack_reference}",
                            )
                            logger.info(
                                f"Added {credits_amount} credits to user {user_id} via payment {payment.id}"
                            )
                        except Exception as e:
                            logger.error(f"Error adding credits for payment {payment.id}: {e}", exc_info=True)

    elif event_type == "charge.failure":
        payment.status = PaymentStatus.FAILED

    # Update Paystack response data
    payment.paystack_response = event_data

    await session.flush()
    # Refresh to ensure all updated fields are loaded, but use expire_on_commit=False session behavior
    # The payment object should already have all fields we need

    logger.info(f"Payment {payment.id} status updated to {payment.status.value} via webhook")
    return payment
