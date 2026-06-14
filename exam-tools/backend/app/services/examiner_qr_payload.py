"""Build and parse examiner QR scan payloads: {examination_id}:{reference_code}."""

from __future__ import annotations

import re

_PAYLOAD_PATTERN = re.compile(r"^(\d+):(.+)$")


def build_examiner_qr_payload(examination_id: int, reference_code: str) -> str:
    code = reference_code.strip().upper()
    if examination_id <= 0:
        raise ValueError("Examination id must be positive.")
    if not code:
        raise ValueError("Reference code is required.")
    return f"{int(examination_id)}:{code}"


def parse_examiner_qr_scan(raw: str) -> tuple[int | None, str]:
    """Return (examination_id, reference_code). examination_id is None for legacy plain codes."""
    text = raw.strip()
    if not text:
        return None, ""

    match = _PAYLOAD_PATTERN.fullmatch(text)
    if match is not None:
        exam_id = int(match.group(1))
        code = match.group(2).strip().upper()
        return exam_id, code

    return None, text.upper()
