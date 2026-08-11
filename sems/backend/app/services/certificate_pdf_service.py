"""ReportLab overlay PDF for pre-printed certificate stock."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from io import BytesIO
from typing import Any

from reportlab.lib.colors import black
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)

MM_TO_PT = 72.0 / 25.4
DEFAULT_DATE_FORMAT = "%d %B %Y"


def _mm_to_pt(value_mm: float) -> float:
    return value_mm * MM_TO_PT


def coerce_layout(layout_json: Any) -> dict[str, Any]:
    if isinstance(layout_json, str):
        try:
            layout_json = json.loads(layout_json)
        except json.JSONDecodeError:
            return default_layout()
    if isinstance(layout_json, list):
        return {"fields": layout_json}
    if isinstance(layout_json, dict):
        return layout_json
    return default_layout()


def _field_type(field: dict[str, Any]) -> str:
    raw = str(field.get("type") or "").strip().lower()
    if raw in {"image", "subjects", "text"}:
        return raw
    key = str(field.get("key") or "").strip().lower()
    asset_key = str(field.get("asset_key") or "").strip().lower()
    if field.get("asset_key") or key.startswith("image") or key == "candidate_photo" or asset_key == "candidate_photo":
        return "image"
    if key == "subjects" or field.get("columns"):
        return "subjects"
    return "text"


def _index_images(images: dict[str, bytes]) -> dict[str, bytes]:
    indexed: dict[str, bytes] = {}
    for key, data in images.items():
        if not key or not data:
            continue
        indexed[str(key)] = data
        indexed[str(key).strip().lower()] = data
    return indexed


def _resolve_image_bytes(images: dict[str, bytes], field: dict[str, Any]) -> bytes | None:
    candidates = [
        field.get("asset_key"),
        field.get("key"),
        str(field.get("asset_key") or "").strip().lower(),
        str(field.get("key") or "").strip().lower(),
    ]
    for candidate in candidates:
        if candidate and candidate in images:
            return images[candidate]
    return None


def _prepare_image_bytes(image_bytes: bytes) -> bytes:
    from PIL import Image

    image = Image.open(BytesIO(image_bytes))
    image.load()
    if image.mode in {"RGBA", "LA"}:
        converted = image.convert("RGBA")
    elif image.mode == "P":
        converted = image.convert("RGBA" if "transparency" in image.info else "RGB")
    elif image.mode != "RGB":
        converted = image.convert("RGB")
    else:
        converted = image
    buffer = BytesIO()
    converted.save(buffer, format="PNG")
    return buffer.getvalue()


def _draw_image(
    can: canvas.Canvas,
    image_bytes: bytes,
    x_pt: float,
    y_pt: float,
    width_pt: float,
    height_pt: float,
) -> bool:
    try:
        prepared = _prepare_image_bytes(image_bytes)
    except Exception:
        prepared = image_bytes
    attempts: list[dict[str, Any]] = [
        {"mask": "auto", "preserveAspectRatio": True, "anchor": "c"},
        {"mask": "auto", "preserveAspectRatio": True},
        {"preserveAspectRatio": True},
        {},
    ]
    for kwargs in attempts:
        try:
            can.drawImage(
                ImageReader(BytesIO(prepared)),
                x_pt,
                y_pt,
                width=width_pt,
                height=height_pt,
                **kwargs,
            )
            return True
        except TypeError:
            continue
        except Exception:
            continue
    logger.error("All attempts to draw certificate image failed")
    return False


def _normalize_subjects(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    rows: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        grade = item.get("grade")
        if hasattr(grade, "value"):
            grade = grade.value
        rows.append(
            {
                "subject_code": str(item.get("subject_code") or item.get("code") or ""),
                "subject_name": str(
                    item.get("subject_name") or item.get("name") or item.get("subject") or ""
                ),
                "grade": "" if grade is None else str(grade),
            }
        )
    return rows


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
    layout = coerce_layout(layout_json)
    fields = layout.get("fields") or default_layout()["fields"]
    images = _index_images(images or {})

    width_pt = _mm_to_pt(page_width_mm)
    height_pt = _mm_to_pt(page_height_mm)

    buffer = BytesIO()
    can = canvas.Canvas(buffer, pagesize=(width_pt, height_pt))
    can.setFillColor(black)

    for field in fields:
        key = field.get("key")
        if not key:
            continue
        field_type = _field_type(field)
        x_mm = float(field.get("x_mm", 0))
        y_mm = float(field.get("y_mm", 0))
        x_pt = _mm_to_pt(x_mm)

        if field_type == "image":
            image_bytes = _resolve_image_bytes(images, field)
            if not image_bytes:
                if str(key).strip().lower() != "candidate_photo":
                    logger.warning("Certificate image field %s has no matching asset", key)
                continue
            width_mm = float(field.get("width_mm") or field.get("max_width_mm") or 40)
            height_mm = float(field.get("height_mm") or 15)
            img_width_pt = _mm_to_pt(width_mm)
            img_height_pt = _mm_to_pt(height_mm)
            # y_mm is top of image box from page top
            y_pt = height_pt - _mm_to_pt(y_mm) - img_height_pt
            if not _draw_image(can, image_bytes, x_pt, y_pt, img_width_pt, img_height_pt):
                logger.warning("Failed to draw certificate image field %s", key)
            continue

        font_size = float(field.get("font_size", 11))
        align = str(field.get("align", "left")).lower()
        max_width_mm = field.get("max_width_mm")
        max_width_pt = _mm_to_pt(float(max_width_mm)) if max_width_mm is not None else None
        y_pt = height_pt - _mm_to_pt(y_mm) - font_size
        can.setFont("Helvetica", font_size)

        if field_type == "subjects" or str(key) == "subjects":
            table_width_pt = max_width_pt if max_width_pt is not None else _mm_to_pt(130)
            subject_rows = _normalize_subjects(context.get("subjects"))
            _draw_subjects_table(
                can,
                subjects=subject_rows,
                x_pt=x_pt,
                top_pt=height_pt - _mm_to_pt(y_mm),
                table_width_pt=table_width_pt,
                font_size=font_size,
                line_height_mm=float(field.get("line_height_mm") or 7),
                columns=_subject_columns(field.get("columns")),
                show_header=field.get("show_header", True) is not False,
                show_borders=field.get("show_borders", True) is not False,
                header_labels=field.get("header_labels") or {},
                align=align,
            )
            continue

        if field.get("static_value") is not None:
            text = str(field.get("static_value") or "")
        else:
            text = str(context.get(key, "") or "")
        if not text:
            continue
        if align == "justify" and max_width_pt is not None:
            line_height_mm = field.get("line_height_mm")
            line_height_pt = (
                _mm_to_pt(float(line_height_mm)) if line_height_mm is not None else font_size * 1.25
            )
            _draw_justified_text(
                can,
                text,
                x_pt,
                y_pt,
                max_width_pt=max_width_pt,
                font_name="Helvetica",
                font_size=font_size,
                line_height_pt=line_height_pt,
            )
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


def _wrap_words(text: str, font_name: str, font_size: float, max_width_pt: float) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if stringWidth(trial, font_name, font_size) <= max_width_pt:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _draw_justified_line(
    can: canvas.Canvas,
    text: str,
    x_pt: float,
    y_pt: float,
    *,
    max_width_pt: float,
    font_name: str,
    font_size: float,
    last_line: bool,
) -> None:
    words = text.split()
    if len(words) <= 1 or last_line:
        can.drawString(x_pt, y_pt, text)
        return
    word_widths = [stringWidth(word, font_name, font_size) for word in words]
    extra = max_width_pt - sum(word_widths)
    gap = extra / (len(words) - 1)
    x = x_pt
    for word, width in zip(words, word_widths, strict=True):
        can.drawString(x, y_pt, word)
        x += width + gap


def _draw_justified_text(
    can: canvas.Canvas,
    text: str,
    x_pt: float,
    y_pt: float,
    *,
    max_width_pt: float,
    font_name: str,
    font_size: float,
    line_height_pt: float,
) -> None:
    lines = _wrap_words(text, font_name, font_size, max_width_pt)
    last_index = len(lines) - 1
    for index, line in enumerate(lines):
        _draw_justified_line(
            can,
            line,
            x_pt,
            y_pt - index * line_height_pt,
            max_width_pt=max_width_pt,
            font_name=font_name,
            font_size=font_size,
            last_line=index == last_index,
        )


def _truncate_to_width(text: str, font_name: str, font_size: float, max_width_pt: float) -> str:
    if stringWidth(text, font_name, font_size) <= max_width_pt:
        return text
    ellipsis = "…"
    truncated = text
    while truncated and stringWidth(truncated + ellipsis, font_name, font_size) > max_width_pt:
        truncated = truncated[:-1]
    return (truncated + ellipsis) if truncated else ellipsis


_SUBJECT_COLUMNS = ("subject_code", "subject_name", "grade")
_DEFAULT_SUBJECT_COLUMNS = ["subject_name", "grade"]
_DEFAULT_HEADER_LABELS = {
    "subject_code": "Code",
    "subject_name": "Subject",
    "grade": "Grade",
}
_COLUMN_WEIGHTS = {
    "subject_code": 1.2,
    "subject_name": 4.0,
    "grade": 1.0,
}


def _subject_columns(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return list(_DEFAULT_SUBJECT_COLUMNS)
    columns = [str(column) for column in raw if str(column) in _SUBJECT_COLUMNS]
    return columns or list(_DEFAULT_SUBJECT_COLUMNS)


def _header_label(column: str, header_labels: Any) -> str:
    if isinstance(header_labels, dict) and header_labels.get(column):
        return str(header_labels[column])
    return _DEFAULT_HEADER_LABELS.get(column, column.replace("_", " ").title())


def _draw_subjects_table(
    can: canvas.Canvas,
    *,
    subjects: list[dict[str, str]],
    x_pt: float,
    top_pt: float,
    table_width_pt: float,
    font_size: float,
    line_height_mm: float,
    columns: list[str],
    show_header: bool,
    show_borders: bool,
    header_labels: Any,
    align: str,
) -> None:
    row_height_pt = _mm_to_pt(line_height_mm)
    pad_pt = _mm_to_pt(1.2)
    weights = [_COLUMN_WEIGHTS.get(column, 1.0) for column in columns]
    total_weight = sum(weights) or 1.0
    col_widths = [table_width_pt * weight / total_weight for weight in weights]

    rows: list[tuple[bool, list[str]]] = []
    if show_header:
        labels: list[str] = []
        if isinstance(header_labels, list):
            labels = [str(header_labels[i]) if i < len(header_labels) and header_labels[i] else _DEFAULT_HEADER_LABELS.get(col, col) for i, col in enumerate(columns)]
        else:
            labels = [_header_label(column, header_labels) for column in columns]
        rows.append((True, labels))
    for subject in subjects:
        rows.append((False, [str(subject.get(column) or "") for column in columns]))

    can.setStrokeColor(black)
    can.setFillColor(black)
    can.setLineWidth(0.4)

    y_top = top_pt
    for is_header, cells in rows:
        y_bottom = y_top - row_height_pt
        font_name = "Helvetica-Bold" if is_header else "Helvetica"
        can.setFont(font_name, font_size)
        x = x_pt
        for cell, width in zip(cells, col_widths, strict=True):
            if show_borders:
                can.setStrokeColor(black)
                can.setLineWidth(0.4)
                can.rect(x, y_bottom, width, row_height_pt, stroke=1, fill=0)
            can.setFillColor(black)
            text = _truncate_to_width(cell, font_name, font_size, max(1.0, width - 2 * pad_pt))
            text_y = y_bottom + max(1.0, (row_height_pt - font_size) / 2)
            if align == "center":
                can.drawCentredString(x + width / 2, text_y, text)
            elif align == "right":
                can.drawRightString(x + width - pad_pt, text_y, text)
            else:
                can.drawString(x + pad_pt, text_y, text)
            x += width
        y_top = y_bottom
