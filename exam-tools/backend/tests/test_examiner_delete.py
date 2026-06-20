"""Tests for examiner roster delete preview and cleanup."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import Examiner, UserRole
from app.routers.examiners import delete_examiner, get_examiner_delete_preview
from app.schemas.examiner_delete import (
    ExaminerAllocationCampaignItem,
    ExaminerDeleteImpactResponse,
    ExaminerEnvelopeAssignmentItem,
    ExaminerManualAllocationItem,
)
from app.services.examiner_delete import build_examiner_delete_impact, delete_examiner_with_cleanup


def _examiner_stub(*, exam_id: int = 1, name: str = "Jane Doe") -> Examiner:
    ex = MagicMock(spec=Examiner)
    ex.id = uuid4()
    ex.examination_id = exam_id
    ex.name = name
    subj = MagicMock()
    subj.subject_id = 10
    ex.subjects = [subj]
    return ex


@pytest.mark.asyncio
async def test_build_examiner_delete_impact_manual_only() -> None:
    examiner = _examiner_stub()
    session = AsyncMock()

    manual_row = MagicMock()
    manual_row.paper_number = 1
    manual_row.script_count = 25
    subject = MagicMock()
    subject.code = "MATH301"
    subject.name = "Mathematics"
    subject.original_code = "MATH301"

    manual_result = MagicMock()
    manual_result.all.return_value = [(manual_row, subject)]

    alloc_result = MagicMock()
    alloc_result.scalars.return_value.all.return_value = []

    member_result = MagicMock()
    member_result.all.return_value = []

    session.execute = AsyncMock(side_effect=[manual_result, alloc_result, member_result])

    impact = await build_examiner_delete_impact(session, 1, examiner)

    assert impact.requires_confirmation is True
    assert impact.total_manual_scripts == 25
    assert len(impact.manual_allocations) == 1
    assert impact.manual_allocations[0].subject_code == "MATH301"
    assert impact.total_envelopes == 0


@pytest.mark.asyncio
async def test_build_examiner_delete_impact_no_allocations() -> None:
    examiner = _examiner_stub()
    session = AsyncMock()

    manual_result = MagicMock()
    manual_result.all.return_value = []
    alloc_result = MagicMock()
    alloc_result.scalars.return_value.all.return_value = []
    member_result = MagicMock()
    member_result.all.return_value = []

    session.execute = AsyncMock(side_effect=[manual_result, alloc_result, member_result])

    impact = await build_examiner_delete_impact(session, 1, examiner)

    assert impact.requires_confirmation is False
    assert impact.manual_allocations == []
    assert impact.envelope_assignments == []


@pytest.mark.asyncio
async def test_delete_examiner_with_cleanup_executes_deletes() -> None:
    examiner = _examiner_stub()
    session = AsyncMock()
    inv_lookup = MagicMock()
    inv_lookup.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(side_effect=[inv_lookup, MagicMock(), MagicMock(), MagicMock()])
    session.delete = AsyncMock()
    session.flush = AsyncMock()

    with patch(
        "app.services.examiner_delete.sync_subject_cohort_memberships",
        new_callable=AsyncMock,
    ) as sync_mock:
        await delete_examiner_with_cleanup(session, 1, examiner)

    assert session.execute.await_count == 4
    session.delete.assert_awaited_once_with(examiner)
    assert session.flush.await_count == 1
    sync_mock.assert_awaited_once_with(session, examination_id=1, subject_id=10)


@pytest.mark.asyncio
async def test_delete_examiner_with_cleanup_deletes_linked_invitation() -> None:
    examiner = _examiner_stub()
    invitation = MagicMock()
    session = AsyncMock()

    inv_result = MagicMock()
    inv_result.scalar_one_or_none.return_value = invitation
    session.execute = AsyncMock(side_effect=[inv_result, MagicMock(), MagicMock(), MagicMock()])
    session.delete = AsyncMock()
    session.flush = AsyncMock()

    with patch(
        "app.services.examiner_delete.sync_subject_cohort_memberships",
        new_callable=AsyncMock,
    ):
        await delete_examiner_with_cleanup(session, 1, examiner)

    assert session.delete.await_count == 2
    session.delete.assert_any_await(examiner)
    session.delete.assert_any_await(invitation)
    assert session.flush.await_count == 2


@pytest.mark.asyncio
async def test_get_examiner_delete_preview_returns_impact() -> None:
    examiner = _examiner_stub()
    user = MagicMock(role=UserRole.SUPER_ADMIN)
    session = AsyncMock()
    impact = ExaminerDeleteImpactResponse(
        examiner_id=examiner.id,
        examiner_name=examiner.name,
        manual_allocations=[
            ExaminerManualAllocationItem(
                subject_code="MATH301",
                subject_name="Mathematics",
                paper_number=1,
                script_count=10,
            )
        ],
        requires_confirmation=True,
        total_manual_scripts=10,
    )

    with (
        patch(
            "app.routers.examiners.load_examiner_for_delete",
            new_callable=AsyncMock,
            return_value=examiner,
        ),
        patch(
            "app.routers.examiners._assert_examiner_accessible",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.examiners.build_examiner_delete_impact",
            new_callable=AsyncMock,
            return_value=impact,
        ),
    ):
        result = await get_examiner_delete_preview(session, user, 1, examiner.id)

    assert result.requires_confirmation is True
    assert result.total_manual_scripts == 10


@pytest.mark.asyncio
async def test_delete_examiner_blocks_without_confirm_when_allocations_exist() -> None:
    examiner = _examiner_stub()
    user = MagicMock(role=UserRole.SUPER_ADMIN)
    session = AsyncMock()
    impact = ExaminerDeleteImpactResponse(
        examiner_id=examiner.id,
        examiner_name=examiner.name,
        envelope_assignments=[
            ExaminerEnvelopeAssignmentItem(
                allocation_id=uuid4(),
                allocation_name="Core P1",
                subject_code="MATH301",
                subject_name="Mathematics",
                paper_number=1,
                school_name="Accra High",
                envelope_number=3,
                booklet_count=12,
                run_id=uuid4(),
            )
        ],
        requires_confirmation=True,
        total_envelopes=1,
    )

    with (
        patch(
            "app.routers.examiners.load_examiner_for_delete",
            new_callable=AsyncMock,
            return_value=examiner,
        ),
        patch(
            "app.routers.examiners._assert_examiner_accessible",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.examiners.build_examiner_delete_impact",
            new_callable=AsyncMock,
            return_value=impact,
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await delete_examiner(session, user, 1, examiner.id, confirm_remove_allocations=False)

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_delete_examiner_with_confirm_runs_cleanup() -> None:
    examiner = _examiner_stub()
    user = MagicMock(role=UserRole.SUPER_ADMIN)
    session = AsyncMock()
    impact = ExaminerDeleteImpactResponse(
        examiner_id=examiner.id,
        examiner_name=examiner.name,
        allocation_campaigns=[
            ExaminerAllocationCampaignItem(
                allocation_id=uuid4(),
                allocation_name="Core P1",
                subject_code="MATH301",
                subject_name="Mathematics",
                paper_number=1,
            )
        ],
        requires_confirmation=True,
    )

    with (
        patch(
            "app.routers.examiners.load_examiner_for_delete",
            new_callable=AsyncMock,
            return_value=examiner,
        ),
        patch(
            "app.routers.examiners._assert_examiner_accessible",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.examiners.build_examiner_delete_impact",
            new_callable=AsyncMock,
            return_value=impact,
        ),
        patch(
            "app.routers.examiners.delete_examiner_with_cleanup",
            new_callable=AsyncMock,
        ) as cleanup_mock,
    ):
        await delete_examiner(session, user, 1, examiner.id, confirm_remove_allocations=True)

    cleanup_mock.assert_awaited_once_with(session, 1, examiner)
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_examiner_without_allocations_skips_confirm() -> None:
    examiner = _examiner_stub()
    user = MagicMock(role=UserRole.SUPER_ADMIN)
    session = AsyncMock()
    impact = ExaminerDeleteImpactResponse(
        examiner_id=examiner.id,
        examiner_name=examiner.name,
        requires_confirmation=False,
    )

    with (
        patch(
            "app.routers.examiners.load_examiner_for_delete",
            new_callable=AsyncMock,
            return_value=examiner,
        ),
        patch(
            "app.routers.examiners._assert_examiner_accessible",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.examiners.build_examiner_delete_impact",
            new_callable=AsyncMock,
            return_value=impact,
        ),
        patch(
            "app.routers.examiners.delete_examiner_with_cleanup",
            new_callable=AsyncMock,
        ) as cleanup_mock,
    ):
        await delete_examiner(session, user, 1, examiner.id, confirm_remove_allocations=False)

    cleanup_mock.assert_awaited_once()
