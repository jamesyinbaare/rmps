"""Router tests for workforce assignment batches."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.models import UserRole
from app.routers.workforce_script_checker_assignments import (
    create_script_checker_assignment,
    get_script_checker_assignment_roster,
    get_script_checker_assignments,
    router,
)
from app.schemas.workforce import WorkforceAssignmentBatchCreate
from app.services.workforce_assignment_batches import (
    ActiveBatchConflictError,
    _assignment_script_totals,
)


@pytest.mark.asyncio
async def test_get_assignments_calls_subject_officer_scope() -> None:
    user = MagicMock(role=UserRole.SUBJECT_OFFICER)
    session = AsyncMock()
    grid = {
        "examination_id": 1,
        "subject_id": 10,
        "paper_number": 1,
        "items": [],
    }

    with (
        patch(
            "app.routers.workforce_script_checker_assignments.assert_subject_officer_access",
            new_callable=AsyncMock,
        ) as scope_mock,
        patch(
            "app.routers.workforce_script_checker_assignments.list_script_checker_assignment_grid",
            new_callable=AsyncMock,
            return_value=grid,
        ),
    ):
        result = await get_script_checker_assignments(
            session=session,
            user=user,
            examination_id=1,
            subject_id=10,
            paper_number=1,
        )

    scope_mock.assert_awaited_once_with(session, user, 1, 10)
    assert result.examination_id == 1
    assert result.items == []


@pytest.mark.asyncio
async def test_get_assignments_forbidden_for_unassigned_subject_officer() -> None:
    user = MagicMock(role=UserRole.SUBJECT_OFFICER)
    session = AsyncMock()

    with patch(
        "app.routers.workforce_script_checker_assignments.assert_subject_officer_access",
        new_callable=AsyncMock,
        side_effect=HTTPException(status_code=403, detail="Not assigned to this subject"),
    ):
        with pytest.raises(HTTPException) as exc:
            await get_script_checker_assignments(
                session=session,
                user=user,
                examination_id=1,
                subject_id=99,
                paper_number=1,
            )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_get_assignment_roster_returns_exam_wide_totals() -> None:
    user = MagicMock(role=UserRole.SUPER_ADMIN)
    session = AsyncMock()
    roster = {
        "examination_id": 1,
        "items": [
            {
                "id": uuid4(),
                "name": "Checker A",
                "reference_code": "SC1",
                "phone_number": "024",
                "availability_status": "confirmed",
                "has_bank_account": True,
                "active_batch": None,
                "assigned_total": 75,
                "completed_total": 50,
                "uncompleted_total": 25,
                "batches": [],
            }
        ],
    }

    with patch(
        "app.routers.workforce_script_checker_assignments.list_script_checker_assignment_roster",
        new_callable=AsyncMock,
        return_value=roster,
    ):
        result = await get_script_checker_assignment_roster(
            session=session,
            _=user,
            examination_id=1,
        )

    assert result.examination_id == 1
    assert len(result.items) == 1
    assert result.items[0].assigned_total == 75
    assert result.items[0].completed_total == 50
    assert result.items[0].uncompleted_total == 25


def test_assignment_script_totals_sums_active_and_completed() -> None:
    batch_completed = MagicMock(script_count=50, status="completed")
    batch_active = MagicMock(script_count=25, status="active")
    batch_cancelled = MagicMock(script_count=10, status="cancelled")

    assigned, completed, uncompleted = _assignment_script_totals(
        [batch_completed, batch_active, batch_cancelled],
    )

    assert assigned == 75
    assert completed == 50
    assert uncompleted == 25


def test_create_assignment_rejects_paper_three_via_query_validation() -> None:
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    response = client.post(
        "/examinations/1/subjects/10/script-checker-assignments?paper_number=3",
        json={"person_id": str(uuid4()), "script_count": 50},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_assignment_success() -> None:
    user = MagicMock(role=UserRole.SUPER_ADMIN, id=uuid4())
    session = AsyncMock()
    batch_id = uuid4()
    checker_id = uuid4()
    batch_row = {
        "id": batch_id,
        "examination_id": 1,
        "subject_id": 10,
        "paper_number": 1,
        "script_count": 50,
        "status": "active",
        "batch_sequence": 1,
        "assigned_at": MagicMock(),
        "assigned_by_user_id": user.id,
        "completed_at": None,
        "completed_by_user_id": None,
    }

    with (
        patch(
            "app.routers.workforce_script_checker_assignments.assert_subject_officer_access",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.workforce_script_checker_assignments.create_script_checker_assignment_batch",
            new_callable=AsyncMock,
            return_value=batch_row,
        ),
    ):
        result = await create_script_checker_assignment(
            session=session,
            user=user,
            examination_id=1,
            subject_id=10,
            body=WorkforceAssignmentBatchCreate(person_id=checker_id, script_count=50),
            paper_number=1,
        )

    assert result.id == batch_id
    assert result.script_count == 50
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_assignment_returns_409_when_active_batch_exists() -> None:
    user = MagicMock(role=UserRole.TEST_ADMIN_OFFICER, id=uuid4())
    session = AsyncMock()

    with (
        patch(
            "app.routers.workforce_script_checker_assignments.assert_subject_officer_access",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.workforce_script_checker_assignments.create_script_checker_assignment_batch",
            new_callable=AsyncMock,
            side_effect=ActiveBatchConflictError("An active batch already exists for this checker."),
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await create_script_checker_assignment(
                session=session,
                user=user,
                examination_id=1,
                subject_id=10,
                body=WorkforceAssignmentBatchCreate(person_id=uuid4(), script_count=50),
                paper_number=1,
            )

    assert exc.value.status_code == 409
    assert "active batch" in exc.value.detail.lower()
    session.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_assignment_subject_officer_scope_enforced() -> None:
    user = MagicMock(role=UserRole.SUBJECT_OFFICER, id=uuid4())
    session = AsyncMock()

    with patch(
        "app.routers.workforce_script_checker_assignments.assert_subject_officer_access",
        new_callable=AsyncMock,
        side_effect=HTTPException(status_code=403, detail="Not assigned to this subject"),
    ):
        with pytest.raises(HTTPException) as exc:
            await create_script_checker_assignment(
                session=session,
                user=user,
                examination_id=1,
                subject_id=10,
                body=WorkforceAssignmentBatchCreate(person_id=uuid4(), script_count=25),
                paper_number=1,
            )

    assert exc.value.status_code == 403
