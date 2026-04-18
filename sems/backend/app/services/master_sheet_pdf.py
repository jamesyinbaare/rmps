"""Master distribution list PDFs (appended to score sheets)."""

import logging
from io import BytesIO
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader
from PyPDF2 import PdfReader
from weasyprint import CSS, HTML

from app.config import settings
from app.services.pdf_generator import PdfGenerator
from app.services.pdf_generator_old import PdfGeneratorOld

logger = logging.getLogger(__name__)

MASTER_ROWS_PER_PAGE = 25


def _paginate_master_students(students: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """At most MASTER_ROWS_PER_PAGE candidates per PDF page."""
    if not students:
        return [[]]
    return [students[i : i + MASTER_ROWS_PER_PAGE] for i in range(0, len(students), MASTER_ROWS_PER_PAGE)]


def _master_jinja_context(
    school_code: str,
    school_name: str,
    subject_code: str,
    subject_name: str,
    exam_year: int,
    exam_series: str,
    exam_type: str,
    students: list[dict[str, Any]],
    layout_variant: str,
) -> dict[str, Any]:
    student_pages = _paginate_master_students(students)
    return {
        "center": f"{school_code} - {school_name}",
        "subject": f"{subject_code} - {subject_name}",
        "exam_year": exam_year,
        "exam_series": exam_series,
        "exam_type": exam_type,
        "student_pages": student_pages,
        "master_rows_per_page": MASTER_ROWS_PER_PAGE,
        "master_page_total": len(student_pages),
        "candidate_count": len(students),
        "layout_variant": layout_variant,
    }


def _render_template(context: dict[str, Any], template_path: str) -> str:
    templates_dir = Path(settings.templates_path)
    env = Environment(loader=FileSystemLoader(str(templates_dir)))
    return env.get_template(template_path).render(context)


def generate_master_sheet_pdf_old(
    school_code: str,
    school_name: str,
    subject_code: str,
    subject_name: str,
    exam_year: int,
    exam_series: str,
    exam_type: str,
    students: list[dict[str, Any]],
) -> tuple[bytes, int]:
    """Master list PDF using legacy header/footer (logo.jpg) and shared general table body."""
    context = _master_jinja_context(
        school_code,
        school_name,
        subject_code,
        subject_name,
        exam_year,
        exam_series,
        exam_type,
        students,
        layout_variant="old",
    )
    main_html = _render_template(context, "score_sheets/general.html")
    header_html = _render_template(context, "score_sheets/general_header.html")
    footer_html = _render_template(context, "score_sheets/general_footer.html")

    templates_dir = Path(settings.templates_path) / "score_sheets"
    templates_dir = templates_dir.resolve()
    base_url = str(templates_dir)

    css_file = templates_dir / "sample.css"
    stylesheets: list[CSS] = []
    if css_file.exists():
        try:
            stylesheets.append(CSS(filename=str(css_file.resolve()), base_url=base_url))
        except Exception as e:
            logger.warning("Failed to load CSS with filename method: %s. Trying string method...", e)
            try:
                css_text = css_file.read_text(encoding="utf-8")
                stylesheets.append(CSS(string=css_text, base_url=base_url))
            except Exception as e2:
                logger.error("Failed to load CSS file %s: %s", css_file, e2)

    # Margins are for the master header/footer only (shorter than score sheets). Positive top
    # extra clears the taller title block; a more negative bottom extra tightens the table–footer gap.
    pdf_gen = PdfGeneratorOld(
        main_html,
        header_html,
        footer_html,
        base_url=base_url,
        extra_vertical_margin=36,
        extra_vertical_margin_bottom=-42,
        external_stylesheets=stylesheets,
    )
    pdf_bytes = pdf_gen.render_pdf()
    page_count = len(PdfReader(BytesIO(pdf_bytes)).pages)
    return pdf_bytes, page_count


def generate_master_sheet_pdf_new(
    school_code: str,
    school_name: str,
    subject_code: str,
    subject_name: str,
    exam_year: int,
    exam_series: str,
    exam_type: str,
    students: list[dict[str, Any]],
    vertical_margins: int = 40,
    vertical_margins_bottom: int = -42,
) -> tuple[bytes, int]:
    """Master list PDF using new layout (crest header, branded footer) and shared general table body.

    Do not reuse score-sheet margin defaults: those assume a shorter measured header and a tall
    invigilator footer. Here we use a positive top extra so the main table clears the master header,
    and a negative bottom extra so the reserved footer band matches the compact master footer.
    """
    context = _master_jinja_context(
        school_code,
        school_name,
        subject_code,
        subject_name,
        exam_year,
        exam_series,
        exam_type,
        students,
        layout_variant="new",
    )
    main_html = _render_template(context, "score_sheets/general.html")
    header_html = _render_template(context, "score_sheets/new/master_header.html")
    footer_html = _render_template(context, "score_sheets/new/master_footer.html")

    templates_dir = Path(settings.templates_path) / "score_sheets"
    templates_dir = templates_dir.resolve()
    base_url = templates_dir.as_uri() + "/"

    css_file = templates_dir / "sample.css"
    stylesheets: list[CSS] = []
    if css_file.exists():
        try:
            stylesheets.append(CSS(filename=str(css_file.resolve()), base_url=base_url))
        except Exception as e:
            logger.warning("Failed to load CSS with filename method: %s. Trying string method...", e)
            try:
                css_text = css_file.read_text(encoding="utf-8")
                stylesheets.append(CSS(string=css_text, base_url=base_url))
            except Exception as e2:
                logger.error("Failed to load CSS file %s: %s", css_file, e2)

    pdf_gen = PdfGenerator(
        main_html,
        header_html,
        footer_html,
        base_url=base_url,
        extra_vertical_margin=vertical_margins,
        extra_vertical_margin_bottom=vertical_margins_bottom,
        external_stylesheets=stylesheets,
    )
    pdf_bytes = pdf_gen.render_pdf()
    page_count = len(PdfReader(BytesIO(pdf_bytes)).pages)
    return pdf_bytes, page_count
