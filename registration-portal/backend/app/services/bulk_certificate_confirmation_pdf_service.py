"""Service for generating bulk certificate confirmation PDFs."""

import base64
from datetime import datetime
from pathlib import Path

from app.models import Invoice, Payment, CertificateConfirmationRequest
from app.services.pdf_generator import PdfGenerator, render_html
from app.services.certificate_file_storage import CertificateFileStorageService


async def generate_bulk_certificate_confirmation_pdf(
    confirmation_request: CertificateConfirmationRequest,
    invoice: Invoice | None = None,
    payment: Payment | None = None,
    certificate_details: list[dict] | None = None,
) -> bytes:
    """
    Generate certificate confirmation PDF document for bulk request using WeasyPrint.

    Args:
        confirmation_request: CertificateConfirmationRequest model instance (unified model for single/bulk)
        invoice: Optional Invoice model instance
        payment: Optional Payment model instance
        certificate_details: Optional list of certificate detail dictionaries from JSON field

    Returns:
        PDF file as bytes
    """
    # Get certificate details from JSON field if not provided
    if certificate_details is None:
        certificate_details = confirmation_request.certificate_details if isinstance(confirmation_request.certificate_details, list) else []

    # Load certificate images and convert to base64 for PDF embedding
    file_storage = CertificateFileStorageService()

    # Prepare individual request data with base64-encoded images
    individual_request_data = []
    for cert_detail in certificate_details:
        cert_data = cert_detail.copy()

        # Load and encode certificate scan if available
        if cert_detail.get("certificate_file_path"):
            try:
                cert_image_bytes = await file_storage.retrieve(cert_detail["certificate_file_path"])
                cert_image_base64 = base64.b64encode(cert_image_bytes).decode('utf-8')
                # Determine image format from file extension
                file_ext = Path(cert_detail["certificate_file_path"]).suffix.lower()
                if file_ext in ['.jpg', '.jpeg']:
                    cert_data["certificate_image_base64"] = f"data:image/jpeg;base64,{cert_image_base64}"
                elif file_ext == '.png':
                    cert_data["certificate_image_base64"] = f"data:image/png;base64,{cert_image_base64}"
                else:
                    cert_data["certificate_image_base64"] = f"data:image/jpeg;base64,{cert_image_base64}"  # Default to JPEG
            except Exception as e:
                # If image can't be loaded, just skip it
                cert_data["certificate_image_base64"] = None
        else:
            cert_data["certificate_image_base64"] = None

        individual_request_data.append(cert_data)

    # Prepare template context
    context = {
        "bulk_confirmation": confirmation_request,  # Keep key name for template compatibility
        "confirmation_request": confirmation_request,  # Add new key for clarity
        "invoice": invoice,
        "payment": payment,
        "individual_requests": individual_request_data,
        "certificate_details": individual_request_data,  # Add alias for template
        "total_count": len(certificate_details),
        "generated_at": datetime.utcnow().strftime('%B %d, %Y at %H:%M:%S UTC'),
    }

    # Render the HTML template
    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "bulk-certificate-confirmations/bulk-confirmation-details.html", templates_dir)

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


async def save_bulk_confirmation_pdf(
    confirmation_request: CertificateConfirmationRequest,
    pdf_bytes: bytes,
    generated_by_user_id: str | None = None,
) -> str:
    """
    Save generated PDF to storage and update confirmation request record.

    Args:
        confirmation_request: CertificateConfirmationRequest model instance (unified model for single/bulk)
        pdf_bytes: PDF file content as bytes
        generated_by_user_id: Optional user ID who generated the PDF

    Returns:
        File path where PDF was saved
    """
    file_storage = CertificateFileStorageService()

    # Generate filename using request_number (works for both single and bulk)
    filename = f"confirmation_{confirmation_request.request_number}.pdf"

    # Save to storage
    file_path, _ = await file_storage.save_pdf(pdf_bytes, filename, confirmation_request.id)

    # Update confirmation request record
    confirmation_request.pdf_file_path = file_path
    confirmation_request.pdf_generated_at = datetime.utcnow()
    if generated_by_user_id:
        from uuid import UUID
        confirmation_request.pdf_generated_by_user_id = UUID(generated_by_user_id)

    return file_path
