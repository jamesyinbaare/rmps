"""PDF generation service using WeasyPrint."""
import logging
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader
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
            An extra margin to apply between the main content and header and the footer.
            The goal is to avoid having the content of `main_html` touching the header or the
            footer.
        external_stylesheets: list[CSS]
            Optional list of external CSS files to load.
        """
        self.main_html = main_html
        self.header_html = header_html
        self.footer_html = footer_html
        self.base_url = base_url
        self.side_margin = side_margin
        self.extra_vertical_margin = extra_vertical_margin
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
            footer_size=footer_height + self.extra_vertical_margin,
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


def render_html(context: dict[str, Any], template_path: str, templates_dir: Path | None = None) -> str:
    """
    Render an HTML template with the given context.

    Args:
        context: Dictionary of variables to pass to the template
        template_path: Path to the template file relative to templates directory
        templates_dir: Optional templates directory path (defaults to app/templates)

    Returns:
        Rendered HTML string
    """
    if templates_dir is None:
        # Default to app/templates if not specified
        templates_dir = Path(__file__).parent.parent / "templates"

    env = Environment(loader=FileSystemLoader(str(templates_dir)))
    template = env.get_template(template_path)
    html_output = template.render(context)
    return html_output
