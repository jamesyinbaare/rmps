"""Roster CRUD for script checkers and data entry clerks."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import DataEntryClerk, Examination, ScriptChecker
from app.schemas.workforce import WorkforceRosterCreate, WorkforceRosterUpdate
from app.services.script_allocation import parse_region
from app.services.sms.phone import normalize_msisdn
from app.services.workforce_portal import (
    data_entry_clerk_portal_url,
    generate_portal_token,
    script_checker_portal_url,
)

WorkforceKind = Literal["script_checker", "data_entry_clerk"]


class WorkforceRosterNotFoundError(Exception):
    pass


async def _load_examination(session: AsyncSession, examination_id: int) -> Examination:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")
    return exam


async def assert_script_checker_belongs_to_exam(
    session: AsyncSession,
    checker_id: UUID,
    examination_id: int,
) -> ScriptChecker:
    return await get_script_checker_or_404(
        session,
        examination_id=examination_id,
        checker_id=checker_id,
    )


async def assert_data_entry_clerk_belongs_to_exam(
    session: AsyncSession,
    clerk_id: UUID,
    examination_id: int,
) -> DataEntryClerk:
    return await get_data_entry_clerk_or_404(
        session,
        examination_id=examination_id,
        clerk_id=clerk_id,
    )


async def get_script_checker_or_404(
    session: AsyncSession,
    *,
    examination_id: int,
    checker_id: UUID,
) -> ScriptChecker:
    stmt = (
        select(ScriptChecker)
        .where(ScriptChecker.id == checker_id)
        .options(selectinload(ScriptChecker.bank_account))
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None or int(row.examination_id) != examination_id:
        raise WorkforceRosterNotFoundError("Script checker not found")
    return row


async def get_data_entry_clerk_or_404(
    session: AsyncSession,
    *,
    examination_id: int,
    clerk_id: UUID,
) -> DataEntryClerk:
    stmt = (
        select(DataEntryClerk)
        .where(DataEntryClerk.id == clerk_id)
        .options(selectinload(DataEntryClerk.bank_account))
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None or int(row.examination_id) != examination_id:
        raise WorkforceRosterNotFoundError("Data entry clerk not found")
    return row


def _region_value(region) -> str | None:
    if region is None:
        return None
    return region.value if hasattr(region, "value") else str(region)


def _availability_status_value(row: ScriptChecker | DataEntryClerk) -> str:
    status = row.availability_status
    return status.value if hasattr(status, "value") else str(status)


def script_checker_to_dict(row: ScriptChecker) -> dict:
    return {
        "id": row.id,
        "examination_id": int(row.examination_id),
        "name": row.name,
        "phone_number": row.phone_number,
        "region": _region_value(row.region),
        "reference_code": row.reference_code,
        "portal_url": script_checker_portal_url(row.portal_token),
        "portal_invite_sms_sent_at": row.portal_invite_sms_sent_at,
        "availability_status": _availability_status_value(row),
        "availability_responded_at": row.availability_responded_at,
        "availability_deadline": row.availability_deadline,
        "has_bank_account": row.bank_account is not None,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def data_entry_clerk_to_dict(row: DataEntryClerk) -> dict:
    return {
        "id": row.id,
        "examination_id": int(row.examination_id),
        "name": row.name,
        "phone_number": row.phone_number,
        "region": _region_value(row.region),
        "reference_code": row.reference_code,
        "portal_url": data_entry_clerk_portal_url(row.portal_token),
        "portal_invite_sms_sent_at": row.portal_invite_sms_sent_at,
        "availability_status": _availability_status_value(row),
        "availability_responded_at": row.availability_responded_at,
        "availability_deadline": row.availability_deadline,
        "has_bank_account": row.bank_account is not None,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


async def list_script_checkers(session: AsyncSession, examination_id: int) -> list[dict]:
    await _load_examination(session, examination_id)
    stmt = (
        select(ScriptChecker)
        .where(ScriptChecker.examination_id == examination_id)
        .options(selectinload(ScriptChecker.bank_account))
        .order_by(ScriptChecker.name)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return [script_checker_to_dict(r) for r in rows]


async def list_data_entry_clerks(session: AsyncSession, examination_id: int) -> list[dict]:
    await _load_examination(session, examination_id)
    stmt = (
        select(DataEntryClerk)
        .where(DataEntryClerk.examination_id == examination_id)
        .options(selectinload(DataEntryClerk.bank_account))
        .order_by(DataEntryClerk.name)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return [data_entry_clerk_to_dict(r) for r in rows]


async def create_script_checker(
    session: AsyncSession,
    *,
    examination_id: int,
    body: WorkforceRosterCreate,
) -> dict:
    await _load_examination(session, examination_id)
    region = parse_region(body.region) if body.region else None
    phone = body.phone_number.strip() if body.phone_number else None
    if phone:
        try:
            normalize_msisdn(phone)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    row = ScriptChecker(
        examination_id=examination_id,
        name=body.name.strip(),
        phone_number=phone,
        region=region,
        reference_code=body.reference_code.strip() if body.reference_code else None,
        portal_token=generate_portal_token(),
    )
    session.add(row)
    await session.flush()
    await session.refresh(row, attribute_names=["bank_account"])
    return script_checker_to_dict(row)


async def create_data_entry_clerk(
    session: AsyncSession,
    *,
    examination_id: int,
    body: WorkforceRosterCreate,
) -> dict:
    await _load_examination(session, examination_id)
    region = parse_region(body.region) if body.region else None
    phone = body.phone_number.strip() if body.phone_number else None
    if phone:
        try:
            normalize_msisdn(phone)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    row = DataEntryClerk(
        examination_id=examination_id,
        name=body.name.strip(),
        phone_number=phone,
        region=region,
        reference_code=body.reference_code.strip() if body.reference_code else None,
        portal_token=generate_portal_token(),
    )
    session.add(row)
    await session.flush()
    await session.refresh(row, attribute_names=["bank_account"])
    return data_entry_clerk_to_dict(row)


async def update_script_checker(
    session: AsyncSession,
    *,
    examination_id: int,
    checker_id: UUID,
    body: WorkforceRosterUpdate,
) -> dict:
    row = await get_script_checker_or_404(session, examination_id=examination_id, checker_id=checker_id)
    if body.name is not None:
        row.name = body.name.strip()
    if body.phone_number is not None:
        phone = body.phone_number.strip() or None
        if phone:
            try:
                normalize_msisdn(phone)
            except ValueError as exc:
                raise ValueError(str(exc)) from exc
        row.phone_number = phone
    if body.region is not None:
        row.region = parse_region(body.region) if body.region else None
    if body.reference_code is not None:
        row.reference_code = body.reference_code.strip() or None
    row.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(row, attribute_names=["bank_account"])
    return script_checker_to_dict(row)


async def update_data_entry_clerk(
    session: AsyncSession,
    *,
    examination_id: int,
    clerk_id: UUID,
    body: WorkforceRosterUpdate,
) -> dict:
    row = await get_data_entry_clerk_or_404(session, examination_id=examination_id, clerk_id=clerk_id)
    if body.name is not None:
        row.name = body.name.strip()
    if body.phone_number is not None:
        phone = body.phone_number.strip() or None
        if phone:
            try:
                normalize_msisdn(phone)
            except ValueError as exc:
                raise ValueError(str(exc)) from exc
        row.phone_number = phone
    if body.region is not None:
        row.region = parse_region(body.region) if body.region else None
    if body.reference_code is not None:
        row.reference_code = body.reference_code.strip() or None
    row.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(row, attribute_names=["bank_account"])
    return data_entry_clerk_to_dict(row)


async def delete_script_checker(
    session: AsyncSession,
    *,
    examination_id: int,
    checker_id: UUID,
) -> None:
    row = await get_script_checker_or_404(session, examination_id=examination_id, checker_id=checker_id)
    await session.delete(row)


async def delete_data_entry_clerk(
    session: AsyncSession,
    *,
    examination_id: int,
    clerk_id: UUID,
) -> None:
    row = await get_data_entry_clerk_or_404(session, examination_id=examination_id, clerk_id=clerk_id)
    await session.delete(row)
