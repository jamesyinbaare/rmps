"""Tests for subject total quota validation."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.schemas.subject_examiner_region_quota import (
    SubjectExaminerRegionQuotaItem,
    SubjectExaminerRegionQuotaReplace,
)


@pytest.mark.asyncio
async def test_put_quotas_rejects_mismatched_group_sum() -> None:
    from app.routers.admin_examiner_region_quotas import put_subject_examiner_region_quotas

    session = AsyncMock()
    group_id = uuid4()
    body = SubjectExaminerRegionQuotaReplace(
        total_quota=100,
        items=[
            SubjectExaminerRegionQuotaItem(group_id=group_id, examiner_type=None, quota_count=40),
        ],
    )

    with (
        patch(
            "app.routers.admin_examiner_region_quotas._load_examination",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.admin_examiner_region_quotas._load_subject",
            new_callable=AsyncMock,
        ),
    ):
        execute_result = MagicMock()
        execute_result.all.return_value = [(group_id,)]
        session.execute = AsyncMock(return_value=execute_result)

        with pytest.raises(HTTPException) as exc:
            await put_subject_examiner_region_quotas(
                exam_id=1,
                subject_id=10,
                body=body,
                session=session,
                _=None,
            )

    assert exc.value.status_code == 400
    assert "must sum to the subject total" in exc.value.detail


@pytest.mark.asyncio
async def test_quotas_response_returns_subject_total_not_last_group_cap() -> None:
    from app.services.examiner_regional_quota import build_subject_quota_status_response

    session = AsyncMock()
    group_a_id = uuid4()
    group_b_id = uuid4()

    group_a = MagicMock()
    group_a.id = group_a_id
    group_a.name = "Alpha"
    region_a = MagicMock()
    region_a.region = "Greater Accra"
    group_a.regions = [region_a]

    group_b = MagicMock()
    group_b.id = group_b_id
    group_b.name = "Zulu"
    region_b = MagicMock()
    region_b.region = "Ashanti"
    group_b.regions = [region_b]

    quota_a = MagicMock()
    quota_a.group_id = group_a_id
    quota_a.examiner_type = None
    quota_a.quota_count = 40

    quota_b = MagicMock()
    quota_b.group_id = group_b_id
    quota_b.examiner_type = None
    quota_b.quota_count = 105

    with (
        patch(
            "app.services.examiner_regional_quota.list_quotas_for_subject",
            new_callable=AsyncMock,
            return_value=[quota_a, quota_b],
        ),
        patch(
            "app.services.examiner_regional_quota.count_roster_distribution",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.services.examiner_regional_quota.get_quota_settings_for_subject",
            new_callable=AsyncMock,
            return_value=MagicMock(total_quota=145, male_quota=None, female_quota=None),
        ),
        patch(
            "app.services.examiner_regional_quota.count_gender_distribution",
            new_callable=AsyncMock,
            return_value=MagicMock(male=0, female=0),
        ),
    ):
        groups_result = MagicMock()
        groups_result.scalars.return_value.all.return_value = [group_b, group_a]
        session.execute = AsyncMock(return_value=groups_result)

        response = await build_subject_quota_status_response(session, examination_id=1, subject_id=10)

    assert response.total_quota == 145
    group_caps = {
        row.group_id: row.quota
        for row in response.summary
        if row.examiner_type is None
    }
    assert group_caps[group_a_id] == 40
    assert group_caps[group_b_id] == 105
