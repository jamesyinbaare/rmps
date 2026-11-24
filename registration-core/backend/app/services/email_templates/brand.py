"""CTVET brand tokens for HTML emails."""
from __future__ import annotations

from app.config import settings

# Ghana / CTVET crest palette (matches frontend globals.css)
BRAND = {
    "green": "#006B3F",
    "forest": "#005530",
    "mint": "#ECFDF5",
    "gold": "#FCD116",
    "text": "#0A0A0A",
    "muted": "#5D6D7E",
    "border": "#E5E7EB",
    "bg": "#FAFAFA",
    "white": "#FFFFFF",
    "danger_bg": "#FEF2F2",
    "danger_text": "#991B1B",
}

FONT = "Arial, Helvetica, sans-serif"
ORG_FOOTER = (
    "Commission for Technical and Vocational Education and Training (CTVET)"
)


def logo_url() -> str:
    base = (settings.frontend_base_url or "http://localhost:3002").rstrip("/")
    return f"{base}/logo-crest-only.png"
