"""QR code image generation for examiner reference codes and similar payloads."""

from __future__ import annotations

import base64
import io

import qrcode


def generate_qr_code_base64(
    payload: str,
    *,
    box_size: int = 10,
    border: int = 4,
    error_correction: int = qrcode.constants.ERROR_CORRECT_L,
) -> str:
    """Return a base64-encoded PNG for the given payload (no data: prefix)."""
    text = payload.strip()
    if not text:
        raise ValueError("QR payload must not be empty.")

    qr = qrcode.QRCode(
        version=1,
        error_correction=error_correction,
        box_size=box_size,
        border=border,
    )
    qr.add_data(text)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")
