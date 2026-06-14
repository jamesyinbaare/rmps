"""Official CTVET letter PDF layout (certificate confirmation response templates)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.services.pdf_generator import PdfGenerator, render_html


def format_date_with_ordinal(date: datetime) -> str:
    """Format date as '7TH JANUARY, 2026' with ordinal suffix."""
    day = date.day
    if 10 <= day % 100 <= 20:
        suffix = "TH"
    else:
        suffix = {1: "ST", 2: "ND", 3: "RD"}.get(day % 10, "TH")

    month = date.strftime("%B").upper()
    year = date.year
    return f"{day}{suffix} {month}, {year}"


def render_certificate_style_letter_pdf(
    *,
    letter_body_html: str,
    reference_number: str,
    letter_date: datetime | None = None,
) -> bytes:
    """Render a single-page official letter using certificate-confirmation templates."""
    resolved_date = letter_date or datetime.now(timezone.utc)
    response_payload: dict[str, Any] = {
        "letter": {"body": letter_body_html},
    }
    context = {
        "response_payload": response_payload,
        "reference_number": reference_number,
        "reference_date": format_date_with_ordinal(resolved_date),
        "generated_at": datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M:%S UTC"),
    }

    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "certificate-confirmations/response_single.html", templates_dir)
    header_html = render_html(context, "certificate-confirmations/response_header.html", templates_dir)
    footer_html = render_html(context, "certificate-confirmations/response_footer.html", templates_dir)
    footer_subsequent_html = render_html(
        context,
        "certificate-confirmations/response_footer_subsequent.html",
        templates_dir,
    )

    app_dir = Path(__file__).parent.parent.resolve()
    pdf_gen = PdfGenerator(
        main_html=main_html,
        header_html=header_html,
        footer_html=footer_html,
        footer_subsequent_html=footer_subsequent_html,
        base_url=str(app_dir),
        side_margin=1.5,
        extra_vertical_margin=30,
        header_first_page_only=True,
    )
    return pdf_gen.render_pdf()
