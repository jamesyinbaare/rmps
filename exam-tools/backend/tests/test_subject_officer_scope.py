"""Unit tests for subject officer scope helpers."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import User, UserRole
from app.services.subject_officer_scope import (
    assert_subject_officer_access,
    can_manage_default_cohort,
    effective_subject_scope,
    is_unrestricted_examiner_manager,
)


def test_is_unrestricted_examiner_manager() -> None:
    admin = MagicMock(role=UserRole.SUPER_ADMIN)
    test_admin = MagicMock(role=UserRole.TEST_ADMIN_OFFICER)
    officer = MagicMock(role=UserRole.SUBJECT_OFFICER)
    assert is_unrestricted_examiner_manager(admin) is True
    assert is_unrestricted_examiner_manager(test_admin) is True
    assert is_unrestricted_examiner_manager(officer) is False


def test_can_manage_default_cohort() -> None:
    admin = MagicMock(role=UserRole.SUPER_ADMIN)
    test_admin = MagicMock(role=UserRole.TEST_ADMIN_OFFICER)
    officer = MagicMock(role=UserRole.SUBJECT_OFFICER)
    assert can_manage_default_cohort(admin) is True
    assert can_manage_default_cohort(test_admin) is True
    assert can_manage_default_cohort(officer) is False


@pytest.mark.asyncio
async def test_effective_subject_scope_admin_returns_none() -> None:
    session = AsyncMock()
    user = MagicMock(role=UserRole.TEST_ADMIN_OFFICER)
    scope = await effective_subject_scope(session, user, examination_id=1)
    assert scope is None
    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_assert_subject_officer_access_denies_unassigned() -> None:
    session = AsyncMock()
    user = MagicMock(spec=User)
    user.role = UserRole.SUBJECT_OFFICER
    user.id = uuid4()

    result = MagicMock()
    result.scalars.return_value.all.return_value = [10]
    session.execute = AsyncMock(return_value=result)

    with pytest.raises(HTTPException) as exc:
        await assert_subject_officer_access(session, user, examination_id=1, subject_id=99)
    assert exc.value.status_code == 403
