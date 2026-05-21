"""Executive national monitoring: centre aggregation and inspector listing."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import ExamInspectorSubjectScope, Region, Zone
from app.services.executive_overview import (
    aggregate_executive_centres,
    load_posted_inspectors_for_centre,
)


def _school(
    *,
    school_id=None,
    code: str = "HOST01",
    name: str = "Host Centre",
    writes_at_center_id=None,
):
    s = MagicMock()
    s.id = school_id or uuid4()
    s.code = code
    s.name = name
    s.writes_at_center_id = writes_at_center_id
    s.region = Region.GREATER_ACCRA
    s.zone = Zone.A
    return s


@pytest.mark.asyncio
async def test_aggregate_executive_centres_empty() -> None:
    session = AsyncMock()
    result = await aggregate_executive_centres(session, 1, set())
    assert result == []


@pytest.mark.asyncio
async def test_load_posted_inspectors_for_centre_maps_fields() -> None:
    posting_id = uuid4()
    inspector_id = uuid4()
    center_id = uuid4()

    posting = MagicMock()
    posting.id = posting_id
    posting.subject_scope = ExamInspectorSubjectScope.ALL

    inspector = MagicMock()
    inspector.full_name = "Jane Doe"
    inspector.phone_number = "0244123456"

    result_mock = MagicMock()
    result_mock.all.return_value = [(posting, inspector)]
    session = AsyncMock()
    session.execute = AsyncMock(return_value=result_mock)

    rows = await load_posted_inspectors_for_centre(session, 1, center_id)
    assert len(rows) == 1
    assert rows[0].inspector_full_name == "Jane Doe"
    assert rows[0].inspector_phone_number == "0244123456"
    assert rows[0].subject_scope == "ALL"
    assert rows[0].posting_id == posting_id


@pytest.mark.asyncio
async def test_build_executive_centre_detail_rejects_satellite() -> None:
    from app.services.executive_overview import build_executive_centre_detail

    satellite = _school(writes_at_center_id=uuid4())
    session = AsyncMock()
    session.get = AsyncMock(return_value=satellite)

    with patch(
        "app.services.executive_overview.load_examination_or_raise",
        new_callable=AsyncMock,
    ):
        with pytest.raises(ValueError, match="not an examination centre host"):
            await build_executive_centre_detail(session, 1, satellite.id)
