"""Payment receipt email HTML."""
from __future__ import annotations

from app.services.email_templates.brand import BRAND, FONT, ORG_FOOTER, logo_url
from app.services.pdf_generator import render_html


def render_payment_receipt_html(
    *,
    recipient_name: str,
    amount: str,
    currency: str,
    reference: str,
    paid_at: str,
    detail_line: str,
    dashboard_url: str,
) -> str:
    context = {
        "brand": BRAND,
        "font": FONT,
        "org_footer": ORG_FOOTER,
        "logo_url": logo_url(),
        "title": "Payment received",
        "preheader": f"We received your payment of {currency} {amount}.",
        "recipient_name": recipient_name,
        "amount": amount,
        "currency": currency,
        "detail_line": detail_line,
        "detail_rows": [
            ("Amount", f"{currency} {amount}"),
            ("Reference", reference),
            ("Paid at", paid_at or "—"),
        ],
        "cta_label": "Open dashboard",
        "cta_url": dashboard_url,
        "footer_note": "Keep this email for your records.",
    }
    return render_html(context, "emails/payment_receipt.html")
