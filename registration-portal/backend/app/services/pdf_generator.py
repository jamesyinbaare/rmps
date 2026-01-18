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
        footer_subsequent_html: str | None = None,
        base_url: str | None = None,
        side_margin: int = 2,
        extra_vertical_margin: int = 30,
        external_stylesheets: list[CSS] | None = None,
        header_first_page_only: bool = False,
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
        self.footer_subsequent_html = footer_subsequent_html
        self.base_url = base_url
        self.side_margin = side_margin
        self.extra_vertical_margin = extra_vertical_margin
        self.external_stylesheets = external_stylesheets or []
        self.header_first_page_only = header_first_page_only

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

        if element_html is None:
            logger.warning(f"Could not find {element} element in template. Using fallback height.")
            # Use fallback height if element not found
            if element == "header":
                element_height = 80  # Approximate header height in pixels
            else:  # footer
                element_height = 100  # Approximate footer height in pixels
        else:
            if element == "header":
                element_height = element_html.height
            if element == "footer":
                element_height = element_page.height - element_html.position_y

        return element_body, element_height

    def _apply_overlay_on_main(self, main_doc, header_body=None, footer_body=None, footer_subsequent_body=None, header_first_page_only=False):
        """
        Insert the header and the footer in the main document.

        Parameters
        ----------
        main_doc: Document
            The top level representation for a PDF page in Weasyprint.
        header_body: BlockBox
            A representation for an html element in Weasyprint (first page).
        footer_body: BlockBox
            A representation for an html element in Weasyprint (first page).
        footer_subsequent_body: BlockBox
            A representation for an html element in Weasyprint (subsequent pages).
        header_first_page_only: bool
            If True, header is only applied to the first page. Default: False (applied to all pages).
        """
        for i, page in enumerate(main_doc.pages):
            page_body = PdfGenerator.get_element(page._page_box.all_children(), "body")

            # Apply header on first page only if header_first_page_only is True
            if i == 0 and header_body:
                page_body.children += header_body.all_children()
            # Fallback: apply header to all pages if header_first_page_only is False
            elif not header_first_page_only and header_body:
                page_body.children += header_body.all_children()

            # Apply footer - first page uses footer_body, subsequent pages use only footer_subsequent_body
            if i == 0 and footer_body:
                page_body.children += footer_body.all_children()
            elif i > 0 and footer_subsequent_body:
                page_body.children += footer_subsequent_body.all_children()

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

        # Compute subsequent footer height if provided
        if self.footer_subsequent_html:
            try:
                html = HTML(
                    string=self.footer_subsequent_html,
                    base_url=self.base_url,
                )
                stylesheets = self.external_stylesheets + [CSS(string=self.OVERLAY_LAYOUT)]
                element_doc = html.render(stylesheets=stylesheets)
                element_page = element_doc.pages[0]
                element_body = PdfGenerator.get_element(
                    element_page._page_box.all_children(), "body"
                )
                if element_body:
                    footer_subsequent_body = element_body.copy_with_children(element_body.all_children())
                else:
                    footer_subsequent_body = None
                element_html = PdfGenerator.get_element(
                    element_page._page_box.all_children(), "footer"
                )
                if element_html:
                    # Calculate footer height: position from top + height of footer element
                    footer_subsequent_height = element_page.height - element_html.position_y
                else:
                    # Fallback: just logo height (54px) + bottom padding (10px) = ~64px
                    footer_subsequent_height = 64
            except Exception as e:
                logger.warning(f"Error computing subsequent footer: {e}, using fallback")
                footer_subsequent_body = None
                footer_subsequent_height = 64  # Just logo height + padding
        else:
            footer_subsequent_body = None
            footer_subsequent_height = 64  # Just logo height + padding if no subsequent footer provided

        # If header is first page only, only first page needs header margin, other pages have no header
        if self.header_first_page_only and header_body:
            # First page with full header, subsequent pages with no header but some top margin
            first_page_margin = "{header_size}px {side_margin} {footer_size}px {side_margin}".format(
                header_size=header_height + self.extra_vertical_margin,
                footer_size=footer_height + (self.extra_vertical_margin // 2),  # Reduced bottom margin
                side_margin=f"{self.side_margin}cm",
            )
            # Subsequent pages: doubled top margin (60px) + subsequent footer at bottom
            other_pages_margin = "60px {side_margin} {footer_size}px {side_margin}".format(
                footer_size=footer_subsequent_height + (self.extra_vertical_margin // 2),  # Reduced bottom margin
                side_margin=f"{self.side_margin}cm",
            )
            content_print_layout = f"@page:first {{ margin: {first_page_margin};}} @page {{ margin: {other_pages_margin};}} "
        else:
            margins = "{header_size}px {side_margin} {footer_size}px {side_margin}".format(
                header_size=header_height + self.extra_vertical_margin if header_body else 0,
                footer_size=footer_height + (self.extra_vertical_margin // 2),  # Reduced bottom margin
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

        if self.header_html or self.footer_html or self.footer_subsequent_html:
            # Header is only shown on first page, footer on all pages (different footer for subsequent pages)
            header_first_page_only = getattr(self, 'header_first_page_only', False)
            self._apply_overlay_on_main(main_doc, header_body, footer_body, footer_subsequent_body, header_first_page_only=header_first_page_only)
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
            result = PdfGenerator.get_element(box.all_children(), element)
            if result is not None:
                return result
        return None


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


def generate_results_pdf(result_response: Any, photo_data: bytes | None = None) -> bytes:
    """
    Generate PDF document for examination results using WeasyPrint.

    Args:
        result_response: PublicResultResponse model instance
        photo_data: Optional photo file content as bytes

    Returns:
        PDF file as bytes
    """
    import base64
    import io
    from datetime import datetime
    import qrcode

    # Convert photo to base64 for embedding in HTML
    photo_base64 = None
    if photo_data:
        try:
            photo_base64 = base64.b64encode(photo_data).decode('utf-8')
        except Exception:
            pass

    # Normalize grades for template (convert enum to string value)
    normalized_results = []
    for subject_result in result_response.results:
        grade_str = None
        if subject_result.grade:
            # Handle enum.Grade or string
            if hasattr(subject_result.grade, 'value'):
                grade_str = subject_result.grade.value
            else:
                grade_str = str(subject_result.grade)

        normalized_results.append({
            "subject_code": subject_result.subject_code,
            "subject_name": subject_result.subject_name,
            "grade": grade_str,
        })

    # Generate QR code with examination details
    qr_content_lines = []
    qr_content_lines.append(f"Name: {result_response.candidate_name}")
    qr_content_lines.append(f"Index Number: {result_response.index_number or 'N/A'}")
    qr_content_lines.append(f"Examination: {result_response.exam_type} {result_response.exam_series} {result_response.year}")
    qr_content_lines.append("Results:")
    for subject_result in normalized_results:
        subject_name = subject_result['subject_name'] or subject_result['subject_code']
        grade = subject_result['grade'] or 'Pending'
        qr_content_lines.append(f"{subject_name}-{grade}")

    qr_content = "\n".join(qr_content_lines)

    # Generate QR code image
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(qr_content)
    qr.make(fit=True)

    qr_img = qr.make_image(fill_color="black", back_color="white")
    qr_buffer = io.BytesIO()
    qr_img.save(qr_buffer, format="PNG")
    qr_buffer.seek(0)
    qr_base64 = base64.b64encode(qr_buffer.read()).decode("utf-8")

    # Prepare template context
    context = {
        "result": result_response,
        "normalized_results": normalized_results,
        "photo_base64": photo_base64,
        "qr_code_base64": qr_base64,
        "generated_at": datetime.utcnow().strftime('%B %d, %Y at %H:%M:%S UTC'),
    }

    # Render the HTML template
    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "results/result-details.html", templates_dir)

    # Get absolute path to app directory for base_url (so images can be resolved)
    app_dir = Path(__file__).parent.parent.resolve()
    base_url = str(app_dir)

    # Generate PDF using PdfGenerator
    pdf_gen = PdfGenerator(
        main_html=main_html,
        header_html=None,
        footer_html=None,
        base_url=base_url,
        side_margin=1.5,
        extra_vertical_margin=20,
    )

    pdf_bytes = pdf_gen.render_pdf()
    return pdf_bytes
