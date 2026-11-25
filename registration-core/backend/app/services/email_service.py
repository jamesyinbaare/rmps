"""SMTP email sending with Mailpit-friendly defaults and fail-soft behavior."""
from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings
from app.services.email_templates import (
    render_bank_deposit_status_html,
    render_completion_confirmation_html,
    render_password_setup_html,
    render_payment_receipt_html,
)

logger = logging.getLogger(__name__)


def _is_dev_environment() -> bool:
    return (settings.environment or "").lower() in {"dev", "development", "local"}


def send_email(
    to: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> bool:
    """Send an email via SMTP. Never raises; returns False on failure."""
    if not to or not to.strip():
        logger.warning("send_email skipped: empty recipient")
        return False

    recipient = to.strip()
    from_email = settings.smtp_from_email or "noreply@localhost"
    from_header = f"{settings.smtp_from_name} <{from_email}>"

    if not settings.smtp_host:
        logger.warning("SMTP not configured; email sending disabled")
        if settings.email_console_fallback and _is_dev_environment():
            logger.info(
                "Email console fallback: to=%s subject=%s",
                recipient,
                subject,
            )
            print(
                f"\n--- Email (console fallback) ---\n"
                f"To: {recipient}\n"
                f"Subject: {subject}\n"
                f"{text_body}\n"
                f"--- end ---\n"
            )
            return True
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = from_header
        msg["To"] = recipient
        msg["Subject"] = subject
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        if html_body:
            msg.attach(MIMEText(html_body, "html", "utf-8"))

        if settings.smtp_port == 465:
            server: smtplib.SMTP | smtplib.SMTP_SSL = smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port, timeout=30
            )
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30)
            if settings.smtp_user and settings.smtp_password:
                server.starttls()

        try:
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        finally:
            server.quit()

        logger.info("Email sent to %s subject=%s", recipient, subject)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", recipient)
        if settings.email_console_fallback and _is_dev_environment():
            print(
                f"\n--- Email (console fallback after SMTP failure) ---\n"
                f"To: {recipient}\n"
                f"Subject: {subject}\n"
                f"{text_body}\n"
                f"--- end ---\n"
            )
            return True
        return False


def send_password_setup_email(
    *,
    to: str,
    full_name: str,
    setup_url: str,
    expiry_hours: int,
    purpose: str = "invite",
) -> bool:
    """Send invite or reset set-password email."""
    if purpose == "reset":
        subject = "Reset your CTVET Registration password"
        intro = (
            f"Hi {full_name}, an administrator requested a password reset for your "
            f"CTVET Registration account ({to}). Use the link below to choose a new password."
        )
        cta = "Reset password"
    else:
        subject = "Set your CTVET Registration password"
        intro = (
            f"Hi {full_name}, an account was created for you on CTVET Registration "
            f"({to}). Use the link below to set your password and sign in."
        )
        cta = "Set password"

    footer = (
        f"This link expires in {expiry_hours} hours and can be used once. "
        "If you were not expecting this email, you can ignore it."
    )
    text_body = f"{intro}\n\n{cta}: {setup_url}\n\n{footer}\n"
    html_body = render_password_setup_html(
        full_name=full_name,
        account_email=to,
        setup_url=setup_url,
        expiry_hours=expiry_hours,
        purpose=purpose,
    )
    return send_email(to, subject, text_body, html_body)


def send_payment_receipt_email(
    *,
    to: str,
    recipient_name: str,
    amount: str,
    currency: str,
    reference: str,
    paid_at: str,
    detail_line: str,
    dashboard_url: str,
) -> bool:
    subject = f"Payment received — {currency} {amount}"
    intro = (
        f"Hi {recipient_name}, we received your payment of {currency} {amount}. "
        f"{detail_line}"
    )
    footer = f"Reference: {reference}. Paid at: {paid_at}."
    text_body = f"{intro}\n\nView account: {dashboard_url}\n\n{footer}\n"
    html_body = render_payment_receipt_html(
        recipient_name=recipient_name,
        amount=amount,
        currency=currency,
        reference=reference,
        paid_at=paid_at,
        detail_line=detail_line,
        dashboard_url=dashboard_url,
    )
    return send_email(to, subject, text_body, html_body)


def send_bank_deposit_status_email(
    *,
    to: str,
    recipient_name: str,
    invoice_number: str,
    approved: bool,
    rejection_reason: str | None = None,
    dashboard_url: str,
) -> bool:
    if approved:
        subject = f"Bank deposit approved — {invoice_number}"
        intro = (
            f"Hi {recipient_name}, your bank deposit for invoice {invoice_number} "
            "has been approved and the invoice is marked paid."
        )
    else:
        subject = f"Bank deposit rejected — {invoice_number}"
        reason = rejection_reason or "No reason provided."
        intro = (
            f"Hi {recipient_name}, your bank deposit for invoice {invoice_number} "
            f"was rejected. Reason: {reason}"
        )

    footer = "If you have questions, contact CTVET registration support."
    text_body = f"{intro}\n\nOpen dashboard: {dashboard_url}\n\n{footer}\n"
    html_body = render_bank_deposit_status_html(
        recipient_name=recipient_name,
        invoice_number=invoice_number,
        approved=approved,
        rejection_reason=rejection_reason,
        dashboard_url=dashboard_url,
    )
    return send_email(to, subject, text_body, html_body)


def send_completion_confirmation_email(
    *,
    to: str,
    principal_name: str,
    school_name: str,
    school_code: str,
    exam_label: str,
    total_candidates: int,
    counts_by_type: dict,
    counts_by_programme: list,
    confirmed_at: str,
) -> bool:
    dashboard_url = (settings.frontend_base_url or "").rstrip("/") or "http://localhost:3002"
    dashboard_url = f"{dashboard_url}/dashboard/my-school/register"
    subject = f"Registration confirmed — {exam_label} — {school_code}"
    type_summary = ", ".join(
        f"{k}: {int(counts_by_type.get(k, 0))}"
        for k in ("fee_paying", "free_tvet", "referral")
    )
    text_body = (
        f"Dear {principal_name},\n\n"
        f"Registration for {school_name} ({school_code}) has been confirmed for {exam_label}.\n"
        f"Confirmed at: {confirmed_at}\n"
        f"Total candidates: {total_candidates}\n"
        f"By type: {type_summary}\n\n"
        f"Registration is locked until confirmation is withdrawn or the period ends.\n"
        f"Open dashboard: {dashboard_url}\n"
    )
    html_body = render_completion_confirmation_html(
        recipient_name=principal_name,
        school_name=school_name,
        school_code=school_code,
        exam_label=exam_label,
        total_candidates=total_candidates,
        counts_by_type=counts_by_type,
        counts_by_programme=counts_by_programme,
        confirmed_at=confirmed_at,
        dashboard_url=dashboard_url,
    )
    return send_email(to, subject, text_body, html_body)
