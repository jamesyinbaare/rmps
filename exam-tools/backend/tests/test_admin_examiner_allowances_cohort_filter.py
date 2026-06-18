"""Tests for cohort filter on admin examiner allowances and admin cohort list."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import Examination, UserRole
from app.routers.admin_examiner_allowances import (
    _resolve_group_filter,
    admin_export_examiner_allowances,
    admin_list_examiner_allowances,
)
from app.routers.admin_subject_marking_groups import admin_list_subject_marking_groups
from tests.test_examiner_allowance_bog_export import _row as allowance_row


@pytest.mark.asyncio
async def test_resolve_group_filter_none_when_group_id_omitted() -> None:
    session = AsyncMock()
    result = await _resolve_group_filter(session, examination_id=1, subject_id=10, group_id=None)
    assert result is None


@pytest.mark.asyncio
async def test_resolve_group_filter_not_found_for_subject() -> None:
    group_id = uuid4()
    session = AsyncMock()
    with patch(
        "app.routers.admin_examiner_allowances.load_group",
        new_callable=AsyncMock,
        return_value=None,
    ):
        with pytest.raises(HTTPException) as exc:
            await _resolve_group_filter(session, examination_id=1, subject_id=10, group_id=group_id)
    assert exc.value.status_code == 404
    assert exc.value.detail == "Cohort not found"


@pytest.mark.asyncio
async def test_resolve_group_filter_valid_with_subject() -> None:
    group_id = uuid4()
    session = AsyncMock()
    with patch(
        "app.routers.admin_examiner_allowances.load_group",
        new_callable=AsyncMock,
        return_value=MagicMock(),
    ):
        result = await _resolve_group_filter(session, examination_id=1, subject_id=10, group_id=group_id)
    assert result == group_id


@pytest.mark.asyncio
async def test_resolve_group_filter_not_found_without_subject() -> None:
    group_id = uuid4()
    session = AsyncMock()
    session.get = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as exc:
        await _resolve_group_filter(session, examination_id=1, subject_id=None, group_id=group_id)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_admin_list_subject_marking_groups_returns_cohorts() -> None:
    group_id = uuid4()
    now = datetime.utcnow()
    session = AsyncMock()
    session.get = AsyncMock(return_value=Examination(id=1))
    rows = [
        {
            "id": group_id,
            "examination_id": 1,
            "subject_id": 209,
            "name": "Northern",
            "is_default": False,
            "examiner_ids": [uuid4()],
            "member_regions": ["greater_accra"],
            "source_regions": [],
            "source_roles": [],
            "coordination_start_date": None,
            "coordination_start_time": None,
            "coordination_end_date": None,
            "coordination_end_time": None,
            "coordination_venue": None,
            "marking_start_date": None,
            "marking_end_date": None,
            "marked_script_submission_deadline": None,
            "created_at": now,
            "updated_at": now,
        }
    ]
    with patch(
        "app.routers.admin_subject_marking_groups.list_groups",
        new_callable=AsyncMock,
        return_value=rows,
    ):
        result = await admin_list_subject_marking_groups(
            examination_id=1,
            session=session,
            _admin=MagicMock(role=UserRole.FINANCE_OFFICER),
            subject_id=209,
        )
    assert len(result) == 1
    assert result[0].id == group_id
    assert result[0].name == "Northern"


@pytest.mark.asyncio
async def test_admin_list_examiner_allowances_applies_group_filter() -> None:
    group_id = uuid4()
    examiner_id = uuid4()
    session = AsyncMock()
    exam = Examination(id=1, year=2026, exam_series="MAY/JUNE", exam_type="C2")
    session.get = AsyncMock(return_value=exam)

    examiner = MagicMock()
    examiner.id = examiner_id
    examiner.name = "Ada Lovelace"
    examiner.subjects = []
    examiner.bank_account = None
    examiner.examiner_type = MagicMock(value="assistant")
    examiner.region = MagicMock(value="greater_accra")
    examiner.reference_code = "REF1"
    examiner.phone_number = "055"
    examiner.created_at = datetime.utcnow()
    examiner.updated_at = datetime.utcnow()

    count_result = MagicMock()
    count_result.scalar = MagicMock(return_value=1)
    list_result = MagicMock()
    list_result.scalars.return_value.all.return_value = [examiner]

    session.scalar = AsyncMock(return_value=1)
    session.execute = AsyncMock(side_effect=[list_result])

    with (
        patch(
            "app.routers.admin_examiner_allowances.load_group",
            new_callable=AsyncMock,
            return_value=MagicMock(),
        ),
        patch(
            "app.routers.admin_examiner_allowances.load_role_allowance_rates_map",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.routers.admin_examiner_allowances.load_marking_rates_map",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.routers.admin_examiner_allowances.load_travel_rates_map",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.routers.admin_examiner_allowances.load_travel_zones_map",
            new_callable=AsyncMock,
            return_value=({}, {}),
        ),
        patch(
            "app.routers.admin_examiner_allowances.load_travel_role_factors_map",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.routers.admin_examiner_allowances.load_effective_allocated_booklets_map",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.routers.admin_examiner_allowances.load_subject_source_modes",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.routers.admin_examiner_allowances.examiners_to_admin_rows",
            return_value=[allowance_row(name="Ada Lovelace")],
        ),
    ):
        response = await admin_list_examiner_allowances(
            session=session,
            _admin=MagicMock(),
            examination_id=1,
            role=None,
            region=None,
            subject_id=209,
            group_id=group_id,
            search=None,
            skip=0,
            limit=50,
        )

    assert response.total == 1
    assert len(response.items) == 1


@pytest.mark.asyncio
async def test_admin_export_examiner_allowances_rejects_unknown_cohort() -> None:
    group_id = uuid4()
    session = AsyncMock()
    session.get = AsyncMock(return_value=Examination(id=1, year=2026, exam_series="MAY/JUNE", exam_type="C2"))
    with patch(
        "app.routers.admin_examiner_allowances.load_group",
        new_callable=AsyncMock,
        return_value=None,
    ):
        with pytest.raises(HTTPException) as exc:
            await admin_export_examiner_allowances(
                session=session,
                _admin=MagicMock(),
                examination_id=1,
                role=None,
                region=None,
                subject_id=209,
                group_id=group_id,
                search=None,
            )
    assert exc.value.status_code == 404
