"""Allocation assignment integrity: ORM delete behavior and pool removal."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import Examiner, ScriptEnvelope
from app.routers.script_allocation import remove_allocation_examiner


def test_script_envelope_allocation_assignments_passive_deletes() -> None:
    rel = ScriptEnvelope.allocation_assignments.property
    assert rel.passive_deletes is True


def test_examiner_allocation_assignments_passive_deletes() -> None:
    rel = Examiner.allocation_assignments.property
    assert rel.passive_deletes is True


@pytest.mark.asyncio
async def test_remove_allocation_examiner_deletes_assignments_before_membership() -> None:
    allocation_id = uuid4()
    examiner_id = uuid4()
    member = MagicMock()
    session = AsyncMock()
    session.get = AsyncMock(return_value=member)
    session.execute = AsyncMock()
    session.delete = AsyncMock()
    session.commit = AsyncMock()

    await remove_allocation_examiner(session, None, allocation_id, examiner_id)  # type: ignore[arg-type]

    session.execute.assert_awaited()
    session.delete.assert_awaited_once_with(member)
    session.commit.assert_awaited_once()
