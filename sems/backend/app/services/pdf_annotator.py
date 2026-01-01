"""PDF annotation service for adding barcodes and text to score sheets."""

from io import BytesIO

import barcode
from barcode.writer import ImageWriter
from PIL import Image
from PyPDF2 import PdfReader, PdfWriter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


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
    barcode_instance = barcode_format(text, writer=ImageWriter(), add_checksum=False)
    barcode_bytes = BytesIO()
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


def annotate_pdf_page_with_sheet_id(pdf_bytes: bytes, page_index: int, sheet_id: str, barcode_x: float = 340, barcode_y: float = 755, text_x: float = 420, text_y: float = 690) -> bytes:
    """
    Annotate a specific page of a PDF with barcode and text containing the sheet ID.

    Args:
        pdf_bytes: PDF file as bytes
        page_index: Zero-based index of the page to annotate
        sheet_id: Sheet ID to add as barcode and text
        barcode_x: X coordinate for barcode
        barcode_y: Y coordinate for barcode
        text_x: X coordinate for text
        text_y: Y coordinate for text

    Returns:
        Annotated PDF as bytes
    """
    # Read the input PDF
    pdf_buffer = BytesIO(pdf_bytes)
    reader = PdfReader(pdf_buffer)
    writer = PdfWriter()

    # Process each page
    for i, page in enumerate(reader.pages):
        if i == page_index:
            # Create a temporary PDF with the annotations for this page
            packet = BytesIO()
            can = canvas.Canvas(packet)
            can.setFont("Helvetica-Bold", 16)

            # Generate barcode
            barcode_image = generate_barcode_image(sheet_id)
            add_barcode_image_to_canvas(can, barcode_image, barcode_x, barcode_y, width=200, height=50)

            # Add text
            can.drawString(text_x, text_y, sheet_id)
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


def annotate_pdf_with_sheet_ids(pdf_bytes: bytes, sheet_ids: list[str], barcode_x: float = 340, barcode_y: float = 755, text_x: float = 420, text_y: float = 690) -> bytes:
    """
    Annotate all pages of a PDF with corresponding sheet IDs.

    Args:
        pdf_bytes: PDF file as bytes
        sheet_ids: List of sheet IDs, one per page (in order)
        barcode_x: X coordinate for barcode
        barcode_y: Y coordinate for barcode
        text_x: X coordinate for text
        text_y: Y coordinate for text

    Returns:
        Fully annotated PDF as bytes
    """
    # Read the input PDF
    pdf_buffer = BytesIO(pdf_bytes)
    reader = PdfReader(pdf_buffer)
    writer = PdfWriter()

    # Process each page
    for i, page in enumerate(reader.pages):
        if i < len(sheet_ids):
            sheet_id = sheet_ids[i]

            # Create a temporary PDF with the annotations for this page
            packet = BytesIO()
            can = canvas.Canvas(packet)
            can.setFont("Helvetica-Bold", 16)

            # Generate barcode
            barcode_image = generate_barcode_image(sheet_id)
            add_barcode_image_to_canvas(can, barcode_image, barcode_x, barcode_y, width=200, height=50)

            # Add text
            can.drawString(text_x, text_y, sheet_id)
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
