"""Service for generating certificate request detail PDFs."""

import io
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from app.models import CertificateRequest, Invoice, Payment
from app.services.certificate_file_storage import CertificateFileStorageService


async def generate_certificate_request_pdf(
    certificate_request: CertificateRequest,
    invoice: Invoice | None = None,
    payment: Payment | None = None,
    photo_data: bytes | None = None,
    id_scan_data: bytes | None = None,
) -> bytes:
    """
    Generate PDF document for certificate request details.

    Args:
        certificate_request: CertificateRequest model instance
        invoice: Optional Invoice model instance
        payment: Optional Payment model instance
        photo_data: Optional photo file content as bytes
        id_scan_data: Optional ID scan file content as bytes

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
        'RequestTitle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor('#1e3a8a'),
        spaceAfter=12,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold',
    )

    heading_style = ParagraphStyle(
        'RequestHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=8,
        alignment=TA_LEFT,
        fontName='Helvetica-Bold',
    )

    normal_style = ParagraphStyle(
        'RequestNormal',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#000000'),
        alignment=TA_LEFT,
        leading=12,
    )

    label_style = ParagraphStyle(
        'RequestLabel',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#4b5563'),
        alignment=TA_LEFT,
        leading=12,
        fontName='Helvetica-Bold',
    )

    # Title
    title = Paragraph("Certificate Request Details", title_style)
    elements.append(title)
    elements.append(Spacer(1, 0.5*cm))

    # Request Information
    request_data = [
        ['Request Number:', certificate_request.request_number],
        ['Request Type:', certificate_request.request_type.value.title()],
        ['Status:', certificate_request.status.value.replace('_', ' ').title()],
        ['Index Number:', certificate_request.index_number],
        ['Examination Year:', str(certificate_request.exam_year)],
        ['National ID Number:', certificate_request.national_id_number],
        ['Delivery Method:', certificate_request.delivery_method.value.title()],
        ['Contact Phone:', certificate_request.contact_phone],
    ]

    if certificate_request.contact_email:
        request_data.append(['Contact Email:', certificate_request.contact_email])

    # Get examination center name safely
    examination_center_name = "N/A"
    if hasattr(certificate_request, 'examination_center') and certificate_request.examination_center:
        examination_center_name = certificate_request.examination_center.name
    request_data.append(['Examination Center:', examination_center_name])

    if certificate_request.tracking_number:
        request_data.append(['Tracking Number:', certificate_request.tracking_number])

    request_data.append(['Created At:', certificate_request.created_at.strftime('%Y-%m-%d %H:%M:%S')])
    request_data.append(['Updated At:', certificate_request.updated_at.strftime('%Y-%m-%d %H:%M:%S')])

    request_table = Table(request_data, colWidths=[5*cm, 10*cm])
    request_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#374151')),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (0, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (1, 0), (1, -1), colors.white),
        ('TEXTCOLOR', (1, 0), (1, -1), colors.black),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (1, 0), (1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb')),
    ]))
    elements.append(request_table)
    elements.append(Spacer(1, 0.5*cm))

    # Courier Address (if applicable)
    if certificate_request.delivery_method.value == 'courier':
        if (certificate_request.courier_address_line1 or
            certificate_request.courier_city or
            certificate_request.courier_region):
            address_heading = Paragraph("Courier Address", heading_style)
            elements.append(address_heading)

            address_data = []
            if certificate_request.courier_address_line1:
                address_data.append(['Address Line 1:', certificate_request.courier_address_line1])
            if certificate_request.courier_address_line2:
                address_data.append(['Address Line 2:', certificate_request.courier_address_line2])
            if certificate_request.courier_city:
                address_data.append(['City:', certificate_request.courier_city])
            if certificate_request.courier_region:
                address_data.append(['Region:', certificate_request.courier_region])
            if certificate_request.courier_postal_code:
                address_data.append(['Postal Code:', certificate_request.courier_postal_code])

            address_table = Table(address_data, colWidths=[5*cm, 10*cm])
            address_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
                ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#374151')),
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (0, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BACKGROUND', (1, 0), (1, -1), colors.white),
                ('TEXTCOLOR', (1, 0), (1, -1), colors.black),
                ('ALIGN', (1, 0), (1, -1), 'LEFT'),
                ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
                ('FONTSIZE', (1, 0), (1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb')),
            ]))
            elements.append(address_table)
            elements.append(Spacer(1, 0.5*cm))

    # Invoice Information
    if invoice:
        invoice_heading = Paragraph("Invoice Information", heading_style)
        elements.append(invoice_heading)

        invoice_data = [
            ['Invoice Number:', invoice.invoice_number],
            ['Amount:', f"{invoice.currency} {invoice.amount:.2f}"],
            ['Status:', invoice.status.title()],
            ['Due Date:', invoice.due_date.strftime('%Y-%m-%d') if invoice.due_date else 'N/A'],
        ]
        if invoice.paid_at:
            invoice_data.append(['Paid At:', invoice.paid_at.strftime('%Y-%m-%d %H:%M:%S')])

        invoice_table = Table(invoice_data, colWidths=[5*cm, 10*cm])
        invoice_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#374151')),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (0, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BACKGROUND', (1, 0), (1, -1), colors.white),
            ('TEXTCOLOR', (1, 0), (1, -1), colors.black),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (1, 0), (1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb')),
        ]))
        elements.append(invoice_table)
        elements.append(Spacer(1, 0.5*cm))

    # Payment Information
    if payment:
        payment_heading = Paragraph("Payment Information", heading_style)
        elements.append(payment_heading)

        payment_data = [
            ['Payment Reference:', payment.paystack_reference or 'N/A'],
            ['Amount:', f"{payment.currency} {payment.amount:.2f}"],
            ['Status:', payment.status.value.title()],
        ]
        if payment.paid_at:
            payment_data.append(['Paid At:', payment.paid_at.strftime('%Y-%m-%d %H:%M:%S')])

        payment_table = Table(payment_data, colWidths=[5*cm, 10*cm])
        payment_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#374151')),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (0, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BACKGROUND', (1, 0), (1, -1), colors.white),
            ('TEXTCOLOR', (1, 0), (1, -1), colors.black),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (1, 0), (1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb')),
        ]))
        elements.append(payment_table)
        elements.append(Spacer(1, 0.5*cm))

    # Notes
    if certificate_request.notes:
        notes_heading = Paragraph("Notes", heading_style)
        elements.append(notes_heading)
        notes_text = Paragraph(certificate_request.notes, normal_style)
        elements.append(notes_text)
        elements.append(Spacer(1, 0.5*cm))

    # Footer
    footer_text = Paragraph(
        f"Generated on {datetime.utcnow().strftime('%B %d, %Y at %H:%M:%S UTC')}",
        ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#6b7280'),
            alignment=TA_CENTER,
        )
    )
    elements.append(Spacer(1, 0.5*cm))
    elements.append(footer_text)

    # Add page break before images
    elements.append(PageBreak())

    # Add Photograph on separate page
    if photo_data:
        photo_heading = Paragraph("Candidate Photograph", heading_style)
        elements.append(photo_heading)
        elements.append(Spacer(1, 0.3*cm))

        try:
            # Create temporary image file from bytes
            photo_buffer = io.BytesIO(photo_data)
            # Calculate image dimensions to fit on page (max width 12cm, maintain aspect ratio)
            photo_img = Image(photo_buffer, width=12*cm, kind='proportional')
            # Center the image
            elements.append(Spacer(1, 1*cm))
            elements.append(photo_img)
        except Exception as e:
            # If image can't be loaded, add error message
            error_text = Paragraph(f"<i>Error loading photograph: {str(e)}</i>", normal_style)
            elements.append(error_text)

        elements.append(PageBreak())

    # Add ID Scan on separate page
    if id_scan_data:
        id_heading = Paragraph("National ID Scan", heading_style)
        elements.append(id_heading)
        elements.append(Spacer(1, 0.3*cm))

        try:
            # Create temporary image file from bytes
            id_buffer = io.BytesIO(id_scan_data)
            # Calculate image dimensions to fit on page (max width 15cm, maintain aspect ratio)
            id_img = Image(id_buffer, width=15*cm, kind='proportional')
            # Center the image
            elements.append(Spacer(1, 1*cm))
            elements.append(id_img)
        except Exception as e:
            # If image can't be loaded, add error message
            error_text = Paragraph(f"<i>Error loading ID scan: {str(e)}</i>", normal_style)
            elements.append(error_text)

    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()
