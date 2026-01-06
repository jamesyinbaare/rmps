"""Service for generating certificate request detail PDFs."""

import base64
from datetime import datetime
from pathlib import Path

from app.models import CertificateRequest, Invoice, Payment
from app.services.pdf_generator import PdfGenerator, render_html


async def generate_certificate_request_pdf(
    certificate_request: CertificateRequest,
    invoice: Invoice | None = None,
    payment: Payment | None = None,
    photo_data: bytes | None = None,
    id_scan_data: bytes | None = None,
) -> bytes:
    """
    Generate PDF document for certificate request details using WeasyPrint.

    Args:
        certificate_request: CertificateRequest model instance
        invoice: Optional Invoice model instance
        payment: Optional Payment model instance
        photo_data: Optional photo file content as bytes
        id_scan_data: Optional ID scan file content as bytes

    Returns:
        PDF file as bytes
    """
    # Get examination center name safely
    examination_center_name = "N/A"
    if hasattr(certificate_request, 'examination_center') and certificate_request.examination_center:
        examination_center_name = certificate_request.examination_center.name

    # Convert images to base64 for embedding in HTML
    photo_base64 = None
    if photo_data:
        try:
            photo_base64 = base64.b64encode(photo_data).decode('utf-8')
        except Exception:
            pass

    id_scan_base64 = None
    if id_scan_data:
        try:
            id_scan_base64 = base64.b64encode(id_scan_data).decode('utf-8')
        except Exception:
            pass

    # Prepare template context
    context = {
        "certificate_request": certificate_request,
        "invoice": invoice,
        "payment": payment,
        "examination_center_name": examination_center_name,
        "photo_base64": photo_base64,
        "id_scan_base64": id_scan_base64,
        "generated_at": datetime.utcnow().strftime('%B %d, %Y at %H:%M:%S UTC'),
    }

    # Render the HTML template
    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "certificate-requests/request-details.html", templates_dir)

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
