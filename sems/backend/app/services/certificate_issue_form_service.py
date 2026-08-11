"""Institution certificate issue form PDF (receiving officer checklist)."""

from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException, status
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Candidate,
    CertificateIssuance,
    CertificateIssuanceStatus,
    Exam,
    ExamRegistration,
    Programme,
    School,
)

# Brand accents
TEAL = colors.HexColor("#0f766e")
INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#64748b")
RULE = colors.HexColor("#cbd5e1")
ZEBRA = colors.HexColor("#f0fdfa")
HEADER_BG = colors.HexColor("#ecfdf5")

CREST_PATH = Path(__file__).resolve().parents[2] / "img" / "logo-crest-only.png"
CREST_FALLBACK = (
    Path(__file__).resolve().parents[2] / "templates" / "score_sheets" / "logo-crest-only.png"
)

# Column x-offsets from left margin (A4 usable ~174mm with 18mm margins)
COL_NO = 0
COL_NAME = 12 * mm
COL_INDEX = 88 * mm
COL_CERT = 122 * mm
COL_RECV = 162 * mm

ROW_H = 7.2 * mm
GROUP_H = 8.2 * mm
SIG_BLOCK_H = 52 * mm
PAGE_FOOTER_H = 10 * mm


def _exam_label(exam: Exam) -> str:
    exam_type = exam.exam_type.value if hasattr(exam.exam_type, "value") else str(exam.exam_type)
    series = exam.series.value if hasattr(exam.series, "value") else str(exam.series)
    return f"{exam_type} · {series} · {exam.year}"


def _crest_path() -> Path | None:
    if CREST_PATH.exists():
        return CREST_PATH
    if CREST_FALLBACK.exists():
        return CREST_FALLBACK
    return None


def _fit_text(text: str, font: str, size: float, max_width: float) -> str:
    raw = (text or "").strip()
    if not raw:
        return ""
    if stringWidth(raw, font, size) <= max_width:
        return raw
    ellipsis = "…"
    while raw and stringWidth(raw + ellipsis, font, size) > max_width:
        raw = raw[:-1]
    return (raw + ellipsis) if raw else ellipsis


def issue_form_filters(
    *,
    exam_id: int,
    school_id: int,
    include_unnumbered: bool = False,
    programme_id: int | None = None,
) -> list:
    filters = [
        ExamRegistration.exam_id == exam_id,
        Candidate.school_id == school_id,
    ]
    if programme_id is not None:
        filters.append(Candidate.programme_id == programme_id)
    if not include_unnumbered:
        filters.append(CertificateIssuance.certificate_number.is_not(None))
    return filters


def _active_issuance_subquery():
    return (
        select(
            CertificateIssuance.exam_registration_id.label("exam_registration_id"),
            func.max(CertificateIssuance.id).label("issuance_id"),
        )
        .where(CertificateIssuance.status != CertificateIssuanceStatus.VOID)
        .group_by(CertificateIssuance.exam_registration_id)
        .subquery()
    )


async def load_issue_form_rows(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int,
    include_unnumbered: bool = False,
    programme_id: int | None = None,
) -> list[tuple[CertificateIssuance | None, ExamRegistration, Candidate, Programme | None]]:
    """Registered candidates for the school/exam, with their latest non-void issuance.

    Default includes only candidates who already have a certificate number.
    ``include_unnumbered`` adds the rest of the school's registered candidates.
    """
    latest = _active_issuance_subquery()
    filters = issue_form_filters(
        exam_id=exam_id,
        school_id=school_id,
        include_unnumbered=include_unnumbered,
        programme_id=programme_id,
    )
    stmt = (
        select(CertificateIssuance, ExamRegistration, Candidate, Programme)
        .select_from(ExamRegistration)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .outerjoin(Programme, Candidate.programme_id == Programme.id)
        .outerjoin(latest, latest.c.exam_registration_id == ExamRegistration.id)
        .outerjoin(CertificateIssuance, CertificateIssuance.id == latest.c.issuance_id)
        .where(*filters)
        .order_by(
            Programme.code.asc().nulls_last(),
            ExamRegistration.index_number,
            Candidate.name,
        )
    )
    return list((await session.execute(stmt)).all())


def empty_issue_form_detail(*, include_unnumbered: bool) -> str:
    if include_unnumbered:
        return "No registered candidates found for this school and examination"
    return "No candidates with certificate numbers found for this school and examination"


def _programme_key(programme: Programme | None) -> tuple[int | None, str, str]:
    if programme is None:
        return (None, "", "No programme")
    return (programme.id, programme.code or "", programme.name or programme.code or "Programme")


