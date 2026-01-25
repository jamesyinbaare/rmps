"""PDF generation service for score sheets."""
import logging

from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader
from PyPDF2 import PdfReader
from weasyprint import CSS, HTML

from app.config import settings

logger = logging.getLogger('weasyprint')
logger.addHandler(logging.StreamHandler())

class PdfGenerator:
    """
    Generate a PDF out of a rendered template, with the possibility to integrate nicely
    a header and a footer if provided.

    Notes:
    ------
    - When Weasyprint renders an html into a PDF, it goes though several intermediate steps.
      Here, in this class, we deal mostly with a box representation: 1 `Document` have 1 `Page`
      or more, each `Page` 1 `Box` or more. Each box can contain other box. Hence the recursive
      method `get_element` for example.
      For more, see:
      https://weasyprint.readthedocs.io/en/stable/hacking.html#dive-into-the-source
      https://weasyprint.readthedocs.io/en/stable/hacking.html#formatting-structure
    - Warning: the logic of this class relies heavily on the internal Weasyprint API. This
      snippet was written at the time of the release 47, it might break in the future.
    - This generator draws its inspiration and, also a bit of its implementation, from this
      discussion in the library github issues: https://github.com/Kozea/WeasyPrint/issues/92
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
        extra_vertical_margin_bottom: int | None = None,
        external_stylesheets: list[CSS] | None = None,
    ):
        """
        Parameters
        ----------
        main_html: str
            An HTML file (most of the time a template rendered into a string) which represents
            the core of the PDF to generate.
        header_html: str
            An optional header html.
        footer_html: str
            An optional footer html.
        base_url: str
            An absolute url or path to the page which serves as a reference to Weasyprint to fetch assets,
            required to get our media.
        side_margin: int, interpreted in cm, by default 2cm
            The margin to apply on the core of the rendered PDF (i.e. main_html).
        extra_vertical_margin: int, interpreted in pixel, by default 30 pixels
            An extra margin to apply between the main content and header (and footer if
            extra_vertical_margin_bottom is not set).
        extra_vertical_margin_bottom: int | None
            If set, use this for the bottom margin instead of extra_vertical_margin.
            Use a more negative value to reduce the gap between content and footer.
        external_stylesheets: list[CSS]
            Optional list of external CSS files to load.
        """
        self.main_html = main_html
        self.header_html = header_html
        self.footer_html = footer_html
        self.base_url = base_url
        self.side_margin = side_margin
        self.extra_vertical_margin = extra_vertical_margin
        self.extra_vertical_margin_bottom = (
            extra_vertical_margin_bottom
            if extra_vertical_margin_bottom is not None
            else extra_vertical_margin
        )
        self.external_stylesheets = external_stylesheets or []

    def _compute_overlay_element(self, element: str):
        """
        Parameters
        ----------
        element: str
            Either 'header' or 'footer'

        Returns
        -------
        element_body: BlockBox
            A Weasyprint pre-rendered representation of an html element
        element_height: float
            The height of this element, which will be then translated in a html height
        """
        # Use base_url if provided, otherwise use None
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
            # Include external stylesheets for header/footer too (for fonts, etc.)
            stylesheets = self.external_stylesheets + [CSS(string=self.OVERLAY_LAYOUT)]
            element_doc = html.render(stylesheets=stylesheets)
        except Exception as e:
            logger.error(f"Error rendering {element} HTML: {e}")
            raise
        element_page = element_doc.pages[0]
        element_body = PdfGenerator.get_element(
            element_page._page_box.all_children(), "body"
        )
        element_body = element_body.copy_with_children(element_body.all_children())
        element_html = PdfGenerator.get_element(
            element_page._page_box.all_children(), element
        )

        if element == "header":
            element_height = element_html.height
        if element == "footer":
            element_height = element_page.height - element_html.position_y

        return element_body, element_height

    def _apply_overlay_on_main(self, main_doc, header_body=None, footer_body=None):
        """
        Insert the header and the footer in the main document.

        Parameters
        ----------
        main_doc: Document
            The top level representation for a PDF page in Weasyprint.
        header_body: BlockBox
            A representation for an html element in Weasyprint.
        footer_body: BlockBox
            A representation for an html element in Weasyprint.
        """
        for page in main_doc.pages:
            page_body = PdfGenerator.get_element(page._page_box.all_children(), "body")

            if header_body:
                page_body.children += header_body.all_children()
            if footer_body:
                page_body.children += footer_body.all_children()

    def render_pdf(self) -> bytes:
        """
        Returns
        -------
        pdf: a bytes sequence
            The rendered PDF.
        """
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
            footer_size=footer_height + self.extra_vertical_margin_bottom,
            side_margin=f"{self.side_margin}cm",
        )
        content_print_layout = f"@page {{ margin: {margins};}} "

        # Use base_url if provided, otherwise use None (WeasyPrint will use current directory)
        base_url = self.base_url if self.base_url else None
        if base_url:
            logger.debug(f"Rendering main HTML with base_url: {base_url}")
        else:
            logger.warning("Rendering main HTML without base_url - assets may not resolve correctly")

        try:
            html = HTML(
                string=self.main_html,
                base_url=base_url,
            )
            # Combine external stylesheets with page layout CSS
            all_stylesheets = self.external_stylesheets + [CSS(string=content_print_layout)]
            logger.debug(f"Using {len(all_stylesheets)} stylesheet(s) for main HTML")
            # WeasyPrint will automatically load external CSS files referenced in <link> tags
            # when base_url is set correctly, but we also load them explicitly here
            main_doc = html.render(stylesheets=all_stylesheets)
        except Exception as e:
            logger.error(f"Error rendering main HTML: {e}")
            raise

        if self.header_html or self.footer_html:
            self._apply_overlay_on_main(main_doc, header_body, footer_body)
        pdf = main_doc.write_pdf()

        return pdf

    @staticmethod
    def get_element(boxes, element: str):
        """
        Given a set of boxes representing the elements of a PDF page in a DOM-like way, find the
        box which is named `element`.

        Look at the notes of the class for more details on Weasyprint insides.
        """
        for box in boxes:
            if box.element_tag == element:
                return box
            return PdfGenerator.get_element(box.all_children(), element)


def render_html(context: dict[str, Any], template_path: str) -> str:
    """
    Render an HTML template with the given context.

    Args:
        context: Dictionary of variables to pass to the template
        template_path: Path to the template file relative to templates directory

    Returns:
        Rendered HTML string
    """
    templates_dir = Path(settings.templates_path)
    env = Environment(loader=FileSystemLoader(str(templates_dir)))
    template = env.get_template(template_path)
    html_output = template.render(context)
    return html_output


def get_templates_base_url(template_subdir: str = "score_sheets") -> str:
    """
    Get the absolute base URL for templates directory.
    This is used by WeasyPrint to resolve relative paths to images and CSS.

    Args:
        template_subdir: Subdirectory within templates (default: "score_sheets")

    Returns:
        Absolute file path string to templates subdirectory (WeasyPrint accepts both paths and URIs)
    """
    templates_dir = Path(settings.templates_path) / template_subdir
    templates_dir = templates_dir.resolve()
    # Use absolute file path string for consistency
    # WeasyPrint accepts both file:// URIs and file paths, but file paths are more reliable
    base_url = str(templates_dir)
    return base_url


def generate_score_sheet_pdf(
    school_code: str,
    school_name: str,
    subject_code: str,
    subject_name: str,
    series: int,
    test_type: int,
    candidates: list[dict[str, Any]],
    main_template: str = "score_sheets/main_2_columns.html",
    header_template: str = "score_sheets/header.html",
    footer_template: str = "score_sheets/footer_series.html",
    vertical_margins: int = -50,
    vertical_margins_bottom: int = -200,
) -> tuple[bytes, int]:
    """
    Generate a multi-page PDF score sheet for a group of candidates.

    Args:
        school_code: School code (6 characters)
        school_name: School name
        subject_code: Subject code (3 characters)
        subject_name: Subject name
        series: Series number (1-9)
        test_type: Test type (1 = Objectives, 2 = Essay)
        candidates: List of candidate dictionaries with index_number, name, etc.
        main_template: Path to main template
        header_template: Path to header template
        footer_template: Path to footer template
        vertical_margins: Vertical margin adjustment for top (header). Less
            negative = more space reserved, prevents table overlapping header.
        vertical_margins_bottom: Extra margin for bottom (footer). More negative
            = less gap between table and footer.

    Returns:
        Tuple of (PDF bytes, page count)
    """
    # Chunk candidates into pages of 25 for explicit pagination
    batch_size = 25
    students_by_page = [
        candidates[i : i + batch_size]
        for i in range(0, len(candidates), batch_size)
    ]

    # Prepare template context
    context = {
        "center_no": school_code,
        "center": f"{school_code} - {school_name}",
        "subject": f"{subject_code} - {subject_name}",
        "paper": str(test_type),
        "series": str(series),
        "students": candidates,
        "students_by_page": students_by_page,
    }

    # Render templates
    main_html = render_html(context, main_template)
    header_html = render_html(context, header_template)
    footer_html = render_html(context, footer_template)

    # Get absolute path to score_sheets directory for base_url
    templates_dir = Path(settings.templates_path) / "score_sheets"
    templates_dir = templates_dir.resolve()
    # Use file:// URI with trailing slash so WeasyPrint's urljoin resolves relative
    # paths (e.g. logo-crest-only.png) correctly under score_sheets/
    base_url = templates_dir.as_uri() + "/"

    # Verify that required assets exist (footer is HTML-only; header uses logo crest)
    logo_crest_file = templates_dir / "logo-crest-only.png"
    if not logo_crest_file.exists():
        logger.warning(f"Logo crest image not found: {logo_crest_file}")

    logger.info(f"Using base_url for asset resolution: {base_url}")

    # Load external CSS file if it exists
    # CSS needs base_url to resolve font files referenced with url()
    css_file = templates_dir / "sample.css"
    stylesheets = []
    if css_file.exists():
        try:
            # Load CSS from file with explicit base_url to ensure font URLs resolve correctly
            # The base_url must point to the directory containing the CSS file (and fonts)
            # Using absolute path string for base_url (same format as HTML base_url)
            css_content = CSS(filename=str(css_file.resolve()), base_url=base_url)
            stylesheets.append(css_content)
            logger.info(f"Successfully loaded CSS file: {css_file} with base_url: {base_url}")
        except Exception as e:
            # If CSS loading fails with filename, try loading as string with base_url
            logger.warning(f"Failed to load CSS with filename method: {e}. Trying string method...")
            try:
                css_text = css_file.read_text(encoding="utf-8")
                css_content = CSS(string=css_text, base_url=base_url)
                stylesheets.append(css_content)
                logger.info(f"Successfully loaded CSS file as string: {css_file} with base_url: {base_url}")
            except Exception as e2:
                # If both methods fail, log error but continue without CSS
                logger.error(f"Failed to load CSS file {css_file}: {e2}")
    else:
        logger.warning(f"CSS file not found: {css_file}")

    try:
        pdf_gen = PdfGenerator(
            main_html,
            header_html,
            footer_html,
            base_url=base_url,
            extra_vertical_margin=vertical_margins,
            extra_vertical_margin_bottom=vertical_margins_bottom,
            external_stylesheets=stylesheets,
        )
        logger.info(f"Generating PDF with base_url: {base_url}, {len(stylesheets)} stylesheet(s)")
        pdf_bytes = pdf_gen.render_pdf()
        logger.info("PDF generation completed successfully")
    except Exception as e:
        logger.error(f"PDF generation failed: {e}", exc_info=True)
        raise

    # Count pages in the PDF
    from io import BytesIO

    pdf_buffer = BytesIO(pdf_bytes)
    pdf_reader = PdfReader(pdf_buffer)
    page_count = len(pdf_reader.pages)

    return pdf_bytes, page_count
