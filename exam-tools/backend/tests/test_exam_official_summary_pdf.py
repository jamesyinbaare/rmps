"""Exam centre official summary PDF: row helpers and WeasyPrint render."""

from io import BytesIO

import pytest
from PyPDF2 import PdfReader

from app.models import ExamInspectorSubjectScope, Examination
from app.services.exam_official_summary_pdf import (
    examination_scope_label,
    official_rows_for_template,
    render_summary_pdf_sync,
    scope_display_suffix,
    scope_filename_suffix,
    summary_export_filename,
)

pytest.importorskip("weasyprint", reason="WeasyPrint required for HTML→PDF in this test")


def test_scope_display_suffix() -> None:
    assert scope_display_suffix(ExamInspectorSubjectScope.CORE) == "Core"
    assert scope_display_suffix(ExamInspectorSubjectScope.ELECTIVE) == "Electives"


def test_examination_scope_label() -> None:
    exam = Examination(
        id=1,
        year=2026,
        exam_series="MAY/JUNE",
        exam_type="Certificate II",
    )
    assert examination_scope_label(exam, ExamInspectorSubjectScope.CORE) == (
        "2026 MAY/JUNE Certificate II (Core)"
    )
    assert examination_scope_label(exam, ExamInspectorSubjectScope.ELECTIVE) == (
        "2026 MAY/JUNE Certificate II (Electives)"
    )


def test_scope_filename_suffix() -> None:
    assert scope_filename_suffix(ExamInspectorSubjectScope.CORE) == "CORE"
    assert scope_filename_suffix(ExamInspectorSubjectScope.ELECTIVE) == "ELECTIVE"
    assert scope_filename_suffix("core") == "CORE"


def test_summary_export_filename() -> None:
    name = summary_export_filename("SCH01", "Sample Centre", ExamInspectorSubjectScope.CORE)
    assert name.endswith("official_accounts_summary.pdf")
    assert "SCH01" in name
    assert "CORE" in name


def test_render_summary_pdf_sync_produces_pdf() -> None:
    rows = [
        {
            "full_name": "Jane Doe",
            "designation": "Invigilator",
            "subject_scope": "CORE",
            "bank_name": "GCB Bank",
            "branch_name": "Accra Main",
            "bank_code": "123456",
            "account_number": "1234567890123",
            "num_days": 5,
            "telephone_number": "0241234567",
        },
    ]
    pdf = render_summary_pdf_sync(
        examination_label_str="2026 Nov/Dec BECE",
        center_code="CTR01",
        center_name="Central High School",
        subject_scope_label="2026 MAY/JUNE Certificate II (Core)",
        inspector_name="Inspector One",
        rows=rows,
        generated_at="2026-05-25 12:00 UTC",
    )
    assert pdf.startswith(b"%PDF")
    reader = PdfReader(BytesIO(pdf))
    assert len(reader.pages) >= 1


def test_official_rows_for_template_empty() -> None:
    assert official_rows_for_template([]) == []
