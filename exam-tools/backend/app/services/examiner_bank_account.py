"""Bank account CRUD for rostered examiners (one account per examiner)."""

from __future__ import annotations

from datetime import datetime
from typing import cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import BankBranch, ExaminerBankAccount, ExaminerInvitation, ExaminerInvitationStatus
from app.services.exam_official_account import normalize_account_for_save


def require_accepted_invitation_for_bank(inv: ExaminerInvitation) -> UUID:
    """Return examiner_id when invitation is accepted and rostered."""
    if inv.status != ExaminerInvitationStatus.ACCEPTED:
        raise ValueError("Bank details can only be submitted after confirming availability.")
    if inv.examiner_id is None:
        raise ValueError("Examiner record not found for this invitation.")
    return inv.examiner_id


async def get_by_examiner_id(
    session: AsyncSession,
    examiner_id: UUID,
) -> ExaminerBankAccount | None:
    stmt = (
        select(ExaminerBankAccount)
        .where(ExaminerBankAccount.examiner_id == examiner_id)
        .options(selectinload(ExaminerBankAccount.bank_branch))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def bank_account_to_dict(row: ExaminerBankAccount) -> dict:
    bb = row.bank_branch
    return {
        "id": row.id,
        "examiner_id": row.examiner_id,
        "bank_branch_id": row.bank_branch_id,
        "bank_code": cast(str, bb.bank_code),
        "bank_name": cast(str, bb.bank_name),
        "branch_name": cast(str, bb.branch_name),
        "account_number": cast(str, row.account_number),
        "created_at": cast(datetime, row.created_at),
        "updated_at": cast(datetime, row.updated_at),
    }


async def upsert_for_examiner(
    session: AsyncSession,
    *,
    examiner_id: UUID,
    bank_branch_id: UUID,
    account_number: str,
) -> ExaminerBankAccount:
    bb = await session.get(BankBranch, bank_branch_id)
    if bb is None:
        raise ValueError("Selected bank branch not found.")

    existing = await get_by_examiner_id(session, examiner_id)
    for_update = existing is not None
    normalized = normalize_account_for_save(
        account_number,
        bank_name=cast(str, bb.bank_name),
        bank_code=cast(str, bb.bank_code),
        for_update=for_update,
    )

    now = datetime.utcnow()
    if existing is None:
        row = ExaminerBankAccount(
            examiner_id=examiner_id,
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
