"""Service for generating certificate confirmation/verification response PDFs."""

from datetime import datetime
from pathlib import Path
from typing import Any

from app.models import CertificateConfirmationRequest, Invoice, Payment
from app.services.pdf_generator import PdfGenerator, render_html


def format_date_with_ordinal(date: datetime) -> str:
    """Format date as '7TH JANUARY, 2026' with ordinal suffix."""
    day = date.day
    # Determine ordinal suffix
    if 10 <= day % 100 <= 20:
        suffix = "TH"
    else:
        suffix = {1: "ST", 2: "ND", 3: "RD"}.get(day % 10, "TH")

    month = date.strftime("%B").upper()
    year = date.year

    return f"{day}{suffix} {month}, {year}"


async def generate_confirmation_response_pdf(
    confirmation_request: CertificateConfirmationRequest,
    invoice: Invoice | None = None,
    payment: Payment | None = None,
    response_payload: dict[str, Any] | None = None,
) -> bytes:
    """
    Generate an admin response PDF for a confirmation/verification request.
    """
    response_payload = response_payload or {}

    certificate_details = (
        confirmation_request.certificate_details
        if isinstance(confirmation_request.certificate_details, list)
        else []
    )

    # Optional per-candidate outcomes:
    # outcomes: { "<candidate_index_number>": { "status": "...", "remarks": "..." }, ... }
    outcomes: dict[str, Any] = response_payload.get("outcomes") or {}
    rows: list[dict[str, Any]] = []
    for item in certificate_details:
        idx = (item.get("candidate_index_number") or "").strip()
        outcome = outcomes.get(idx) if idx else None
        rows.append(
            {
                **item,
                "outcome_status": (outcome or {}).get("status"),
                "outcome_remarks": (outcome or {}).get("remarks"),
            }
        )

    # Get reference number from response_payload or use request_number
    reference_number = response_payload.get("reference_number") or confirmation_request.request_number
    letter_date = datetime.utcnow()
    if response_payload.get("letter") and response_payload["letter"].get("date"):
        # If date is provided in payload, use it (assuming it's a string or datetime)
        date_value = response_payload["letter"]["date"]
        if isinstance(date_value, str):
            try:
                letter_date = datetime.fromisoformat(date_value.replace("Z", "+00:00"))
            except:
                pass
        elif isinstance(date_value, datetime):
            letter_date = date_value

    context = {
        "confirmation_request": confirmation_request,
        "invoice": invoice,
        "payment": payment,
        "response_payload": response_payload,
        "rows": rows,
        "generated_at": datetime.utcnow().strftime("%B %d, %Y at %H:%M:%S UTC"),
        "reference_number": reference_number,
        "reference_date": format_date_with_ordinal(letter_date),
    }

    templates_dir = Path(__file__).parent.parent / "templates"

    # Auto-detect single vs bulk request based on certificate_details array length
    is_bulk = len(certificate_details) > 1
    template_name = "certificate-confirmations/response_bulk.html" if is_bulk else "certificate-confirmations/response_single.html"

    main_html = render_html(context, template_name, templates_dir)

    # Render header and footer templates
    header_html = render_html(context, "certificate-confirmations/response_header.html", templates_dir)
    footer_html = render_html(context, "certificate-confirmations/response_footer.html", templates_dir)

    app_dir = Path(__file__).parent.parent.resolve()
    base_url = str(app_dir)

    pdf_gen = PdfGenerator(
        main_html=main_html,
        header_html=header_html,
        footer_html=footer_html,
        base_url=base_url,
        side_margin=1.5,
        extra_vertical_margin=30,  # Increased to prevent overlap
        header_first_page_only=True,  # Header only on first page
    )

    return pdf_gen.render_pdf()
