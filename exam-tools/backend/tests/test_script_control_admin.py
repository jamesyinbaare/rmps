"""Admin worked-scripts complete/correct helpers and access."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.dependencies.auth import RoleChecker
from app.models import UserRole
from app.routers.script_control import (
    _assert_inspector_irregular_series_editable,
    _assert_inspector_series_editable,
    _sync_irregular_script_series_envelopes,
    _sync_script_series_envelopes,
    upsert_admin_school_irregular_script_series,
)
from app.schemas.script_control import ScriptEnvelopeItem, ScriptSeriesUpsertRequest


def test_assert_inspector_series_editable_rejects_fully_verified() -> None:
    row = MagicMock()
    row.verified_at = datetime.utcnow()
    row.envelopes = []
    with pytest.raises(HTTPException) as exc_info:
        _assert_inspector_series_editable(row)
    assert exc_info.value.status_code == 409


def test_assert_inspector_series_editable_rejects_partially_verified() -> None:
    env = MagicMock()
    env.verified_at = datetime.utcnow()
    row = MagicMock()
    row.verified_at = None
    row.envelopes = [env]
    with pytest.raises(HTTPException) as exc_info:
        _assert_inspector_series_editable(row)
    assert exc_info.value.status_code == 409


def test_assert_inspector_irregular_series_editable_rejects_verified() -> None:
    row = MagicMock()
    row.verified_at = datetime.utcnow()
    row.envelopes = []
    with pytest.raises(HTTPException) as exc_info:
        _assert_inspector_irregular_series_editable(row)
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_sync_script_series_envelopes_admin_clears_verification_on_count_change() -> None:
    env = MagicMock()
    env.envelope_number = 1
    env.booklet_count = 10
    env.verified_at = datetime.utcnow()
    env.verified_by_id = uuid4()
    env.id = uuid4()

    row = MagicMock()
    row.envelopes = [env]
    row.verified_at = datetime.utcnow()
    row.verified_by_id = uuid4()
    row.id = uuid4()

    session = AsyncMock()
    session.execute = AsyncMock()

    await _sync_script_series_envelopes(
        session,
        row,
        [ScriptEnvelopeItem(envelope_number=1, booklet_count=12)],
        admin_override=True,
    )

    assert env.booklet_count == 12
    assert env.verified_at is None
    assert env.verified_by_id is None
    assert row.verified_at is None
    assert row.verified_by_id is None


@pytest.mark.asyncio
async def test_sync_script_series_envelopes_admin_keeps_verification_when_unchanged() -> None:
    verified_at = datetime.utcnow()
    verified_by = uuid4()
    env = MagicMock()
    env.envelope_number = 1
    env.booklet_count = 10
    env.verified_at = verified_at
    env.verified_by_id = verified_by
    env.id = uuid4()

    row = MagicMock()
    row.envelopes = [env]
    row.verified_at = verified_at
    row.verified_by_id = verified_by
    row.id = uuid4()

    session = AsyncMock()
    session.execute = AsyncMock()

    await _sync_script_series_envelopes(
        session,
        row,
        [ScriptEnvelopeItem(envelope_number=1, booklet_count=10)],
        admin_override=True,
    )

    assert env.verified_at == verified_at
    assert row.verified_at == verified_at


@pytest.mark.asyncio
async def test_sync_irregular_script_series_envelopes_admin_clears_verification() -> None:
    env = MagicMock()
    env.envelope_number = 1
    env.booklet_count = 5
    env.verified_at = datetime.utcnow()
    env.verified_by_id = uuid4()

    row = MagicMock()
    row.envelopes = [env]
    row.verified_at = datetime.utcnow()
    row.verified_by_id = uuid4()

    session = AsyncMock()

    await _sync_irregular_script_series_envelopes(
        session,
        row,
        [ScriptEnvelopeItem(envelope_number=1, booklet_count=8)],
        admin_override=True,
    )

    assert env.booklet_count == 8
    assert env.verified_at is None
    assert row.verified_at is None


@pytest.mark.asyncio
async def test_admin_irregular_upsert_rejects_no_scripts() -> None:
    body = ScriptSeriesUpsertRequest(
        subject_id=1,
        paper_number=1,
        series_number=1,
        no_scripts=True,
        envelopes=[],
    )
    with pytest.raises(HTTPException) as exc_info:
        await upsert_admin_school_irregular_script_series(
            exam_id=1,
            body=body,
            session=MagicMock(),
            user=MagicMock(),
            school_id=uuid4(),
        )
    assert exc_info.value.status_code == 400
    assert "regular worked scripts only" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_super_admin_or_test_admin_role_checker() -> None:
    checker = RoleChecker(allowed_roles={UserRole.SUPER_ADMIN, UserRole.TEST_ADMIN_OFFICER})
    super_admin = MagicMock(role=UserRole.SUPER_ADMIN, is_active=True)
    test_admin = MagicMock(role=UserRole.TEST_ADMIN_OFFICER, is_active=True)
    inspector = MagicMock(role=UserRole.INSPECTOR, is_active=True)

    assert await checker(super_admin) is super_admin
    assert await checker(test_admin) is test_admin

    with pytest.raises(HTTPException) as exc_info:
        await checker(inspector)
    assert exc_info.value.status_code == 403
