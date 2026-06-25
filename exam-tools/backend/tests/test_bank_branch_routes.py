"""Router tests for authenticated bank branch directory search."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import BankBranch, UserRole
from app.routers.bank_branches import distinct_bank_names, list_bank_branches


@pytest.mark.asyncio
async def test_distinct_bank_names_route_delegates_to_query_service() -> None:
    session = AsyncMock()
    user = MagicMock(role=UserRole.INSPECTOR)

    with patch(
        "app.routers.bank_branches.query_distinct_bank_names",
        new_callable=AsyncMock,
        return_value=["GCB BANK LTD", "APEX BANK"],
    ) as query_mock:
        result = await distinct_bank_names(
            session=session,
            _user=user,
            q="gc",
            limit=100,
        )

    query_mock.assert_awaited_once_with(session, q="gc", limit=100)
    assert result == ["GCB BANK LTD", "APEX BANK"]


@pytest.mark.asyncio
async def test_list_bank_branches_route_returns_rows_for_inspector() -> None:
    session = AsyncMock()
    user = MagicMock(role=UserRole.INSPECTOR)
    branch_id = uuid4()
    now = datetime.now(UTC)
    row = BankBranch(
        id=branch_id,
        bank_code="123456",
        bank_name="GCB BANK LTD",
        branch_name="Main Branch",
        created_at=now,
        updated_at=now,
    )

    with patch(
        "app.routers.bank_branches.query_bank_branches",
        new_callable=AsyncMock,
        return_value=([row], 1),
    ) as query_mock:
        result = await list_bank_branches(
            session=session,
            _user=user,
            search=None,
            bank_name=None,
            bank_name_exact="GCB BANK LTD",
            branch_name=None,
            skip=0,
            limit=500,
        )

    query_mock.assert_awaited_once_with(
        session,
        search=None,
        bank_name=None,
        bank_name_exact="GCB BANK LTD",
        branch_name=None,
        skip=0,
        limit=500,
    )
    assert result.total == 1
    assert len(result.items) == 1
    assert result.items[0].id == branch_id
    assert result.items[0].bank_name == "GCB BANK LTD"