async def build_issue_form_pdf(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int,
    include_unnumbered: bool = False,
    programme_id: int | None = None,
) -> tuple[bytes, str]:
    exam = await session.get(Exam, exam_id)
    school = await session.get(School, school_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    rows = await load_issue_form_rows(
        session,
        exam_id=exam_id,
        school_id=school_id,
        include_unnumbered=include_unnumbered,
        programme_id=programme_id,
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=empty_issue_form_detail(include_unnumbered=include_unnumbered),
        )

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    page_w, page_h = A4
    margin = 18 * mm
    content_w = page_w - 2 * margin
    total = len(rows)
    page_num = 1
    y = page_h - margin

    crest = _crest_path()
    crest_reader: ImageReader | None = None
    if crest is not None:
        try:
            crest_reader = ImageReader(str(crest))
        except Exception:
            crest_reader = None

    def draw_page_footer() -> None:
        c.setStrokeColor(RULE)
        c.setLineWidth(0.4)
        c.line(margin, margin - 2 * mm, page_w - margin, margin - 2 * mm)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7.5)
        left = f"{school.code} · Certificate issue form"
        right = f"Page {page_num}"
        c.drawString(margin, margin - 6 * mm, left)
        c.drawRightString(page_w - margin, margin - 6 * mm, right)

    def draw_header(*, with_columns: bool = True) -> None:
        nonlocal y
        crest_size = 22 * mm
        text_left = margin + (crest_size + 4 * mm if crest_reader else 0)
        text_width = page_w - margin - text_left

        # Crest
        if crest_reader is not None:
            c.drawImage(
                crest_reader,
                margin,
                y - crest_size + 2 * mm,
                width=crest_size,
                height=crest_size,
                preserveAspectRatio=True,
                mask="auto",
            )

        # School name (primary)
        c.setFillColor(INK)
        name_font = "Helvetica-Bold"
        name_size = 14
        school_name = _fit_text(school.name or school.code, name_font, name_size, text_width)
        c.setFont(name_font, name_size)
        c.drawString(text_left, y - 4 * mm, school_name)

        # School code
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(text_left, y - 9 * mm, f"Centre code: {school.code}")

        # Form title
        c.setFillColor(TEAL)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(text_left, y - 15 * mm, "Certificate Issue Form")

        # Exam + meta
        c.setFillColor(INK)
        c.setFont("Helvetica", 8.5)
        count_label = "candidate(s)" if include_unnumbered else "certificate(s)"
        meta = f"{_exam_label(exam)}  ·  Printed {date.today().isoformat()}  ·  {total} {count_label}"
        c.drawString(text_left, y - 20 * mm, _fit_text(meta, "Helvetica", 8.5, text_width))

        y -= max(crest_size, 24 * mm) + 4 * mm

        # Accent rule
        c.setStrokeColor(TEAL)
        c.setLineWidth(1.6)
        c.line(margin, y, page_w - margin, y)
        y -= 1.2 * mm
        c.setStrokeColor(RULE)
        c.setLineWidth(0.5)
        c.line(margin, y, page_w - margin, y)
        y -= 6 * mm

        if not with_columns:
            return

        # Column header band
        band_h = 7 * mm
        c.setFillColor(HEADER_BG)
        c.rect(margin, y - 1.5 * mm, content_w, band_h, stroke=0, fill=1)
        c.setFillColor(TEAL)
        c.setFont("Helvetica-Bold", 8)
        header_y = y + 1.2 * mm
        c.drawString(margin + COL_NO, header_y, "No.")
        c.drawString(margin + COL_NAME, header_y, "Candidate name")
        c.drawString(margin + COL_INDEX, header_y, "Index number")
        c.drawString(margin + COL_CERT, header_y, "Certificate no.")
        c.drawRightString(margin + COL_RECV + 10 * mm, header_y, "Received")
        y -= band_h
        c.setStrokeColor(TEAL)
        c.setLineWidth(0.6)
        c.line(margin, y, page_w - margin, y)
        y -= 2 * mm

    def draw_programme_header(label: str, count: int) -> None:
        nonlocal y
        band_h = GROUP_H
        c.setFillColor(TEAL)
        c.rect(margin, y - band_h + 1.5 * mm, content_w, band_h, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 8)
        text_y = y - band_h + 4.2 * mm
        count_text = f"{count} candidate{'s' if count != 1 else ''}"
        c.drawString(margin + 2 * mm, text_y, _fit_text(label, "Helvetica-Bold", 8, content_w - 40 * mm))
        c.setFont("Helvetica", 8)
        c.drawRightString(page_w - margin - 2 * mm, text_y, count_text)
        y -= band_h + 1 * mm

    def draw_row(serial: int, name: str, index: str, cert_no: str, zebra: bool) -> None:
        nonlocal y
        row_bottom = y - ROW_H

        if zebra:
            c.setFillColor(ZEBRA)
            c.rect(margin, row_bottom, content_w, ROW_H, stroke=0, fill=1)

        text_y = row_bottom + 2.4 * mm
        c.setFillColor(INK)
        c.setFont("Helvetica", 8.5)
        c.drawString(margin + COL_NO, text_y, str(serial))

        name_max = COL_INDEX - COL_NAME - 2 * mm
        index_max = COL_CERT - COL_INDEX - 2 * mm
        cert_max = COL_RECV - COL_CERT - 2 * mm

        c.setFont("Helvetica", 8.5)
        c.drawString(margin + COL_NAME, text_y, _fit_text(name, "Helvetica", 8.5, name_max))
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor("#334155"))
        c.drawString(margin + COL_INDEX, text_y, _fit_text(index, "Helvetica", 8, index_max))
        c.drawString(margin + COL_CERT, text_y, _fit_text(cert_no, "Helvetica", 8, cert_max))

        # Received checkbox
        box = 3.8 * mm
        box_x = margin + COL_RECV + 2 * mm
        box_y = row_bottom + (ROW_H - box) / 2
        c.setStrokeColor(INK)
        c.setLineWidth(0.8)
        c.rect(box_x, box_y, box, box, stroke=1, fill=0)

        # Hairline under row
        c.setStrokeColor(RULE)
        c.setLineWidth(0.35)
        c.line(margin, row_bottom, page_w - margin, row_bottom)

        y = row_bottom

    def draw_signatures() -> None:
        nonlocal y
        y -= 6 * mm
        c.setStrokeColor(TEAL)
        c.setLineWidth(1.0)
        c.line(margin, y, page_w - margin, y)
        y -= 7 * mm

        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(margin, y, "Acknowledgement")
        y -= 5 * mm
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7.5)
        c.drawString(
            margin,
            y,
            "I confirm receipt of the certificates listed above for this institution.",
        )
        y -= 10 * mm

        col_w = (content_w - 8 * mm) / 2
        left_x = margin
        right_x = margin + col_w + 8 * mm
        line_w = col_w - 2 * mm

        def officer_block(x: float, title: str) -> None:
            local_y = y
            c.setFillColor(TEAL)
            c.setFont("Helvetica-Bold", 8.5)
            c.drawString(x, local_y, title)
            local_y -= 8 * mm
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 7.5)
            for label in ("Name", "Signature", "Date"):
                c.drawString(x, local_y, label)
                c.setStrokeColor(RULE)
                c.setLineWidth(0.6)
                c.line(x + 18 * mm, local_y - 1, x + line_w, local_y - 1)
                local_y -= 9 * mm

        officer_block(left_x, "Receiving officer")
        officer_block(right_x, "Issuing officer")
        y -= 36 * mm

    # --- render ---
    programme_counts: dict[tuple[int | None, str, str], int] = {}
    for _issuance, _exam_reg, _candidate, programme in rows:
        key = _programme_key(programme)
        programme_counts[key] = programme_counts.get(key, 0) + 1
    group_by_programme = len(programme_counts) > 1

    draw_header()

    current_key: tuple[int | None, str, str] | None = None
    serial = 0
    min_y = margin + PAGE_FOOTER_H + 4 * mm

    for issuance, exam_reg, candidate, programme in rows:
        key = _programme_key(programme)
        starting_group = group_by_programme and key != current_key
        needed = ROW_H + (GROUP_H + 1 * mm if starting_group else 0)
        if y - needed < min_y:
            draw_page_footer()
            c.showPage()
            page_num += 1
            y = page_h - margin
            draw_header()
            if group_by_programme and current_key is not None and key == current_key:
                _pid, prog_code, prog_name = key
                label = f"{prog_code} — {prog_name}" if prog_code else prog_name
                draw_programme_header(f"{label} (continued)", programme_counts[key])

        if starting_group:
            current_key = key
            serial = 0
            _pid, prog_code, prog_name = key
            label = f"{prog_code} — {prog_name}" if prog_code else prog_name
            draw_programme_header(label, programme_counts[key])

        serial += 1
        candidate_name = candidate.name or ""
        index = exam_reg.index_number or candidate.index_number or ""
        cert_no = (issuance.certificate_number if issuance else None) or "—"
        draw_row(serial, candidate_name, index, cert_no, zebra=(serial % 2 == 0))

    # Signature block — new page if needed
    if y < margin + PAGE_FOOTER_H + SIG_BLOCK_H:
        draw_page_footer()
        c.showPage()
        page_num += 1
        y = page_h - margin
        draw_header(with_columns=False)

    draw_signatures()
    draw_page_footer()

    c.save()
    filename = f"issue-form-{school.code}-{exam.year}-{datetime.utcnow().strftime('%Y%m%d')}.pdf"
    return buffer.getvalue(), filename
