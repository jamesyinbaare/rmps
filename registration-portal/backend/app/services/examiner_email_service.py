"""Service for sending examiner recommendation emails."""
import logging
import secrets
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
    frontend_url = settings.frontend_base_url or "http://localhost:3001"
    return f"{frontend_url}/examiner-recommendation/{token}"


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
CTVET Registration Portal
"""

    # TODO: Integrate with actual email service
    # For now, log the email details
    logger.info(
        f"Recommendation email prepared for {recommender_email} "
        f"(Application: {recommendation.application_id}, Token: {recommendation.token})"
    )
    logger.info(f"Email subject: {subject}")
    logger.info(f"Email body:\n{body}")

    # In production, replace this with actual email sending:
    # try:
    #     # Example with SendGrid:
    #     # sg = sendgrid.SendGridAPIClient(api_key=settings.sendgrid_api_key)
    #     # message = Mail(
    #     #     from_email=settings.from_email,
    #     #     to_emails=recommender_email,
    #     #     subject=subject,
    #     #     plain_text_content=body
    #     # )
    #     # response = sg.send(message)
    #     # return response.status_code == 202
    # except Exception as e:
    #     logger.error(f"Failed to send recommendation email: {e}")
    #     return False

    # For now, return True to indicate the email was "prepared"
    # The actual sending should be implemented based on the email service used
    return True
