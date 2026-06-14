"""Bank account CRUD for script checkers and data entry clerks."""

from __future__ import annotations

from datetime import datetime
from typing import cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    BankBranch,
    DataEntryClerk,
    DataEntryClerkBankAccount,
    ScriptChecker,
    ScriptCheckerBankAccount,
)
from app.services.exam_official_account import normalize_account_for_save


async def get_script_checker_bank_account(
    session: AsyncSession,
    checker_id: UUID,
) -> ScriptCheckerBankAccount | None:
    stmt = (
        select(ScriptCheckerBankAccount)
        .where(ScriptCheckerBankAccount.checker_id == checker_id)
        .options(selectinload(ScriptCheckerBankAccount.bank_branch))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_data_entry_clerk_bank_account(
    session: AsyncSession,
    clerk_id: UUID,
) -> DataEntryClerkBankAccount | None:
    stmt = (
        select(DataEntryClerkBankAccount)
        .where(DataEntryClerkBankAccount.clerk_id == clerk_id)
        .options(selectinload(DataEntryClerkBankAccount.bank_branch))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def script_checker_bank_account_to_dict(row: ScriptCheckerBankAccount) -> dict:
    bb = row.bank_branch
    return {
        "id": row.id,
        "person_id": row.checker_id,
        "bank_branch_id": row.bank_branch_id,
        "bank_code": cast(str, bb.bank_code),
        "bank_name": cast(str, bb.bank_name),
        "branch_name": cast(str, bb.branch_name),
        "account_number": cast(str, row.account_number),
        "created_at": cast(datetime, row.created_at),
        "updated_at": cast(datetime, row.updated_at),
    }


def data_entry_clerk_bank_account_to_dict(row: DataEntryClerkBankAccount) -> dict:
    bb = row.bank_branch
    return {
        "id": row.id,
        "person_id": row.clerk_id,
        "bank_branch_id": row.bank_branch_id,
        "bank_code": cast(str, bb.bank_code),
        "bank_name": cast(str, bb.bank_name),
        "branch_name": cast(str, bb.branch_name),
        "account_number": cast(str, row.account_number),
        "created_at": cast(datetime, row.created_at),
        "updated_at": cast(datetime, row.updated_at),
    }


async def upsert_script_checker_bank_account(
    session: AsyncSession,
    *,
    checker_id: UUID,
    bank_branch_id: UUID,
    account_number: str,
) -> ScriptCheckerBankAccount:
    checker = await session.get(ScriptChecker, checker_id)
    if checker is None:
        raise ValueError("Script checker not found.")

    bb = await session.get(BankBranch, bank_branch_id)
    if bb is None:
        raise ValueError("Selected bank branch not found.")

    existing = await get_script_checker_bank_account(session, checker_id)
    for_update = existing is not None
    normalized = normalize_account_for_save(
        account_number,
        bank_name=cast(str, bb.bank_name),
        bank_code=cast(str, bb.bank_code),
        for_update=for_update,
    )

    now = datetime.utcnow()
    if existing is None:
        row = ScriptCheckerBankAccount(
            checker_id=checker_id,
            bank_branch_id=bank_branch_id,
            account_number=normalized,
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        await session.flush()
        await session.refresh(row, attribute_names=["bank_branch"])
        return row

    existing.bank_branch_id = bank_branch_id
    existing.account_number = normalized
    existing.updated_at = now
    await session.flush()
    await session.refresh(existing, attribute_names=["bank_branch"])
    return existing


async def upsert_data_entry_clerk_bank_account(
    session: AsyncSession,
    *,
    clerk_id: UUID,
    bank_branch_id: UUID,
    account_number: str,
) -> DataEntryClerkBankAccount:
    clerk = await session.get(DataEntryClerk, clerk_id)
    if clerk is None:
        raise ValueError("Data entry clerk not found.")

    bb = await session.get(BankBranch, bank_branch_id)
    if bb is None:
        raise ValueError("Selected bank branch not found.")

    existing = await get_data_entry_clerk_bank_account(session, clerk_id)
    for_update = existing is not None
    normalized = normalize_account_for_save(
        account_number,
        bank_name=cast(str, bb.bank_name),
        bank_code=cast(str, bb.bank_code),
        for_update=for_update,
    )

    now = datetime.utcnow()
    if existing is None:
        row = DataEntryClerkBankAccount(
            clerk_id=clerk_id,
            bank_branch_id=bank_branch_id,
            account_number=normalized,
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        await session.flush()
        await session.refresh(row, attribute_names=["bank_branch"])
        return row

    existing.bank_branch_id = bank_branch_id
    existing.account_number = normalized
    existing.updated_at = now
    await session.flush()
    await session.refresh(existing, attribute_names=["bank_branch"])
    return existing
