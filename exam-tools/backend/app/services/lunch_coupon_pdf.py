"""PDF generation for printable lunch coupon sheets (10 per A4 page, 2 columns)."""

from __future__ import annotations

import math
from pathlib import Path
from uuid import UUID

import qrcode
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Examiner, ExaminerSubject, Examination, Subject
from app.services.exam_official_export import examination_label
from app.services.examiner_qr_payload import build_examiner_qr_payload
from app.services.pdf_generator import PdfGenerator, render_html
from app.services.qr_code import generate_qr_code_base64
from app.services.subject_marking_group import load_group

COUPONS_PER_PAGE = 10
TEMPLATE_REL = "lunch-coupon/lunch-coupons-sheet.html"
DEFAULT_BRAND_COLOR_KEY = "ctvred"

BRAND_COLOR_PRESETS: dict[str, str] = {
    "ctvred": "#CE1126",
    "navy": "#1E3A5F",
    "forest": "#1F5C4A",
    "royal": "#1D4ED8",
    "burgundy": "#7F1D1D",
    "slate": "#334155",
}


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    if len(value) != 6:
        raise ValueError("Invalid hex color")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def _soft_tint_hex(hex_color: str, mix_ratio: float = 0.06) -> str:
    r, g, b = _hex_to_rgb(hex_color)
    soft_r = round(255 * (1 - mix_ratio) + r * mix_ratio)
    soft_g = round(255 * (1 - mix_ratio) + g * mix_ratio)
    soft_b = round(255 * (1 - mix_ratio) + b * mix_ratio)
    return f"#{soft_r:02X}{soft_g:02X}{soft_b:02X}"


def resolve_brand_color(preset_key: str | None) -> tuple[str, str, str]:
    key = (preset_key or DEFAULT_BRAND_COLOR_KEY).strip().lower()
    accent = BRAND_COLOR_PRESETS.get(key)
    if accent is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown brand color preset. Choose one of: {', '.join(BRAND_COLOR_PRESETS)}.",
        )
    return accent, _soft_tint_hex(accent), key


def _subject_label(subject: Subject) -> str:
    code = (subject.original_code or subject.code or "").strip()
    name = (subject.name or "").strip()
    if code and name:
        return f"{code} — {name}"
    return code or name or f"Subject {subject.id}"


def _paginate_coupons(coupons: list[dict | None]) -> list[list[dict | None]]:
    padded: list[dict | None] = list(coupons)
    remainder = len(padded) % COUPONS_PER_PAGE
    if remainder:
        padded.extend([None] * (COUPONS_PER_PAGE - remainder))
    pages: list[list[dict | None]] = []
    for i in range(0, len(padded), COUPONS_PER_PAGE):
        pages.append(padded[i : i + COUPONS_PER_PAGE])
    return pages


def _render_lunch_coupons_pdf_sync(
    *,
    examination_label_str: str,
    subject_label: str,
    coupons: list[dict],
    brand_color: str,
    brand_color_soft: str,
    cohort_name: str | None = None,
) -> bytes:
    pages = _paginate_coupons(coupons)
    templates_dir = Path(__file__).parent.parent / "templates"
    app_dir = Path(__file__).parent.parent.resolve()
    main_html = render_html(
        {
            "examination_label": examination_label_str,
            "subject_label": subject_label,
            "pages": pages,
            "brand_color": brand_color,
            "brand_color_soft": brand_color_soft,
            "cohort_name": cohort_name,
        },
        TEMPLATE_REL,
        templates_dir,
    )
    pdf_gen = PdfGenerator(main_html=main_html, base_url=str(app_dir))
    return pdf_gen.render_pdf()


def _filter_examiners_with_codes(
    examiners: list[Examiner],
    *,
    empty_detail: str,
    no_codes_detail: str,
) -> tuple[list[Examiner], int]:
    with_codes = [e for e in examiners if (e.reference_code or "").strip()]
    if not with_codes:
        if not examiners:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=empty_detail,
            )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=no_codes_detail,
        )
    return with_codes, len(examiners) - len(with_codes)


async def load_examiners_for_lunch_coupons(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID | None = None,
) -> tuple[Examination, Subject, list[Examiner], int, str | None]:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")

    subject = await session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    cohort_name: str | None = None
    if group_id is not None:
        group = await load_group(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
            group_id=group_id,
        )
        if group is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cohort not found")

        cohort_name = group.name
        examiner_ids = [m.examiner_id for m in group.members]
        if not examiner_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="This cohort has no examiners. Add members before printing.",
            )

        stmt = (
            select(Examiner)
            .where(
                Examiner.examination_id == examination_id,
                Examiner.id.in_(examiner_ids),
            )
            .options(selectinload(Examiner.subjects))
            .order_by(Examiner.name)
        )
        examiners = list((await session.execute(stmt)).scalars().all())
        with_codes, missing = _filter_examiners_with_codes(
            examiners,
            empty_detail="No examiners found for this cohort.",
            no_codes_detail=(
                "No examiners in this cohort have a reference code assigned. "
                "Assign reference codes before printing lunch coupons."
            ),
        )
        return exam, subject, with_codes, missing, cohort_name

    stmt = (
        select(Examiner)
        .join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id)
        .where(
            Examiner.examination_id == examination_id,
            ExaminerSubject.subject_id == subject_id,
        )
        .options(selectinload(Examiner.subjects))
        .order_by(Examiner.name)
    )
    examiners = list((await session.execute(stmt)).scalars().unique().all())
    with_codes, missing = _filter_examiners_with_codes(
        examiners,
        empty_detail="No examiners on this subject.",
        no_codes_detail=(
            "No examiners on this subject have a reference code assigned. "
            "Assign reference codes before printing lunch coupons."
        ),
    )
    return exam, subject, with_codes, missing, cohort_name


async def generate_lunch_coupons_pdf(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID | None = None,
    color: str | None = None,
) -> tuple[bytes, str]:
    exam, subject, examiners, _, cohort_name = await load_examiners_for_lunch_coupons(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )
    brand_color, brand_color_soft, _ = resolve_brand_color(color)

    coupons: list[dict] = []
    for examiner in examiners:
        ref = (examiner.reference_code or "").strip().upper()
        payload = build_examiner_qr_payload(examination_id, ref)
        coupons.append(
            {
                "name": examiner.name,
                "reference_code": ref,
                "qr_base64": generate_qr_code_base64(
                    payload,
                    box_size=14,
                    border=2,
                    error_correction=qrcode.constants.ERROR_CORRECT_M,
                ),
            }
        )

    exam_label = examination_label(exam)
    sub_label = _subject_label(subject)
    pdf_bytes = _render_lunch_coupons_pdf_sync(
        examination_label_str=exam_label,
        subject_label=sub_label,
        coupons=coupons,
        brand_color=brand_color,
        brand_color_soft=brand_color_soft,
        cohort_name=cohort_name,
    )

    safe_sub = "".join(c for c in sub_label if c.isalnum() or c in ("_", "-", " ")).strip().replace(" ", "_")[:40]
    safe_cohort = (
        "".join(c for c in (cohort_name or "") if c.isalnum() or c in ("_", "-", " ")).strip().replace(" ", "_")[:30]
        if cohort_name
        else ""
    )
    page_count = max(1, math.ceil(len(coupons) / COUPONS_PER_PAGE))
    parts = ["lunch_coupons"]
    if safe_cohort:
        parts.append(safe_cohort)
    parts.append(safe_sub or str(subject_id))
    parts.append(f"{page_count}p.pdf")
    filename = "_".join(parts)
    return pdf_bytes, filename
