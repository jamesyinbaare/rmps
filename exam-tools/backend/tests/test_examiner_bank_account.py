"""Tests for examiner bank account service."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import ExaminerBankAccount, ExaminerInvitationStatus, ExaminerType, Region
from app.services.exam_official_account import ABSA_BANK_NAME_IN_DIRECTORY, ADB_BANK_NAME_IN_DIRECTORY
from app.services.examiner_bank_account import (
    get_by_examiner_id,
    require_accepted_invitation_for_bank,
    upsert_for_examiner,
)


def _mock_invitation(**overrides: object) -> MagicMock:
    inv = MagicMock()
    inv.status = ExaminerInvitationStatus.ACCEPTED
    inv.examiner_id = uuid4()
    inv.examiner_type = ExaminerType.ASSISTANT
    inv.region = Region.ASHANTI
    for key, value in overrides.items():
        setattr(inv, key, value)
    return inv


def test_require_accepted_invitation_for_bank_accepts_rostered() -> None:
    examiner_id = uuid4()
    inv = _mock_invitation(examiner_id=examiner_id)
    assert require_accepted_invitation_for_bank(inv) == examiner_id


def test_require_accepted_invitation_for_bank_rejects_pending() -> None:
    inv = _mock_invitation(status=ExaminerInvitationStatus.PENDING)
    with pytest.raises(ValueError, match="after confirming"):
        require_accepted_invitation_for_bank(inv)


def test_require_accepted_invitation_for_bank_rejects_without_examiner() -> None:
    inv = _mock_invitation(examiner_id=None)
    with pytest.raises(ValueError, match="Examiner record"):
        require_accepted_invitation_for_bank(inv)


@pytest.mark.asyncio
async def test_get_by_examiner_id_returns_none_when_missing() -> None:
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=result)
    assert await get_by_examiner_id(session, uuid4()) is None


@pytest.mark.asyncio
async def test_upsert_for_examiner_creates_standard_account() -> None:
    session = AsyncMock()
    examiner_id = uuid4()
    branch_id = uuid4()
    bb = MagicMock()
    bb.bank_name = "GCB BANK LTD"
    bb.bank_code = "123456"
    session.get = AsyncMock(return_value=bb)

    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=existing_result)

    async def _flush() -> None:
        for call in session.add.call_args_list:
            obj = call.args[0]
            if isinstance(obj, ExaminerBankAccount) and obj.id is None:
                obj.id = uuid4()

    session.flush = AsyncMock(side_effect=_flush)
    session.refresh = AsyncMock()

    row = await upsert_for_examiner(
        session,
        examiner_id=examiner_id,
        bank_branch_id=branch_id,
        account_number="1234567890123",
    )

    assert row.account_number == "1234567890123"
    assert row.examiner_id == examiner_id
    session.add.assert_called_once()


@pytest.mark.asyncio
async def test_upsert_for_examiner_normalizes_absa_account() -> None:
    session = AsyncMock()
    examiner_id = uuid4()
    branch_id = uuid4()
    bb = MagicMock()
    bb.bank_name = ABSA_BANK_NAME_IN_DIRECTORY
    bb.bank_code = "123456"
    session.get = AsyncMock(return_value=bb)

    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=existing_result)
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()

    row = await upsert_for_examiner(
        session,
        examiner_id=examiner_id,
        bank_branch_id=branch_id,
        account_number="7654321",
    )

    assert row.account_number == "1234567654321"


@pytest.mark.asyncio
async def test_upsert_for_examiner_normalizes_adb_account() -> None:
    session = AsyncMock()
    examiner_id = uuid4()
    branch_id = uuid4()
    bb = MagicMock()
    bb.bank_name = ADB_BANK_NAME_IN_DIRECTORY
    bb.bank_code = "000001"
    session.get = AsyncMock(return_value=bb)

    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=existing_result)
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()

    row = await upsert_for_examiner(
        session,
        examiner_id=examiner_id,
        bank_branch_id=branch_id,
        account_number="1234567890123456",
    )

    assert row.account_number == "4567890123456"


@pytest.mark.asyncio
async def test_upsert_for_examiner_updates_existing_row() -> None:
    session = AsyncMock()
    examiner_id = uuid4()
    branch_id = uuid4()
    bb = MagicMock()
    bb.bank_name = "GCB BANK LTD"
    bb.bank_code = "123456"
    session.get = AsyncMock(return_value=bb)

    existing = MagicMock(spec=ExaminerBankAccount)
    existing.examiner_id = examiner_id
    existing.bank_branch_id = uuid4()
    existing.account_number = "1111111111111"
    existing.updated_at = datetime(2026, 1, 1)

    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = existing
    session.execute = AsyncMock(return_value=existing_result)
    session.flush = AsyncMock()
    session.refresh = AsyncMock()

    row = await upsert_for_examiner(
        session,
        examiner_id=examiner_id,
        bank_branch_id=branch_id,
        account_number="2222222222222",
    )

    assert row is existing
    assert row.account_number == "2222222222222"
    assert row.bank_branch_id == branch_id
    session.add.assert_not_called()
