"""Minimal test for score sheet PDF generation (new layout). Run from backend: uv run python scripts/test_score_sheet_pdf.py"""
from pathlib import Path

from app.services.pdf_annotator import annotate_pdf_with_sheet_ids
from app.services.pdf_generator import generate_score_sheet_pdf

# Mock candidates: 25 -> 1 page, then 30 -> 2 pages
for n, expected_pages in [(25, 1), (30, 2)]:
    candidates = [
        {"index": f"SB{c:04d}", "index_number": f"SB{c:04d}", "name": f"Candidate {c}"}
        for c in range(1, n + 1)
    ]
    pdf_bytes, page_count = generate_score_sheet_pdf(
        school_code="123456",
        school_name="Test School",
        subject_code="MTH",
        subject_name="Mathematics",
        series=1,
        test_type=1,
        candidates=candidates,
    )
    assert page_count == expected_pages, f"candidates={n}: expected {expected_pages} pages, got {page_count}"
    print(f"candidates={n}: {page_count} page(s) ok")

# Use 30 for annotated output
candidates = [
    {"index": f"SB{c:04d}", "index_number": f"SB{c:04d}", "name": f"Candidate {c}"}
    for c in range(1, 31)
]
pdf_bytes, page_count = generate_score_sheet_pdf(
    school_code="123456",
    school_name="Test School",
    subject_code="MTH",
    subject_name="Mathematics",
    series=1,
    test_type=1,
    candidates=candidates,
)
sheet_ids = ["123456MTH1101", "123456MTH1102"]
annotated = annotate_pdf_with_sheet_ids(pdf_bytes, sheet_ids)

out = Path("score_sheets") / "test_score_sheet_layout.pdf"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(annotated)
print(f"Saved to {out.absolute()}")
