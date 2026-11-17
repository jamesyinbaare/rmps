"""PDF export for admin irregular examination candidates (details + photo + voucher)."""

from __future__ import annotations

import base64
import logging
import zipfile
from collections import defaultdict
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image

from app.models import Examination, IrregularExaminationCandidate
from app.services.irregular_candidate_files import read_irregular_candidate_file_bytes
from app.services.irregular_candidates import original_subject_code
from app.services.pdf_generator import PdfGenerator, render_html

logger = logging.getLogger(__name__)

TEMPLATE_REL = "irregular-candidates/details.html"
_MAX_IMAGE_EDGE_PX = 900


def _display_name(row: IrregularExaminationCandidate) -> str:
    return " ".join(
        part for part in (row.first_name, row.other_name, row.last_name) if part and str(part).strip()
    )


def _format_date(value: date | datetime | None) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().strftime("%d/%m/%Y")
    return value.strftime("%d/%m/%Y")


def _format_datetime(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.strftime("%d/%m/%Y %H:%M")


def _image_jpeg_base64(stored_path: str | None) -> str | None:
    """Load an irregular-candidate image and return JPEG base64 (no data: prefix)."""
    if not stored_path:
        return None
    try:
        raw = read_irregular_candidate_file_bytes(stored_path)
    except FileNotFoundError:
        logger.warning("Missing irregular candidate image for PDF: %s", stored_path)
        return None
    except Exception:
        logger.exception("Failed to read irregular candidate image for PDF: %s", stored_path)
        return None
    if not raw:
        return None
    try:
        with Image.open(BytesIO(raw)) as img:
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            elif img.mode == "L":
                img = img.convert("RGB")
            img.thumbnail((_MAX_IMAGE_EDGE_PX, _MAX_IMAGE_EDGE_PX), Image.Resampling.LANCZOS)
            out = BytesIO()
            img.save(out, format="JPEG", quality=85, optimize=True)
            return base64.b64encode(out.getvalue()).decode("ascii")
    except Exception:
        logger.exception("Failed to convert irregular candidate image for PDF: %s", stored_path)
        # Fall back to raw bytes as JPEG data URI payload if already JPEG-ish
        try:
            return base64.b64encode(raw).decode("ascii")
        except Exception:
            return None


def _safe_filename_part(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in {"_", "-", "."} else "_" for ch in value)


def irregular_candidates_pdf_filename(exam: Examination) -> str:
    series = f"_{exam.exam_series}" if exam.exam_series else ""
    raw = f"irregular_candidates_{exam.exam_type}_{exam.year}{series}.pdf"
    return _safe_filename_part(raw)


def irregular_candidates_pdf_zip_filename(exam: Examination) -> str:
    series = f"_{exam.exam_series}" if exam.exam_series else ""
    raw = f"irregular_candidates_{exam.exam_type}_{exam.year}{series}_by_centre.zip"
    return _safe_filename_part(raw)


def irregular_candidates_centre_pdf_filename(
    exam: Examination,
    *,
    centre_code: str,
    centre_name: str = "",
) -> str:
    series = f"_{exam.exam_series}" if exam.exam_series else ""
    centre = _safe_filename_part(centre_code or "centre")
    name_part = _safe_filename_part(centre_name) if centre_name else ""
    mid = f"{centre}_{name_part}" if name_part else centre
    raw = f"irregular_candidates_{exam.exam_type}_{exam.year}{series}_{mid}.pdf"
    return _safe_filename_part(raw)


def irregular_candidate_pdf_filename(exam: Examination, row: IrregularExaminationCandidate) -> str:
    series = f"_{exam.exam_series}" if exam.exam_series else ""
    name = _safe_filename_part(_display_name(row).replace(" ", "_") or f"candidate_{row.id}")
    raw = f"irregular_candidate_{exam.exam_type}_{exam.year}{series}_{name}_{row.id}.pdf"
    return _safe_filename_part(raw)


def build_irregular_candidate_pdf_context(row: IrregularExaminationCandidate) -> dict[str, Any]:
    """Snapshot ORM fields + embed images. Call on the request thread before to_thread."""
    centre = row.examination_centre
    school = row.school
    programme = row.programme
    subjects = list(row.subject_selections or [])
    photo_path = str(row.photograph_stored_path or "") or None
    voucher_path = str(row.voucher_stored_path or "") or None
    subject_codes = [original_subject_code(s) for s in subjects if original_subject_code(s)]
    return {
        "id": row.id,
        "full_name": _display_name(row),
        "first_name": row.first_name,
        "other_name": row.other_name or "",
        "last_name": row.last_name,
        "gender": row.gender or "",
        "date_of_birth": _format_date(row.date_of_birth),
        "phone_number": row.phone_number or "",
        "guardian_name": row.guardian_name or "",
        "guardian_phone_number": row.guardian_phone_number or "",
        "ghanapost_gps_address": row.ghanapost_gps_address or "",
        "centre_code": centre.code if centre else "",
        "centre_name": centre.name if centre else "",
        "school_code": school.code if school else "",
        "school_name": school.name if school else "",
        "programme_code": programme.code if programme else "",
        "programme_name": programme.name if programme else "",
        "subject_codes": ", ".join(subject_codes),
        "recorded_at": _format_datetime(row.created_at),
        "updated_at": _format_datetime(row.updated_at),
        "photograph_base64": _image_jpeg_base64(photo_path),
        "voucher_base64": _image_jpeg_base64(voucher_path),
    }


def _exam_label(exam: Examination) -> str:
    if exam.exam_series:
        return f"{exam.exam_type} — {exam.exam_series} {exam.year}"
    return f"{exam.exam_type} {exam.year}"


def render_irregular_candidates_pdf(
    *,
    exam_label: str,
    exam_type: str,
    exam_series: str,
    year: int,
    candidates: list[dict[str, Any]],
) -> bytes:
    """Render PDF from plain candidate context dicts (safe for asyncio.to_thread)."""
    templates_dir = Path(__file__).parent.parent / "templates"
    app_dir = Path(__file__).parent.parent.resolve()
    main_html = render_html(
        {
            "exam_label": exam_label,
            "exam_type": exam_type,
            "exam_series": exam_series,
            "year": year,
            "candidates": candidates,
        },
        TEMPLATE_REL,
        templates_dir,
    )
    pdf_gen = PdfGenerator(main_html=main_html, base_url=str(app_dir), side_margin=1.5)
    return pdf_gen.render_pdf()


def generate_irregular_candidates_pdf(
    exam: Examination,
    rows: list[IrregularExaminationCandidate],
) -> bytes:
    """Build a multi-page PDF (one page per irregular candidate)."""
    candidates = [build_irregular_candidate_pdf_context(row) for row in rows]
    return render_irregular_candidates_pdf(
        exam_label=_exam_label(exam),
        exam_type=str(exam.exam_type),
        exam_series=str(exam.exam_series or ""),
        year=int(exam.year),
        candidates=candidates,
    )


def group_candidate_contexts_by_centre(
    candidates: list[dict[str, Any]],
) -> list[tuple[str, str, list[dict[str, Any]]]]:
    """Group PDF contexts by centre code; returns sorted (code, name, candidates) tuples."""
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    names: dict[str, str] = {}
    for candidate in candidates:
        code = str(candidate.get("centre_code") or "").strip() or "UNKNOWN"
        name = str(candidate.get("centre_name") or "").strip()
        grouped[code].append(candidate)
        if code not in names and name:
            names[code] = name
    return [
        (code, names.get(code, ""), grouped[code])
        for code in sorted(grouped.keys(), key=lambda c: c.lower())
    ]


def build_irregular_candidates_pdf_zip(
    *,
    exam: Examination,
    exam_label: str,
    candidates: list[dict[str, Any]],
) -> bytes:
    """One PDF per centre, packed into a zip archive."""
    groups = group_candidate_contexts_by_centre(candidates)
    if not groups:
        raise ValueError("no candidates to zip")

    buf = BytesIO()
    used_names: dict[str, int] = {}
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for centre_code, centre_name, centre_candidates in groups:
            pdf_bytes = render_irregular_candidates_pdf(
                exam_label=exam_label,
                exam_type=str(exam.exam_type),
                exam_series=str(exam.exam_series or ""),
                year=int(exam.year),
                candidates=centre_candidates,
            )
            entry = irregular_candidates_centre_pdf_filename(
                exam,
                centre_code=centre_code,
                centre_name=centre_name,
            )
            key = entry.lower()
            count = used_names.get(key, 0)
            used_names[key] = count + 1
            if count:
                stem = entry[:-4] if entry.lower().endswith(".pdf") else entry
                entry = f"{stem}_{count + 1}.pdf"
            zf.writestr(entry, pdf_bytes)
    return buf.getvalue()
