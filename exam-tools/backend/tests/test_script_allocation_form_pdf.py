"""Scripts allocation form PDF: merge behaviour and single-page render."""

from io import BytesIO

import pytest
from PyPDF2 import PdfReader

from app.services.script_allocation_form_pdf import (
    MAX_COPIES,
    MAX_SCHOOL_DISPLAY_LEN,
    _annotate_series_tones,
    _format_school_display,
    _merge_pdf_copies,
    _render_one_examiner_pdf_sync,
    _subject_label,
)
from app.models import Subject

pytest.importorskip("weasyprint", reason="WeasyPrint required for HTML→PDF in this test")


def test_merge_pdf_copies_doubles_page_count() -> None:
    single = _render_one_examiner_pdf_sync(
        examination_id=1,
        examination_label_str="2026 Series NovDec",
        year=2026,
        subject_label="Mathematics (MATH)",
        paper_number=2,
        examiner_name="A. Examiner",
        examiner_region="Greater Accra",
        reference_code=None,
        rows=[
            {
                "school_code": "S001",
                "school_name": "Sample SHS",
                "school_display": "S001 - Sample SHS",
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
        examination_id=1,
        examination_label_str="Exam",
        year=2025,
        subject_label="English (ENG)",
        paper_number=1,
        examiner_name="B. Name",
        examiner_region="Ashanti",
        reference_code=None,
        rows=[
            {
                "school_code": "X",
                "school_name": "X",
                "school_display": "X - X",
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


def test_format_school_display_combines_code_and_name() -> None:
    formatted = _format_school_display("A123", "Example Secondary School")
    assert formatted == "A123 - Example Secondary School"


def test_format_school_display_truncates_to_max_length() -> None:
    formatted = _format_school_display("LONGCODE", "A Very Long School Name For Allocation")
    assert len(formatted) == MAX_SCHOOL_DISPLAY_LEN
    assert formatted == "LONGCODE - A Very Long School Name Fo..."


def test_annotate_series_tones() -> None:
    single = [{"series_number": 1, "booklet_count": 10}]
    annotated = _annotate_series_tones(single)
    assert annotated[0]["series_tone"] is None

    mixed = [
        {"series_number": 2, "booklet_count": 10},
        {"series_number": 1, "booklet_count": 5},
        {"series_number": 2, "booklet_count": 3},
    ]
    annotated = _annotate_series_tones(mixed)
    assert annotated[0]["series_tone"] == 1
    assert annotated[1]["series_tone"] == 0
    assert annotated[2]["series_tone"] == 1


def test_subject_label_uses_original_code_and_name() -> None:
    subject = Subject(name="Mathematics", code="301", original_code="MATH301")
    assert _subject_label(subject, subject_id=1) == "MATH301 - Mathematics"


def test_render_multi_series_pdf() -> None:
    pdf = _render_one_examiner_pdf_sync(
        examination_id=1,
        examination_label_str="2026 Series NovDec",
        year=2026,
        subject_label="Mathematics (MATH)",
        paper_number=2,
        examiner_name="A. Examiner",
        examiner_region="Greater Accra",
        reference_code=None,
        rows=[
            {
                "school_code": "A1",
                "school_name": "Alpha SHS",
                "school_display": "A1 - Alpha SHS",
                "envelope_number": 1,
                "series_number": 1,
                "booklet_count": 12,
            },
            {
                "school_code": "B2",
                "school_name": "Beta SHS",
                "school_display": "B2 - Beta SHS",
                "envelope_number": 2,
                "series_number": 2,
                "booklet_count": 8,
            },
        ],
        total_count=20,
    )
    assert pdf.startswith(b"%PDF")
