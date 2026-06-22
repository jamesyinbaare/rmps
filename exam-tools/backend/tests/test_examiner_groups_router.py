"""Router tests for examiner group source-region conflict handling."""

from __future__ import annotations

import logging
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models import Region
from app.routers.examiner_groups import (
    SOURCE_REGION_CONFLICT_MESSAGE,
    _assert_source_regions_available,
    _commit_examiner_group_changes,
    create_examiner_group,
    replace_examiner_group_source_regions,
)
from app.schemas.examiner_groups import ExaminerGroupCreate, ExaminerGroupSourceRegionsReplace


def _group_magic(*, group_id=None):
    group = MagicMock()
    group.id = group_id or uuid4()
    group.examination_id = 1
    group.name = "North"
    group.members = []
    group.source_regions = []
    group.created_at = datetime.utcnow()
    group.updated_at = datetime.utcnow()
    return group


@pytest.mark.asyncio
async def test_assert_source_regions_available_logs_conflicts_not_in_response(caplog) -> None:
    group_id = uuid4()
    session = AsyncMock()
    result = MagicMock()
    result.all.return_value = [(Region.GREATER_ACCRA, "Northern Cohort")]
    session.execute = AsyncMock(return_value=result)

    with caplog.at_level(logging.WARNING):
        with pytest.raises(HTTPException) as exc:
            await _assert_source_regions_available(
                session,
                examination_id=1,
                group_id=group_id,
                regions=[Region.GREATER_ACCRA, Region.EASTERN],
            )

    assert exc.value.status_code == 400
    assert exc.value.detail == SOURCE_REGION_CONFLICT_MESSAGE
    assert "Northern Cohort" in caplog.text
    assert "Greater Accra" in caplog.text
    assert "Northern Cohort" not in exc.value.detail


@pytest.mark.asyncio
async def test_assert_source_regions_available_no_conflict() -> None:
    session = AsyncMock()
    result = MagicMock()
    result.all.return_value = []
    session.execute = AsyncMock(return_value=result)

    await _assert_source_regions_available(
        session,
        examination_id=1,
        group_id=uuid4(),
        regions=[Region.EASTERN],
    )


@pytest.mark.asyncio
async def test_commit_integrity_error_returns_generic_message(caplog) -> None:
    group_id = uuid4()
    session = AsyncMock()
    session.commit = AsyncMock(side_effect=IntegrityError("insert", {}, Exception("duplicate")))
    session.rollback = AsyncMock()

    with caplog.at_level(logging.WARNING):
        with pytest.raises(HTTPException) as exc:
            await _commit_examiner_group_changes(
                session,
                examination_id=1,
                group_id=group_id,
                regions=[Region.GREATER_ACCRA],
            )

    assert exc.value.status_code == 400
    assert exc.value.detail == SOURCE_REGION_CONFLICT_MESSAGE
    assert "examiner_group_source_region_integrity_error" in caplog.text
    session.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_replace_source_regions_conflict_returns_400_not_500() -> None:
    group_id = uuid4()
    session = AsyncMock()
    group = _group_magic(group_id=group_id)
    auth = MagicMock()

    with (
        patch(
            "app.routers.examiner_groups._load_group",
            new_callable=AsyncMock,
            return_value=group,
        ),
        patch(
            "app.routers.examiner_groups._assert_source_regions_available",
            new_callable=AsyncMock,
            side_effect=HTTPException(
                status_code=400,
                detail=SOURCE_REGION_CONFLICT_MESSAGE,
            ),
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await replace_examiner_group_source_regions(
                session=session,
                _=auth,
                examination_id=1,
                group_id=group_id,
                body=ExaminerGroupSourceRegionsReplace(regions=["Greater Accra", "Eastern"]),
            )

    assert exc.value.status_code == 400
    assert exc.value.detail == SOURCE_REGION_CONFLICT_MESSAGE


@pytest.mark.asyncio
async def test_replace_source_regions_self_replace_succeeds() -> None:
    group_id = uuid4()
    session = AsyncMock()
    group = _group_magic(group_id=group_id)
    auth = MagicMock()
    loaded = _group_magic(group_id=group_id)
    region_row = MagicMock()
    region_row.region.value = "Greater Accra"
    loaded.source_regions = [region_row]

    with (
        patch(
            "app.routers.examiner_groups._load_group",
            new_callable=AsyncMock,
            side_effect=[group, loaded],
        ),
        patch(
            "app.routers.examiner_groups._assert_source_regions_available",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.examiner_groups._sync_group_members_to_cohort_regions",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.examiner_groups._commit_examiner_group_changes",
            new_callable=AsyncMock,
        ),
    ):
        result = await replace_examiner_group_source_regions(
            session=session,
            _=auth,
            examination_id=1,
            group_id=group_id,
            body=ExaminerGroupSourceRegionsReplace(regions=["Greater Accra"]),
        )

    assert result.id == group_id
    assert result.source_regions == ["Greater Accra"]


@pytest.mark.asyncio
async def test_create_group_with_taken_region_returns_generic_400() -> None:
    session = AsyncMock()
    auth = MagicMock()
    examination = MagicMock()

    async def flush_side_effect():
        return None

    session.flush = AsyncMock(side_effect=flush_side_effect)
    session.add = MagicMock()

    with (
        patch(
            "app.routers.examiner_groups._get_examination_or_404",
            new_callable=AsyncMock,
            return_value=examination,
        ),
        patch(
            "app.routers.examiner_groups._assert_source_regions_available",
            new_callable=AsyncMock,
            side_effect=HTTPException(
                status_code=400,
                detail=SOURCE_REGION_CONFLICT_MESSAGE,
            ),
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await create_examiner_group(
                session=session,
                _=auth,
                examination_id=1,
                body=ExaminerGroupCreate(name="West", source_regions=["Greater Accra"]),
            )

    assert exc.value.status_code == 400
    assert exc.value.detail == SOURCE_REGION_CONFLICT_MESSAGE
    assert "West" not in exc.value.detail
