"""Tests for one active SchoolAdmin per school (guard + replace)."""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import PortalUser, Role, School
from app.routers.admin_registration import (
    create_school_admin_user,
    replace_school_admin,
)
from app.schemas.user import SchoolAdminReplace, SchoolAdminUserCreate
from app.services.school_admin_guard import (
    ACTIVE_SCHOOL_ADMIN_EXISTS_MSG,
    assert_school_has_no_active_admin,
    count_active_school_admins,
    is_one_active_school_admin_violation,
)


def _admin(**kwargs) -> PortalUser:
    defaults = dict(
        id=uuid4(),
        email="sys@example.com",
        username="sysadmin",
        hashed_password="hashed",
        full_name="System Admin",
        role=Role.SystemAdmin,
        is_active=True,
    )
    defaults.update(kwargs)
    return PortalUser(**defaults)


def _school_admin(**kwargs) -> PortalUser:
    defaults = dict(
        id=uuid4(),
        email="coord@school.com",
        username="coord",
        hashed_password="hashed",
        full_name="Coordinator",
        role=Role.SchoolAdmin,
        school_id=1,
        is_active=True,
    )
    defaults.update(kwargs)
    return PortalUser(**defaults)


@pytest.mark.asyncio
async def test_assert_blocks_when_active_admin_exists():
    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(scalar_one=MagicMock(return_value=1))
    )
    with pytest.raises(HTTPException) as exc:
        await assert_school_has_no_active_admin(session, 10)
    assert exc.value.status_code == 400
    assert ACTIVE_SCHOOL_ADMIN_EXISTS_MSG in exc.value.detail


@pytest.mark.asyncio
async def test_assert_allows_when_no_active_admin():
    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(scalar_one=MagicMock(return_value=0))
    )
    await assert_school_has_no_active_admin(session, 10)


@pytest.mark.asyncio
async def test_assert_excludes_user_id():
    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(scalar_one=MagicMock(return_value=0))
    )
    exclude = uuid4()
    await assert_school_has_no_active_admin(session, 10, exclude_user_id=exclude)
    # Ensure the query was issued (exclude applied in SQL, not Python)
    session.execute.assert_awaited()


def test_is_one_active_school_admin_violation():
    class FakeExc(Exception):
        def __init__(self):
            self.orig = Exception('duplicate key value violates unique constraint "uq_one_active_school_admin"')

    assert is_one_active_school_admin_violation(FakeExc()) is True
    assert is_one_active_school_admin_violation(Exception("other")) is False


@pytest.mark.asyncio
async def test_create_second_active_admin_returns_400():
    school = School(id=1, name="Test School", code="TS01")
    current = _admin()
    session = AsyncMock()
    # email check → None, username check → None, school → school, then assert raises
    session.execute = AsyncMock(
        side_effect=[
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),  # email
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),  # username
            MagicMock(scalar_one_or_none=MagicMock(return_value=school)),  # school
        ]
    )

    with patch(
        "app.routers.admin_registration.assert_school_has_no_active_admin",
        new_callable=AsyncMock,
        side_effect=HTTPException(status_code=400, detail=ACTIVE_SCHOOL_ADMIN_EXISTS_MSG),
    ):
        with pytest.raises(HTTPException) as exc:
            await create_school_admin_user(
                SchoolAdminUserCreate(
                    email="new@school.com",
                    full_name="New Coord",
                    school_id=1,
                ),
                session,
                current,
            )
    assert exc.value.status_code == 400
    assert ACTIVE_SCHOOL_ADMIN_EXISTS_MSG in exc.value.detail
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_create_allowed_when_vacancy_after_leave():
    school = School(id=1, name="Test School", code="TS01")
    current = _admin()
    created = _school_admin(email="new@school.com", username="newcoord", school_id=1)
    created.school = school
    created.created_at = created.updated_at = MagicMock()

    session = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),  # email
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),  # username
            MagicMock(scalar_one_or_none=MagicMock(return_value=school)),  # school
            MagicMock(scalar_one=MagicMock(return_value=created)),  # reload
        ]
    )
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()

    with (
        patch(
            "app.routers.admin_registration.assert_school_has_no_active_admin",
            new_callable=AsyncMock,
        ) as guard,
        patch(
            "app.services.password_setup_service.generate_unusable_password_hash",
            return_value="u",
        ),
        patch(
            "app.services.password_setup_service.issue_and_send_password_setup",
            new_callable=AsyncMock,
            return_value=True,
        ) as issue,
        patch(
            "app.services.account_audit.record_account_event",
            new_callable=AsyncMock,
        ),
    ):
        result = await create_school_admin_user(
            SchoolAdminUserCreate(
                email="new@school.com",
                full_name="New Coord",
                school_id=1,
            ),
            session,
            current,
        )

    guard.assert_awaited_once()
    issue.assert_awaited_once()
    assert result.invite_sent is True
    assert result.email == "new@school.com"


@pytest.mark.asyncio
async def test_replace_deactivates_old_and_creates_new():
    school = School(id=5, name="Alpha", code="A01")
    current = _admin()
    old = _school_admin(email="old@school.com", username="oldcoord", school_id=5)
    new_user = _school_admin(
        email="fresh@school.com", username="fresh", school_id=5, full_name="Fresh Coord"
    )
    new_user.school = school
    new_user.created_at = new_user.updated_at = MagicMock()

    scalars_active = MagicMock()
    scalars_active.all = MagicMock(return_value=[old])

    session = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[
            MagicMock(scalar_one_or_none=MagicMock(return_value=school)),  # school
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),  # email
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),  # username
            MagicMock(scalars=MagicMock(return_value=scalars_active)),  # active admins
            MagicMock(scalar_one=MagicMock(return_value=new_user)),  # reload
        ]
    )
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()

    with (
        patch(
            "app.services.password_setup_service.generate_unusable_password_hash",
            return_value="u",
        ),
        patch(
            "app.services.password_setup_service.issue_and_send_password_setup",
            new_callable=AsyncMock,
            return_value=True,
        ) as issue,
        patch(
            "app.services.password_setup_service.revoke_user_refresh_tokens",
            new_callable=AsyncMock,
        ) as revoke,
        patch(
            "app.services.account_audit.record_account_event",
            new_callable=AsyncMock,
        ) as audit,
        patch(
            "app.routers.admin_registration.invalidate_user_cache",
        ),
    ):
        result = await replace_school_admin(
            5,
            SchoolAdminReplace(email="fresh@school.com", full_name="Fresh Coord"),
            session,
            current,
        )

    assert old.is_active is False
    revoke.assert_awaited()
    issue.assert_awaited_once()
    assert audit.await_count >= 3
    found_replaced = any(
        (c.kwargs.get("metadata") or {}).get("reason") == "replaced"
        for c in audit.await_args_list
    )
    assert found_replaced
    assert result.invite_sent is True
    assert result.email == "fresh@school.com"


@pytest.mark.asyncio
async def test_bulk_row_fails_when_school_has_active_admin():
    """Guard helper used by bulk: count > 0 means row should fail."""
    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(scalar_one=MagicMock(return_value=2))
    )
    count = await count_active_school_admins(session, school_id=3)
    assert count == 2
    with pytest.raises(HTTPException):
        await assert_school_has_no_active_admin(session, 3)
