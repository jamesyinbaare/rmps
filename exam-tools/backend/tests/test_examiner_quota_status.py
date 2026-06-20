"""Router tests for read-only examiner quota status."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models import UserRole
from app.routers.examiner_quota_status import get_subject_examiner_quota_status


@pytest.mark.asyncio
async def test_quota_status_allowed_for_assigned_subject_officer() -> None:
    user = MagicMock(role=UserRole.SUBJECT_OFFICER)
    session = AsyncMock()

    expected = MagicMock()

    with (
        patch(
            "app.routers.examiner_quota_status._authorize_quota_status",
            new_callable=AsyncMock,
        ) as access_mock,
        patch(
            "app.routers.examiner_quota_status.build_subject_quota_status_response",
            new_callable=AsyncMock,
            return_value=expected,
        ) as build_mock,
    ):
        result = await get_subject_examiner_quota_status(
            examination_id=1,
            subject_id=10,
            session=session,
            user=user,
            projection="current",
        )

    access_mock.assert_awaited_once_with(session, user, 1, 10)
    build_mock.assert_awaited_once_with(session, examination_id=1, subject_id=10)
    assert result is expected


@pytest.mark.asyncio
async def test_quota_status_denies_unassigned_subject_officer() -> None:
    user = MagicMock(role=UserRole.SUBJECT_OFFICER)
    session = AsyncMock()

    with patch(
        "app.routers.examiner_quota_status._authorize_quota_status",
        new_callable=AsyncMock,
        side_effect=HTTPException(status_code=403, detail="Not assigned to this subject"),
    ):
        with pytest.raises(HTTPException) as exc:
            await get_subject_examiner_quota_status(
                examination_id=1,
                subject_id=99,
                session=session,
                user=user,
                projection="current",
            )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_quota_status_skips_scope_for_test_admin() -> None:
    user = MagicMock(role=UserRole.TEST_ADMIN_OFFICER)
    session = AsyncMock()

    expected = MagicMock()

    with (
        patch(
            "app.routers.examiner_quota_status._authorize_quota_status",
            new_callable=AsyncMock,
        ) as access_mock,
        patch(
            "app.routers.examiner_quota_status.build_subject_quota_status_response",
            new_callable=AsyncMock,
            return_value=expected,
        ),
    ):
        result = await get_subject_examiner_quota_status(
            examination_id=1,
            subject_id=10,
            session=session,
            user=user,
            projection="current",
        )

    access_mock.assert_awaited_once()
    assert result is expected


@pytest.mark.asyncio
async def test_quota_projection_pending_uses_projection_builder() -> None:
    user = MagicMock(role=UserRole.TEST_ADMIN_OFFICER)
    session = AsyncMock()
    expected = MagicMock()

    with (
        patch(
            "app.routers.examiner_quota_status._authorize_quota_status",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.examiner_quota_status.build_subject_quota_projection_response",
            new_callable=AsyncMock,
            return_value=expected,
        ) as projection_mock,
        patch(
            "app.routers.examiner_quota_status.build_subject_quota_status_response",
            new_callable=AsyncMock,
        ) as status_mock,
    ):
        result = await get_subject_examiner_quota_status(
            examination_id=1,
            subject_id=10,
            session=session,
            user=user,
            projection="pending",
        )

    projection_mock.assert_awaited_once_with(
        session,
        examination_id=1,
        subject_id=10,
        scenario="pending",
    )
    status_mock.assert_not_called()
    assert result is expected


@pytest.mark.asyncio
async def test_build_projection_counts_pending_invitations() -> None:
    from app.models import ExaminerInvitationStatus, ExaminerType, Region
    from app.services.examiner_regional_quota import (
        ProposedExaminerRow,
        build_subject_quota_projection_response,
    )

    session = AsyncMock()

    pending_row = ProposedExaminerRow(
        subject_id=10,
        examiner_type=ExaminerType.ASSISTANT,
        region=Region.GREATER_ACCRA,
        gender="Male",
    )

    with (
        patch(
            "app.services.examiner_regional_quota.count_invitations_for_subject",
            new_callable=AsyncMock,
            return_value={"pending": 2, "quota_waitlisted": 1},
        ),
        patch(
            "app.services.examiner_regional_quota.load_proposed_from_invitations",
            new_callable=AsyncMock,
            return_value=[pending_row, pending_row],
        ) as load_mock,
        patch(
            "app.services.examiner_regional_quota.assess_proposed_examiners",
            new_callable=AsyncMock,
            return_value={
                "valid": True,
                "violations": [],
                "row_errors": [],
                "summary_by_group": [],
                "summary_by_gender": [],
                "proposed_count": 2,
            },
        ),
        patch(
            "app.services.examiner_regional_quota.get_quota_settings_for_subject",
            new_callable=AsyncMock,
            return_value=MagicMock(total_quota=100, male_quota=None, female_quota=None),
        ),
        patch(
            "app.services.examiner_regional_quota.count_roster_distribution",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.services.examiner_regional_quota.list_quotas_for_subject",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "app.services.examiner_regional_quota.count_roster_by_region",
            new_callable=AsyncMock,
            return_value={},
        ),
    ):
        groups_result = MagicMock()
        groups_result.scalars.return_value.all.return_value = []
        session.execute = AsyncMock(return_value=groups_result)

        pending_result = await build_subject_quota_projection_response(
            session,
            examination_id=1,
            subject_id=10,
            scenario="pending",
        )
        waitlisted_result = await build_subject_quota_projection_response(
            session,
            examination_id=1,
            subject_id=10,
            scenario="pending_and_waitlisted",
        )

    load_mock.assert_any_call(
        session,
        examination_id=1,
        subject_id=10,
        statuses=[ExaminerInvitationStatus.PENDING],
    )
    load_mock.assert_any_call(
        session,
        examination_id=1,
        subject_id=10,
        statuses=[
            ExaminerInvitationStatus.PENDING,
            ExaminerInvitationStatus.QUOTA_WAITLISTED,
        ],
    )

    assert pending_result.proposed_count == 2
    assert pending_result.invitation_count == 2
    assert pending_result.invitation_breakdown.pending == 2
    assert pending_result.invitation_breakdown.quota_waitlisted == 0
    assert waitlisted_result.invitation_breakdown.quota_waitlisted == 1


@pytest.mark.asyncio
async def test_build_projection_subject_over_cap() -> None:
    from app.services.examiner_regional_quota import build_subject_quota_projection_response

    session = AsyncMock()

    with (
        patch(
            "app.services.examiner_regional_quota.count_invitations_for_subject",
            new_callable=AsyncMock,
            return_value={"pending": 5, "quota_waitlisted": 0},
        ),
        patch(
            "app.services.examiner_regional_quota.load_proposed_from_invitations",
            new_callable=AsyncMock,
            return_value=[MagicMock()] * 5,
        ),
        patch(
            "app.services.examiner_regional_quota.assess_proposed_examiners",
            new_callable=AsyncMock,
            return_value={
                "valid": True,
                "violations": [],
                "row_errors": [],
                "summary_by_group": [],
                "summary_by_gender": [],
                "proposed_count": 5,
            },
        ),
        patch(
            "app.services.examiner_regional_quota.get_quota_settings_for_subject",
            new_callable=AsyncMock,
            return_value=MagicMock(total_quota=3, male_quota=None, female_quota=None),
        ),
        patch(
            "app.services.examiner_regional_quota.count_roster_distribution",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.services.examiner_regional_quota.list_quotas_for_subject",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "app.services.examiner_regional_quota.count_roster_by_region",
            new_callable=AsyncMock,
            return_value={},
        ),
    ):
        groups_result = MagicMock()
        groups_result.scalars.return_value.all.return_value = []
        session.execute = AsyncMock(return_value=groups_result)

        result = await build_subject_quota_projection_response(
            session,
            examination_id=1,
            subject_id=10,
            scenario="pending",
        )

    assert result.roster_total == 0
    assert result.combined_roster_total == 5
    assert result.subject_over_cap is True
    assert result.valid is False
    assert any("Subject total exceeds quota" in v for v in result.violations)
