"""Exam centre official summary PDF: row helpers and WeasyPrint render."""

from io import BytesIO

import pytest
from PyPDF2 import PdfReader

from app.models import ExamInspectorSubjectScope, Examination
from app.services.exam_official_summary_pdf import (
    MAX_ROWS_CONTINUATION_PAGE,
    MAX_ROWS_FIRST_PAGE,
    examination_scope_label,
    format_pdf_row_cells,
    official_rows_for_template,
    paginate_pdf_rows,
    render_summary_pdf_sync,
    scope_display_suffix,
    scope_filename_suffix,
    summary_export_filename,
    truncate_pdf_cell,
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


def test_truncate_pdf_cell() -> None:
    assert truncate_pdf_cell("Short", 10) == "Short"
    long_branch = "A" * 60
    assert truncate_pdf_cell(long_branch, 40) == ("A" * 37) + "..."


def test_paginate_pdf_rows_uniform_override() -> None:
    rows = [{"id": i} for i in range(25)]
    pages = paginate_pdf_rows(rows, page_size=10)
    assert len(pages) == 3
    assert len(pages[0]["rows"]) == 10
    assert pages[0]["start_index"] == 1
    assert pages[2]["start_index"] == 21
    assert len(pages[2]["rows"]) == 5


def test_paginate_pdf_rows_first_ten_then_fifteen() -> None:
    rows = [{"id": i} for i in range(30)]
    pages = paginate_pdf_rows(rows)
    assert len(pages) == 3
    assert len(pages[0]["rows"]) == MAX_ROWS_FIRST_PAGE
    assert pages[0]["is_first"] is True
    assert len(pages[1]["rows"]) == MAX_ROWS_CONTINUATION_PAGE
    assert pages[1]["is_first"] is False
    assert pages[1]["start_index"] == 11
    assert len(pages[2]["rows"]) == 5
    assert pages[2]["start_index"] == 26


def test_format_pdf_row_cells_truncates_branch() -> None:
    out = format_pdf_row_cells({"branch_name": "B" * 60, "full_name": "A"})
    assert out["branch_name"].endswith("...")
    assert len(out["branch_name"]) <= 40


def test_render_summary_pdf_sync_produces_pdf() -> None:
    rows = [
        format_pdf_row_cells(
            {
                "full_name": "Jane Doe",
                "designation": "Invigilator",
                "subject_scope": "CORE",
                "branch_name": "Accra Main",
                "telephone_number": "0241234567",
                "account_number": "1234567890123",
                "num_days": 5,
            }
        ),
    ]
    pages = paginate_pdf_rows(rows)
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
    assert len(pages) == 1


def test_render_summary_pdf_multipage() -> None:
    rows = [
        format_pdf_row_cells(
            {
                "full_name": f"Official {i}",
                "designation": "Invigilator",
                "subject_scope": "CORE",
                "branch_name": "Branch",
                "telephone_number": "0241234567",
                "account_number": "1234567890123",
                "num_days": 1,
            }
        )
        for i in range(15)
    ]
    pdf = render_summary_pdf_sync(
        examination_label_str="Exam",
        center_code="C1",
        center_name="Centre",
        subject_scope_label="2026 MAY/JUNE Certificate II (Core)",
        inspector_name="Inspector",
        rows=rows,
        generated_at="2026-05-25 12:00 UTC",
    )
    reader = PdfReader(BytesIO(pdf))
    # 15 rows → page 1 (10) + page 2 (5); signatures on each page (fixed).
    pages = paginate_pdf_rows(rows)
    assert len(pages) == 2
    assert len(reader.pages) >= 2


def test_official_rows_for_template_empty() -> None:
    assert official_rows_for_template([]) == []
