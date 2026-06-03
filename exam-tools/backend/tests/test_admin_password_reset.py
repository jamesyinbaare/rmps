from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import User, UserRole
from app.schemas.password_reset import AdminPasswordReset
from app.services.admin_password_reset import apply_admin_password_reset, resolve_password_from_reset
from app.services.staff_email_users import load_staff_email_user


def test_resolve_password_auto_mode() -> None:
    password, generated = resolve_password_from_reset(AdminPasswordReset(mode="auto"))
    assert password == generated
    assert len(password) == 8


def test_resolve_password_manual_mode() -> None:
    password, generated = resolve_password_from_reset(
        AdminPasswordReset(mode="manual", new_password="manualpass1"),
    )
    assert password == "manualpass1"
    assert generated is None


def test_resolve_password_manual_too_short() -> None:
    with pytest.raises(ValueError, match="at least"):
        resolve_password_from_reset(AdminPasswordReset(mode="manual", new_password="short"))


@pytest.mark.asyncio
async def test_apply_admin_password_reset_auto() -> None:
    user = User(
        id=uuid4(),
        full_name="Keeper",
        role=UserRole.DEPOT_KEEPER,
        is_active=True,
    )
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()

    result = await apply_admin_password_reset(session, user, AdminPasswordReset(mode="auto"))

    assert result.generated_password is not None
    assert user.hashed_password is not None
    assert user.hashed_password != result.generated_password
    session.execute.assert_awaited_once()
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_load_staff_email_user_not_found() -> None:
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=result)

    with pytest.raises(HTTPException) as exc_info:
        await load_staff_email_user(
            session,
            uuid4(),
            UserRole.FINANCE_OFFICER,
            not_found_detail="Finance officer not found",
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Finance officer not found"


@pytest.mark.asyncio
async def test_load_staff_email_user_found() -> None:
    user_id = uuid4()
    user = User(
        id=user_id,
        email="finance@example.com",
        full_name="Finance User",
        role=UserRole.FINANCE_OFFICER,
        is_active=True,
        created_at=datetime.utcnow(),
    )
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    session.execute = AsyncMock(return_value=result)

    loaded = await load_staff_email_user(
        session,
        user_id,
        UserRole.FINANCE_OFFICER,
        not_found_detail="Finance officer not found",
    )

    assert loaded is user
