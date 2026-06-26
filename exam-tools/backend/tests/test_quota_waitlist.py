"""Tests for quota waitlist on invitation accept (first explicit accept wins)."""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import (
    Examiner,
    ExaminerInvitation,
    ExaminerInvitationStatus,
    ExaminerType,
    Region,
)
from app.services.examiner_invitation import accept_examiner_invitation
from app.services.examiner_regional_quota import QuotaExceedResult


def _invitation(
    *,
    status: ExaminerInvitationStatus = ExaminerInvitationStatus.PENDING,
) -> MagicMock:
    inv = MagicMock(spec=ExaminerInvitation)
    inv.id = uuid4()
    inv.examination_id = 1
    inv.subject_id = 10
    inv.name = "Ada Lovelace"
    inv.phone_number = "0551234567"
    inv.msisdn = "233551234567"
    inv.gender = "Female"
    inv.examiner_type = ExaminerType.ASSISTANT
    inv.region = Region.NORTHERN
    inv.token = "test-token"
    inv.status = status
    inv.examiner_id = None
    inv.responded_at = None
    inv.response_deadline = datetime.utcnow() + timedelta(days=7)
    inv.subject = MagicMock(name="Mathematics")
    inv.subject.name = "Mathematics"
    return inv


def _session_with_no_existing_roster() -> AsyncMock:
    session = AsyncMock()
    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=existing_result)
    session.flush = AsyncMock()
    return session


@pytest.mark.asyncio
async def test_accept_to_roster_when_quota_has_capacity() -> None:
    session = _session_with_no_existing_roster()
    inv = _invitation(status=ExaminerInvitationStatus.PENDING)

    examiner = MagicMock(spec=Examiner)
    examiner.id = uuid4()

    with (
        patch(
            "app.services.examiner_invitation.assert_examiner_subject_allowed",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.examiner_invitation.would_exceed_quota",
            new_callable=AsyncMock,
            return_value=QuotaExceedResult(exceeded=False, group_name="North"),
        ),
        patch(
            "app.services.examiner_invitation._finalize_invitation_acceptance",
            new_callable=AsyncMock,
            return_value=examiner,
        ) as finalize,
    ):
        result = await accept_examiner_invitation(session, inv)

    assert result.outcome == "accepted"
    assert result.examiner is examiner
    finalize.assert_awaited_once_with(session, inv)


@pytest.mark.asyncio
async def test_waitlisted_invitation_accepts_when_quota_has_capacity() -> None:
    session = _session_with_no_existing_roster()
    inv = _invitation(status=ExaminerInvitationStatus.QUOTA_WAITLISTED)
    inv.responded_at = datetime.utcnow() - timedelta(days=1)

    examiner = MagicMock(spec=Examiner)
    examiner.id = uuid4()

    with (
        patch(
            "app.services.examiner_invitation.assert_examiner_subject_allowed",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.examiner_invitation.would_exceed_quota",
            new_callable=AsyncMock,
            return_value=QuotaExceedResult(exceeded=False, group_name="North"),
        ),
        patch(
            "app.services.examiner_invitation._finalize_invitation_acceptance",
            new_callable=AsyncMock,
            return_value=examiner,
        ) as finalize,
    ):
        result = await accept_examiner_invitation(session, inv)

    assert result.outcome == "accepted"
    finalize.assert_awaited_once_with(session, inv)


@pytest.mark.asyncio
async def test_waitlist_when_roster_at_quota() -> None:
    session = _session_with_no_existing_roster()
    inv = _invitation(status=ExaminerInvitationStatus.PENDING)

    with (
        patch(
            "app.services.examiner_invitation.assert_examiner_subject_allowed",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.examiner_invitation.would_exceed_quota",
            new_callable=AsyncMock,
            return_value=QuotaExceedResult(
                exceeded=True,
                group_name="North",
                message="The quota for North is full (2 examiners).",
            ),
        ),
        patch(
            "app.services.examiner_invitation._finalize_invitation_acceptance",
            new_callable=AsyncMock,
        ) as finalize,
    ):
        result = await accept_examiner_invitation(session, inv)

    assert result.outcome == "quota_waitlisted"
    assert inv.status == ExaminerInvitationStatus.QUOTA_WAITLISTED
    assert inv.responded_at is not None
    assert result.quota_waitlist_message is not None
    assert "first person to confirm" in result.quota_waitlist_message
    finalize.assert_not_awaited()


@pytest.mark.asyncio
async def test_waitlisted_stays_waitlisted_when_roster_still_full() -> None:
    session = _session_with_no_existing_roster()
    inv = _invitation(status=ExaminerInvitationStatus.QUOTA_WAITLISTED)
    inv.responded_at = datetime.utcnow() - timedelta(hours=2)

    with (
        patch(
            "app.services.examiner_invitation.assert_examiner_subject_allowed",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.examiner_invitation.would_exceed_quota",
            new_callable=AsyncMock,
            return_value=QuotaExceedResult(exceeded=True, group_name="North"),
        ),
        patch(
            "app.services.examiner_invitation._finalize_invitation_acceptance",
            new_callable=AsyncMock,
        ) as finalize,
    ):
        result = await accept_examiner_invitation(session, inv)

    assert result.outcome == "quota_waitlisted"
    finalize.assert_not_awaited()


@pytest.mark.asyncio
async def test_accept_acquires_subject_quota_lock() -> None:
    session = _session_with_no_existing_roster()
    inv = _invitation()

    with (
        patch(
            "app.services.examiner_invitation.assert_examiner_subject_allowed",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.examiner_invitation._lock_subject_quota",
            new_callable=AsyncMock,
        ) as lock_quota,
        patch(
            "app.services.examiner_invitation.would_exceed_quota",
            new_callable=AsyncMock,
            return_value=QuotaExceedResult(exceeded=False),
        ),
        patch(
            "app.services.examiner_invitation._finalize_invitation_acceptance",
            new_callable=AsyncMock,
            return_value=MagicMock(spec=Examiner),
        ),
    ):
        await accept_examiner_invitation(session, inv)

    lock_quota.assert_awaited_once_with(session, 1, 10)


def test_waitlist_portal_message_first_to_confirm() -> None:
    from app.services.examiner_regional_quota import build_quota_waitlist_portal_message

    message = build_quota_waitlist_portal_message(
        invitee_name="Jane Doe",
        group_name="North",
        subject_name="Mathematics",
        examiner_type=ExaminerType.ASSISTANT,
    )
    assert "waitlist" in message.lower()
    assert "first person to confirm" in message
    assert "automatically" not in message.lower()


def test_waitlist_sms_first_to_confirm() -> None:
    from app.services.sms.examiner_invitation import build_quota_waitlist_sms

    message = build_quota_waitlist_sms(
        name="Jane Doe",
        subject_name="Mathematics",
        region_group_name="North",
    )
    assert "first to confirm" in message.lower()
