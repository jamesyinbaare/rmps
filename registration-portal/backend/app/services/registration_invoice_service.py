"""Service for generating invoices for registration candidates."""

from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Invoice, RegistrationCandidate
from app.services.invoice_service import generate_invoice_number
from app.services.registration_pricing_service import calculate_registration_amount


async def calculate_registration_invoice_amount(
    session: AsyncSession, candidate: RegistrationCandidate
) -> Decimal:
    """
    Calculate invoice amount for a registration candidate.

    Args:
        session: Database session
        candidate: RegistrationCandidate instance

    Returns:
        Total amount as Decimal
    """
    result = await calculate_registration_amount(session, candidate.id)
    return result["total"]


async def create_registration_invoice(
    session: AsyncSession, candidate: RegistrationCandidate, amount: Decimal | None = None
) -> Invoice:
    """
    Create invoice for a registration candidate.

    Args:
        session: Database session
        candidate: RegistrationCandidate instance
        amount: Invoice amount (if None, will be calculated)

    Returns:
        Created Invoice instance
    """
    if amount is None:
        amount = await calculate_registration_invoice_amount(session, candidate)

    invoice_number = await generate_invoice_number(session)

    invoice = Invoice(
        invoice_number=invoice_number,
        registration_candidate_id=candidate.id,
        amount=amount,
        currency="GHS",
        status="pending",
        due_date=datetime.utcnow().date() + timedelta(days=7),  # 7 days from now
    )
    session.add(invoice)
    await session.flush()
    await session.refresh(invoice)

    return invoice


async def create_additional_charge_invoice(
    session: AsyncSession, candidate: RegistrationCandidate, additional_amount: Decimal
) -> Invoice:
    """
    Create invoice for additional charges after subject changes.

    Args:
        session: Database session
        candidate: RegistrationCandidate instance
        additional_amount: Additional amount to charge

    Returns:
        Created Invoice instance
    """
    invoice_number = await generate_invoice_number(session)

    invoice = Invoice(
        invoice_number=invoice_number,
        registration_candidate_id=candidate.id,
        amount=additional_amount,
        currency="GHS",
        status="pending",
        due_date=datetime.utcnow().date() + timedelta(days=7),  # 7 days from now
    )
    session.add(invoice)
    await session.flush()
    await session.refresh(invoice)

    return invoice
