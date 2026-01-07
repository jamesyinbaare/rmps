"""Service for generating certificate confirmation/verification response PDFs."""

from datetime import datetime
from pathlib import Path
from typing import Any

from app.models import CertificateConfirmationRequest, Invoice, Payment
from app.services.pdf_generator import PdfGenerator, render_html


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

    context = {
        "confirmation_request": confirmation_request,
        "invoice": invoice,
        "payment": payment,
        "response_payload": response_payload,
        "rows": rows,
        "generated_at": datetime.utcnow().strftime("%B %d, %Y at %H:%M:%S UTC"),
    }

    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "certificate-confirmations/response.html", templates_dir)

    app_dir = Path(__file__).parent.parent.resolve()
    base_url = str(app_dir)

    pdf_gen = PdfGenerator(
        main_html=main_html,
        header_html=None,
        footer_html=None,
        base_url=base_url,
        side_margin=1.5,
        extra_vertical_margin=20,
    )

    return pdf_gen.render_pdf()
