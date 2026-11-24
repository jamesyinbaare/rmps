"""Bank deposit approve/reject email HTML."""
from __future__ import annotations

from app.services.email_templates.brand import BRAND, FONT, ORG_FOOTER, logo_url
from app.services.pdf_generator import render_html


def render_bank_deposit_status_html(
    *,
    recipient_name: str,
    invoice_number: str,
    approved: bool,
    rejection_reason: str | None = None,
    dashboard_url: str,
) -> str:
    if approved:
        title = "Deposit approved"
        preheader = f"Bank deposit for invoice {invoice_number} was approved."
        panel_tint = BRAND["mint"]
        detail_rows = [
            ("Invoice", invoice_number),
            ("Status", "Approved — invoice marked paid"),
        ]
    else:
        title = "Deposit rejected"
        preheader = f"Bank deposit for invoice {invoice_number} was rejected."
        panel_tint = BRAND["danger_bg"]
        reason = rejection_reason or "No reason provided."
        detail_rows = [
            ("Invoice", invoice_number),
            ("Status", "Rejected"),
            ("Reason", reason),
        ]

    context = {
        "brand": BRAND,
        "font": FONT,
        "org_footer": ORG_FOOTER,
        "logo_url": logo_url(),
        "title": title,
        "preheader": preheader,
        "recipient_name": recipient_name,
        "invoice_number": invoice_number,
        "approved": approved,
        "detail_rows": detail_rows,
        "panel_tint": panel_tint,
        "cta_label": "Open dashboard",
        "cta_url": dashboard_url,
        "footer_note": "If you have questions, contact CTVET registration support.",
    }
    return render_html(context, "emails/bank_deposit.html")
