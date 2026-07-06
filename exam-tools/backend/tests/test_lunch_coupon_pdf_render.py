"""WeasyPrint smoke tests for lunch coupon PDF rendering."""

from __future__ import annotations

import pytest

from app.services.lunch_coupon_pdf import _render_lunch_coupons_pdf_sync
from app.services.qr_code import generate_qr_code_base64

pytest.importorskip("weasyprint", reason="WeasyPrint required for HTML→PDF in this test")


def _sample_coupons(count: int) -> list[dict]:
    coupons: list[dict] = []
    for index in range(1, count + 1):
        ref = f"MATH301-NAE{index}"
        coupons.append(
            {
                "name": f"Examiner {index}",
                "reference_code": ref,
                "qr_base64": generate_qr_code_base64(f"1:{ref}"),
            }
        )
    return coupons


def test_render_lunch_coupons_pdf_sync_produces_pdf() -> None:
    pdf_bytes = _render_lunch_coupons_pdf_sync(
        examination_label_str="2026 MAY/JUNE Certificate II",
        subject_label="MATH301 — Mathematics",
        coupons=_sample_coupons(3),
        brand_color="#CE1126",
        brand_color_soft="#FFF5F6",
        cohort_name="North cohort",
    )

    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 5_000


def test_render_lunch_coupons_pdf_sync_pads_last_page() -> None:
    pdf_bytes = _render_lunch_coupons_pdf_sync(
        examination_label_str="2026 MAY/JUNE Certificate II",
        subject_label="MATH301 — Mathematics",
        coupons=_sample_coupons(23),
        brand_color="#1E3A5F",
        brand_color_soft="#F2F4F7",
        cohort_name=None,
    )

    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 10_000
