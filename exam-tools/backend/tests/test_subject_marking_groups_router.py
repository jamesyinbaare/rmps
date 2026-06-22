"""Router tests for default cohort RBAC on subject marking groups."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.models import UserRole
from app.routers.subject_marking_groups import patch_subject_marking_group
from app.schemas.subject_marking_groups import SubjectMarkingGroupUpdate


def _group_row(*, group_id: UUID, is_default: bool) -> dict:
    now = datetime.utcnow()
    return {
        "id": group_id,
        "examination_id": 1,
        "subject_id": 10,
        "name": "All examiners" if is_default else "North",
        "is_default": is_default,
        "examiner_ids": [],
        "source_regions": [],
        "source_roles": [],
        "coordination_start_date": None,
        "coordination_start_time": None,
        "coordination_end_date": None,
        "coordination_end_time": None,
        "marking_start_date": None,
        "marking_end_date": None,
        "marked_script_submission_deadline": None,
        "scripts_allocation_release_enabled": False,
        "scripts_allocation_release_at": None,
        "created_at": now,
        "updated_at": now,
    }


@pytest.mark.asyncio
async def test_patch_default_cohort_forbidden_for_subject_officer() -> None:
    group_id = uuid4()
    user = MagicMock(role=UserRole.SUBJECT_OFFICER)
    session = AsyncMock()
    group = MagicMock()
    group.is_default = True

    with (
        patch(
            "app.routers.subject_marking_groups.assert_subject_officer_access",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.subject_marking_groups.load_group",
            new_callable=AsyncMock,
            return_value=group,
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await patch_subject_marking_group(
                examination_id=1,
                group_id=group_id,
                body=SubjectMarkingGroupUpdate(coordination_start_date=None),
                session=session,
                user=user,
                subject_id=10,
            )

    assert exc.value.status_code == 403
    assert "default cohort" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_patch_default_cohort_allowed_for_super_admin() -> None:
    group_id = uuid4()
    user = MagicMock(role=UserRole.SUPER_ADMIN)
    session = AsyncMock()
    group = MagicMock()
    group.is_default = True

    with (
        patch(
            "app.routers.subject_marking_groups.assert_subject_officer_access",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.subject_marking_groups.load_group",
            new_callable=AsyncMock,
            return_value=group,
        ),
        patch(
            "app.routers.subject_marking_groups.update_group",
            new_callable=AsyncMock,
            return_value=_group_row(group_id=group_id, is_default=True),
        ),
    ):
        result = await patch_subject_marking_group(
            examination_id=1,
            group_id=group_id,
            body=SubjectMarkingGroupUpdate(coordination_start_date=None),
            session=session,
            user=user,
            subject_id=10,
        )

    assert result.id == group_id


@pytest.mark.asyncio
async def test_patch_release_fields_forbidden_for_subject_officer() -> None:
    group_id = uuid4()
    user = MagicMock(role=UserRole.SUBJECT_OFFICER)
    session = AsyncMock()
    group = MagicMock()
    group.is_default = False

    with (
        patch(
            "app.routers.subject_marking_groups.assert_subject_officer_access",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.subject_marking_groups.load_group",
            new_callable=AsyncMock,
            return_value=group,
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await patch_subject_marking_group(
                examination_id=1,
                group_id=group_id,
                body=SubjectMarkingGroupUpdate(scripts_allocation_release_enabled=True),
                session=session,
                user=user,
                subject_id=10,
            )

    assert exc.value.status_code == 403
    assert "scripts allocation release" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_patch_named_cohort_allowed_for_subject_officer() -> None:
    group_id = uuid4()
    user = MagicMock(role=UserRole.SUBJECT_OFFICER)
    session = AsyncMock()
    group = MagicMock()
    group.is_default = False

    with (
        patch(
            "app.routers.subject_marking_groups.assert_subject_officer_access",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.subject_marking_groups.load_group",
            new_callable=AsyncMock,
            return_value=group,
        ),
        patch(
            "app.routers.subject_marking_groups.update_group",
            new_callable=AsyncMock,
            return_value=_group_row(group_id=group_id, is_default=False),
        ),
    ):
        result = await patch_subject_marking_group(
            examination_id=1,
            group_id=group_id,
            body=SubjectMarkingGroupUpdate(name="North"),
            session=session,
            user=user,
            subject_id=10,
        )

    assert result.id == group_id


@pytest.mark.asyncio
async def test_patch_release_fields_allowed_for_super_admin() -> None:
    group_id = uuid4()
    user = MagicMock(role=UserRole.SUPER_ADMIN)
    session = AsyncMock()
    group = MagicMock()
    group.is_default = False

    with (
        patch(
            "app.routers.subject_marking_groups.assert_subject_officer_access",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.subject_marking_groups.load_group",
            new_callable=AsyncMock,
            return_value=group,
        ),
        patch(
            "app.routers.subject_marking_groups.update_group",
            new_callable=AsyncMock,
            return_value=_group_row(group_id=group_id, is_default=False),
        ),
    ):
        result = await patch_subject_marking_group(
            examination_id=1,
            group_id=group_id,
            body=SubjectMarkingGroupUpdate(
                scripts_allocation_release_enabled=True,
                scripts_allocation_release_at=None,
            ),
            session=session,
            user=user,
            subject_id=10,
        )

    assert result.id == group_id
