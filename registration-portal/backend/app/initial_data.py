from sqlalchemy import select

from app.config import settings
from app.core.security import get_password_hash
from app.models import PortalUser, PortalUserType


async def ensure_system_admin_user(session) -> None:
    """Ensure a system admin user exists based on configuration."""
    if not settings.system_admin_email or not settings.system_admin_password or not settings.system_admin_full_name:
        return  # Skip if not configured

    # Check if system admin already exists
    stmt = select(PortalUser).where(PortalUser.email == settings.system_admin_email)
    result = await session.execute(stmt)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        return  # System admin already exists

    # Create system admin user
    hashed_password = get_password_hash(settings.system_admin_password)
    system_admin = PortalUser(
        email=settings.system_admin_email,
        hashed_password=hashed_password,
        full_name=settings.system_admin_full_name,
        user_type=PortalUserType.SYSTEM_ADMIN,
        is_active=True,
    )
    session.add(system_admin)
    await session.commit()
