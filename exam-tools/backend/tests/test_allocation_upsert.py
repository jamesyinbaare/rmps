"""Upsert and solve-overwrite behavior (mocked session)."""

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import Allocation
from app.routers.script_allocation import create_allocation
from app.schemas.script_allocation import AllocationCreate
from app.services.script_allocation import run_allocation_solve


@pytest.mark.asyncio
async def test_create_allocation_returns_existing_same_id() -> None:
    existing_id = uuid4()
    existing = MagicMock(spec=Allocation)
    existing.id = existing_id
    existing.examination_id = 1
    existing.subject_id = 10
    existing.paper_number = 2
    existing.notes = None
    existing.name = "MATH · Paper 2"

    session = AsyncMock()
    session.add = MagicMock()
    result_existing = MagicMock()
    result_existing.scalar_one_or_none.return_value = existing
    session.execute.return_value = result_existing

    body = AllocationCreate(examination_id=1, subject_id=10, paper_number=2)
    out = await create_allocation(session, None, body)  # type: ignore[arg-type]

    assert out.id == existing_id
    session.add.assert_not_called()
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_allocation_inserts_when_missing() -> None:
    session = AsyncMock()
    session.add = MagicMock()
    result_miss = MagicMock()
    result_miss.scalar_one_or_none.return_value = None
    session.execute.return_value = result_miss
    session.get.return_value = None

    body = AllocationCreate(examination_id=1, subject_id=10, paper_number=2)
    await create_allocation(session, None, body)  # type: ignore[arg-type]

    session.add.assert_called_once()
    added = session.add.call_args[0][0]
    assert isinstance(added, Allocation)
    assert added.examination_id == 1
    assert added.subject_id == 10
    assert added.paper_number == 2
    assert added.name == "Subject 10 · Paper 2"


@pytest.mark.asyncio
async def test_run_allocation_solve_executes_delete_runs_first() -> None:
    alloc_id = uuid4()
    executed: list[object] = []

    class _Result:
        def scalars(self):
            return self

        def all(self):
            return []

    class _Session:
        async def execute(self, stmt):
            executed.append(stmt)
            return _Result()

        async def flush(self):
            return None

        def add(self, _row):
            pass

    allocation = SimpleNamespace(
        id=alloc_id,
        examination_id=1,
        subject_id=101,
        paper_number=1,
        scripts_allocation_quotas=[],
    )
    await run_allocation_solve(
        _Session(),  # type: ignore[arg-type]
        allocation,  # type: ignore[arg-type]
        created_by_id=None,
        unassigned_penalty=1.0,
        time_limit_sec=10.0,
    )
    assert executed, "expected execute calls"
    assert "allocation_runs" in str(executed[0]).lower()
