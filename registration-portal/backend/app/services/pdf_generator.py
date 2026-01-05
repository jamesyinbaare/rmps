"""Service for generating PDF documents."""
import io
from datetime import datetime
from pathlib import Path
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT

from app.schemas.result import PublicResultResponse


def generate_results_pdf(results: PublicResultResponse, photo_data: Optional[bytes] = None) -> bytes:
    """
    Generate a PDF document for examination results.

    Args:
        results: PublicResultResponse containing the results data
        photo_data: Optional bytes of candidate photo image

    Returns:
        bytes: PDF file as bytes
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

    # Container for PDF elements
    elements = []
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor('#1e3a8a'),
        spaceAfter=8,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold',
    )

    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=6,
        alignment=TA_LEFT,
        fontName='Helvetica-Bold',
    )

    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#000000'),
        alignment=TA_LEFT,
        leading=14,
    )

    small_style = ParagraphStyle(
        'CustomSmall',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#4b5563'),
        alignment=TA_LEFT,
        leading=11,
    )

    disclaimer_style = ParagraphStyle(
        'DisclaimerStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#dc2626'),
        alignment=TA_CENTER,
        leading=12,
        fontName='Helvetica-Bold',
    )

    # Logo at the top
    try:
        logo_path = Path(__file__).parent.parent / "img" / "logo.jpg"
        if logo_path.exists():
            logo_img = Image(str(logo_path), width=6*cm, height=None, kind='proportional')
            elements.append(logo_img)
            elements.append(Spacer(1, 0.4*cm))
    except Exception:
        # If logo cannot be loaded, continue without it
        pass

    # Header
    header_text = Paragraph("EXAMINATION RESULTS", title_style)
    elements.append(header_text)

    exam_info_text = f"{results.exam_type} - {results.exam_series} {results.year}"
    exam_info_para = Paragraph(exam_info_text, small_style)
    elements.append(exam_info_para)
    elements.append(Spacer(1, 0.5*cm))

    # Candidate Information Section
    # Build candidate details text
    candidate_info_parts = [f"<b>{results.candidate_name}</b>"]
    candidate_info_parts.append("")  # Empty line

    if results.index_number:
        candidate_info_parts.append(f"<b>Index Number:</b> {results.index_number}")
    candidate_info_parts.append(f"<b>Registration Number:</b> {results.registration_number}")

    candidate_info_parts.append("")  # Empty line

    if results.school_name:
        candidate_info_parts.append(f"<b>School:</b> {results.school_name}")
    if results.programme_name:
        candidate_info_parts.append(f"<b>Programme:</b> {results.programme_name}")

    candidate_info_text = "<br/>".join(candidate_info_parts)
    candidate_details_para = Paragraph(candidate_info_text, normal_style)

    # Photo or placeholder
    if photo_data:
        try:
            photo_io = io.BytesIO(photo_data)
            photo_img = Image(photo_io, width=3.5*cm, height=4.2*cm, kind='proportional')
            photo_cell = photo_img
        except Exception:
            photo_cell = Paragraph("<i>Photo not available</i>", small_style)
    else:
        photo_cell = Paragraph("<i>Photo not available</i>", small_style)

    # Combine into table
    candidate_table_data = [
        [candidate_details_para, photo_cell]
    ]

    candidate_table = Table(candidate_table_data, colWidths=[12.5*cm, 4.5*cm])
    candidate_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))

    elements.append(candidate_table)
    elements.append(Spacer(1, 0.6*cm))

    # Results Table
    results_heading = Paragraph("Examination Results", heading_style)
    elements.append(results_heading)
    elements.append(Spacer(1, 0.3*cm))

    if not results.results:
        elements.append(Paragraph("No results available for this examination.", normal_style))
    else:
        # Sort results: CORE subjects first, then ELECTIVE, then alphabetically
        # Note: We don't have subject type in PublicSubjectResult, so we'll just sort by name
        sorted_results = sorted(results.results, key=lambda x: (x.subject_name or x.subject_code))

        # Table data
        table_data = [['Subject', 'Grade']]
        for result in sorted_results:
            subject_name = result.subject_name or result.subject_code
            # Grade is an enum, so get its value and convert to uppercase
            grade = result.grade.value.upper() if result.grade else "PENDING"
            table_data.append([subject_name, grade])

        results_table = Table(table_data, colWidths=[13.5*cm, 3.5*cm])
        results_table.setStyle(TableStyle([
            # Header row
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e5e7eb')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#000000')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('TOPPADDING', (0, 0), (-1, 0), 10),
            # Data rows
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 1), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 10),
        ]))

        elements.append(results_table)

    elements.append(Spacer(1, 0.6*cm))

    # Disclaimer
    disclaimer_text = Paragraph(
        "<b>NOTE: This is a provisional results document. The final results are those which will be printed on your certificate.</b>",
        disclaimer_style
    )
    elements.append(disclaimer_text)
    elements.append(Spacer(1, 0.4*cm))

    # Footer
    footer_text = Paragraph(
        "This is a computer-generated document. No signature is required.",
        small_style
    )
    elements.append(footer_text)

    generated_date = datetime.now().strftime("%B %d, %Y")
    date_text = Paragraph(f"Generated on {generated_date}", small_style)
    elements.append(date_text)

    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()
