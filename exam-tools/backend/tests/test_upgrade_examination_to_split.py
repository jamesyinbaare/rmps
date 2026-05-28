"""UNIFIED → SPLIT upgrade converts ALL memberships to CORE in place."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import (
    CentreStructureMode,
    ExaminationCentreMembershipScope,
)
from app.services.examination_centre_service import upgrade_examination_to_split


def _membership(*, scope: ExaminationCentreMembershipScope):
    return SimpleNamespace(
        id=uuid4(),
        examination_id=1,
        examination_centre_id=uuid4(),
        school_id=uuid4(),
        subject_scope=scope,
    )


@pytest.mark.asyncio
async def test_upgrade_converts_all_to_core_in_place() -> None:
    m1 = _membership(scope=ExaminationCentreMembershipScope.ALL)
    m2 = _membership(scope=ExaminationCentreMembershipScope.ALL)
    exam = SimpleNamespace(id=1, centre_structure_mode=CentreStructureMode.UNIFIED)

    result = MagicMock()
    result.scalars.return_value.all.return_value = [m1, m2]

    session = AsyncMock()
    session.get = AsyncMock(return_value=exam)
    session.execute = AsyncMock(return_value=result)
    session.flush = AsyncMock()

    created, removed = await upgrade_examination_to_split(session, 1)

    assert created == 2
    assert removed == 2
    assert m1.subject_scope == ExaminationCentreMembershipScope.CORE
    assert m2.subject_scope == ExaminationCentreMembershipScope.CORE
    assert exam.centre_structure_mode == CentreStructureMode.SPLIT
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_upgrade_does_not_create_elective_rows() -> None:
    m1 = _membership(scope=ExaminationCentreMembershipScope.ALL)
    exam = SimpleNamespace(id=1, centre_structure_mode=CentreStructureMode.UNIFIED)

    result = MagicMock()
    result.scalars.return_value.all.return_value = [m1]

    session = AsyncMock()
    session.get = AsyncMock(return_value=exam)
    session.execute = AsyncMock(return_value=result)
    session.flush = AsyncMock()

    await upgrade_examination_to_split(session, 1)

    assert m1.subject_scope != ExaminationCentreMembershipScope.ELECTIVE
    assert m1.subject_scope == ExaminationCentreMembershipScope.CORE


@pytest.mark.asyncio
async def test_upgrade_rejects_already_split() -> None:
    exam = SimpleNamespace(id=1, centre_structure_mode=CentreStructureMode.SPLIT)
    session = AsyncMock()
    session.get = AsyncMock(return_value=exam)

    with pytest.raises(HTTPException) as exc:
        await upgrade_examination_to_split(session, 1)

    assert exc.value.status_code == 400
    assert "already" in exc.value.detail.lower()
