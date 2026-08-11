"""OCR helpers for Certificate Studio scan ROIs."""

from __future__ import annotations

import io
import re
from typing import Any

import pytesseract
from PIL import Image


def normalize_ocr_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value.strip())
    return cleaned or None


def validate_roi(roi: dict[str, Any], *, label: str) -> dict[str, float]:
    try:
        x = float(roi["x"])
        y = float(roi["y"])
        w = float(roi["w"])
        h = float(roi["h"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"Invalid {label} ROI: expected x,y,w,h numbers") from exc
    if not (0 <= x <= 1 and 0 <= y <= 1 and 0 < w <= 1 and 0 < h <= 1):
        raise ValueError(f"Invalid {label} ROI: values must be within the page (0–1)")
    if x + w > 1.001 or y + h > 1.001:
        raise ValueError(f"Invalid {label} ROI: rectangle exceeds page bounds")
    return {"x": x, "y": y, "w": w, "h": h}


def load_scan_image(content: bytes, filename: str | None = None) -> Image.Image:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        raise ValueError("PDF scans are not supported for OCR; upload JPEG/PNG/TIFF images")
    try:
        image = Image.open(io.BytesIO(content))
        return image.convert("RGB")
    except Exception as exc:
        raise ValueError("Unable to open scan image") from exc


def crop_roi(image: Image.Image, roi: dict[str, float]) -> Image.Image:
    width, height = image.size
    left = max(0, int(roi["x"] * width))
    top = max(0, int(roi["y"] * height))
    right = min(width, int((roi["x"] + roi["w"]) * width))
    bottom = min(height, int((roi["y"] + roi["h"]) * height))
    if right <= left or bottom <= top:
        raise ValueError("ROI crop is empty")
    return image.crop((left, top, right, bottom))


def ocr_roi_text(image: Image.Image, roi: dict[str, float]) -> str | None:
    cropped = crop_roi(image, roi)
    # Slight upscale helps small printed text
    cw, ch = cropped.size
    if cw < 400 or ch < 80:
        scale = max(2, int(400 / max(cw, 1)))
        cropped = cropped.resize((cw * scale, ch * scale), Image.Resampling.LANCZOS)
    raw = pytesseract.image_to_string(cropped, config="--psm 7")
    return normalize_ocr_text(raw)


def extract_index_and_certificate(
    content: bytes,
    *,
    filename: str | None,
    roi_index: dict[str, float],
    roi_certificate: dict[str, float],
) -> tuple[str | None, str | None]:
    image = load_scan_image(content, filename)
    index_number = ocr_roi_text(image, roi_index)
    certificate_number = ocr_roi_text(image, roi_certificate)
    return index_number, certificate_number
