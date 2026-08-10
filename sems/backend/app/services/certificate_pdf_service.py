"""ReportLab overlay PDF for pre-printed certificate stock."""

from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from typing import Any

from reportlab.lib.colors import black
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

MM_TO_PT = 72.0 / 25.4
DEFAULT_DATE_FORMAT = "%d %B %Y"


def _mm_to_pt(value_mm: float) -> float:
    return value_mm * MM_TO_PT


def default_layout() -> dict[str, Any]:
    from app.schemas.certificate import DEFAULT_CERTIFICATE_LAYOUT

    return {
        "fields": [dict(field) for field in DEFAULT_CERTIFICATE_LAYOUT["fields"]],
    }


def format_issuance_date(
    value: date | datetime | str | None,
    date_format: str = DEFAULT_DATE_FORMAT,
) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        try:
            return value.strftime(date_format)
        except ValueError:
            return value.strftime(DEFAULT_DATE_FORMAT)
    return str(value)


def build_certificate_context(
    *,
    candidate_name: str,
    index_number: str,
    school_name: str,
    certificate_number: str,
    subjects: list[dict[str, str]],
    issuance_date: date | datetime | str | None = None,
    date_format: str = DEFAULT_DATE_FORMAT,
    school_code: str = "",
    programme_name: str = "",
    exam_year: str = "",
    exam_type: str = "",
    exam_series: str = "",
    exam_description: str = "",
    extra: dict[str, str] | None = None,
) -> dict[str, Any]:
    formatted_date = format_issuance_date(issuance_date, date_format)
    ctx: dict[str, Any] = {
        "candidate_name": candidate_name,
        "index_number": index_number,
        "school_name": school_name,
        "school_code": school_code,
        "programme_name": programme_name,
        "certificate_number": certificate_number,
        "subjects": subjects,
        "issuance_date": formatted_date,
        "completion_date": formatted_date,
        "exam_year": exam_year,
        "exam_type": exam_type,
        "exam_series": exam_series,
        "exam_description": exam_description,
    }
    if extra:
        ctx.update(extra)
    return ctx


def render_certificate_overlay_pdf(
    *,
    page_width_mm: float,
    page_height_mm: float,
    layout_json: dict[str, Any] | None,
    context: dict[str, Any],
    images: dict[str, bytes] | None = None,
) -> bytes:
    """
    Render a transparent overlay PDF with positioned certificate fields.

    Layout coordinates use top-left origin in millimetres (editor-friendly).
    ReportLab uses bottom-left origin in points; conversion happens here.

    Field types:
    - text / omitted: draw context[key] or field.static_value
    - subjects: subject/grade list
    - image: draw images[asset_key] at position with width/height mm
    """
    layout = layout_json or default_layout()
    fields = layout.get("fields") or default_layout()["fields"]
    images = images or {}

    width_pt = _mm_to_pt(page_width_mm)
    height_pt = _mm_to_pt(page_height_mm)

    buffer = BytesIO()
    can = canvas.Canvas(buffer, pagesize=(width_pt, height_pt))
    can.setFillColor(black)

    for field in fields:
        key = field.get("key")
        if not key:
            continue
        field_type = str(field.get("type") or "text").lower()
        x_mm = float(field.get("x_mm", 0))
        y_mm = float(field.get("y_mm", 0))
        x_pt = _mm_to_pt(x_mm)

        if field_type == "image":
            asset_key = str(field.get("asset_key") or key)
            image_bytes = images.get(asset_key)
            if not image_bytes:
                continue
            width_mm = float(field.get("width_mm") or field.get("max_width_mm") or 40)
            height_mm = float(field.get("height_mm") or 15)
            img_width_pt = _mm_to_pt(width_mm)
            img_height_pt = _mm_to_pt(height_mm)
            # y_mm is top of image box from page top
            y_pt = height_pt - _mm_to_pt(y_mm) - img_height_pt
            try:
                img = ImageReader(BytesIO(image_bytes))
                can.drawImage(
                    img,
                    x_pt,
                    y_pt,
                    width=img_width_pt,
                    height=img_height_pt,
                    mask="auto",
                    preserveAspectRatio=True,
                    anchor="c",
                )
            except Exception:
                continue
            continue

        font_size = float(field.get("font_size", 11))
        align = str(field.get("align", "left")).lower()
        max_width_mm = field.get("max_width_mm")
        max_width_pt = _mm_to_pt(float(max_width_mm)) if max_width_mm is not None else None
        y_pt = height_pt - _mm_to_pt(y_mm) - font_size
        can.setFont("Helvetica", font_size)

        if key == "subjects" or field_type == "subjects":
            _draw_subjects(
                can,
                subjects=context.get("subjects") or [],
                x_pt=x_pt,
                y_pt=y_pt,
                font_size=font_size,
                line_height_mm=float(field.get("line_height_mm", 6)),
                columns=field.get("columns") or ["subject_name", "grade"],
            )
            continue

        if field.get("static_value") is not None:
            text = str(field.get("static_value") or "")
        else:
            text = str(context.get(key, "") or "")
        if not text:
            continue
        if max_width_pt is not None:
            text = _truncate_to_width(text, "Helvetica", font_size, max_width_pt)
        _draw_aligned_text(can, text, x_pt, y_pt, align=align, max_width_pt=max_width_pt)

    can.showPage()
    can.save()
    buffer.seek(0)
    return buffer.read()


def _draw_aligned_text(
    can: canvas.Canvas,
    text: str,
    x_pt: float,
    y_pt: float,
    *,
    align: str,
    max_width_pt: float | None,
) -> None:
    if align == "center" and max_width_pt is not None:
        can.drawCentredString(x_pt + max_width_pt / 2, y_pt, text)
    elif align == "right" and max_width_pt is not None:
        can.drawRightString(x_pt + max_width_pt, y_pt, text)
    elif align == "right":
        can.drawRightString(x_pt, y_pt, text)
    else:
        can.drawString(x_pt, y_pt, text)


def _truncate_to_width(text: str, font_name: str, font_size: float, max_width_pt: float) -> str:
    if stringWidth(text, font_name, font_size) <= max_width_pt:
        return text
    ellipsis = "…"
    truncated = text
    while truncated and stringWidth(truncated + ellipsis, font_name, font_size) > max_width_pt:
        truncated = truncated[:-1]
    return (truncated + ellipsis) if truncated else ellipsis


def _draw_subjects(
    can: canvas.Canvas,
    *,
    subjects: list[dict[str, str]],
    x_pt: float,
    y_pt: float,
    font_size: float,
    line_height_mm: float,
    columns: list[str],
) -> None:
    line_height_pt = _mm_to_pt(line_height_mm)
    can.setFont("Helvetica", font_size)
    for index, subject in enumerate(subjects):
        parts: list[str] = []
        for column in columns:
            value = subject.get(column)
            if value:
                parts.append(str(value))
        line = "  —  ".join(parts) if len(parts) > 1 else (parts[0] if parts else "")
        if not line:
            continue
        can.drawString(x_pt, y_pt - index * line_height_pt, line)
