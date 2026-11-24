"""CTVET-branded HTML email templates (Jinja2 under app/templates/emails/)."""
from app.services.email_templates.bank_deposit import render_bank_deposit_status_html
from app.services.email_templates.brand import BRAND, FONT, ORG_FOOTER, logo_url
from app.services.email_templates.password_setup import render_password_setup_html
from app.services.email_templates.payment_receipt import render_payment_receipt_html

__all__ = [
    "BRAND",
    "FONT",
    "ORG_FOOTER",
    "logo_url",
    "render_password_setup_html",
    "render_payment_receipt_html",
    "render_bank_deposit_status_html",
]
