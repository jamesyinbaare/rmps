"""Create default supervisor users when schools are created."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models import User, UserRole


async def provision_supervisor_for_school(
    session: AsyncSession,
    school_code: str,
) -> tuple[User, str]:
    """Insert a SUPERVISOR user for ``school_code``. Does not commit.

    The supervisor's ``full_name`` and login password are both set to ``school_code``
    (supervisor login uses ``school_code`` + password).

    Returns ``(user, plain_password)`` where ``plain_password == school_code``.
    """
    stmt = select(User).where(User.school_code == school_code, User.role == UserRole.SUPERVISOR)
    result = await session.execute(stmt)
    if result.scalar_one_or_none() is not None:
        raise ValueError(f"A supervisor already exists for school code {school_code!r}")

    password = school_code
    user = User(
        school_code=school_code,
        hashed_password=get_password_hash(password),
        full_name=school_code,
        role=UserRole.SUPERVISOR,
        is_active=True,
    )
    session.add(user)
    return user, password
