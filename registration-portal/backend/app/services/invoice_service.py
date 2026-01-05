"""Service for invoice generation and management."""

import io
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Invoice, CertificateRequest, CertificateRequestType, DeliveryMethod


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
) -> Decimal:
    """
    Calculate invoice amount based on request type and delivery method.

    Args:
        request_type: Certificate or Attestation
        delivery_method: Pickup or Courier

    Returns:
        Total amount as Decimal
    """
    base_price = Decimal(0)
    if request_type == CertificateRequestType.CERTIFICATE:
        base_price = Decimal(str(settings.certificate_request_price))
    elif request_type == CertificateRequestType.ATTESTATION:
        base_price = Decimal(str(settings.attestation_request_price))

    courier_fee = Decimal(0)
    if delivery_method == DeliveryMethod.COURIER:
        courier_fee = Decimal(str(settings.courier_fee))

    return base_price + courier_fee


async def generate_invoice_pdf(invoice: Invoice, certificate_request: CertificateRequest) -> bytes:
    """
    Generate PDF invoice document.

    Args:
        invoice: Invoice model instance
        certificate_request: CertificateRequest model instance

    Returns:
        PDF file as bytes
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5*cm,
        leftMargin=1.5*cm,
        topMargin=1*cm,
        bottomMargin=1*cm,
    )

    elements = []
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'InvoiceTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1e3a8a'),
        spaceAfter=12,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold',
    )

    heading_style = ParagraphStyle(
        'InvoiceHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=8,
        alignment=TA_LEFT,
        fontName='Helvetica-Bold',
    )

    normal_style = ParagraphStyle(
        'InvoiceNormal',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#000000'),
        alignment=TA_LEFT,
        leading=12,
    )

    label_style = ParagraphStyle(
        'InvoiceLabel',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#4b5563'),
        alignment=TA_LEFT,
        leading=12,
        fontName='Helvetica-Bold',
    )

    amount_style = ParagraphStyle(
        'InvoiceAmount',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#000000'),
        alignment=TA_RIGHT,
        leading=14,
        fontName='Helvetica-Bold',
    )

    # Logo at the top (if available)
    try:
        logo_path = Path(__file__).parent.parent / "img" / "logo.jpg"
        if logo_path.exists():
            logo_img = Image(str(logo_path), width=6*cm, height=None, kind='proportional')
            elements.append(logo_img)
            elements.append(Spacer(1, 0.4*cm))
    except Exception:
        pass

    # Invoice title
    title = Paragraph("INVOICE", title_style)
    elements.append(title)
    elements.append(Spacer(1, 0.6*cm))

    # Invoice details table
    invoice_data = [
        [Paragraph("<b>Invoice Number:</b>", label_style), Paragraph(invoice.invoice_number, normal_style)],
        [Paragraph("<b>Invoice Date:</b>", label_style), Paragraph(invoice.created_at.strftime("%B %d, %Y"), normal_style)],
        [Paragraph("<b>Due Date:</b>", label_style), Paragraph(
            (invoice.due_date or invoice.created_at.date()).strftime("%B %d, %Y"),
            normal_style
        )],
        [Paragraph("<b>Status:</b>", label_style), Paragraph(invoice.status.upper(), normal_style)],
    ]

    invoice_table = Table(invoice_data, colWidths=[4*cm, 10*cm])
    invoice_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(invoice_table)
    elements.append(Spacer(1, 0.6*cm))

    # Request details
    request_type_label = "Certificate Request" if certificate_request.request_type == CertificateRequestType.CERTIFICATE else "Attestation Request"
    heading = Paragraph("Request Details", heading_style)
    elements.append(heading)

    request_data = [
        [Paragraph("<b>Request Number:</b>", label_style), Paragraph(certificate_request.request_number, normal_style)],
        [Paragraph("<b>Request Type:</b>", label_style), Paragraph(request_type_label, normal_style)],
        [Paragraph("<b>Index Number:</b>", label_style), Paragraph(certificate_request.index_number, normal_style)],
        [Paragraph("<b>Examination Year:</b>", label_style), Paragraph(str(certificate_request.exam_year), normal_style)],
        [Paragraph("<b>Delivery Method:</b>", label_style), Paragraph(
            certificate_request.delivery_method.value.capitalize(),
            normal_style
        )],
    ]

    request_table = Table(request_data, colWidths=[4*cm, 10*cm])
    request_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(request_table)
    elements.append(Spacer(1, 0.6*cm))

    # Items and amounts
    heading = Paragraph("Payment Details", heading_style)
    elements.append(heading)

    # Calculate item breakdown
    base_price = Decimal(str(
        settings.certificate_request_price if certificate_request.request_type == CertificateRequestType.CERTIFICATE
        else settings.attestation_request_price
    ))
    courier_fee = Decimal(str(settings.courier_fee)) if certificate_request.delivery_method == DeliveryMethod.COURIER else Decimal(0)

    items_data = [
        [Paragraph("<b>Description</b>", label_style), Paragraph("<b>Amount</b>", label_style)],
        [Paragraph(request_type_label, normal_style), Paragraph(f"{invoice.currency} {base_price:,.2f}", normal_style)],
    ]

    if courier_fee > 0:
        items_data.append([
            Paragraph("Courier Delivery Fee", normal_style),
            Paragraph(f"{invoice.currency} {courier_fee:,.2f}", normal_style)
        ])

    items_data.append([
        Paragraph("<b>Total Amount</b>", label_style),
        Paragraph(f"<b>{invoice.currency} {invoice.amount:,.2f}</b>", amount_style)
    ])

    items_table = Table(items_data, colWidths=[10*cm, 4*cm])
    items_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, 0), 1, colors.HexColor('#cccccc')),
        ('LINEBELOW', (0, -2), (-1, -2), 1, colors.HexColor('#cccccc')),
        ('LINEBELOW', (0, -1), (-1, -1), 2, colors.HexColor('#000000')),
        ('FONTNAME', (0, -1), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, -1), (1, -1), 'Helvetica-Bold'),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 0.8*cm))

    # Payment instructions
    if invoice.status == "pending":
        instructions = Paragraph(
            "<b>Payment Instructions:</b><br/>"
            "Please make payment using the payment link provided. "
            "Your request will be processed after payment confirmation.",
            normal_style
        )
        elements.append(instructions)
        elements.append(Spacer(1, 0.4*cm))

    # Footer
    footer_text = Paragraph(
        "This is a computer-generated invoice. No signature is required.",
        ParagraphStyle(
            'FooterStyle',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#6b7280'),
            alignment=TA_CENTER,
        )
    )
    elements.append(Spacer(1, 0.6*cm))
    elements.append(footer_text)

    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()
