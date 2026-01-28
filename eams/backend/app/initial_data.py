"""Initialize system data (e.g., system admin user)."""
import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import get_password_hash
from app.models import User, UserRole

logger = logging.getLogger(__name__)


async def ensure_system_admin_user(session: AsyncSession) -> None:
    """Ensure SYSTEM_ADMIN user exists."""
    if not settings.system_admin_email or not settings.system_admin_password or not settings.system_admin_full_name:
        logger.warning("System admin credentials not configured. Skipping system admin user creation.")
        return

    # Check if system admin already exists
    stmt = select(User).where(User.email == settings.system_admin_email)
    result = await session.execute(stmt)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        return

    # Create system admin user
    hashed_password = get_password_hash(settings.system_admin_password)
    system_admin = User(
        email=settings.system_admin_email,
        hashed_password=hashed_password,
        full_name=settings.system_admin_full_name,
        role=UserRole.SYSTEM_ADMIN,
        is_active=True,
    )

    session.add(system_admin)
    await session.commit()
