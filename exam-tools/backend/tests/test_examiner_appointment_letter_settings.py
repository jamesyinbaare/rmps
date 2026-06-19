"""Tests for appointment letter signatory and CC settings."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock

import pytest

from app.models import (
    AppointmentLetterSigningOfficial,
    ExaminerType,
    Examination,
    ExaminationExaminerAppointmentLetterSettings,
    ExaminationExaminerAppointmentLetterSubjectSettings,
    Subject,
    SubjectType,
)
from app.services.examiner_appointment_letter_pdf import (
    DEFAULT_COORDINATION_VENUE,
    DUMMY_APPOINTMENT_LETTEE_NAME,
    _appointment_role_context,
    _render_appointment_letter_body_html,
    appointment_letter_examination_label,
)
from app.services.examiner_appointment_letter_settings import (
    DEFAULT_CC_LINES,
    DEFAULT_DIRECTOR_ASSESSMENT_NAME,
    DEFAULT_DIRECTOR_ASSESSMENT_TITLE,
    DEFAULT_VALEDICTION,
    copy_settings_from_examination,
    require_letter_date_for_pdf,
    resolve_dac_for_subject,
    resolve_letter_date,
    resolve_signatory_context,
    settings_to_response,
    validate_signature_upload,
)
from app.services.exam_documents import ExamDocumentUploadError

pytest.importorskip("weasyprint", reason="WeasyPrint required for appointment letter HTML test")


def _sample_row(**overrides) -> ExaminationExaminerAppointmentLetterSettings:
    row = ExaminationExaminerAppointmentLetterSettings(
        examination_id=1,
        signing_official=AppointmentLetterSigningOfficial.DIRECTOR_ASSESSMENT_CERTIFICATION,
        signed_for_director_general=True,
        director_general_name="DG Name",
        director_general_title="DIRECTOR-GENERAL",
        director_assessment_name="DAC Name",
        director_assessment_title="DIRECTOR 1, ASSESSMENT AND CERTIFICATION",
        cc_lines=["The Accountant.", "The Internal Auditor."],
        updated_at=datetime.utcnow(),
    )
    for key, value in overrides.items():
        setattr(row, key, value)
    return row


def test_settings_to_response_defaults_without_row() -> None:
    resp = settings_to_response(42, None)
    assert resp.examination_id == 42
    assert resp.signing_official.value == "director_assessment_certification"
    assert resp.signed_for_director_general is True
    assert resp.director_assessment_name == DEFAULT_DIRECTOR_ASSESSMENT_NAME
    assert resp.director_assessment_title == DEFAULT_DIRECTOR_ASSESSMENT_TITLE
    assert resp.valediction == DEFAULT_VALEDICTION
    assert resp.cc_lines == DEFAULT_CC_LINES
    assert resp.director_general_signature.has_signature is False
    assert resp.director_assessment_signature.has_signature is False


def test_resolve_letter_date_returns_none_without_row() -> None:
    assert resolve_letter_date(None) is None


def test_require_letter_date_for_pdf_raises_when_unset() -> None:
    with pytest.raises(ValueError, match="letter date"):
        require_letter_date_for_pdf(None)


def test_require_letter_date_for_pdf_uses_configured_date() -> None:
    from datetime import date

    row = _sample_row(letter_date=date(2026, 3, 15))
    resolved = require_letter_date_for_pdf(row)
    assert resolved.year == 2026
    assert resolved.month == 3
    assert resolved.day == 15


def test_resolve_signatory_context_dac_signs_for_dg() -> None:
    row = _sample_row()
    ctx = resolve_signatory_context(row)
    assert ctx["signatory_name"] == "DAC Name"
    assert ctx["signatory_title"] == "DIRECTOR 1, ASSESSMENT AND CERTIFICATION"
    assert ctx["signed_for_director_general"] is True
    assert ctx["valediction"] == DEFAULT_VALEDICTION
    assert ctx["cc_lines"] == ["The Accountant.", "The Internal Auditor."]


def test_resolve_signatory_context_dg_signs_without_for_line() -> None:
    row = _sample_row(
        signing_official=AppointmentLetterSigningOfficial.DIRECTOR_GENERAL,
        director_general_name="John Doe",
        director_general_title="DIRECTOR-GENERAL",
    )
    ctx = resolve_signatory_context(row)
    assert ctx["signatory_name"] == "John Doe"
    assert ctx["signatory_title"] == "DIRECTOR-GENERAL"
    assert ctx["signed_for_director_general"] is False


def test_resolve_dac_for_subject_uses_subject_override() -> None:
    exam_row = _sample_row()
    subject_row = ExaminationExaminerAppointmentLetterSubjectSettings(
        examination_id=1,
        subject_id=211,
        director_assessment_name="Subject DAC",
        director_assessment_title="SUBJECT TITLE",
        director_assessment_signature_path=None,
        updated_at=datetime.utcnow(),
    )
    name, title, sig_path, uses_name, uses_title, uses_sig = resolve_dac_for_subject(exam_row, subject_row)
    assert name == "Subject DAC"
    assert title == "SUBJECT TITLE"
    assert uses_name is False
    assert uses_title is False
    assert uses_sig is True


def test_resolve_signatory_context_uses_subject_dac_override() -> None:
    exam_row = _sample_row()
    subject_row = ExaminationExaminerAppointmentLetterSubjectSettings(
        examination_id=1,
        subject_id=211,
        director_assessment_name="Per Subject DAC",
        director_assessment_title="PER SUBJECT TITLE",
        director_assessment_signature_path=None,
        updated_at=datetime.utcnow(),
    )
    ctx = resolve_signatory_context(exam_row, subject_row)
    assert ctx["signatory_name"] == "Per Subject DAC"
    assert ctx["signatory_title"] == "PER SUBJECT TITLE"


def test_validate_signature_upload_rejects_large_file() -> None:
    with pytest.raises(ExamDocumentUploadError, match="500 KB"):
        validate_signature_upload(b"x" * 600_000, "sig.png")


def test_validate_signature_upload_rejects_invalid_type() -> None:
    with pytest.raises(ExamDocumentUploadError, match="PNG"):
        validate_signature_upload(b"abc", "sig.pdf")


def test_validate_signature_upload_accepts_png() -> None:
    assert validate_signature_upload(b"\x89PNG", "sig.png") == ".png"


def test_appointment_letter_examination_label_includes_subject_type() -> None:
    exam = Examination(year=2026, exam_series="May/June", exam_type="Certificate II")
    subject = Subject(name="Entrepreneurship", subject_type=SubjectType.CORE)
    assert (
        appointment_letter_examination_label(exam, subject)
        == "2026 May/June Certificate II Core Subjects Examinations"
    )


def test_render_appointment_letter_body_includes_signatory_name() -> None:
    html = _render_appointment_letter_body_html(
        context={
            "examination_label": "2026 May/June Certificate II Core Subjects Examinations",
            "examination_label_upper": "2026 MAY/JUNE CERTIFICATE II CORE SUBJECTS EXAMINATIONS",
            "invitee_name": DUMMY_APPOINTMENT_LETTEE_NAME,
            "phone_number": "",
            "examiner_type_label": "Chief examiner",
            "subject_label": "Mathematics",
            "subject_name": "Mathematics",
            "region": "Greater Accra",
            "coordination_date": None,
            "coordination_start_time": None,
            "coordination_end_time": None,
            "coordination_venue": DEFAULT_COORDINATION_VENUE,
            "marking_start_date": None,
            "marking_end_date": None,
            "examiner_role_title": "Chief Examiner",
            "examiner_role_article": "a",
            "conditions_section_heading": "CONDITIONS",
            "fees_section_heading": "FEES",
            "show_red_marking_pen_instruction": False,
            "show_green_vetting_pen_instruction": True,
            "show_confidentiality_example_clause": True,
            "examiner_type": "chief_examiner",
            "signatory_name": "Custom Signatory",
            "signatory_title": "CUSTOM TITLE",
            "signed_for_director_general": True,
            "valediction": "Yours faithfully",
            "cc_lines": ["The Accountant.", "The Internal Auditor."],
            "signatory_signature_src": None,
        },
    )
    assert "Custom Signatory" in html
    assert "CUSTOM TITLE" in html
    assert "FOR: DIRECTOR-GENERAL" in html
    assert "The Accountant." in html


def test_appointment_letter_intro_uses_formal_wording() -> None:
    subject_label = "Mathematics (Core)"
    html = _render_appointment_letter_body_html(
        context={
            "examination_label": "2025 May/June Certificate II Core Subjects Examinations",
            "examination_label_upper": "2025 MAY/JUNE CERTIFICATE II CORE SUBJECTS EXAMINATIONS",
            "invitee_name": "Core Math Examiner 013",
            "phone_number": "",
            "examiner_type_label": "Assistant examiner",
            "subject_label": subject_label,
            "subject_name": "Mathematics (Core)",
            "region": "Greater Accra",
            "coordination_date": "Monday, 8 June 2026 to Tuesday, 9 June 2026",
            "coordination_start_time": "10:00am",
            "coordination_end_time": "4:00pm",
            "coordination_venue": DEFAULT_COORDINATION_VENUE,
            "marking_start_date": None,
            "marking_end_date": None,
            **_appointment_role_context(ExaminerType.ASSISTANT),
            "signatory_name": "Custom Signatory",
            "signatory_title": "CUSTOM TITLE",
            "signed_for_director_general": True,
            "valediction": "Yours faithfully",
            "cc_lines": ["The Accountant."],
            "signatory_signature_src": None,
        },
    )
    assert "has the honour" in html
    assert "Co-ordination Meeting and Script Marking" in html
    assert "confirms your appointment" in html
    assert subject_label in html
    assert "marking and vetting" in html
    assert "Co-ordination Meeting." in html
    assert "will begin at" in html
    assert "and end at" in html
    assert "commence" not in html
    assert "conclude" not in html
    assert "pleased to invite" not in html
    assert "You are invited as" not in html
    assert "special responsibility" not in html
    assert "performance of candidates" not in html


def test_appointment_letter_chief_examiner_keeps_confidentiality_example() -> None:
    html = _render_appointment_letter_body_html(
        context={
            "examination_label": "2026 May/June Certificate II Core Subjects Examinations",
            "examination_label_upper": "2026 MAY/JUNE CERTIFICATE II CORE SUBJECTS EXAMINATIONS",
            "invitee_name": "Chief Examiner",
            "phone_number": "",
            "examiner_type_label": "Chief examiner",
            "subject_label": "Entrepreneurship",
            "subject_name": "Entrepreneurship",
            "region": "Greater Accra",
            "coordination_date": None,
            "coordination_start_time": None,
            "coordination_end_time": None,
            "coordination_venue": DEFAULT_COORDINATION_VENUE,
            "marking_start_date": None,
            "marking_end_date": None,
            **_appointment_role_context(ExaminerType.CHIEF),
            "signatory_name": "Signatory",
            "signatory_title": "TITLE",
            "signed_for_director_general": True,
            "valediction": "Yours faithfully",
            "cc_lines": ["The Accountant."],
            "signatory_signature_src": None,
        },
    )
    assert "performance of candidates" in html


@pytest.mark.asyncio
async def test_copy_settings_from_examination_clones_text_and_signatures(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    monkeypatch.setattr("app.config.settings.storage_backend", "local")
    monkeypatch.setattr("app.config.settings.storage_path", str(tmp_path / "documents"))

    from app.services.exam_documents import write_stored_file

    source_sig = write_stored_file(b"\x89PNG-source", ".png")

    source = _sample_row(
        examination_id=10,
        director_assessment_signature_path=source_sig,
        cc_lines=["Line A.", "Line B."],
    )
    target = _sample_row(examination_id=20, director_general_name="Old DG")

    session = AsyncMock()

    async def fake_get_settings_row(_session, examination_id: int):
        if examination_id == 10:
            return source
        if examination_id == 20:
            return target
        return None

    monkeypatch.setattr(
        "app.services.examiner_appointment_letter_settings.get_settings_row",
        fake_get_settings_row,
    )

    async def fake_get_or_create(_session, examination_id: int):
        assert examination_id == 20
        return target

    monkeypatch.setattr(
        "app.services.examiner_appointment_letter_settings.get_or_create_settings",
        fake_get_or_create,
    )
    monkeypatch.setattr(
        "app.services.examiner_appointment_letter_settings.copy_subject_settings_from_examination",
        AsyncMock(return_value=(0, 0)),
    )

    row, cc_count, sig_count, subjects_copied = await copy_settings_from_examination(
        session,
        target_examination_id=20,
        source_examination_id=10,
    )

    assert row is target
    assert cc_count == 2
    assert sig_count == 1
    assert subjects_copied == 0
    assert target.director_assessment_name == "DAC Name"
    assert target.director_general_name == "DG Name"
    assert target.director_assessment_signature_path != source_sig
    assert target.director_assessment_signature_path is not None


@pytest.mark.asyncio
async def test_copy_settings_from_examination_without_source_uses_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = _sample_row(examination_id=20, director_general_name="Old DG")
    session = AsyncMock()

    async def fake_get_settings_row(_session, examination_id: int):
        if examination_id == 20:
            return target
        return None

    async def fake_get_or_create(_session, examination_id: int):
        return target

    monkeypatch.setattr(
        "app.services.examiner_appointment_letter_settings.get_settings_row",
        fake_get_settings_row,
    )
    monkeypatch.setattr(
        "app.services.examiner_appointment_letter_settings.get_or_create_settings",
        fake_get_or_create,
    )
    monkeypatch.setattr(
        "app.services.examiner_appointment_letter_settings.copy_subject_settings_from_examination",
        AsyncMock(return_value=(0, 0)),
    )

    row, cc_count, sig_count, subjects_copied = await copy_settings_from_examination(
        session,
        target_examination_id=20,
        source_examination_id=99,
    )

    assert row is target
    assert cc_count == len(DEFAULT_CC_LINES)
    assert sig_count == 0
    assert subjects_copied == 0
