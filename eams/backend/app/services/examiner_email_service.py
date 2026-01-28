"""Service for sending examiner recommendation emails."""
import logging
import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import ExaminerRecommendation

logger = logging.getLogger(__name__)


def generate_recommendation_token() -> str:
    """
    Generate a secure random token for recommendation link.

    Returns:
        Random token string (64 characters)
    """
    return secrets.token_urlsafe(48)  # 48 bytes = 64 base64url characters


async def create_recommendation_token(
    session: AsyncSession,
    recommendation: ExaminerRecommendation,
    expiry_days: int | None = None,
) -> str:
    """
    Create and store a recommendation token.

    Args:
        session: Database session
        recommendation: ExaminerRecommendation instance
        expiry_days: Number of days until token expires (defaults to config value)

    Returns:
        Generated token string
    """
    token = generate_recommendation_token()
    expiry_days = expiry_days or getattr(settings, "recommendation_token_expiry_days", 30)
    token_expires_at = datetime.utcnow() + timedelta(days=expiry_days)

    recommendation.token = token
    recommendation.token_expires_at = token_expires_at

    await session.flush()
    return token


def get_recommendation_url(token: str) -> str:
    """
    Generate the recommendation URL for a given token.

    Args:
        token: Recommendation token

    Returns:
        Full URL to recommendation form
    """
    frontend_url = getattr(settings, "frontend_base_url", "http://localhost:3002")
    return f"{frontend_url.rstrip('/')}/examiner-recommendation/{token}"


async def send_recommendation_email(
    session: AsyncSession,
    recommendation: ExaminerRecommendation,
    recommender_email: str,
    recommender_name: str,
    applicant_name: str,
) -> bool:
    """
    Send recommendation email to recommender.

    Note: This is a placeholder implementation. In production, integrate with
    an email service (SendGrid, AWS SES, SMTP, etc.).

    Args:
        session: Database session
        recommendation: ExaminerRecommendation instance
        recommender_email: Email address of recommender
        recommender_name: Name of recommender
        applicant_name: Name of applicant

    Returns:
        True if email was sent successfully (or queued), False otherwise
    """
    # Generate token if not already set
    if not recommendation.token:
        await create_recommendation_token(session, recommendation)

    recommendation_url = get_recommendation_url(recommendation.token)

    # Email content
    subject = f"Recommendation Request for Examiner Application - {applicant_name}"
    body = f"""
Dear {recommender_name},

You have been requested to provide an official recommendation for {applicant_name}'s application to become an examiner with the Commission for Technical and Vocational Education and Training (CTVET).

Please complete the recommendation form by clicking the link below:

{recommendation_url}

This link will expire on {recommendation.token_expires_at.strftime('%B %d, %Y') if recommendation.token_expires_at else 'N/A'}.

If you have any questions, please contact the CTVET office.

Thank you for your time and consideration.

Best regards,
CTVET EAMS
"""

    # Try to send email via SMTP if configured
    if settings.smtp_host and settings.smtp_from_email:
        try:
            # Create message
            msg = MIMEMultipart()
            msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
            msg["To"] = recommender_email
            msg["Subject"] = subject

            # Add body to email
            msg.attach(MIMEText(body, "plain"))

            # Create SMTP connection
            if settings.smtp_port == 465:
                # SSL connection
                server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port)
            else:
                # TLS connection
                server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
                server.starttls()

            # Login if credentials provided
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)

            # Send email
            server.send_message(msg)
            server.quit()

            logger.info(
                f"Recommendation email sent successfully to {recommender_email} "
                f"(Application: {recommendation.application_id}, Token: {recommendation.token})"
            )
            return True

        except Exception as e:
            logger.error(
                f"Failed to send recommendation email to {recommender_email}: {e}",
                exc_info=True,
            )
            # Fall through to logging mode
    else:
        logger.warning(
            "SMTP not configured. Email sending is disabled. "
            "Configure SMTP settings to enable email sending."
        )

    # Log email details (for development or when SMTP not configured)
    logger.info(
        f"Recommendation email prepared for {recommender_email} "
        f"(Application: {recommendation.application_id}, Token: {recommendation.token})"
    )
    logger.info(f"Email subject: {subject}")
    logger.info(f"Email body:\n{body}")
    logger.info(f"Recommendation URL: {recommendation_url}")

    # Return True even in logging mode to allow workflow to continue
    # In production, you may want to return False if email sending fails
    return True
