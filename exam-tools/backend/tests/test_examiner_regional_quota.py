"""Tests for regional examiner quotas and attendance."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import (
    ExaminerInvitationStatus,
    ExaminerType,
    Region,
)
from app.services.examiner_regional_quota import (
    GenderDistribution,
    ProposedExaminerRow,
    QuotaExceedResult,
    SubjectQuotaSettings,
    _quota_share_percents,
    assess_proposed_examiners,
    would_exceed_quota,
)


def test_quota_share_percents_sums_to_one_hundred() -> None:
    percents = _quota_share_percents(["a", "b", "c"], [40, 35, 25])
    assert percents == {"a": 40.0, "b": 35.0, "c": 25.0}
    assert sum(percents.values()) == 100.0


@pytest.mark.asyncio
async def test_assess_omits_unconfigured_caps_and_includes_quota_percent() -> None:
    session = AsyncMock()
    group_id = uuid4()
    quota_total = MagicMock()
    quota_total.group_id = group_id
    quota_total.examiner_type = None
    quota_total.quota_count = 60
    quota_role = MagicMock()
    quota_role.group_id = group_id
    quota_role.examiner_type = ExaminerType.ASSISTANT
    quota_role.quota_count = 30

    group = MagicMock()
    group.id = group_id
    group.name = "South"

    with (
        patch(
            "app.services.examiner_regional_quota.list_quotas_for_subject",
            new_callable=AsyncMock,
            return_value=[quota_total, quota_role],
        ),
        patch(
            "app.services.examiner_regional_quota.count_roster_distribution",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.services.examiner_regional_quota._load_region_to_group",
            new_callable=AsyncMock,
            return_value={Region.GREATER_ACCRA: (group_id, "South")},
        ),
        patch(
            "app.services.examiner_regional_quota.get_quota_settings_for_subject",
            new_callable=AsyncMock,
            return_value=SubjectQuotaSettings(total_quota=100, male_quota=70, female_quota=30),
        ),
        patch(
            "app.services.examiner_regional_quota.count_gender_distribution",
            new_callable=AsyncMock,
            return_value=GenderDistribution(male=0, female=0),
        ),
    ):
        groups_result = MagicMock()
        groups_result.scalars.return_value.all.return_value = [group]
        session.execute = AsyncMock(return_value=groups_result)

        result = await assess_proposed_examiners(
            session,
            examination_id=1,
            subject_id=10,
            proposed=[
                ProposedExaminerRow(
                    subject_id=10,
                    examiner_type=ExaminerType.ASSISTANT,
                    region=Region.GREATER_ACCRA,
                    gender="Male",
                )
            ],
        )

    assert len(result["summary_by_group"]) == 2
    group_rows = [r for r in result["summary_by_group"] if r["examiner_type"] is None]
    role_rows = [r for r in result["summary_by_group"] if r["examiner_type"] is not None]
    assert len(group_rows) == 1
    assert group_rows[0]["quota_percent"] == 100.0
    assert len(role_rows) == 1
    assert role_rows[0]["quota_percent"] == 100.0
    assert len(result["summary_by_gender"]) == 2
    assert sum(r["quota_percent"] for r in result["summary_by_gender"]) == 100.0
    assert all(r["quota"] is not None for r in result["summary_by_gender"])


@pytest.mark.asyncio
async def test_would_exceed_quota_no_quotas_configured() -> None:
    session = AsyncMock()
    with (
        patch(
            "app.services.examiner_regional_quota.list_quotas_for_subject",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "app.services.examiner_regional_quota.get_quota_settings_for_subject",
            new_callable=AsyncMock,
            return_value=SubjectQuotaSettings(),
        ),
    ):
        result = await would_exceed_quota(
            session,
            examination_id=1,
            subject_id=10,
            region=Region.GREATER_ACCRA,
            examiner_type=ExaminerType.ASSISTANT,
        )
    assert result.exceeded is False


@pytest.mark.asyncio
async def test_would_exceed_gender_quota_when_male_cap_full() -> None:
    session = AsyncMock()
    with (
        patch(
            "app.services.examiner_regional_quota.list_quotas_for_subject",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "app.services.examiner_regional_quota.get_quota_settings_for_subject",
            new_callable=AsyncMock,
            return_value=SubjectQuotaSettings(male_quota=2, female_quota=None),
        ),
        patch(
            "app.services.examiner_regional_quota.count_gender_distribution",
            new_callable=AsyncMock,
            return_value=GenderDistribution(male=2, female=0),
        ),
    ):
        result = await would_exceed_quota(
            session,
            examination_id=1,
            subject_id=10,
            region=Region.GREATER_ACCRA,
            examiner_type=ExaminerType.ASSISTANT,
            gender="Male",
        )
    assert result.exceeded is True
    assert result.message is not None
    assert "Male" in result.message


@pytest.mark.asyncio
async def test_would_exceed_gender_quota_skipped_without_gender() -> None:
    session = AsyncMock()
    with (
        patch(
            "app.services.examiner_regional_quota.list_quotas_for_subject",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "app.services.examiner_regional_quota.get_quota_settings_for_subject",
            new_callable=AsyncMock,
            return_value=SubjectQuotaSettings(male_quota=1, female_quota=1),
        ),
        patch(
            "app.services.examiner_regional_quota.count_gender_distribution",
            new_callable=AsyncMock,
            return_value=GenderDistribution(male=1, female=1),
        ),
    ):
        result = await would_exceed_quota(
            session,
            examination_id=1,
            subject_id=10,
            region=Region.GREATER_ACCRA,
            examiner_type=ExaminerType.ASSISTANT,
            gender=None,
        )
    assert result.exceeded is False


@pytest.mark.asyncio
async def test_accept_sets_quota_waitlisted_when_full() -> None:
    from app.models import ExaminerInvitation
    from app.services.examiner_invitation import accept_examiner_invitation

    session = AsyncMock()
    inv = MagicMock(spec=ExaminerInvitation)
    inv.status = ExaminerInvitationStatus.PENDING
    inv.response_deadline = datetime.utcnow() + timedelta(days=3)
    inv.examination_id = 1
    inv.msisdn = "233551234567"
    inv.name = "Jane"
    inv.examiner_type = ExaminerType.ASSISTANT
    inv.region = Region.GREATER_ACCRA
    inv.phone_number = "0551234567"
    inv.subject_id = 10
    inv.examiner_id = None
    inv.responded_at = None
    inv.subject = MagicMock(name="Mathematics")

    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=existing_result)
    session.flush = AsyncMock()

    with patch(
        "app.services.examiner_invitation.would_exceed_quota",
        new_callable=AsyncMock,
        return_value=QuotaExceedResult(
            exceeded=True,
            group_name="South",
            message="The quota for South is full (2 examiners).",
        ),
    ):
        result = await accept_examiner_invitation(session, inv)

    assert result.outcome == "quota_waitlisted"
    assert inv.status == ExaminerInvitationStatus.QUOTA_WAITLISTED
    assert result.examiner is None


@pytest.mark.asyncio
async def test_mark_attendance_already_marked() -> None:
    from app.models import Examiner, ExaminerAttendance
    from app.services.examiner_attendance import mark_examiner_attendance

    session = AsyncMock()
    examiner = MagicMock(spec=Examiner)
    examiner.id = uuid4()
    examiner.name = "Jane"
    examiner.reference_code = "SAE1"
    examiner.examiner_type = ExaminerType.ASSISTANT
    examiner.region = Region.GREATER_ACCRA
    examiner.subjects = []

    existing = MagicMock(spec=ExaminerAttendance)

    with (
        patch(
            "app.services.examiner_attendance.verify_examiner_for_attendance",
            new_callable=AsyncMock,
            return_value={
                "valid": True,
                "examiner_id": examiner.id,
                "reference_code": "SAE1",
                "name": "Jane",
                "examiner_type": "assistant_examiner",
                "examiner_type_label": "Assistant examiner",
                "region": "Greater Accra",
                "subject_codes": ["301"],
            },
        ),
        patch(
            "app.services.examiner_attendance._load_existing_attendance",
            new_callable=AsyncMock,
            return_value=existing,
        ),
    ):
        result = await mark_examiner_attendance(
            session,
            examination_id=1,
            officer_subject_ids={10},
            reference_code="SAE1",
            marked_by_user_id=uuid4(),
        )

    assert result["already_marked"] is True
    assert result["recorded"] is False


def test_build_region_breakdown_rows_groups_and_counts() -> None:
    from uuid import uuid4

    from app.models import ExaminerType, Region
    from app.services.examiner_regional_quota import GroupDistribution, build_region_breakdown_rows

    group_id = uuid4()
    group = MagicMock()
    group.id = group_id
    group.name = "South"
    region_a = MagicMock()
    region_a.region = Region.GREATER_ACCRA
    region_b = MagicMock()
    region_b.region = Region.CENTRAL
    group.regions = [region_b, region_a]

    quota_total = MagicMock()
    quota_total.group_id = group_id
    quota_total.examiner_type = None
    quota_total.quota_count = 10

    group_dist = {group_id: GroupDistribution(total=7)}
    roster_by_region = {Region.GREATER_ACCRA: 5, Region.CENTRAL: 2}
    proposed_by_region = {Region.GREATER_ACCRA: 1}

    rows = build_region_breakdown_rows(
        [group],
        [quota_total],
        group_dist,
        roster_by_region,
        proposed_by_region,
    )

    assert len(rows) == 2
    accra = next(r for r in rows if r.region == "Greater Accra")
    central = next(r for r in rows if r.region == "Central")
    assert accra.current_count == 5
    assert accra.proposed_count == 1
    assert accra.combined_count == 6
    assert accra.group_quota == 10
    assert accra.group_over_cap is False
    assert central.current_count == 2
    assert central.share_of_group_percent == pytest.approx(28.6, abs=0.1)
