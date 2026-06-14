"""Auth dependency tests for marking script source API."""

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.dependencies.auth import super_admin_or_test_admin_officer
from app.models import UserRole


@pytest.mark.asyncio
async def test_super_admin_or_test_admin_can_access_marking_script_source() -> None:
    super_admin = MagicMock(role=UserRole.SUPER_ADMIN, is_active=True)
    test_admin = MagicMock(role=UserRole.TEST_ADMIN_OFFICER, is_active=True)
    checker = super_admin_or_test_admin_officer
    assert await checker(super_admin) is super_admin
    assert await checker(test_admin) is test_admin


@pytest.mark.asyncio
async def test_finance_officer_denied_marking_script_source_write() -> None:
    finance = MagicMock(role=UserRole.FINANCE_OFFICER, is_active=True)
    with pytest.raises(HTTPException):
        await super_admin_or_test_admin_officer(finance)
