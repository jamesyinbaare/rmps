"""Service for generating invoices for registration candidates."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Invoice, RegistrationCandidate, RegistrationExam, School, Programme
from app.services.invoice_service import generate_invoice_number
from app.services.registration_pricing_service import calculate_registration_amount
from app.services.pdf_generator import PdfGenerator, render_html


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


async def generate_registration_invoice_pdf(
    session: AsyncSession,
    invoice: Invoice,
    candidate: RegistrationCandidate | None = None,
) -> bytes:
    """
    Generate PDF invoice document for a registration candidate.

    Args:
        session: Database session
        invoice: Invoice model instance
        candidate: RegistrationCandidate instance (if None, will be loaded from invoice)

    Returns:
        PDF file as bytes
    """
    # Always reload candidate with all relationships to ensure we have all data
    from sqlalchemy import select
    candidate_id = candidate.id if candidate else invoice.registration_candidate_id

    if not candidate_id:
        raise ValueError("Invoice must be associated with a registration candidate")

    candidate_stmt = (
        select(RegistrationCandidate)
        .where(RegistrationCandidate.id == candidate_id)
        .options(
            selectinload(RegistrationCandidate.exam).selectinload(RegistrationExam.registration_period),
            selectinload(RegistrationCandidate.subject_selections),
            selectinload(RegistrationCandidate.school),
            selectinload(RegistrationCandidate.programme),
        )
    )
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        raise ValueError("Registration candidate not found")

    # Calculate price breakdown
    price_breakdown = await calculate_registration_amount(session, candidate.id)

    # Load exam and school info
    exam = candidate.exam
    school = candidate.school
    programme = candidate.programme

    # Prepare subject breakdown
    subjects = []
    for subject_selection in candidate.subject_selections:
        subjects.append({
            "code": subject_selection.subject_code,
            "name": subject_selection.subject_name,
            "series": subject_selection.series,
        })

    # Prepare template context
    context = {
        "invoice": invoice,
        "candidate": candidate,
        "exam": {
            "id": exam.id if exam else None,
            "type": exam.exam_type if exam else None,
            "series": exam.exam_series if exam else None,
            "year": exam.year if exam else None,
        },
        "school": {
            "code": school.code if school else None,
            "name": school.name if school else None,
        },
        "programme": {
            "code": programme.code if programme else None,
            "name": programme.name if programme else None,
        },
        "subjects": subjects,
        "price_breakdown": {
            "application_fee": float(price_breakdown.get("application_fee", 0)),
            "subject_price": float(price_breakdown.get("subject_price", 0)) if price_breakdown.get("subject_price") else None,
            "tiered_price": float(price_breakdown.get("tiered_price", 0)) if price_breakdown.get("tiered_price") else None,
            "pricing_model_used": price_breakdown.get("pricing_model_used", "unknown"),
        },
        "total_amount": float(invoice.amount),
        "currency": invoice.currency,
    }

    # Render the HTML template
    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "invoices/registration_invoice.html", templates_dir)

    # Get absolute path to app directory for base_url (so images can be resolved)
    app_dir = Path(__file__).parent.parent.resolve()
    base_url = str(app_dir)

    # Generate PDF using PdfGenerator
    pdf_gen = PdfGenerator(
        main_html=main_html,
        header_html=None,
        footer_html=None,
        base_url=base_url,
        side_margin=1.5,
        extra_vertical_margin=20,
    )

    pdf_bytes = pdf_gen.render_pdf()
    return pdf_bytes
