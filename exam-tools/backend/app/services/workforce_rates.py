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
from app.schemas.workforce import DataEntryClerkRatesPut, ScriptCheckerRatesPut
from app.services.workforce_compensation import DEFAULT_WITHHOLDING_TAX_PERCENT


async def _load_examination(session: AsyncSession, examination_id: int) -> Examination:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")
    return exam


def _script_checker_rate_response(examination_id: int, row: ExaminationScriptCheckerRate | None) -> dict:
    if row is None:
        return {
            "examination_id": examination_id,
            "objective_rate_per_script_ghs": None,
            "subjective_rate_per_script_ghs": None,
            "rate_per_script_ghs": None,
            "commuting_allowance_ghs": None,
            "lunch_allowance_ghs": None,
            "withholding_tax_percent": DEFAULT_WITHHOLDING_TAX_PERCENT,
        }
    return {
        "examination_id": examination_id,
        "objective_rate_per_script_ghs": cast(Decimal, row.objective_rate_per_script_ghs),
        "subjective_rate_per_script_ghs": cast(Decimal, row.subjective_rate_per_script_ghs),
        "rate_per_script_ghs": cast(Decimal, row.objective_rate_per_script_ghs),
        "commuting_allowance_ghs": cast(Decimal, row.commuting_allowance_ghs),
        "lunch_allowance_ghs": cast(Decimal, row.lunch_allowance_ghs),
        "withholding_tax_percent": cast(Decimal, row.withholding_tax_percent),
    }


def _data_entry_clerk_rate_response(examination_id: int, row: ExaminationDataEntryClerkRate | None) -> dict:
    if row is None:
        return {
            "examination_id": examination_id,
            "rate_per_script_ghs": None,
            "objective_rate_per_script_ghs": None,
            "subjective_rate_per_script_ghs": None,
            "commuting_allowance_ghs": None,
            "lunch_allowance_ghs": None,
            "withholding_tax_percent": DEFAULT_WITHHOLDING_TAX_PERCENT,
        }
    return {
        "examination_id": examination_id,
        "rate_per_script_ghs": cast(Decimal, row.rate_per_script_ghs),
        "objective_rate_per_script_ghs": None,
        "subjective_rate_per_script_ghs": None,
        "commuting_allowance_ghs": cast(Decimal, row.commuting_allowance_ghs),
        "lunch_allowance_ghs": cast(Decimal, row.lunch_allowance_ghs),
        "withholding_tax_percent": cast(Decimal, row.withholding_tax_percent),
    }


async def get_script_checker_rates(session: AsyncSession, examination_id: int) -> dict:
    await _load_examination(session, examination_id)
    row = await session.get(ExaminationScriptCheckerRate, examination_id)
    return _script_checker_rate_response(examination_id, row)


async def get_data_entry_clerk_rates(session: AsyncSession, examination_id: int) -> dict:
    await _load_examination(session, examination_id)
    row = await session.get(ExaminationDataEntryClerkRate, examination_id)
    return _data_entry_clerk_rate_response(examination_id, row)


async def put_script_checker_rates(
    session: AsyncSession,
    examination_id: int,
    body: ScriptCheckerRatesPut,
) -> dict:
    await _load_examination(session, examination_id)
    existing = await session.get(ExaminationScriptCheckerRate, examination_id)
    now = datetime.utcnow()
    if existing is None:
        existing = ExaminationScriptCheckerRate(
            examination_id=examination_id,
            objective_rate_per_script_ghs=body.objective_rate_per_script_ghs,
            subjective_rate_per_script_ghs=body.subjective_rate_per_script_ghs,
            commuting_allowance_ghs=body.commuting_allowance_ghs,
            lunch_allowance_ghs=body.lunch_allowance_ghs,
            withholding_tax_percent=body.withholding_tax_percent,
            updated_at=now,
        )
        session.add(existing)
    else:
        existing.objective_rate_per_script_ghs = body.objective_rate_per_script_ghs
        existing.subjective_rate_per_script_ghs = body.subjective_rate_per_script_ghs
        existing.commuting_allowance_ghs = body.commuting_allowance_ghs
        existing.lunch_allowance_ghs = body.lunch_allowance_ghs
        existing.withholding_tax_percent = body.withholding_tax_percent
        existing.updated_at = now
    await session.flush()
    return _script_checker_rate_response(examination_id, existing)


async def put_data_entry_clerk_rates(
    session: AsyncSession,
    examination_id: int,
    body: DataEntryClerkRatesPut,
) -> dict:
    await _load_examination(session, examination_id)
    existing = await session.get(ExaminationDataEntryClerkRate, examination_id)
    now = datetime.utcnow()
    if existing is None:
        existing = ExaminationDataEntryClerkRate(
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
    return _data_entry_clerk_rate_response(examination_id, existing)
