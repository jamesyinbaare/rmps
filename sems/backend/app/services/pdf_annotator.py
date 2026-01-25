"""PDF annotation service for adding barcodes and text to score sheets."""

from io import BytesIO

import barcode
from barcode.writer import ImageWriter
from PIL import Image
from PyPDF2 import PdfReader, PdfWriter
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

# A4 width 595 pt; side margin 2 cm ≈ 56.69 pt per side. Score table right edge.
_MARGIN_PT = 2 * 28.35  # 56.69
_TABLE_RIGHT_PT = 595 - _MARGIN_PT  # 538.31
_CONTENT_LEFT_PT = _MARGIN_PT
_CONTENT_WIDTH_PT = _TABLE_RIGHT_PT - _CONTENT_LEFT_PT  # 481.62
_BARCODE_WIDTH_PT = 200
_BARCODE_HEIGHT_PT = 50
# Barcode right edge aligns with table right; nudged right a little.
_DEFAULT_BARCODE_X = _TABLE_RIGHT_PT - _BARCODE_WIDTH_PT + 20  # ~358.3
# Footer right cell (Examiner) = 50% of content area. Center x for sheet ID.
_FOOTER_CELL_LEFT_PT = _CONTENT_LEFT_PT + _CONTENT_WIDTH_PT / 2  # 297.5
_FOOTER_CELL_CENTER_X = (_FOOTER_CELL_LEFT_PT + _TABLE_RIGHT_PT) / 2  # 417.9
_SHEET_ID_FONT = "Helvetica-Bold"
_SHEET_ID_FONT_SIZE = 16
_DEFAULT_TEXT_Y = 32  # sheet ID in footer; higher = further up


def generate_barcode_image(text: str) -> Image.Image:
    """
    Generates a Code39 barcode from the given text and returns it as a PIL image.

    Parameters:
    text (str): The text to generate the barcode for.

    Returns:
    Image: A PIL image object containing the barcode.
    """
    # Use Code39 as the barcode format
    barcode_format = barcode.get_barcode_class("code39")

    # Generate the barcode and save it to a BytesIO object
    barcode_bytes = BytesIO()
    barcode_instance = barcode_format(text, writer=ImageWriter(), add_checksum=False)
    barcode_instance.write(barcode_bytes)

    # Seek to the start of the BytesIO object
    barcode_bytes.seek(0)

    # Open the image with PIL
    barcode_image = Image.open(barcode_bytes)

    return barcode_image


def add_barcode_image_to_canvas(canvas_obj: canvas.Canvas, barcode_image: Image.Image, x: float, y: float, width: int = 200, height: int = 50) -> None:
    """
    Adds a Barcode image to a ReportLab canvas at the specified coordinates.

    Parameters:
    canvas_obj (canvas.Canvas): The ReportLab canvas object.
    barcode_image (PIL.Image.Image): The PIL image to add.
    x (float): The x-coordinate on the canvas where the image should be placed.
    y (float): The y-coordinate on the canvas where the image should be placed.
    width (float, optional): The width of the image on the canvas. If not specified, use the image's width.
    height (float, optional): The height of the image on the canvas. If not specified, use the image's height.
    """
    # Convert the PIL image to a BytesIO object
    img_bytes = BytesIO()
    barcode_image.save(img_bytes, format="PNG")
    img_bytes.seek(0)

    # Create an ImageReader object from the BytesIO object
    reportlab_image = ImageReader(img_bytes)

    # If width and height are not specified, use the original image dimensions
    if width is None or height is None:
        width, height = barcode_image.size

    # Draw the image on the canvas
    canvas_obj.drawImage(reportlab_image, x, y, width=width, height=height)


def _sheet_id_text_x_centered(sheet_id: str) -> float:
    """X so sheet ID text is centered in the footer right cell."""
    w = stringWidth(sheet_id, _SHEET_ID_FONT, _SHEET_ID_FONT_SIZE)
    return _FOOTER_CELL_CENTER_X - w / 2


