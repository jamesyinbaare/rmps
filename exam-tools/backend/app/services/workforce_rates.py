"""Flat per-examination script rates for workforce payout."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import cast

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Examination,
    ExaminationDataEntryClerkRate,
    ExaminationScriptCheckerRate,
)
from app.schemas.workforce import WorkforceRatesPut
from app.services.workforce_compensation import DEFAULT_WITHHOLDING_TAX_PERCENT


async def _load_examination(session: AsyncSession, examination_id: int) -> Examination:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")
    return exam


def _rate_response(examination_id: int, row: ExaminationScriptCheckerRate | ExaminationDataEntryClerkRate | None) -> dict:
    if row is None:
        return {
            "examination_id": examination_id,
            "rate_per_script_ghs": None,
            "commuting_allowance_ghs": None,
            "lunch_allowance_ghs": None,
            "withholding_tax_percent": DEFAULT_WITHHOLDING_TAX_PERCENT,
        }
    return {
        "examination_id": examination_id,
        "rate_per_script_ghs": cast(Decimal, row.rate_per_script_ghs),
        "commuting_allowance_ghs": cast(Decimal, row.commuting_allowance_ghs),
        "lunch_allowance_ghs": cast(Decimal, row.lunch_allowance_ghs),
        "withholding_tax_percent": cast(Decimal, row.withholding_tax_percent),
    }


async def get_script_checker_rates(session: AsyncSession, examination_id: int) -> dict:
    await _load_examination(session, examination_id)
    row = await session.get(ExaminationScriptCheckerRate, examination_id)
    return _rate_response(examination_id, row)


async def get_data_entry_clerk_rates(session: AsyncSession, examination_id: int) -> dict:
    await _load_examination(session, examination_id)
    row = await session.get(ExaminationDataEntryClerkRate, examination_id)
    return _rate_response(examination_id, row)


async def _put_rate(
    session: AsyncSession,
    *,
    examination_id: int,
    body: WorkforceRatesPut,
    model,
) -> dict:
    await _load_examination(session, examination_id)
    existing = await session.get(model, examination_id)
    now = datetime.utcnow()
    if existing is None:
        existing = model(
            examination_id=examination_id,
            rate_per_script_ghs=body.rate_per_script_ghs,
            commuting_allowance_ghs=body.commuting_allowance_ghs,
            lunch_allowance_ghs=body.lunch_allowance_ghs,
            withholding_tax_percent=body.withholding_tax_percent,
            updated_at=now,
        )
        session.add(existing)
    else:
        existing.rate_per_script_ghs = body.rate_per_script_ghs
        existing.commuting_allowance_ghs = body.commuting_allowance_ghs
        existing.lunch_allowance_ghs = body.lunch_allowance_ghs
        existing.withholding_tax_percent = body.withholding_tax_percent
        existing.updated_at = now
    await session.flush()
    return _rate_response(examination_id, existing)


async def put_script_checker_rates(
    session: AsyncSession,
    examination_id: int,
    body: WorkforceRatesPut,
) -> dict:
    return await _put_rate(
        session,
        examination_id=examination_id,
        body=body,
        model=ExaminationScriptCheckerRate,
    )


async def put_data_entry_clerk_rates(
    session: AsyncSession,
    examination_id: int,
    body: WorkforceRatesPut,
) -> dict:
    return await _put_rate(
        session,
        examination_id=examination_id,
        body=body,
        model=ExaminationDataEntryClerkRate,
    )


async def load_script_checker_rate(session: AsyncSession, examination_id: int) -> Decimal:
    data = await get_script_checker_rates(session, examination_id)
    rate = data["rate_per_script_ghs"]
    return cast(Decimal, rate) if rate is not None else Decimal("0")


async def load_data_entry_clerk_rate(session: AsyncSession, examination_id: int) -> Decimal:
    data = await get_data_entry_clerk_rates(session, examination_id)
    rate = data["rate_per_script_ghs"]
    return cast(Decimal, rate) if rate is not None else Decimal("0")
