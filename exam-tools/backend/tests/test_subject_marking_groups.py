"""Tests for subject-scoped cohorts."""

from __future__ import annotations

from datetime import datetime, time
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import SubjectMarkingGroup, SubjectMarkingGroupMember
from app.services.subject_marking_group import (
    create_group,
    delete_group,
    get_examiner_marking_group,
    group_response,
    replace_group_members,
    update_group,
)


def test_group_response_shape() -> None:
    group_id = uuid4()
    examiner_id = uuid4()
    member = MagicMock()
    member.examiner_id = examiner_id
    examiner = MagicMock()
    examiner.region = MagicMock(value="greater_accra")
    member.examiner = examiner
    group = MagicMock(spec=SubjectMarkingGroup)
    group.id = group_id
    group.examination_id = 1
    group.subject_id = 10
    group.name = "Group A"
    group.members = [member]
    group.source_regions = []
    group.source_roles = []
    group.coordination_start_date = datetime(2026, 6, 15)
    group.coordination_start_time = time(9, 0)
    group.coordination_end_date = datetime(2026, 6, 15)
    group.coordination_end_time = time(12, 0)
    group.marking_start_date = datetime(2026, 6, 16)
    group.marking_end_date = datetime(2026, 6, 25)
    group.marked_script_submission_deadline = datetime(2026, 7, 1)
    group.created_at = datetime.utcnow()
    group.updated_at = datetime.utcnow()

    data = group_response(group)
    assert data["id"] == group_id
    assert data["examiner_ids"] == [examiner_id]
    assert data["member_regions"] == ["greater_accra"]
    assert data["source_regions"] == []
    assert data["source_roles"] == []
    assert data["coordination_start_date"] == datetime(2026, 6, 15)
    assert data["coordination_start_time"] == time(9, 0)
    assert data["marked_script_submission_deadline"] == datetime(2026, 7, 1)


@pytest.mark.asyncio
async def test_create_group_persists_dates() -> None:
    session = AsyncMock()
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()

    with patch("app.services.subject_marking_group.group_response") as mock_resp:
        mock_resp.return_value = {"id": uuid4()}
        await create_group(
            session,
            examination_id=1,
            subject_id=10,
            name="North cohort",
            coordination_start_date=datetime(2026, 6, 10),
            coordination_start_time=time(8, 30),
            coordination_end_date=datetime(2026, 6, 10),
            coordination_end_time=time(11, 0),
            marking_start_date=datetime(2026, 6, 11),
            marking_end_date=datetime(2026, 6, 20),
            marked_script_submission_deadline=datetime(2026, 6, 30),
        )

    added = session.add.call_args[0][0]
    assert added.name == "North cohort"
    assert added.coordination_start_date == datetime(2026, 6, 10)
    assert added.coordination_start_time == time(8, 30)
    assert added.marked_script_submission_deadline == datetime(2026, 6, 30)


@pytest.mark.asyncio
async def test_replace_group_members_rejects_examiner_not_on_subject() -> None:
    session = AsyncMock()
    group_id = uuid4()
    examiner_id = uuid4()
    group = MagicMock(spec=SubjectMarkingGroup)
    group.id = group_id
    group.members = []

    with patch(
        "app.services.subject_marking_group.load_group",
        new_callable=AsyncMock,
        return_value=group,
    ):
        empty = MagicMock()
        empty.scalars.return_value.all.return_value = []
        session.execute = AsyncMock(return_value=empty)

        with pytest.raises(HTTPException) as exc:
            await replace_group_members(
                session,
                examination_id=1,
                subject_id=10,
                group_id=group_id,
                source_regions=[],
                source_roles=[],
                examiner_ids=[examiner_id],
            )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_replace_group_members_adds_members() -> None:
    session = AsyncMock()
    group_id = uuid4()
    examiner_id = uuid4()
    group = MagicMock(spec=SubjectMarkingGroup)
    group.id = group_id
    group.is_default = False
    group.members = []

    refreshed = MagicMock(spec=SubjectMarkingGroup)
    refreshed.is_default = False

    with (
        patch(
            "app.services.subject_marking_group.load_group",
            new_callable=AsyncMock,
            side_effect=[group, refreshed],
        ),
        patch(
            "app.services.subject_marking_group.group_response",
            return_value={"id": group_id, "examiner_ids": [examiner_id]},
        ),
    ):
        found = MagicMock()
        found.scalars.return_value.all.return_value = [examiner_id]
        session.execute = AsyncMock(return_value=found)
        session.commit = AsyncMock()

        data = await replace_group_members(
            session,
            examination_id=1,
            subject_id=10,
            group_id=group_id,
            source_regions=[],
            source_roles=[],
            examiner_ids=[examiner_id],
        )

    assert session.add.called
    added = session.add.call_args[0][0]
    assert isinstance(added, SubjectMarkingGroupMember)
    assert added.examiner_id == examiner_id
    assert added.subject_id == 10
    assert data["examiner_ids"] == [examiner_id]


