"""Tests for lifetime examiner subject lock."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import Examiner, ExaminerInvitation, ExaminerInvitationStatus, ExaminerSubject
from app.services.examiner_subject_lock import assert_examiner_subject_allowed, locked_subject_id_for_msisdn

MATH_ID = 10
ENGLISH_ID = 20
EXAM_2025 = 1
EXAM_2026 = 2
PHONE = "233551234567"


def _examiner(
    *,
    examination_id: int,
    subject_id: int,
    msisdn: str = PHONE,
) -> MagicMock:
    ex = MagicMock(spec=Examiner)
    ex.id = uuid4()
    ex.examination_id = examination_id
    ex.msisdn = msisdn
    subj = MagicMock(spec=ExaminerSubject)
    subj.subject_id = subject_id
    ex.subjects = [subj]
    return ex


def _invitation(
    *,
    examination_id: int,
    subject_id: int,
    status: ExaminerInvitationStatus,
    msisdn: str | None = PHONE,
) -> MagicMock:
    inv = MagicMock(spec=ExaminerInvitation)
    inv.id = uuid4()
    inv.examination_id = examination_id
    inv.subject_id = subject_id
    inv.status = status
    inv.msisdn = msisdn
    return inv


@pytest.mark.asyncio
async def test_same_subject_different_examination_allowed() -> None:
    session = AsyncMock()
    math_2025 = _examiner(examination_id=EXAM_2025, subject_id=MATH_ID)

    roster_result = MagicMock()
    roster_result.scalars.return_value.all.return_value = [math_2025]

    inv_direct = MagicMock()
    inv_direct.scalars.return_value.all.return_value = []
    inv_linked = MagicMock()
    inv_linked.scalars.return_value.all.return_value = []

    session.execute = AsyncMock(side_effect=[roster_result, inv_direct, inv_linked])

    await assert_examiner_subject_allowed(
        session,
        examination_id=EXAM_2026,
        msisdn=PHONE,
        subject_id=MATH_ID,
    )


@pytest.mark.asyncio
async def test_cross_subject_different_examination_rejected() -> None:
    session = AsyncMock()
    math_2025 = _examiner(examination_id=EXAM_2025, subject_id=MATH_ID)

    roster_result = MagicMock()
    roster_result.scalars.return_value.all.return_value = [math_2025]

    session.execute = AsyncMock(return_value=roster_result)

    with pytest.raises(ValueError, match="already registered"):
        await assert_examiner_subject_allowed(
            session,
            examination_id=EXAM_2026,
            msisdn=PHONE,
            subject_id=ENGLISH_ID,
        )


@pytest.mark.asyncio
async def test_cross_subject_same_examination_rejected() -> None:
    session = AsyncMock()
    math_2026 = _examiner(examination_id=EXAM_2026, subject_id=MATH_ID)

    roster_result = MagicMock()
    roster_result.scalars.return_value.all.return_value = [math_2026]

    session.execute = AsyncMock(return_value=roster_result)

    with pytest.raises(ValueError, match="cannot be added"):
        await assert_examiner_subject_allowed(
            session,
            examination_id=EXAM_2026,
            msisdn=PHONE,
            subject_id=ENGLISH_ID,
        )


@pytest.mark.asyncio
async def test_pending_invitation_cross_subject_same_examination_rejected() -> None:
    session = AsyncMock()
    pending_math = _invitation(
        examination_id=EXAM_2026,
        subject_id=MATH_ID,
        status=ExaminerInvitationStatus.PENDING,
    )

    roster_result = MagicMock()
    roster_result.scalars.return_value.all.return_value = []

    inv_direct = MagicMock()
    inv_direct.scalars.return_value.all.return_value = [pending_math]
    inv_linked = MagicMock()
    inv_linked.scalars.return_value.all.return_value = []

    session.execute = AsyncMock(side_effect=[roster_result, inv_direct, inv_linked])

    with pytest.raises(ValueError, match="cannot be added"):
        await assert_examiner_subject_allowed(
            session,
            examination_id=EXAM_2026,
            msisdn=PHONE,
            subject_id=ENGLISH_ID,
        )


@pytest.mark.asyncio
async def test_declined_invitation_cross_subject_different_examination_rejected() -> None:
    session = AsyncMock()
    declined_math = _invitation(
        examination_id=EXAM_2025,
        subject_id=MATH_ID,
        status=ExaminerInvitationStatus.DECLINED,
    )

    roster_result = MagicMock()
    roster_result.scalars.return_value.all.return_value = []

    inv_direct = MagicMock()
    inv_direct.scalars.return_value.all.return_value = [declined_math]
    inv_linked = MagicMock()
    inv_linked.scalars.return_value.all.return_value = []

    session.execute = AsyncMock(side_effect=[roster_result, inv_direct, inv_linked])

    with pytest.raises(ValueError, match="cannot be used"):
        await assert_examiner_subject_allowed(
            session,
            examination_id=EXAM_2026,
            msisdn=PHONE,
            subject_id=ENGLISH_ID,
        )


@pytest.mark.asyncio
async def test_same_subject_invitation_different_examination_allowed() -> None:
    session = AsyncMock()
    declined_math = _invitation(
        examination_id=EXAM_2025,
        subject_id=MATH_ID,
        status=ExaminerInvitationStatus.DECLINED,
    )

    roster_result = MagicMock()
    roster_result.scalars.return_value.all.return_value = []

    inv_direct = MagicMock()
    inv_direct.scalars.return_value.all.return_value = [declined_math]
    inv_linked = MagicMock()
    inv_linked.scalars.return_value.all.return_value = []

    session.execute = AsyncMock(side_effect=[roster_result, inv_direct, inv_linked])

    await assert_examiner_subject_allowed(
        session,
        examination_id=EXAM_2026,
        msisdn=PHONE,
        subject_id=MATH_ID,
    )


@pytest.mark.asyncio
async def test_expired_invitation_does_not_lock() -> None:
    session = AsyncMock()
    expired_math = _invitation(
        examination_id=EXAM_2025,
        subject_id=MATH_ID,
        status=ExaminerInvitationStatus.EXPIRED,
    )

    roster_result = MagicMock()
    roster_result.scalars.return_value.all.return_value = []

    inv_direct = MagicMock()
    inv_direct.scalars.return_value.all.return_value = [expired_math]
    inv_linked = MagicMock()
    inv_linked.scalars.return_value.all.return_value = []

    session.execute = AsyncMock(side_effect=[roster_result, inv_direct, inv_linked])

    await assert_examiner_subject_allowed(
        session,
        examination_id=EXAM_2026,
        msisdn=PHONE,
        subject_id=ENGLISH_ID,
    )


@pytest.mark.asyncio
async def test_locked_subject_id_for_msisdn_from_roster() -> None:
    session = AsyncMock()
    math_2025 = _examiner(examination_id=EXAM_2025, subject_id=MATH_ID)

    roster_result = MagicMock()
    roster_result.scalars.return_value.all.return_value = [math_2025]

    inv_direct = MagicMock()
    inv_direct.scalars.return_value.all.return_value = []
    inv_linked = MagicMock()
    inv_linked.scalars.return_value.all.return_value = []

    session.execute = AsyncMock(side_effect=[roster_result, inv_direct, inv_linked])

    locked = await locked_subject_id_for_msisdn(session, PHONE)
    assert locked == MATH_ID


@pytest.mark.asyncio
async def test_duplicate_same_subject_roster_same_examination_rejected() -> None:
    session = AsyncMock()
    math_2026 = _examiner(examination_id=EXAM_2026, subject_id=MATH_ID)

    roster_result = MagicMock()
    roster_result.scalars.return_value.all.return_value = [math_2026]

    session.execute = AsyncMock(return_value=roster_result)

    with pytest.raises(ValueError, match="already on the examiner roster"):
        await assert_examiner_subject_allowed(
            session,
            examination_id=EXAM_2026,
            msisdn=PHONE,
            subject_id=MATH_ID,
        )
