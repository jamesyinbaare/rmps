"""Scripts allocation form PDF: merge behaviour and single-page render."""

from io import BytesIO

import pytest
from PyPDF2 import PdfReader

from app.services.script_allocation_form_pdf import MAX_COPIES, _merge_pdf_copies, _render_one_examiner_pdf_sync

pytest.importorskip("weasyprint", reason="WeasyPrint required for HTML→PDF in this test")


def test_merge_pdf_copies_doubles_page_count() -> None:
    single = _render_one_examiner_pdf_sync(
        examination_label_str="NovDec 2026 (Series)",
        year=2026,
        subject_label="Mathematics (MATH)",
        paper_number=2,
        examiner_name="A. Examiner",
        rows=[
            {
                "school_name": "Sample SHS",
                "envelope_number": 3,
                "series_number": 1,
                "booklet_count": 12,
            },
        ],
        total_count=12,
    )
    assert single.startswith(b"%PDF")
    r1 = PdfReader(BytesIO(single))
    n1 = len(r1.pages)
    assert n1 >= 1

    doubled = _merge_pdf_copies(single, 2)
    r2 = PdfReader(BytesIO(doubled))
    assert len(r2.pages) == 2 * n1


def test_merge_pdf_copies_one_is_unchanged() -> None:
    single = _render_one_examiner_pdf_sync(
        examination_label_str="Exam",
        year=2025,
        subject_label="English (ENG)",
        paper_number=1,
        examiner_name="B. Name",
        rows=[
            {
                "school_name": "X",
                "envelope_number": 1,
                "series_number": 1,
                "booklet_count": 1,
            },
        ],
        total_count=1,
    )
    assert _merge_pdf_copies(single, 1) == single


def test_max_copies_constant() -> None:
    assert MAX_COPIES == 20