@pytest.mark.asyncio
async def test_delete_group_not_found() -> None:
    session = AsyncMock()
    with patch(
        "app.services.subject_marking_group.load_group",
        new_callable=AsyncMock,
        return_value=None,
    ):
        with pytest.raises(HTTPException) as exc:
            await delete_group(session, examination_id=1, subject_id=10, group_id=uuid4())
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_update_group_clears_coordination_start_date() -> None:
    session = AsyncMock()
    group_id = uuid4()
    group = MagicMock(spec=SubjectMarkingGroup)
    group.coordination_start_date = datetime(2026, 6, 1)
    group.coordination_start_time = None
    group.coordination_end_date = None
    group.coordination_end_time = None
    group.members = []

    with (
        patch(
            "app.services.subject_marking_group.load_group",
            new_callable=AsyncMock,
            return_value=group,
        ),
        patch(
            "app.services.subject_marking_group.group_response",
            return_value={"id": group_id},
        ),
    ):
        session.commit = AsyncMock()
        session.refresh = AsyncMock()
        await update_group(
            session,
            examination_id=1,
            subject_id=10,
            group_id=group_id,
            name=None,
            coordination_start_date=None,
            coordination_start_time=None,
            coordination_end_date=None,
            coordination_end_time=None,
            marking_start_date=None,
            marking_end_date=None,
            marked_script_submission_deadline=None,
            update_coordination_start_date=True,
            update_coordination_start_time=False,
            update_coordination_end_date=False,
            update_coordination_end_time=False,
            update_marking_start_date=False,
            update_marking_end_date=False,
            update_submission_deadline=False,
        )
    assert group.coordination_start_date is None


@pytest.mark.asyncio
async def test_get_examiner_marking_group_returns_none_when_unassigned() -> None:
    session = AsyncMock()
    with patch(
        "app.services.subject_marking_group.get_examiner_marking_groups",
        new_callable=AsyncMock,
        return_value=[],
    ):
        result = await get_examiner_marking_group(
            session,
            examination_id=1,
            subject_id=10,
            examiner_id=uuid4(),
        )
    assert result is None


@pytest.mark.asyncio
async def test_get_examiner_marking_group_prefers_named_over_default() -> None:
    session = AsyncMock()
    default_id = uuid4()
    named_id = uuid4()
    with patch(
        "app.services.subject_marking_group.get_examiner_marking_groups",
        new_callable=AsyncMock,
        return_value=[
            {
                "id": default_id,
                "name": "All examiners",
                "is_default": True,
                "coordination_start_date": None,
                "coordination_start_time": None,
                "coordination_end_date": None,
                "coordination_end_time": None,
                "marking_start_date": None,
                "marking_end_date": None,
                "marked_script_submission_deadline": None,
            },
            {
                "id": named_id,
                "name": "Northern",
                "is_default": False,
                "coordination_start_date": datetime(2026, 6, 15),
                "coordination_start_time": time(9, 0),
                "coordination_end_date": datetime(2026, 6, 15),
                "coordination_end_time": time(12, 0),
                "marking_start_date": None,
                "marking_end_date": None,
                "marked_script_submission_deadline": None,
            },
        ],
    ):
        result = await get_examiner_marking_group(
            session,
            examination_id=1,
            subject_id=10,
            examiner_id=uuid4(),
        )
    assert result is not None
    assert result["marking_group_id"] == named_id
    assert result["marking_group_name"] == "Northern"
