"""Tests for flat workforce rates."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.workforce import WorkforceRatesPut
from app.services.workforce_rates import get_script_checker_rates, put_script_checker_rates


@pytest.mark.asyncio
async def test_get_script_checker_rates_returns_defaults_when_unset() -> None:
    session = AsyncMock()
    exam = MagicMock()
    session.get = AsyncMock(side_effect=[exam, None])

    result = await get_script_checker_rates(session, 1)

    assert result == {
        "examination_id": 1,
        "rate_per_script_ghs": None,
        "commuting_allowance_ghs": None,
        "lunch_allowance_ghs": None,
        "withholding_tax_percent": Decimal("10"),
    }


@pytest.mark.asyncio
async def test_put_script_checker_rates_upserts_flat_rate() -> None:
    session = AsyncMock()
    exam = MagicMock()
    session.get = AsyncMock(side_effect=[exam, None])

    result = await put_script_checker_rates(
        session,
        1,
        WorkforceRatesPut(
            rate_per_script_ghs=Decimal("2.50"),
            commuting_allowance_ghs=Decimal("15"),
            lunch_allowance_ghs=Decimal("20"),
            withholding_tax_percent=Decimal("10"),
        ),
    )

    assert result["examination_id"] == 1
    assert result["rate_per_script_ghs"] == Decimal("2.50")
    assert result["commuting_allowance_ghs"] == Decimal("15")
    assert result["lunch_allowance_ghs"] == Decimal("20")
    assert result["withholding_tax_percent"] == Decimal("10")
    session.add.assert_called_once()
    session.flush.assert_awaited_once()
