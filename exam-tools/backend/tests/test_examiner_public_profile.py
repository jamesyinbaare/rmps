"""Tests for public examiner profile: scripts allocation and appointment letter."""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import ExaminerInvitationStatus, ExaminerType, Region, Subject
from app.services.examiner_invitation import public_invitation_view
from app.services.examiner_public_profile import (
    get_scripts_allocation_for_invitation,
    require_accepted_invitation_for_profile,
)

pytest.importorskip("weasyprint", reason="WeasyPrint required for appointment letter PDF test")


def _mock_invitation(**overrides: object) -> MagicMock:
    inv = MagicMock()
    inv.status = ExaminerInvitationStatus.ACCEPTED
    inv.examiner_id = uuid4()
    inv.examination_id = 1
    inv.subject_id = 10
    inv.examiner_type = ExaminerType.ASSISTANT
    inv.region = Region.ASHANTI
    inv.name = "Jane Doe"
    inv.phone_number = "0551234567"
    inv.coordination_date = datetime(2026, 6, 20, 9, 0)
    for key, value in overrides.items():
        setattr(inv, key, value)
    return inv


def test_require_accepted_invitation_for_profile_accepts_rostered() -> None:
    examiner_id = uuid4()
    inv = _mock_invitation(examiner_id=examiner_id)
    assert require_accepted_invitation_for_profile(inv) == examiner_id


def test_require_accepted_invitation_for_profile_rejects_pending() -> None:
    inv = _mock_invitation(status=ExaminerInvitationStatus.PENDING)
    with pytest.raises(ValueError, match="after confirming"):
        require_accepted_invitation_for_profile(inv)


def test_public_invitation_view_includes_examiner_id_when_accepted() -> None:
    examiner_id = uuid4()
    inv = MagicMock()
    inv.name = "Jane Doe"
    inv.phone_number = "0551234567"
    inv.examiner_type = ExaminerType.ASSISTANT
    inv.region = Region.ASHANTI
    inv.status = ExaminerInvitationStatus.ACCEPTED
    inv.examiner_id = examiner_id
    inv.response_deadline = datetime.utcnow() + timedelta(days=7)
    inv.coordination_date = None
    inv.responded_at = datetime.utcnow()
    sub = MagicMock(spec=Subject)
    sub.code = "301"
    sub.original_code = "MATH301"
    sub.name = "Mathematics"
    inv.subject = sub
    exam = MagicMock()
    exam.exam_type = "BECE"
    exam.year = 2026
    exam.description = None
    inv.examination = exam

    view = public_invitation_view(inv)
    assert view["examiner_id"] == examiner_id
    assert view["status"] == "accepted"


def test_public_invitation_view_omits_examiner_id_when_pending() -> None:
    inv = MagicMock()
    inv.name = "Jane Doe"
    inv.phone_number = "0551234567"
    inv.examiner_type = ExaminerType.ASSISTANT
    inv.region = Region.ASHANTI
    inv.status = ExaminerInvitationStatus.PENDING
    inv.examiner_id = None
    inv.response_deadline = datetime.utcnow() + timedelta(days=7)
    inv.coordination_date = None
    inv.responded_at = None
    sub = MagicMock(spec=Subject)
    sub.code = "301"
    sub.original_code = None
    sub.name = "Mathematics"
    inv.subject = sub
    exam = MagicMock()
    exam.exam_type = "BECE"
    exam.year = 2026
    exam.description = None
    inv.examination = exam

    view = public_invitation_view(inv)
    assert view["examiner_id"] is None


@pytest.mark.asyncio
async def test_get_scripts_allocation_for_invitation_rejects_pending() -> None:
    session = AsyncMock()
    inv = _mock_invitation(status=ExaminerInvitationStatus.PENDING)
    with pytest.raises(ValueError, match="after confirming"):
        await get_scripts_allocation_for_invitation(session, inv)


@pytest.mark.asyncio
async def test_get_scripts_allocation_for_invitation_empty_when_no_runs() -> None:
    session = AsyncMock()
    inv = _mock_invitation()

    alloc_result = MagicMock()
    alloc_result.scalars.return_value.all.return_value = []
    session.execute = AsyncMock(return_value=alloc_result)

    data = await get_scripts_allocation_for_invitation(session, inv)
    assert data == {"blocks": []}


def test_appointment_letter_pdf_returns_pdf_bytes() -> None:
    from app.services.examiner_appointment_letter_pdf import _render_appointment_letter_pdf_sync

    pdf = _render_appointment_letter_pdf_sync(
        examination_label_str="NovDec 2026 (Series)",
        invitee_name="Jane Doe",
        phone_number="0551234567",
        examiner_type_label="Assistant examiner",
        subject_label="Mathematics (MATH301)",
        region="Ashanti",
        coordination_date="Friday, 20 June 2026",
    )
    assert pdf.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_build_examiner_appointment_letter_pdf_async() -> None:
    from app.services.examiner_appointment_letter_pdf import build_examiner_appointment_letter_pdf

    inv = _mock_invitation()
    sub = MagicMock(spec=Subject)
    sub.code = "301"
    sub.original_code = "MATH301"
    sub.name = "Mathematics"
    inv.subject = sub
    exam = MagicMock()
    exam.exam_type = "NovDec"
    exam.year = 2026
    exam.exam_series = "Series"
    inv.examination = exam

    pdf, filename = await build_examiner_appointment_letter_pdf(inv)
    assert pdf.startswith(b"%PDF")
    assert filename.startswith("appointment_letter_")
    assert filename.endswith(".pdf")
