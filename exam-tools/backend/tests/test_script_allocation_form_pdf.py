"""Scripts allocation form PDF: merge behaviour and single-page render."""

from io import BytesIO

import pytest
from PyPDF2 import PdfReader

from app.services.script_allocation_form_pdf import (
    ALLOCATION_ROWS_PAGE_ONE,
    MAX_COPIES,
    MAX_SCHOOL_DISPLAY_LEN,
    _annotate_series_tones,
    _format_school_display,
    _merge_pdf_copies,
    _paginate_allocation_rows,
    _render_one_examiner_pdf_sync,
    _subject_label,
)
from app.models import Subject

pytest.importorskip("weasyprint", reason="WeasyPrint required for HTML→PDF in this test")


def _sample_row(index: int) -> dict[str, int | str]:
    return {
        "school_code": f"S{index:03d}",
        "school_name": f"School {index}",
        "school_display": f"S{index:03d} - School {index}",
        "envelope_number": index,
        "series_number": 1,
        "booklet_count": 10,
    }


def _render_pdf_with_row_count(row_count: int) -> bytes:
    rows = [_sample_row(i) for i in range(1, row_count + 1)]
    return _render_one_examiner_pdf_sync(
        examination_id=1,
        examination_label_str="2026 Series NovDec",
        year=2026,
        subject_label="MATH301 - Mathematics",
        paper_number=2,
        examiner_name="A. Examiner",
        examiner_region="Greater Accra",
        reference_code="REF-001",
        rows=rows,
        total_count=10 * row_count,
    )


@pytest.mark.parametrize(
    ("row_count", "expected_pages", "expected_show_total"),
    [
        (0, 1, [True]),
        (10, 1, [True]),
        (25, 1, [True]),
        (26, 2, [False, True]),
        (40, 2, [False, True]),
        (55, 2, [False, True]),
        (70, 3, [False, False, True]),
        (90, 4, [False, False, False, True]),
    ],
)
def test_paginate_allocation_rows(
    row_count: int,
    expected_pages: int,
    expected_show_total: list[bool],
) -> None:
    rows = [_sample_row(i) for i in range(1, row_count + 1)]
    pages = _paginate_allocation_rows(rows)

    assert len(pages) == expected_pages
    assert [page["show_total"] for page in pages] == expected_show_total
    assert sum(len(page["rows"]) for page in pages) == row_count

    if expected_pages == 1:
        assert pages[0]["is_first"] is True
        assert pages[0]["is_last"] is True
        assert pages[0]["start_index"] == 1
    else:
        assert pages[0]["is_first"] is True
        assert pages[0]["is_last"] is False
        assert pages[0]["show_total"] is False
        assert len(pages[0]["rows"]) == ALLOCATION_ROWS_PAGE_ONE
        assert pages[-1]["is_last"] is True
        assert pages[-1]["show_total"] is True


@pytest.mark.parametrize(
    ("row_count", "expected_row_counts"),
    [
        (55, [25, 30]),
        (70, [25, 30, 15]),
        (90, [25, 30, 30, 5]),
    ],
)
def test_paginate_allocation_rows_splits(row_count: int, expected_row_counts: list[int]) -> None:
    rows = [_sample_row(i) for i in range(1, row_count + 1)]
    pages = _paginate_allocation_rows(rows)

    assert [len(page["rows"]) for page in pages] == expected_row_counts
    assert pages[0]["is_first"] is True
    assert pages[-1]["is_last"] is True
    for page in pages[:-1]:
        assert page["show_total"] is False
        assert page["is_last"] is False
    assert pages[-1]["show_total"] is True


def _assert_total_and_signature_only_on_last_page(pdf: bytes) -> None:
    reader = PdfReader(BytesIO(pdf))
    page_count = len(reader.pages)
    for index, page in enumerate(reader.pages):
        text = (page.extract_text() or "").lower()
        is_last = index == page_count - 1
        if is_last:
            assert "total booklets" in text
            assert "receiving officer" in text
            assert f"page {page_count} of {page_count}" in text
        else:
            assert "total booklets" not in text
            assert "receiving officer" not in text
            assert "i confirm receipt" not in text


def test_paginate_allocation_rows_reserves_closing_page_capacity() -> None:
    rows = [_sample_row(i) for i in range(1, 56)]
    pages = _paginate_allocation_rows(rows)

    assert len(pages) == 2
    assert [len(page["rows"]) for page in pages] == [25, 30]
    assert sum(len(page["rows"]) for page in pages) == 55


def test_render_pdf_single_page_at_or_below_threshold() -> None:
    pdf = _render_pdf_with_row_count(10)
    assert pdf.startswith(b"%PDF")
    assert len(PdfReader(BytesIO(pdf)).pages) == 1


def test_render_pdf_two_pages_above_threshold() -> None:
    pdf = _render_pdf_with_row_count(30)
    assert pdf.startswith(b"%PDF")
    reader = PdfReader(BytesIO(pdf))
    assert len(reader.pages) == 2


def test_multi_page_pdf_total_and_signature_only_on_last_page() -> None:
    pdf = _render_pdf_with_row_count(30)
    reader = PdfReader(BytesIO(pdf))
    assert len(reader.pages) == 2
    _assert_total_and_signature_only_on_last_page(pdf)


def test_render_pdf_fifty_five_rows_two_pages() -> None:
    pdf = _render_pdf_with_row_count(55)
    assert pdf.startswith(b"%PDF")
    assert len(PdfReader(BytesIO(pdf)).pages) == 2
    _assert_total_and_signature_only_on_last_page(pdf)


def test_render_pdf_ninety_rows_four_pages() -> None:
    pdf = _render_pdf_with_row_count(90)
    assert pdf.startswith(b"%PDF")
    assert len(PdfReader(BytesIO(pdf)).pages) == 4
    _assert_total_and_signature_only_on_last_page(pdf)


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
