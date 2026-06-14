"""PDF generation for printable lunch coupon sheets (10 per A4 page, 2 columns)."""

from __future__ import annotations

import math
from pathlib import Path

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

COUPONS_PER_PAGE = 10
TEMPLATE_REL = "lunch-coupon/lunch-coupons-sheet.html"


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
) -> bytes:
    pages = _paginate_coupons(coupons)
    templates_dir = Path(__file__).parent.parent / "templates"
    app_dir = Path(__file__).parent.parent.resolve()
    main_html = render_html(
        {
            "examination_label": examination_label_str,
            "subject_label": subject_label,
            "pages": pages,
        },
        TEMPLATE_REL,
        templates_dir,
    )
    pdf_gen = PdfGenerator(main_html=main_html, base_url=str(app_dir))
    return pdf_gen.render_pdf()


async def load_examiners_for_lunch_coupons(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> tuple[Examination, Subject, list[Examiner], int]:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")

    subject = await session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

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

    missing_codes = sum(1 for e in examiners if not (e.reference_code or "").strip())
    if missing_codes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{missing_codes} examiner(s) on this subject have no reference code assigned. "
                "Assign reference codes before printing lunch coupons."
            ),
        )

    with_codes = [e for e in examiners if (e.reference_code or "").strip()]
    if not with_codes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No examiners with reference codes on this subject.",
        )

    return exam, subject, with_codes, missing_codes


async def generate_lunch_coupons_pdf(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> tuple[bytes, str]:
    exam, subject, examiners, _ = await load_examiners_for_lunch_coupons(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
    )

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
    )

    safe_sub = "".join(c for c in sub_label if c.isalnum() or c in ("_", "-", " ")).strip().replace(" ", "_")[:40]
    page_count = max(1, math.ceil(len(coupons) / COUPONS_PER_PAGE))
    filename = f"lunch_coupons_exam_{examination_id}_{safe_sub or subject_id}_{page_count}p.pdf"
    return pdf_bytes, filename