def annotate_pdf_page_with_sheet_id(pdf_bytes: bytes, page_index: int, sheet_id: str, barcode_x: float = _DEFAULT_BARCODE_X, barcode_y: float = 755, text_x: float | None = None, text_y: float = _DEFAULT_TEXT_Y) -> bytes:
    """
    Annotate a specific page of a PDF with barcode and text containing the sheet ID.

    Barcode is drawn in the header; sheet ID text in the footer cell (centered).
    Args:
        pdf_bytes: PDF file as bytes
        page_index: Zero-based index of the page to annotate
        sheet_id: Sheet ID to add as barcode and text
        barcode_x: X coordinate for barcode (default: right-aligned with score table)
        barcode_y: Y coordinate for barcode
        text_x: X for sheet ID text; if None, centered in footer cell
        text_y: Y coordinate for text

    Returns:
        Annotated PDF as bytes
    """
    # Read the input PDF
    pdf_buffer = BytesIO(pdf_bytes)
    reader = PdfReader(pdf_buffer)
    writer = PdfWriter()
    tx = text_x if text_x is not None else _sheet_id_text_x_centered(sheet_id)

    # Process each page
    for i, page in enumerate(reader.pages):
        if i == page_index:
            # Create a temporary PDF with the annotations for this page
            packet = BytesIO()
            can = canvas.Canvas(packet)
            can.setFont(_SHEET_ID_FONT, _SHEET_ID_FONT_SIZE)

            # Generate barcode
            barcode_image = generate_barcode_image(sheet_id)
            add_barcode_image_to_canvas(can, barcode_image, barcode_x, barcode_y, width=_BARCODE_WIDTH_PT, height=_BARCODE_HEIGHT_PT)

            # Add text (centered in footer cell when text_x is None)
            can.drawString(tx, text_y, sheet_id)
            can.save()

            # Merge the annotation PDF with the original page
            packet.seek(0)
            temp_pdf = PdfReader(packet)
            page.merge_page(temp_pdf.pages[0])

        writer.add_page(page)

    # Write the output PDF
    output = BytesIO()
    writer.write(output)
    output.seek(0)
    return output.getvalue()


def annotate_pdf_with_sheet_ids(pdf_bytes: bytes, sheet_ids: list[str], barcode_x: float = _DEFAULT_BARCODE_X, barcode_y: float = 755, text_x: float | None = None, text_y: float = _DEFAULT_TEXT_Y) -> bytes:
    """
    Annotate all pages of a PDF with corresponding sheet IDs.

    Barcode in header; sheet ID text in footer cell (centered when text_x is None).
    Args:
        pdf_bytes: PDF file as bytes
        sheet_ids: List of sheet IDs, one per page (in order)
        barcode_x: X coordinate for barcode (default: right-aligned with score table)
        barcode_y: Y coordinate for barcode
        text_x: X for sheet ID text; if None, centered in footer cell
        text_y: Y coordinate for text

    Returns:
        Fully annotated PDF as bytes
    """
    # Read the input PDF
    pdf_buffer = BytesIO(pdf_bytes)
    reader = PdfReader(pdf_buffer)
    writer = PdfWriter()
    total_pages = len(reader.pages)

    if len(sheet_ids) == 0:
        raise ValueError("No sheet IDs provided for PDF annotation")

    if len(sheet_ids) != total_pages:
        raise ValueError(
            f"Sheet ID count ({len(sheet_ids)}) does not match PDF page count ({total_pages})"
        )

    # Process each page
    for i, page in enumerate(reader.pages):
        sheet_id = sheet_ids[i]
        tx = text_x if text_x is not None else _sheet_id_text_x_centered(sheet_id)

        # Create a temporary PDF with the annotations for this page
        packet = BytesIO()
        can = canvas.Canvas(packet)
        can.setFont(_SHEET_ID_FONT, _SHEET_ID_FONT_SIZE)

        # Generate barcode
        barcode_image = generate_barcode_image(sheet_id)
        add_barcode_image_to_canvas(can, barcode_image, barcode_x, barcode_y, width=_BARCODE_WIDTH_PT, height=_BARCODE_HEIGHT_PT)

        # Add text (centered in footer cell when text_x is None)
        can.drawString(tx, text_y, sheet_id)
        can.save()

        # Merge the annotation PDF with the original page
        packet.seek(0)
        temp_pdf = PdfReader(packet)
        page.merge_page(temp_pdf.pages[0])

        writer.add_page(page)

    # Write the output PDF
    output = BytesIO()
    writer.write(output)
    output.seek(0)
    return output.getvalue()
