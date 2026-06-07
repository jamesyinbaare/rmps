"""Tests for subject officer sign-in via staff login."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.security import get_password_hash
from app.models import User, UserRole
from app.routers.auth import SuperAdminLoginRequest, super_admin_login


@pytest.mark.asyncio
async def test_staff_login_rejects_wrong_password_for_subject_officer() -> None:
    session = AsyncMock()
    user = MagicMock(spec=User)
    user.id = uuid4()
    user.role = UserRole.SUBJECT_OFFICER
    user.email = "officer@example.com"
    user.is_active = True
    user.hashed_password = get_password_hash("CorrectPass1!")
    user.school_code = None

    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    session.execute = AsyncMock(return_value=result)

    with pytest.raises(HTTPException) as exc:
        await super_admin_login(
            SuperAdminLoginRequest(email="officer@example.com", password="wrong"),
            session,
        )
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_staff_login_accepts_subject_officer_email_password() -> None:
    session = AsyncMock()
    user = MagicMock(spec=User)
    user.id = uuid4()
    user.role = UserRole.SUBJECT_OFFICER
    user.email = "officer@example.com"
    user.is_active = True
    user.hashed_password = get_password_hash("CorrectPass1!")
    user.school_code = None

    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    session.execute = AsyncMock(return_value=result)

    response = await super_admin_login(
        SuperAdminLoginRequest(email="Officer@Example.com", password="CorrectPass1!"),
        session,
    )
    assert response.role == UserRole.SUBJECT_OFFICER
    assert response.access_token
