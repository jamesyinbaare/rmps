"""Tests for public examiner profile: scripts allocation and appointment letter."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import ExaminerAllowanceType, ExaminerInvitationStatus, ExaminerType, Region, Subject
from app.services.examiner_invitation import public_invitation_view
from app.services.examiner_public_profile import (
    get_examiner_scripts_allocation,
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
    inv.coordination_start_date = datetime(2026, 6, 20, 9, 0)
    inv.coordination_start_time = None
    inv.coordination_end_date = datetime(2026, 6, 20, 9, 0)
    inv.coordination_end_time = None
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
    inv.coordination_start_date = None
    inv.coordination_start_time = None
    inv.coordination_end_date = None
    inv.coordination_end_time = None
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
    inv.coordination_start_date = None
    inv.coordination_start_time = None
    inv.coordination_end_date = None
    inv.coordination_end_time = None
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

    with patch(
        "app.services.examiner_public_profile.is_scripts_allocation_visible_for_examiner",
        new_callable=AsyncMock,
        return_value=True,
    ):
        data = await get_scripts_allocation_for_invitation(session, inv)
    assert data == {"blocks": []}


@pytest.mark.asyncio
async def test_get_examiner_scripts_allocation_gated_returns_empty_blocks() -> None:
    session = AsyncMock()
    examiner_id = uuid4()

    with patch(
        "app.services.examiner_public_profile.is_scripts_allocation_visible_for_examiner",
        new_callable=AsyncMock,
        return_value=False,
    ):
        data = await get_examiner_scripts_allocation(
            session,
            examiner_id=examiner_id,
            examination_id=1,
            subject_id=10,
            apply_release_gate=True,
        )

    assert data == {"blocks": []}
    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_get_examiner_scripts_allocation_staff_bypasses_gate() -> None:
    session = AsyncMock()
    examiner_id = uuid4()

    alloc_result = MagicMock()
    alloc_result.scalars.return_value.all.return_value = []
    session.execute = AsyncMock(return_value=alloc_result)

    data = await get_examiner_scripts_allocation(
        session,
        examiner_id=examiner_id,
        examination_id=1,
        subject_id=10,
        apply_release_gate=False,
    )

    assert data == {"blocks": []}
    session.execute.assert_called()


def test_appointment_letter_pdf_returns_pdf_bytes() -> None:
    from datetime import datetime, timezone

    from app.services.examiner_appointment_letter_pdf import (
        _appointment_role_context,
        _render_appointment_letter_pdf_sync,
    )

    pdf = _render_appointment_letter_pdf_sync(
        context={
            "examination_label": "2026 Series NovDec",
            "examination_label_upper": "2026 SERIES NOVDEC",
            "invitee_name": "Jane Doe",
            "phone_number": "0551234567",
            "examiner_type_label": "Assistant examiner",
            "subject_label": "Mathematics (MATH301)",
            "subject_name": "Mathematics",
            "region": "Ashanti",
            "coordination_date": "Friday, 20 June 2026",
            "coordination_start_time": "10:00am",
            "coordination_end_time": "4:00pm",
            "coordination_venue": "Simulation Hall",
            "marking_start_date": "Monday, 22 June 2026",
            "marking_end_date": "Friday, 10 July 2026",
            **_appointment_role_context(ExaminerType.ASSISTANT),
            "marking_fee_amount": "3.50",
            "responsibility_allowance": "70.00",
            "inconvenience_allowance": "70.00",
            "travel_and_transport_amount": "700.00",
            "internal_commuting": "100.00",
            "signatory_name": "ERIC ASIEDU ANSAH",
            "signatory_title": "DIRECTOR 1, ASSESSMENT AND CERTIFICATION",
            "signed_for_director_general": True,
            "valediction": "Yours faithfully",
            "cc_lines": ["The Accountant.", "The Internal Auditor."],
            "signatory_signature_src": None,
        },
        reference_number="CTVET/EXM/1/MATH301/ABCD1234",
        letter_date=datetime(2026, 6, 13, tzinfo=timezone.utc),
    )
    assert pdf.startswith(b"%PDF")


def test_appointment_role_context_chief_examiner() -> None:
    from app.services.examiner_appointment_letter_pdf import _appointment_role_context

    ctx = _appointment_role_context(ExaminerType.CHIEF)
    assert ctx["examiner_role_title"] == "Chief Examiner"
    assert ctx["conditions_section_heading"] == "CONDITIONS OF APPOINTMENT AS A CHIEF EXAMINER"
    assert ctx["fees_section_heading"] == "FEES FOR CHIEF EXAMINERS: PAPER 2 (ESSAY/WRITTEN TEST)"
    assert ctx["show_red_marking_pen_instruction"] is False
    assert ctx["show_green_vetting_pen_instruction"] is True


def test_build_appointment_fee_context_from_rates_uses_subject_and_region_only() -> None:
    from app.services.examiner_appointment_letter_pdf import _build_appointment_fee_context_from_rates

    zone_id = uuid4()
    subject_id = 10
    other_subject_id = 20

    role_rates = {
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.RESPONSIBILITY): Decimal("70"),
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.INCONVENIENCE): Decimal("70"),
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.INTERNAL_COMMUTING): Decimal("100"),
    }
    marking_rates = {
        (subject_id, 2): Decimal("3.50"),
        (other_subject_id, 2): Decimal("4.00"),
    }
    travel_rates = {
        Region.ASHANTI: Decimal("350"),
        Region.GREATER_ACCRA: Decimal("200"),
    }
    travel_zones = {
        Region.ASHANTI: zone_id,
        Region.GREATER_ACCRA: uuid4(),
    }
    travel_role_factors = {
        (ExaminerType.ASSISTANT, zone_id): Decimal("2"),
    }

    travel_zone_names = {
        zone_id: "Zone A",
    }

    context = _build_appointment_fee_context_from_rates(
        role_rates=role_rates,
        marking_rates=marking_rates,
        travel_rates=travel_rates,
        travel_zones=travel_zones,
        travel_zone_names=travel_zone_names,
        travel_role_factors=travel_role_factors,
        examiner_type=ExaminerType.ASSISTANT,
        region=Region.ASHANTI,
        subject_id=subject_id,
    )

    assert context["marking_fee_amount"] == "3.50"
    assert context["travel_and_transport_amount"] == "700.00"
    assert context["chief_examiners_report_allowance"] is None
    assert context["vetting_of_scripts_allowance"] is None
    assert "travel_zone_lines" not in context
    assert "marking_fee_lines" not in context


def test_build_appointment_fee_context_omits_zero_amounts() -> None:
    from app.services.examiner_appointment_letter_pdf import _build_appointment_fee_context_from_rates

    subject_id = 10
    context = _build_appointment_fee_context_from_rates(
        role_rates={
            (ExaminerType.ASSISTANT, ExaminerAllowanceType.RESPONSIBILITY): Decimal("0"),
            (ExaminerType.ASSISTANT, ExaminerAllowanceType.INCONVENIENCE): Decimal("70"),
        },
        marking_rates={(subject_id, 2): Decimal("0")},
        travel_rates={},
        travel_zones={},
        travel_zone_names={},
        travel_role_factors={},
        examiner_type=ExaminerType.ASSISTANT,
        region=Region.GREATER_ACCRA,
        subject_id=subject_id,
    )

    assert context["marking_fee_amount"] is None
    assert context["responsibility_allowance"] is None
    assert context["inconvenience_allowance"] == "70.00"
    assert context["travel_and_transport_amount"] is None


def test_compute_travel_compensation_zero_when_region_unconfigured() -> None:
    from app.services.examiner_compensation import compute_travel_compensation

    comp = compute_travel_compensation(
        region=Region.ASHANTI,
        examiner_type=ExaminerType.ASSISTANT,
        travel_rates={},
        travel_zones={},
        travel_zone_names={},
        travel_role_factors={},
    )
    assert comp.payable_ghs == Decimal("0")


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
