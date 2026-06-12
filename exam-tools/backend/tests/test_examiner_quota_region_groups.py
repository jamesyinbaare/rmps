"""Tests for quota region group upsert (preserve IDs on edit)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.schemas.examination_examiner_quota_region_group import (
    ExaminerQuotaRegionGroupRow,
    ExaminationExaminerQuotaRegionGroupsPut,
)


@pytest.mark.asyncio
async def test_put_preserves_existing_group_ids() -> None:
    from app.routers.admin_examiner_quota_region_groups import put_examination_examiner_quota_region_groups

    session = AsyncMock()
    group_id = uuid4()
    existing = MagicMock()
    existing.id = group_id
    existing.name = "North"
    existing.regions = []

    body = ExaminationExaminerQuotaRegionGroupsPut(
        groups=[
            ExaminerQuotaRegionGroupRow(
                id=group_id,
                name="Northern zone",
                regions=["Northern", "North East", "Savannah", "Upper East", "Upper West"],
            ),
            ExaminerQuotaRegionGroupRow(
                name="South",
                regions=["Greater Accra", "Central", "Western", "Western North", "Volta"],
            ),
            ExaminerQuotaRegionGroupRow(
                name="East",
                regions=["Eastern", "Oti"],
            ),
            ExaminerQuotaRegionGroupRow(
                name="Middle",
                regions=["Ashanti", "Bono", "Bono East", "Ahafo"],
            ),
        ]
    )

    saved = MagicMock()
    saved.id = group_id
    saved.name = "Northern zone"
    region = MagicMock()
    region.region = "Northern"
    saved.regions = [region]

    with (
        patch(
            "app.routers.admin_examiner_quota_region_groups._load_examination",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.admin_examiner_quota_region_groups._load_groups",
            new_callable=AsyncMock,
            side_effect=[[existing], [saved]],
        ),
        patch(
            "app.routers.admin_examiner_quota_region_groups.quota_regions_fully_mapped",
            new_callable=AsyncMock,
            return_value=True,
        ),
    ):
        session.flush = AsyncMock()
        session.commit = AsyncMock()
        session.execute = AsyncMock()
        session.add = MagicMock()

        response = await put_examination_examiner_quota_region_groups(
            exam_id=1,
            body=body,
            session=session,
            _=None,
        )

    assert response.regions_complete is True
    # Existing group updated in place — not deleted wholesale.
    assert existing.name == "Northern zone"
    session.execute.assert_awaited()
    session.commit.assert_awaited_once()
