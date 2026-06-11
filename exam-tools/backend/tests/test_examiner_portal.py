"""Tests for examiner portal tokens, default cohorts, and public portal resolution."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import ExaminerInvitationStatus, ExaminerRosterSource, ExaminerType, Region
from app.services.examiner_portal import (
    ResolvedPortalExaminer,
    ResolvedPortalInvitation,
    examiner_portal_url,
    generate_portal_token,
)
from app.services.examiner_portal_public import invitation_is_publicly_accessible, public_roster_portal_view
from app.services.subject_marking_group import DEFAULT_COHORT_NAME


def test_generate_portal_token_unique() -> None:
    a = generate_portal_token()
    b = generate_portal_token()
    assert a != b
    assert len(a) > 10


def test_examiner_portal_url_uses_ei_path() -> None:
    with patch("app.services.examiner_invitation.settings") as settings:
        settings.examiner_invitation_base_url = "https://example.com"
        settings.examiner_invitation_link_path = "ei"
        url = examiner_portal_url("abc123")
    assert url == "https://example.com/ei/abc123"


def test_invitation_is_publicly_accessible_pending() -> None:
    inv = MagicMock()
    inv.status = ExaminerInvitationStatus.PENDING
    resolved = ResolvedPortalInvitation(kind="invitation", invitation=inv)
    assert invitation_is_publicly_accessible(resolved) is True


@pytest.mark.asyncio
async def test_public_roster_portal_view_payload() -> None:
    examiner = MagicMock()
    examiner.id = uuid4()
    examiner.name = "Jane Doe"
    examiner.phone_number = "0551234567"
    examiner.examiner_type = ExaminerType.ASSISTANT
    examiner.region = Region.ASHANTI
    examiner.examination_id = 1
    examiner.roster_source = ExaminerRosterSource.MANUAL

    exam = MagicMock()
    exam.exam_type = "BECE"
    exam.year = 2026
    exam.description = None

    subject = MagicMock()
    subject.id = 10
    subject.name = "Mathematics"
    subject.code = "301"
    subject.original_code = None

    resolved = ResolvedPortalExaminer(
        kind="roster",
        examiner=examiner,
        examination=exam,
        subject=subject,
    )
    session = AsyncMock()
    with patch(
        "app.services.examiner_portal_public.get_examiner_marking_groups",
        new=AsyncMock(return_value=[{"id": uuid4(), "name": DEFAULT_COHORT_NAME, "is_default": True}]),
    ):
        payload = await public_roster_portal_view(session, resolved)

    assert payload["portal_mode"] == "roster"
    assert payload["roster_source"] == "manual"
    assert payload["status"] == "accepted"
    assert payload["can_respond"] is False
    assert len(payload["marking_cohorts"]) == 1


@pytest.mark.asyncio
async def test_resolve_examiner_id_for_roster_portal() -> None:
    from app.services.examiner_portal import ResolvedPortalExaminer, resolve_examiner_id_for_portal_token

    examiner_id = uuid4()
    examiner = MagicMock()
    examiner.id = examiner_id

    resolved = ResolvedPortalExaminer(
        kind="roster",
        examiner=examiner,
        examination=MagicMock(),
        subject=MagicMock(),
    )
    session = AsyncMock()
    with patch(
        "app.services.examiner_portal.resolve_portal_token",
        new=AsyncMock(return_value=resolved),
    ):
        assert await resolve_examiner_id_for_portal_token(session, "token") == examiner_id


def test_default_cohort_name_constant() -> None:
    assert DEFAULT_COHORT_NAME == "All examiners"
