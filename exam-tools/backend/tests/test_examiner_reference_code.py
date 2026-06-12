"""Tests for examiner reference code assignment and region groups."""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import Examiner, ExaminerType, Region
from fastapi import HTTPException

from app.schemas.examination_examiner_region_group import ExaminerReferenceCodesRegenerateRequest
from app.services.examiner_reference_code import (
    REGION_NOT_MAPPED_MESSAGE,
    ReferenceCodeActionResult,
    ReferenceCodeStats,
    assign_reference_code,
    assign_reference_code_to_examiner,
    backfill_reference_codes_for_examination,
    regenerate_reference_codes_for_examination,
    role_short_code,
    subject_reference_prefix,
    validate_code_prefix,
    validate_region_group_payload,
)


def test_role_short_codes() -> None:
    assert role_short_code(ExaminerType.CHIEF) == "CE"
    assert role_short_code(ExaminerType.ASSISTANT_CHIEF) == "ACE"
    assert role_short_code(ExaminerType.ASSISTANT) == "AE"
    assert role_short_code(ExaminerType.TEAM_LEADER) == "TL"


def test_subject_reference_prefix_uses_original_code() -> None:
    assert subject_reference_prefix(original_code="MATH301", code="301") == "MATH301"
    assert subject_reference_prefix(original_code=None, code="ENG302") == "ENG302"
    assert subject_reference_prefix(original_code="phy", code="401") == "PHY"


def test_validate_code_prefix() -> None:
    assert validate_code_prefix("n") == "N"
    assert validate_code_prefix("st") == "ST"
    with pytest.raises(ValueError, match="1–2 uppercase"):
        validate_code_prefix("abc")


def test_validate_region_group_payload_requires_all_regions() -> None:
    with pytest.raises(ValueError, match="Unassigned regions"):
        validate_region_group_payload(
            [
                {
                    "name": "North",
                    "code_prefix": "N",
                    "regions": ["Northern"],
                }
            ]
        )


def test_validate_region_group_payload_rejects_duplicate_region() -> None:
    groups = [
        {"name": "A", "code_prefix": "A", "regions": ["Ashanti", "Bono"]},
        {"name": "B", "code_prefix": "B", "regions": ["Ashanti"]},
    ]
    with pytest.raises(ValueError, match="more than one group"):
        validate_region_group_payload(groups)


def test_validate_region_group_payload_rejects_duplicate_prefix() -> None:
    regions = [r.value for r in Region]
    half = len(regions) // 2
    groups = [
        {"name": "A", "code_prefix": "N", "regions": regions[:half]},
        {"name": "B", "code_prefix": "n", "regions": regions[half:]},
    ]
    with pytest.raises(ValueError, match="Duplicate code prefix"):
        validate_region_group_payload(groups)


@pytest.mark.asyncio
async def test_resolve_group_prefix_raises_for_unmapped_region() -> None:
    from app.services.examiner_reference_code import resolve_group_prefix

    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=result)

    with pytest.raises(ValueError, match=REGION_NOT_MAPPED_MESSAGE):
        await resolve_group_prefix(session, 1, Region.ASHANTI)


@pytest.mark.asyncio
async def test_assign_reference_code_increments_sequence() -> None:
    session = AsyncMock()

    subject = MagicMock()
    subject.original_code = "MATH301"
    subject.code = "301"
    session.get = AsyncMock(return_value=subject)

    prefix_result = MagicMock()
    prefix_result.scalar_one_or_none.return_value = "N"

    existing_codes = MagicMock()
    existing_codes.scalars.return_value.all.return_value = ["MATH301-NAE1", "MATH301-NAE3"]

    conflict_result = MagicMock()
    conflict_result.scalar_one_or_none.return_value = None

    session.execute = AsyncMock(side_effect=[prefix_result, existing_codes, conflict_result])

    code = await assign_reference_code(session, 1, Region.NORTHERN, ExaminerType.ASSISTANT, 10)
    assert code == "MATH301-NAE4"


@pytest.mark.asyncio
async def test_assign_reference_code_to_examiner_skips_when_set() -> None:
    session = AsyncMock()
    examiner = MagicMock(spec=Examiner)
    examiner.reference_code = "NAE1"
    examiner.examination_id = 1

    code = await assign_reference_code_to_examiner(session, examiner)
    assert code == "NAE1"
    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_accept_invitation_assigns_reference_code() -> None:
    from app.models import ExaminerInvitation, ExaminerInvitationStatus
    from app.services.examiner_invitation import accept_examiner_invitation

    session = AsyncMock()
    inv = MagicMock(spec=ExaminerInvitation)
    inv.status = ExaminerInvitationStatus.PENDING
    inv.response_deadline = datetime.utcnow() + timedelta(days=3)
    inv.token_expires_at = datetime.utcnow() - timedelta(days=1)
    inv.examination_id = 1
    inv.msisdn = "233551234567"
    inv.name = "Jane"
    inv.examiner_type = ExaminerType.ASSISTANT
    inv.region = Region.GREATER_ACCRA
    inv.phone_number = "0551234567"
    inv.subject_id = 10
    inv.examiner_id = None

    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=existing_result)
    session.add = MagicMock()

    async def _flush() -> None:
        for call in session.add.call_args_list:
            obj = call.args[0]
            if hasattr(obj, "reference_code"):
                continue
            if not hasattr(obj, "id") or obj.id is None:
                obj.id = uuid4()

    session.flush = AsyncMock(side_effect=_flush)

    async def _assign_code(_session: AsyncMock, examiner: Examiner) -> str:
        examiner.reference_code = "SAE1"
        return "SAE1"

    with (
        patch(
            "app.services.examiner_invitation.would_exceed_quota",
            new_callable=AsyncMock,
            return_value=MagicMock(exceeded=False),
        ),
        patch("app.services.examiner_invitation.sync_examiner_subjects", new_callable=AsyncMock),
        patch("app.services.examiner_invitation.sync_default_cohort_members", new_callable=AsyncMock),
        patch(
            "app.services.examiner_invitation.assign_reference_code_to_examiner",
            side_effect=_assign_code,
        ),
    ):
        result = await accept_examiner_invitation(session, inv)

    assert result.outcome == "accepted"
    assert result.examiner is not None
    assert result.examiner.reference_code == "SAE1"


