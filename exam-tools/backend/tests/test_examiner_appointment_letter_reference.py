"""Tests for appointment letter reference configuration and preview."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import ExaminerType
from app.services.examiner_appointment_letter_pdf import (
    DEFAULT_COORDINATION_VENUE,
    DUMMY_APPOINTMENT_LETTEE_NAME,
    _normalize_coordination_venue,
)
from app.services.examiner_appointment_letter_settings import (
    DEFAULT_DIRECTOR_ASSESSMENT_NAME,
    DEFAULT_DIRECTOR_ASSESSMENT_TITLE,
    DEFAULT_VALEDICTION,
)
from app.services.examiner_appointment_letter_reference import (
    appointment_reference_number_fallback,
    load_configured_appointment_letter_reference,
    resolve_appointment_letter_reference_number,
)

pytest.importorskip("weasyprint", reason="WeasyPrint required for appointment letter PDF test")


def test_appointment_reference_number_fallback() -> None:
    entity_id = uuid4()
    ref = appointment_reference_number_fallback(
        examination_id=42,
        subject_code="MATH301",
        entity_id=entity_id,
    )
    assert ref.startswith("CTVET/EXM/42/MATH301/")


def test_normalize_coordination_venue_uses_default_when_empty() -> None:
    assert _normalize_coordination_venue(None) == DEFAULT_COORDINATION_VENUE
    assert _normalize_coordination_venue("  ") == DEFAULT_COORDINATION_VENUE
    assert _normalize_coordination_venue("Custom Hall") == "Custom Hall"


@pytest.mark.asyncio
async def test_load_configured_appointment_letter_reference() -> None:
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = "CTVET/EXM/2026/MATH301/CE"
    session.execute = AsyncMock(return_value=result)

    ref = await load_configured_appointment_letter_reference(
        session,
        examination_id=1,
        subject_id=10,
        examiner_type=ExaminerType.CHIEF,
    )
    assert ref == "CTVET/EXM/2026/MATH301/CE"


@pytest.mark.asyncio
async def test_resolve_appointment_letter_reference_number_prefers_configured() -> None:
    session = AsyncMock()
    entity_id = uuid4()

    configured_result = MagicMock()
    configured_result.scalar_one_or_none.return_value = "REF-001"

    session.execute = AsyncMock(return_value=configured_result)

    ref = await resolve_appointment_letter_reference_number(
        session,
        examination_id=1,
        subject_id=10,
        examiner_type=ExaminerType.ASSISTANT,
        subject_code="MATH301",
        entity_id=entity_id,
    )
    assert ref == "REF-001"


@pytest.mark.asyncio
async def test_resolve_appointment_letter_reference_number_falls_back() -> None:
    session = AsyncMock()
    entity_id = uuid4()

    configured_result = MagicMock()
    configured_result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=configured_result)

    ref = await resolve_appointment_letter_reference_number(
        session,
        examination_id=1,
        subject_id=10,
        examiner_type=ExaminerType.ASSISTANT,
        subject_code="MATH301",
        entity_id=entity_id,
    )
    assert ref.startswith("CTVET/EXM/1/MATH301/")


def test_dummy_appointment_letter_preview_uses_placeholder_name() -> None:
    from app.services.examiner_appointment_letter_pdf import _render_appointment_letter_pdf_sync

    pdf = _render_appointment_letter_pdf_sync(
        context={
            "examination_label": "2026 BECE",
            "examination_label_upper": "2026 BECE",
            "invitee_name": DUMMY_APPOINTMENT_LETTEE_NAME,
            "phone_number": "",
            "examiner_type_label": "Chief examiner",
            "subject_label": "Mathematics (MATH301)",
            "subject_name": "Mathematics",
            "region": "Greater Accra",
            "coordination_date": "Monday, 9 June 2025 to Wednesday, 11 June 2025",
            "coordination_start_time": "9:00am",
            "coordination_end_time": "5:00pm",
            "coordination_venue": DEFAULT_COORDINATION_VENUE,
            "marking_start_date": "Monday, 15 June 2026",
            "marking_end_date": "Friday, 3 July 2026",
            "examiner_role_title": "Chief Examiner",
            "examiner_role_article": "a",
            "conditions_section_heading": "CONDITIONS",
            "fees_section_heading": "FEES",
            "show_red_marking_pen_instruction": False,
            "show_green_vetting_pen_instruction": True,
            "examiner_type": ExaminerType.CHIEF.value,
            "signatory_name": DEFAULT_DIRECTOR_ASSESSMENT_NAME,
            "signatory_title": DEFAULT_DIRECTOR_ASSESSMENT_TITLE,
            "signed_for_director_general": True,
            "valediction": DEFAULT_VALEDICTION,
            "cc_lines": ["The Accountant.", "The Internal Auditor."],
            "signatory_signature_src": None,
        },
        reference_number="CTVET/EXM/2026/MATH301/CE",
        letter_date=datetime(2026, 6, 13, tzinfo=timezone.utc),
    )
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 1000
    assert DUMMY_APPOINTMENT_LETTEE_NAME == "___________"
