"""Invite / password-reset email HTML."""
from __future__ import annotations

from app.services.email_templates.brand import BRAND, FONT, ORG_FOOTER, logo_url
from app.services.pdf_generator import render_html


def render_password_setup_html(
    *,
    full_name: str,
    account_email: str,
    setup_url: str,
    expiry_hours: int,
    purpose: str = "invite",
) -> str:
    if purpose == "reset":
        title = "Reset your password"
        preheader = "Choose a new password for your CTVET Registration account."
        cta_label = "Reset password"
    else:
        title = "Set your password"
        preheader = "Activate your CTVET Registration account by setting a password."
        cta_label = "Set password"

    footer_note = (
        f"This link expires in {expiry_hours} hours and can be used once. "
        "If you were not expecting this email, you can ignore it."
    )
    context = {
        "brand": BRAND,
        "font": FONT,
        "org_footer": ORG_FOOTER,
        "logo_url": logo_url(),
        "title": title,
        "preheader": preheader,
        "full_name": full_name,
        "account_email": account_email,
        "purpose": purpose,
        "cta_label": cta_label,
        "cta_url": setup_url,
        "footer_note": footer_note,
    }
    return render_html(context, "emails/password_setup.html")
