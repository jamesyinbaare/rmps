"""Shared bank branch directory queries for authenticated and token-scoped public pickers."""

from __future__ import annotations

from typing import cast

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BankBranch

MAX_LIST = 500
DEFAULT_LIMIT = 200


async def list_bank_branches(
    session: AsyncSession,
    *,
    bank_name: str | None = None,
    bank_name_exact: str | None = None,
    branch_name: str | None = None,
    skip: int = 0,
    limit: int = DEFAULT_LIMIT,
) -> tuple[list[BankBranch], int]:
    stmt = select(BankBranch)
    count_stmt = select(func.count()).select_from(BankBranch)

    if bank_name_exact and bank_name_exact.strip():
        exact = bank_name_exact.strip()
        stmt = stmt.where(BankBranch.bank_name == exact)
        count_stmt = count_stmt.where(BankBranch.bank_name == exact)
    elif bank_name and bank_name.strip():
        pat = f"%{bank_name.strip()}%"
        stmt = stmt.where(BankBranch.bank_name.ilike(pat))
        count_stmt = count_stmt.where(BankBranch.bank_name.ilike(pat))
    if branch_name and branch_name.strip():
        pat = f"%{branch_name.strip()}%"
        stmt = stmt.where(BankBranch.branch_name.ilike(pat))
        count_stmt = count_stmt.where(BankBranch.branch_name.ilike(pat))

    total = int(await session.scalar(count_stmt) or 0)
    stmt = (
        stmt.order_by(BankBranch.bank_name.asc(), BankBranch.branch_name.asc(), BankBranch.bank_code.asc())
        .offset(skip)
        .limit(limit)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all()), total


async def distinct_bank_names(
    session: AsyncSession,
    *,
    q: str | None = None,
    limit: int = 100,
) -> list[str]:
    stmt = select(BankBranch.bank_name).distinct()
    if q and q.strip():
        stmt = stmt.where(BankBranch.bank_name.ilike(f"%{q.strip()}%"))
    stmt = stmt.order_by(BankBranch.bank_name.asc()).limit(limit)
    result = await session.execute(stmt)
    return [cast(str, name) for name in result.scalars().all()]
