"""Service for invoice generation and management."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Invoice, CertificateRequest, CertificateRequestType, DeliveryMethod, ServiceType
from app.services.pdf_generator import PdfGenerator, render_html


async def generate_invoice_number(session: AsyncSession) -> str:
    """
    Generate a unique invoice number in format INV-YYYYMMDD-XXXXXX.

    Args:
        session: Database session

    Returns:
        Unique invoice number string
    """
    today = datetime.utcnow().date()
    date_prefix = today.strftime("%Y%m%d")
    prefix = f"INV-{date_prefix}-"

    # Count existing invoices with same date prefix
    stmt = select(func.count(Invoice.id)).where(Invoice.invoice_number.like(f"{prefix}%"))
    result = await session.execute(stmt)
    count = result.scalar() or 0

    # Generate 6-digit sequential number
    sequence = str(count + 1).zfill(6)
    invoice_number = f"{prefix}{sequence}"

    # Ensure uniqueness (in case of race condition)
    existing_stmt = select(Invoice).where(Invoice.invoice_number == invoice_number)
    existing_result = await session.execute(existing_stmt)
    if existing_result.scalar_one_or_none():
        # If exists, increment and try again (should be rare)
        sequence = str(count + 2).zfill(6)
        invoice_number = f"{prefix}{sequence}"

    return invoice_number


def calculate_invoice_amount(
    request_type: CertificateRequestType,
    delivery_method: DeliveryMethod,
    service_type: ServiceType = ServiceType.STANDARD,
) -> Decimal:
    """
    Calculate invoice amount based on request type, delivery method, and service type.

    Args:
        request_type: Certificate or Attestation
        delivery_method: Pickup or Courier
        service_type: Standard or Express

    Returns:
        Total amount as Decimal
    """
    base_price = Decimal(0)
    if request_type == CertificateRequestType.CERTIFICATE:
        base_price = Decimal(str(settings.certificate_request_price))
    elif request_type == CertificateRequestType.ATTESTATION:
        base_price = Decimal(str(settings.attestation_request_price))

    # Apply express service multiplier if express
    if service_type == ServiceType.EXPRESS:
        base_price = base_price * Decimal(str(settings.express_service_multiplier))

    courier_fee = Decimal(0)
    if delivery_method == DeliveryMethod.COURIER:
        courier_fee = Decimal(str(settings.courier_fee))

    return base_price + courier_fee


async def generate_invoice_pdf(invoice: Invoice, certificate_request: CertificateRequest) -> bytes:
    """
    Generate PDF invoice document using WeasyPrint.

    Args:
        invoice: Invoice model instance
        certificate_request: CertificateRequest model instance

    Returns:
        PDF file as bytes
    """
    # Calculate price breakdown for template
    base_price = Decimal(str(
        settings.certificate_request_price if certificate_request.request_type == CertificateRequestType.CERTIFICATE
        else settings.attestation_request_price
    ))

    service_type = getattr(certificate_request, 'service_type', ServiceType.STANDARD)
    express_surcharge = Decimal(0)
    if service_type == ServiceType.EXPRESS:
        express_surcharge = base_price * (Decimal(str(settings.express_service_multiplier)) - Decimal("1"))
        base_price = base_price * Decimal(str(settings.express_service_multiplier))

    courier_fee = Decimal(str(settings.courier_fee)) if certificate_request.delivery_method == DeliveryMethod.COURIER else Decimal(0)

    # Prepare template context
    context = {
        "invoice": invoice,
        "certificate_request": certificate_request,
        "base_price": float(base_price - express_surcharge),
        "express_surcharge": float(express_surcharge),
        "courier_fee": float(courier_fee),
    }

    # Render the HTML template
    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "invoices/invoice.html", templates_dir)

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
