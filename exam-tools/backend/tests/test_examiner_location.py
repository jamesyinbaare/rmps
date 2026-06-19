"""Tests for examiner town and GhanaPost GPS normalization."""

from __future__ import annotations

import pytest

from app.services.examiner_location import normalize_ghanapost_gps, normalize_town


def test_normalize_town_strips_and_keeps_value() -> None:
    assert normalize_town("  Kumasi  ") == "Kumasi"


def test_normalize_town_rejects_empty() -> None:
    with pytest.raises(ValueError, match="Town is required"):
        normalize_town("   ")


def test_normalize_ghanapost_strips_and_keeps_value() -> None:
    assert normalize_ghanapost_gps("  GA-123-4567  ") == "GA-123-4567"


def test_normalize_ghanapost_accepts_freeform_text() -> None:
    assert normalize_ghanapost_gps("Near the market, Accra") == "Near the market, Accra"


def test_normalize_ghanapost_rejects_empty() -> None:
    with pytest.raises(ValueError, match="GhanaPost GPS address is required"):
        normalize_ghanapost_gps("  ")


def test_normalize_ghanapost_rejects_too_long() -> None:
    with pytest.raises(ValueError, match="50 characters"):
        normalize_ghanapost_gps("x" * 51)


@pytest.mark.asyncio
async def test_upsert_location_for_examiner() -> None:
    from unittest.mock import AsyncMock, MagicMock
    from uuid import uuid4

    from app.services.examiner_location import get_location_by_examiner_id, upsert_location_for_examiner

    examiner_id = uuid4()
    examiner = MagicMock()
    examiner.id = examiner_id
    examiner.town = None
    examiner.ghanapost_gps_address = None
    examiner.updated_at = None

    session = AsyncMock()
    session.get = AsyncMock(return_value=examiner)

    updated = await upsert_location_for_examiner(
        session,
        examiner_id=examiner_id,
        town="Kumasi",
        ghanapost_gps_address="  GA-123-4567  ",
    )

    assert updated.town == "Kumasi"
    assert updated.ghanapost_gps_address == "GA-123-4567"
    session.flush.assert_awaited()
    session.refresh.assert_awaited()

    examiner.town = "Kumasi"
    examiner.ghanapost_gps_address = "GA-123-4567"
    found = await get_location_by_examiner_id(session, examiner_id)
    assert found is examiner
