"""Tests for examiner portal link rotation."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import Examiner, ExaminerInvitation, ExaminerInvitationStatus, UserRole
from app.routers.examiners import regenerate_examiner_portal_link_endpoint
from app.schemas.examiner_portal import ExaminerPortalLinkRegenerateRequest
from app.services.examiner_portal import (
    regenerate_examiner_portal_link,
    regenerate_invitation_portal_link,
    resolve_portal_token,
)


def _examiner_stub(*, portal_token: str = "old-roster-token") -> Examiner:
    ex = MagicMock(spec=Examiner)
    ex.id = uuid4()
    ex.portal_token = portal_token
    ex.invitation = None
    ex.updated_at = None
    return ex


def _invitation_stub(
    *,
    status: ExaminerInvitationStatus = ExaminerInvitationStatus.PENDING,
    token: str = "old-invite-token",
    examiner_id=None,
) -> ExaminerInvitation:
    inv = MagicMock(spec=ExaminerInvitation)
    inv.id = uuid4()
    inv.status = status
    inv.token = token
    inv.examiner_id = examiner_id
    inv.updated_at = None
    return inv


@pytest.mark.asyncio
async def test_regenerate_examiner_portal_link_syncs_accepted_invitation() -> None:
    examiner = _examiner_stub()
    inv = _invitation_stub(status=ExaminerInvitationStatus.ACCEPTED, token="old-roster-token")
    examiner.invitation = inv
    session = AsyncMock()
    session.flush = AsyncMock()

    with (
        patch(
            "app.services.examiner_portal.generate_unique_portal_token",
            new_callable=AsyncMock,
            return_value="new-shared-token",
        ),
        patch(
            "app.services.examiner_portal.examiner_portal_url",
            return_value="https://example.test/invite/new-shared-token",
        ),
    ):
        url = await regenerate_examiner_portal_link(session, examiner)

    assert url == "https://example.test/invite/new-shared-token"
    assert examiner.portal_token == "new-shared-token"
    assert inv.token == "new-shared-token"


@pytest.mark.asyncio
async def test_regenerate_invitation_portal_link_syncs_accepted_examiner() -> None:
    examiner_id = uuid4()
    examiner = _examiner_stub(portal_token="old-invite-token")
    inv = _invitation_stub(
        status=ExaminerInvitationStatus.ACCEPTED,
        token="old-invite-token",
        examiner_id=examiner_id,
    )
    session = AsyncMock()
    session.flush = AsyncMock()
    session.get = AsyncMock(return_value=examiner)

    with (
        patch(
            "app.services.examiner_portal.generate_unique_portal_token",
            new_callable=AsyncMock,
            return_value="new-invite-token",
        ),
        patch(
            "app.services.examiner_portal.invitation_public_url",
            return_value="https://example.test/invite/new-invite-token",
        ),
    ):
        url = await regenerate_invitation_portal_link(session, inv)

    assert url == "https://example.test/invite/new-invite-token"
    assert inv.token == "new-invite-token"
    assert examiner.portal_token == "new-invite-token"


@pytest.mark.asyncio
async def test_regenerate_invitation_portal_link_rotates_declined_invitation() -> None:
    inv = _invitation_stub(status=ExaminerInvitationStatus.DECLINED)
    session = AsyncMock()

    with (
        patch(
            "app.services.examiner_portal.generate_unique_portal_token",
            new_callable=AsyncMock,
            return_value="new-token",
        ),
        patch(
            "app.services.examiner_portal.invitation_public_url",
            return_value="https://example.test/invite/new-token",
        ),
    ):
        url = await regenerate_invitation_portal_link(session, inv)

    assert url == "https://example.test/invite/new-token"
    assert inv.token == "new-token"


@pytest.mark.asyncio
async def test_resolve_portal_token_returns_none_when_token_unknown() -> None:
    session = AsyncMock()
    lookup_result = MagicMock()
    lookup_result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=lookup_result)
    with patch(
        "app.services.examiner_portal.get_invitation_by_token",
        new_callable=AsyncMock,
        return_value=None,
    ):
        resolved = await resolve_portal_token(session, "old-token")
    assert resolved is None


@pytest.mark.asyncio
async def test_regenerate_examiner_portal_link_endpoint_requires_confirm() -> None:
    user = MagicMock(role=UserRole.SUPER_ADMIN)
    session = AsyncMock()
    with pytest.raises(HTTPException) as exc:
        await regenerate_examiner_portal_link_endpoint(
            session,
            user,
            1,
            uuid4(),
            ExaminerPortalLinkRegenerateRequest(confirm=False),
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_regenerate_examiner_portal_link_endpoint_returns_new_url() -> None:
    examiner = _examiner_stub()
    user = MagicMock(role=UserRole.SUPER_ADMIN)
    session = AsyncMock()
    lookup_result = MagicMock()
    lookup_result.scalar_one_or_none.return_value = examiner
    session.execute = AsyncMock(return_value=lookup_result)

    with (
        patch(
            "app.routers.examiners._assert_examiner_accessible",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.examiners.regenerate_examiner_portal_link",
            new_callable=AsyncMock,
            return_value="https://example.test/invite/new-token",
        ),
    ):
        result = await regenerate_examiner_portal_link_endpoint(
            session,
            user,
            1,
            examiner.id,
            ExaminerPortalLinkRegenerateRequest(confirm=True),
        )

    assert result.portal_url == "https://example.test/invite/new-token"
    assert result.examiner_id == examiner.id
    session.commit.assert_awaited_once()
