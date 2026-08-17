"""Tests for script checker bulk assignment upsert."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models import UserRole
from app.routers.workforce_script_checker_assignments import upsert_script_checker_bulk_assignment_route
from app.schemas.workforce import WorkforceBulkAssignmentUpsert
from app.services.workforce_roster import WorkforceRosterNotFoundError


def test_bulk_upsert_schema_rejects_both_papers_zero() -> None:
    with pytest.raises(ValidationError):
        WorkforceBulkAssignmentUpsert(
            person_id=uuid4(),
            paper1_script_count=0,
            paper2_script_count=0,
            num_days=2,
        )


def test_bulk_upsert_schema_requires_days() -> None:
    with pytest.raises(ValidationError):
        WorkforceBulkAssignmentUpsert(
            person_id=uuid4(),
            paper1_script_count=10,
            paper2_script_count=0,
            num_days=0,
        )


@pytest.mark.asyncio
async def test_upsert_bulk_assignment_success() -> None:
    user = MagicMock(role=UserRole.SUPER_ADMIN, id=uuid4())
    session = AsyncMock()
    checker_id = uuid4()
    row = {
        "id": uuid4(),
        "examination_id": 1,
        "checker_id": checker_id,
        "paper1_script_count": 40,
        "paper2_script_count": 20,
        "num_days": 3,
        "assigned_at": datetime(2026, 8, 17, 8, 0),
        "assigned_by_user_id": user.id,
        "updated_at": datetime(2026, 8, 17, 8, 0),
        "updated_by_user_id": user.id,
    }
    body = WorkforceBulkAssignmentUpsert(
        person_id=checker_id,
        paper1_script_count=40,
        paper2_script_count=20,
        num_days=3,
    )

    with patch(
        "app.routers.workforce_script_checker_assignments.upsert_script_checker_bulk_assignment",
        new_callable=AsyncMock,
        return_value=row,
    ) as upsert_mock:
        result = await upsert_script_checker_bulk_assignment_route(
            session=session,
            user=user,
            examination_id=1,
            body=body,
        )

    upsert_mock.assert_awaited_once()
    assert result.paper1_script_count == 40
    assert result.paper2_script_count == 20
    assert result.num_days == 3
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_upsert_bulk_assignment_returns_404_when_checker_missing() -> None:
    user = MagicMock(role=UserRole.TEST_ADMIN_OFFICER, id=uuid4())
    session = AsyncMock()
    body = WorkforceBulkAssignmentUpsert(
        person_id=uuid4(),
        paper1_script_count=10,
        paper2_script_count=0,
        num_days=1,
    )

    with patch(
        "app.routers.workforce_script_checker_assignments.upsert_script_checker_bulk_assignment",
        new_callable=AsyncMock,
        side_effect=WorkforceRosterNotFoundError("Script checker not found"),
    ):
        with pytest.raises(HTTPException) as exc:
            await upsert_script_checker_bulk_assignment_route(
                session=session,
                user=user,
                examination_id=1,
                body=body,
            )

    assert exc.value.status_code == 404
    session.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_upsert_bulk_assignment_returns_400_when_not_confirmed() -> None:
    user = MagicMock(role=UserRole.SUPER_ADMIN, id=uuid4())
    session = AsyncMock()
    body = WorkforceBulkAssignmentUpsert(
        person_id=uuid4(),
        paper1_script_count=10,
        paper2_script_count=5,
        num_days=2,
    )

    with patch(
        "app.routers.workforce_script_checker_assignments.upsert_script_checker_bulk_assignment",
        new_callable=AsyncMock,
        side_effect=ValueError("This person must confirm their availability before scripts can be assigned."),
    ):
        with pytest.raises(HTTPException) as exc:
            await upsert_script_checker_bulk_assignment_route(
                session=session,
                user=user,
                examination_id=1,
                body=body,
            )

    assert exc.value.status_code == 400
    session.rollback.assert_awaited_once()
