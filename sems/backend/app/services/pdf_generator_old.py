"""
PDF generation for the *old* score sheet layout (f2bf6d5 / Fix icm pdf missing barcode #149).

Kept separate from pdf_generator so the old pipeline stays exactly as it was:
single-table flow, old header/footer, old margins, old base_url.
"""

import logging
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader
from PyPDF2 import PdfReader
from weasyprint import CSS, HTML

from app.config import settings

logger = logging.getLogger(__name__)


class PdfGeneratorOld:
    """
    Original WeasyPrint PDF generator (no extra_vertical_margin_bottom).
    Same margin used for header and footer.
    """

    OVERLAY_LAYOUT = "@page { margin: 2cm; margin-top: 1cm;}"

    def __init__(
        self,
        main_html: str,
        header_html: str | None = None,
        footer_html: str | None = None,
        base_url: str | None = None,
        side_margin: int = 2,
        extra_vertical_margin: int = 30,
        external_stylesheets: list | None = None,
    ):
        self.main_html = main_html
        self.header_html = header_html
        self.footer_html = footer_html
        self.base_url = base_url
        self.side_margin = side_margin
        self.extra_vertical_margin = extra_vertical_margin
        self.external_stylesheets = external_stylesheets or []

    def _compute_overlay_element(self, element: str):
        base_url = self.base_url if self.base_url else None
        if base_url:
            logger.debug(f"Rendering {element} with base_url: {base_url}")
        else:
            logger.warning(f"Rendering {element} without base_url - assets may not resolve correctly")

        try:
            html = HTML(
                string=getattr(self, f"{element}_html"),
                base_url=base_url,
            )
            stylesheets = self.external_stylesheets + [CSS(string=self.OVERLAY_LAYOUT)]
            element_doc = html.render(stylesheets=stylesheets)
        except Exception as e:
            logger.error(f"Error rendering {element} HTML: {e}")
            raise

        element_page = element_doc.pages[0]
        element_body = PdfGeneratorOld.get_element(
            element_page._page_box.all_children(), "body"
        )
        element_body = element_body.copy_with_children(element_body.all_children())
        element_html = PdfGeneratorOld.get_element(
            element_page._page_box.all_children(), element
        )

        if element == "header":
            element_height = element_html.height
        if element == "footer":
            element_height = element_page.height - element_html.position_y

        return element_body, element_height

    def _apply_overlay_on_main(self, main_doc, header_body=None, footer_body=None):
        for page in main_doc.pages:
            page_body = PdfGeneratorOld.get_element(page._page_box.all_children(), "body")
            if header_body:
                page_body.children += header_body.all_children()
            if footer_body:
                page_body.children += footer_body.all_children()

    def render_pdf(self) -> bytes:
        if self.header_html:
            header_body, header_height = self._compute_overlay_element("header")
        else:
            header_body, header_height = None, 0
        if self.footer_html:
            footer_body, footer_height = self._compute_overlay_element("footer")
        else:
            footer_body, footer_height = None, 0

        margins = "{header_size}px {side_margin} {footer_size}px {side_margin}".format(
            header_size=header_height + self.extra_vertical_margin,
            footer_size=footer_height + self.extra_vertical_margin,
            side_margin=f"{self.side_margin}cm",
        )
        content_print_layout = f"@page {{ margin: {margins};}} "

        base_url = self.base_url if self.base_url else None
        if base_url:
            logger.debug(f"Rendering main HTML with base_url: {base_url}")
        else:
            logger.warning("Rendering main HTML without base_url - assets may not resolve correctly")

        try:
            html = HTML(string=self.main_html, base_url=base_url)
            all_stylesheets = self.external_stylesheets + [CSS(string=content_print_layout)]
            main_doc = html.render(stylesheets=all_stylesheets)
        except Exception as e:
            logger.error(f"Error rendering main HTML: {e}")
            raise

        if self.header_html or self.footer_html:
            self._apply_overlay_on_main(main_doc, header_body, footer_body)
        return main_doc.write_pdf()

    @staticmethod
    def get_element(boxes, element: str):
        for box in boxes:
            if box.element_tag == element:
                return box
            return PdfGeneratorOld.get_element(box.all_children(), element)


def _render_html(context: dict[str, Any], template_path: str) -> str:
    templates_dir = Path(settings.templates_path)
    env = Environment(loader=FileSystemLoader(str(templates_dir)))
    template = env.get_template(template_path)
    return template.render(context)


def generate_score_sheet_pdf_old(
    school_code: str,
    school_name: str,
    subject_code: str,
    subject_name: str,
    series: int,
    test_type: int,
    candidates: list[dict[str, Any]],
) -> tuple[bytes, int]:
    """
    Generate PDF score sheets using the *old* layout (f2bf6d5).

    - Single table, {% for student in students %}, WeasyPrint flows rows across pages.
    - Old header (logo.jpg, centre/subject/paper/series), old footer (footer.jpg).
    - Old PdfGenerator: single extra_vertical_margin, base_url as path string.
    """
    context = {
        "center_no": school_code,
        "center": f"{school_code} - {school_name}",
        "subject": f"{subject_code} - {subject_name}",
        "paper": str(test_type),
        "series": str(series),
        "students": candidates,
    }

    main_html = _render_html(context, "score_sheets/old/main_2_columns_old.html")
    header_html = _render_html(context, "score_sheets/old/header_old.html")
    footer_html = _render_html(context, "score_sheets/old/footer_series_old.html")

    templates_dir = Path(settings.templates_path) / "score_sheets"
    templates_dir = templates_dir.resolve()
    base_url = str(templates_dir)

    logo_file = templates_dir / "logo.jpg"
    footer_file = templates_dir / "footer.jpg"
    if not logo_file.exists():
        logger.warning(f"Logo image not found: {logo_file}")
    if not footer_file.exists():
        logger.warning(f"Footer image not found: {footer_file}")

    logger.info(f"Using base_url for asset resolution: {base_url}")

    css_file = templates_dir / "sample.css"
    stylesheets = []
    if css_file.exists():
        try:
            css_content = CSS(filename=str(css_file.resolve()), base_url=base_url)
            stylesheets.append(css_content)
        except Exception as e:
            logger.warning(f"Failed to load CSS with filename method: {e}. Trying string method...")
            try:
                css_text = css_file.read_text(encoding="utf-8")
                css_content = CSS(string=css_text, base_url=base_url)
                stylesheets.append(css_content)
            except Exception as e2:
                logger.error(f"Failed to load CSS file {css_file}: {e2}")
    else:
        logger.warning(f"CSS file not found: {css_file}")

    vertical_margins = -20
    try:
        pdf_gen = PdfGeneratorOld(
            main_html,
            header_html,
            footer_html,
            base_url=base_url,
            extra_vertical_margin=vertical_margins,
            external_stylesheets=stylesheets,
        )
        pdf_bytes = pdf_gen.render_pdf()
    except Exception as e:
        logger.error(f"PDF generation failed: {e}", exc_info=True)
        raise

    from io import BytesIO

    pdf_buffer = BytesIO(pdf_bytes)
    pdf_reader = PdfReader(pdf_buffer)
    page_count = len(pdf_reader.pages)

    return pdf_bytes, page_count
