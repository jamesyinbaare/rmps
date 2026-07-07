"""Tests for roster-canonical examiner role on portal and appointment letters."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import ExaminerInvitationStatus, ExaminerType, Region
from app.services.examiner_invitation import (
    effective_examiner_type_for_portal,
    sync_accepted_invitation_role_from_roster,
)
from app.services.examiner_portal import ResolvedPortalInvitation


def _mock_invitation(**overrides: object) -> MagicMock:
    inv = MagicMock()
    inv.id = uuid4()
    inv.status = ExaminerInvitationStatus.ACCEPTED
    inv.examiner_id = uuid4()
    inv.examiner_type = ExaminerType.ASSISTANT
    inv.examination_id = 1
    inv.subject_id = 1
    inv.name = "Jane Doe"
    inv.phone_number = "0240000000"
    inv.region = Region.ASHANTI
    inv.examination = MagicMock(exam_type="BECE", year=2026, description=None)
    inv.subject = MagicMock(name="Mathematics", code="MATH", original_code="MATH301")
    inv.coordination_start_date = None
    inv.coordination_start_time = None
    inv.coordination_end_date = None
    inv.coordination_end_time = None
    inv.coordination_venue = None
    inv.response_deadline = None
    inv.responded_at = datetime.utcnow()
    for key, value in overrides.items():
        setattr(inv, key, value)
    return inv


def _mock_examiner(**overrides: object) -> MagicMock:
    examiner = MagicMock()
    examiner.id = uuid4()
    examiner.examiner_type = ExaminerType.TEAM_LEADER
    examiner.reference_code = "MATH301-TL1"
    examiner.examination_id = 1
    for key, value in overrides.items():
        setattr(examiner, key, value)
    return examiner


def test_effective_examiner_type_uses_roster_for_accepted_linked_examiner() -> None:
    examiner_id = uuid4()
    inv = _mock_invitation(examiner_id=examiner_id, examiner_type=ExaminerType.ASSISTANT)
    examiner = _mock_examiner(id=examiner_id, examiner_type=ExaminerType.TEAM_LEADER)

    assert effective_examiner_type_for_portal(inv, examiner) == ExaminerType.TEAM_LEADER


def test_effective_examiner_type_uses_invitation_when_pending() -> None:
    examiner_id = uuid4()
    inv = _mock_invitation(
        status=ExaminerInvitationStatus.PENDING,
        examiner_id=None,
        examiner_type=ExaminerType.ASSISTANT,
    )
    examiner = _mock_examiner(id=examiner_id, examiner_type=ExaminerType.TEAM_LEADER)

    assert effective_examiner_type_for_portal(inv, examiner) == ExaminerType.ASSISTANT


def test_effective_examiner_type_uses_invitation_without_examiner() -> None:
    inv = _mock_invitation(examiner_type=ExaminerType.ASSISTANT)

    assert effective_examiner_type_for_portal(inv, None) == ExaminerType.ASSISTANT


def test_sync_accepted_invitation_role_from_roster_updates_linked_invitation() -> None:
    examiner_id = uuid4()
    inv = _mock_invitation(examiner_id=examiner_id, examiner_type=ExaminerType.ASSISTANT)
    examiner = _mock_examiner(id=examiner_id, invitation=inv)

    sync_accepted_invitation_role_from_roster(examiner, ExaminerType.TEAM_LEADER)

    assert inv.examiner_type == ExaminerType.TEAM_LEADER
    assert inv.updated_at is not None


def test_sync_accepted_invitation_role_from_roster_skips_pending() -> None:
    examiner_id = uuid4()
    inv = _mock_invitation(
        examiner_id=examiner_id,
        status=ExaminerInvitationStatus.PENDING,
        examiner_type=ExaminerType.ASSISTANT,
    )
    examiner = _mock_examiner(id=examiner_id, invitation=inv)

    sync_accepted_invitation_role_from_roster(examiner, ExaminerType.TEAM_LEADER)

    assert inv.examiner_type == ExaminerType.ASSISTANT


@pytest.mark.asyncio
async def test_public_invitation_portal_view_uses_roster_role() -> None:
    from app.services.examiner_portal_public import public_invitation_portal_view

    examiner_id = uuid4()
    inv = _mock_invitation(examiner_id=examiner_id, examiner_type=ExaminerType.ASSISTANT)
    examiner = _mock_examiner(id=examiner_id, examiner_type=ExaminerType.TEAM_LEADER)
    resolved = ResolvedPortalInvitation(kind="invitation", invitation=inv)
    session = AsyncMock()

    with (
        patch(
            "app.services.examiner_portal_public._load_examiner_with_subjects",
            new=AsyncMock(return_value=examiner),
        ),
        patch(
            "app.services.examiner_portal_public._marking_cohorts_for_examiner",
            new=AsyncMock(return_value=[]),
        ),
        patch(
            "app.services.examiner_portal_public.enrich_portal_with_release",
            new=AsyncMock(side_effect=lambda _session, summary, *_args, **_kwargs: summary),
        ),
    ):
        summary = await public_invitation_portal_view(session, resolved)

    assert summary["examiner_type"] == ExaminerType.TEAM_LEADER.value
    assert summary["examiner_type_label"] == "Team leader"


@pytest.mark.asyncio
async def test_build_examiner_appointment_letter_pdf_uses_roster_role() -> None:
    from app.services.examiner_appointment_letter_pdf import build_examiner_appointment_letter_pdf

    examiner_id = uuid4()
    inv = _mock_invitation(examiner_id=examiner_id, examiner_type=ExaminerType.ASSISTANT)
    examiner = _mock_examiner(id=examiner_id, examiner_type=ExaminerType.TEAM_LEADER)
    session = AsyncMock()
    session.get = AsyncMock(return_value=examiner)
    captured: dict = {}

    async def _fake_coordination(*_args, **_kwargs) -> dict:
        return {
            "coordination_date_range": "TBC",
            "coordination_venue": "Venue",
            "show_coordination_section": True,
        }

    async def _fake_reference_number(*_args, **_kwargs) -> str:
        return "REF-001"

    async def _fake_fee_context(*_args, **_kwargs) -> dict:
        return {}

    async def _fake_signatory(*_args, **_kwargs) -> dict:
        return {}

    async def _fake_letter_date(*_args, **_kwargs) -> datetime:
        return datetime(2026, 1, 1)

    def _fake_render(*, context, reference_number, letter_date) -> bytes:
        captured["context"] = context
        captured["reference_number"] = reference_number
        captured["letter_date"] = letter_date
        return b"%PDF"

    with (
        patch(
            "app.services.examiner_appointment_letter_pdf._load_cohort_coordination_for_letter",
            new=AsyncMock(side_effect=_fake_coordination),
        ),
        patch(
            "app.services.examiner_appointment_letter_pdf.resolve_appointment_letter_reference_number",
            new=AsyncMock(side_effect=_fake_reference_number),
        ),
        patch(
            "app.services.examiner_appointment_letter_pdf._build_appointment_fee_context",
            new=AsyncMock(side_effect=_fake_fee_context),
        ),
        patch(
            "app.services.examiner_appointment_letter_pdf._load_signatory_context",
            new=AsyncMock(side_effect=_fake_signatory),
        ),
        patch(
            "app.services.examiner_appointment_letter_pdf._load_letter_date",
            new=AsyncMock(side_effect=_fake_letter_date),
        ),
        patch(
            "app.services.examiner_appointment_letter_pdf._render_appointment_letter_pdf_sync",
            side_effect=_fake_render,
        ),
    ):
        pdf, _filename = await build_examiner_appointment_letter_pdf(inv, session)

    assert pdf == b"%PDF"
    assert captured["context"]["examiner_type"] == ExaminerType.TEAM_LEADER.value
    assert captured["context"]["examiner_type_label"] == "Team leader"
    assert captured["context"]["examiner_role_title"] == "Team Leader"