@pytest.mark.asyncio
async def test_patch_region_leaves_reference_code_unchanged() -> None:
    """PATCH must not reassign reference_code — verified via immutability in assign helper."""
    session = AsyncMock()
    examiner = MagicMock(spec=Examiner)
    examiner.reference_code = "NAE1"
    examiner.examination_id = 1
    examiner.region = Region.NORTHERN
    examiner.examiner_type = ExaminerType.ASSISTANT

    examiner.region = Region.GREATER_ACCRA
    examiner.examiner_type = ExaminerType.TEAM_LEADER

    code = await assign_reference_code_to_examiner(session, examiner)
    assert code == "NAE1"
    assert examiner.reference_code == "NAE1"


@pytest.mark.asyncio
async def test_backfill_raises_when_regions_incomplete() -> None:
    session = AsyncMock()
    with (
        patch(
            "app.services.examiner_reference_code.ensure_default_region_groups",
            new_callable=AsyncMock,
            return_value=False,
        ),
        patch(
            "app.services.examiner_reference_code.regions_fully_mapped",
            new_callable=AsyncMock,
            return_value=False,
        ),
    ):
        with pytest.raises(ValueError, match=REGION_NOT_MAPPED_MESSAGE):
            await backfill_reference_codes_for_examination(session, 1)


@pytest.mark.asyncio
async def test_backfill_only_assigns_missing_codes() -> None:
    session = AsyncMock()
    missing = MagicMock(spec=Examiner)
    missing.reference_code = None

    with (
        patch(
            "app.services.examiner_reference_code.ensure_default_region_groups",
            new_callable=AsyncMock,
            return_value=False,
        ),
        patch(
            "app.services.examiner_reference_code.regions_fully_mapped",
            new_callable=AsyncMock,
            return_value=True,
        ),
        patch(
            "app.services.examiner_reference_code.reference_code_stats",
            new_callable=AsyncMock,
            return_value=ReferenceCodeStats(roster_total=2, with_code_count=1, missing_code_count=1),
        ),
        patch(
            "app.services.examiner_reference_code._assign_codes_to_examiners",
            new_callable=AsyncMock,
            return_value=(1, 0),
        ) as mock_assign,
    ):
        execute_result = MagicMock()
        execute_result.scalars.return_value.all.return_value = [missing]
        session.execute = AsyncMock(return_value=execute_result)

        result = await backfill_reference_codes_for_examination(session, 1)

    mock_assign.assert_awaited_once_with(session, [missing])
    assert result.assigned_count == 1
    assert result.skipped_count == 0
    assert result.roster_total == 2


@pytest.mark.asyncio
async def test_regenerate_clears_codes_before_reassigning() -> None:
    session = AsyncMock()
    ex1 = MagicMock(spec=Examiner)
    ex1.reference_code = "NAE1"
    ex2 = MagicMock(spec=Examiner)
    ex2.reference_code = "SAE9"

    with (
        patch(
            "app.services.examiner_reference_code.regions_fully_mapped",
            new_callable=AsyncMock,
            return_value=True,
        ),
        patch(
            "app.services.examiner_reference_code.reference_code_stats",
            new_callable=AsyncMock,
            return_value=ReferenceCodeStats(roster_total=2, with_code_count=2, missing_code_count=0),
        ),
        patch(
            "app.services.examiner_reference_code._ordered_examiners_for_examination",
            new_callable=AsyncMock,
            return_value=[ex1, ex2],
        ),
        patch(
            "app.services.examiner_reference_code._assign_codes_to_examiners",
            new_callable=AsyncMock,
            return_value=(2, 0),
        ) as mock_assign,
    ):
        result = await regenerate_reference_codes_for_examination(session, 1)

    assert ex1.reference_code is None
    assert ex2.reference_code is None
    session.flush.assert_awaited_once()
    mock_assign.assert_awaited_once_with(session, [ex1, ex2])
    assert result == ReferenceCodeActionResult(assigned_count=2, skipped_count=0, roster_total=2)


@pytest.mark.asyncio
async def test_regenerate_raises_when_regions_incomplete() -> None:
    session = AsyncMock()
    with patch(
        "app.services.examiner_reference_code.regions_fully_mapped",
        new_callable=AsyncMock,
        return_value=False,
    ):
        with pytest.raises(ValueError, match=REGION_NOT_MAPPED_MESSAGE):
            await regenerate_reference_codes_for_examination(session, 1)


@pytest.mark.asyncio
async def test_regenerate_endpoint_requires_confirm() -> None:
    from app.routers.admin_examiner_region_groups import regenerate_examination_examiner_reference_codes

    session = AsyncMock()
    user = MagicMock()
    body = ExaminerReferenceCodesRegenerateRequest(confirm=False)

    with pytest.raises(HTTPException) as exc_info:
        await regenerate_examination_examiner_reference_codes(1, body, session, user)

    assert exc_info.value.status_code == 400
    assert "confirm" in str(exc_info.value.detail).lower()
