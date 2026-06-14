"""Tests for workforce reference code generation."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models import WorkforceAvailabilityStatus
from app.schemas.workforce import WorkforceRosterCreate
from app.services.workforce_availability import confirm_workforce_availability
from app.services.workforce_reference_code import (
    ensure_workforce_reference_code,
    next_workforce_reference_code,
    workforce_reference_code_prefix,
)
from app.services.workforce_roster import create_script_checker


def test_workforce_reference_code_prefix() -> None:
    assert workforce_reference_code_prefix("script_checker", 2026) == "SC2026-"
    assert workforce_reference_code_prefix("data_entry_clerk", 2026) == "DE2026-"


@pytest.mark.asyncio
async def test_next_script_checker_reference_code_starts_at_one() -> None:
    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[]))))
    )

    code = await next_workforce_reference_code(
        session,
        kind="script_checker",
        examination_id=1,
        exam_year=2026,
    )

    assert code == "SC2026-1"


@pytest.mark.asyncio
async def test_next_script_checker_reference_code_increments() -> None:
    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(
            scalars=MagicMock(
                return_value=MagicMock(all=MagicMock(return_value=["SC2026-1", "SC2026-4", "LEGACY"]))
            )
        )
    )

    code = await next_workforce_reference_code(
        session,
        kind="script_checker",
        examination_id=1,
        exam_year=2026,
    )

    assert code == "SC2026-5"


@pytest.mark.asyncio
async def test_next_data_entry_clerk_reference_code() -> None:
    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=["DE2026-2"])))
        )
    )

    code = await next_workforce_reference_code(
        session,
        kind="data_entry_clerk",
        examination_id=9,
        exam_year=2026,
    )

    assert code == "DE2026-3"


@pytest.mark.asyncio
async def test_ensure_workforce_reference_code_assigns_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    checker = MagicMock()
    checker.reference_code = None
    checker.examination_id = 1

    monkeypatch.setattr(
        "app.services.workforce_reference_code.next_workforce_reference_code",
        AsyncMock(return_value="SC2026-1"),
    )
    session.get = AsyncMock(return_value=MagicMock(year=2026))

    code = await ensure_workforce_reference_code(session, checker)

    assert code == "SC2026-1"
    assert checker.reference_code == "SC2026-1"


@pytest.mark.asyncio
async def test_ensure_workforce_reference_code_skips_when_set() -> None:
    session = AsyncMock()
    checker = MagicMock()
    checker.reference_code = "SC2026-7"

    code = await ensure_workforce_reference_code(session, checker)

    assert code == "SC2026-7"
    session.get.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_script_checker_does_not_assign_reference_code(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    exam = MagicMock(year=2026)
    session.get = AsyncMock(return_value=exam)
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()

    stored: dict[str, object] = {}
    monkeypatch.setattr("app.services.workforce_roster.generate_portal_token", lambda: "token")

    def add_side_effect(row):
        stored["row"] = row

    session.add.side_effect = add_side_effect

    result = await create_script_checker(
        session,
        examination_id=1,
        body=WorkforceRosterCreate(name="Jane Doe"),
    )

    row = stored["row"]
    assert row.reference_code is None
    assert result["reference_code"] is None


@pytest.mark.asyncio
async def test_confirm_workforce_availability_assigns_reference_code(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    checker = MagicMock()
    checker.availability_status = WorkforceAvailabilityStatus.PENDING
    checker.availability_deadline = None
    checker.availability_responded_at = None
    checker.reference_code = None

    ensure_mock = AsyncMock(return_value="SC2026-2")
    monkeypatch.setattr("app.services.workforce_availability.ensure_workforce_reference_code", ensure_mock)

    await confirm_workforce_availability(session, checker)

    assert checker.availability_status == WorkforceAvailabilityStatus.CONFIRMED
    assert checker.availability_responded_at is not None
    ensure_mock.assert_awaited_once_with(session, checker)
    session.flush.assert_awaited_once()
