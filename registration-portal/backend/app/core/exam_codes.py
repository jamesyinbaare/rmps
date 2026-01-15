"""Exam type and series code normalization utilities."""
from typing import Optional


# Exam type aliases mapping to canonical names
EXAM_TYPE_ALIASES: dict[str, str] = {
    # Short aliases (primary)
    "cert2": "Certificate II Examinations",
    "cert_ii": "Certificate II Examinations",
    "certificate_ii": "Certificate II Examinations",
    "advance": "Advance",
    "tech1": "Technician Part I",
    "tech_i": "Technician Part I",
    "technician_i": "Technician Part I",
    "tech2": "Technician Part II",
    "tech_ii": "Technician Part II",
    "technician_ii": "Technician Part II",
    "tech3": "Technician Part III",
    "tech_iii": "Technician Part III",
    "technician_iii": "Technician Part III",
    "diploma": "Diploma",

    # Numeric codes (alternative)
    "1": "Certificate II Examinations",
    "2": "Advance",
    "3": "Technician Part I",
    "4": "Technician Part II",
    "5": "Technician Part III",
    "6": "Diploma",

    # Canonical names (for backward compatibility - identity mapping)
    "Certificate II Examinations": "Certificate II Examinations",
    "Advance": "Advance",
    "Technician Part I": "Technician Part I",
    "Technician Part II": "Technician Part II",
    "Technician Part III": "Technician Part III",
    "Diploma": "Diploma",

    # Common variations
    "Certificate II Examination": "Certificate II Examinations",  # Without 's'
    "Certificate 2 Examinations": "Certificate II Examinations",
    "Cert II": "Certificate II Examinations",
    "Technician Part 1": "Technician Part I",
    "Technician Part 2": "Technician Part II",
    "Technician Part 3": "Technician Part III",
}

# Exam series aliases mapping to canonical names
EXAM_SERIES_ALIASES: dict[str, str] = {
    # Short aliases (primary)
    "may_june": "MAY/JUNE",
    "mj": "MAY/JUNE",
    "may-june": "MAY/JUNE",
    "mayjune": "MAY/JUNE",
    "nov_dec": "NOV/DEC",
    "nd": "NOV/DEC",
    "nov-dec": "NOV/DEC",
    "novdec": "NOV/DEC",
    "november_december": "NOV/DEC",
    "november-december": "NOV/DEC",

    # Numeric codes (alternative)
    "1": "MAY/JUNE",
    "2": "NOV/DEC",

    # Canonical names (for backward compatibility - identity mapping)
    "MAY/JUNE": "MAY/JUNE",
    "NOV/DEC": "NOV/DEC",

    # Common variations
    "MAY-JUNE": "MAY/JUNE",
    "MAY JUNE": "MAY/JUNE",
    "May/June": "MAY/JUNE",
    "May-June": "MAY/JUNE",
    "May June": "MAY/JUNE",
    "NOV-DEC": "NOV/DEC",
    "NOV DEC": "NOV/DEC",
    "Nov/Dec": "NOV/DEC",
    "Nov-Dec": "NOV/DEC",
    "Nov Dec": "NOV/DEC",
    "November/December": "NOV/DEC",
    "November-December": "NOV/DEC",
}


def normalize_exam_type(exam_type: Optional[str]) -> Optional[str]:
    """
    Normalize exam type code/alias to canonical name.

    Supports:
    - Short aliases: "cert2", "tech1", etc.
    - Numeric codes: "1", "2", etc.
    - Full names: "Certificate II Examinations" (unchanged)
    - Common variations: "Certificate II Examination", "Cert II", etc.

    Args:
        exam_type: Exam type string (code, alias, or full name)

    Returns:
        Canonical exam type name, or None if input is None

    Examples:
        >>> normalize_exam_type("cert2")
        'Certificate II Examinations'
        >>> normalize_exam_type("1")
        'Certificate II Examinations'
        >>> normalize_exam_type("Certificate II Examinations")
        'Certificate II Examinations'
    """
    if not exam_type:
        return None

    # Normalize input: strip whitespace and convert to lowercase for lookup
    normalized_input = exam_type.strip()

    # Try exact match first (case-insensitive)
    normalized_lower = normalized_input.lower()

    # Look up in aliases dictionary (case-insensitive lookup)
    if normalized_lower in EXAM_TYPE_ALIASES:
        return EXAM_TYPE_ALIASES[normalized_lower]

    # Try with underscores/slashes normalized
    normalized_key = normalized_lower.replace(" ", "_").replace("-", "_")
    if normalized_key in EXAM_TYPE_ALIASES:
        return EXAM_TYPE_ALIASES[normalized_key]

    # If not found, try original (might be a canonical name with different case)
    if normalized_input in EXAM_TYPE_ALIASES:
        return EXAM_TYPE_ALIASES[normalized_input]

    # If still not found, return original (allows invalid values to pass through for validation error)
    return normalized_input


def normalize_exam_series(exam_series: Optional[str]) -> Optional[str]:
    """
    Normalize exam series code/alias to canonical name.

    Supports:
    - Short aliases: "may_june", "mj", "nov_dec", "nd"
    - Numeric codes: "1" (MAY/JUNE), "2" (NOV/DEC)
    - Full names: "MAY/JUNE", "NOV/DEC" (unchanged)
    - Common variations: "May/June", "MAY-JUNE", etc.

    Args:
        exam_series: Exam series string (code, alias, or full name)

    Returns:
        Canonical exam series name ("MAY/JUNE" or "NOV/DEC"), or None if input is None

    Examples:
        >>> normalize_exam_series("mj")
        'MAY/JUNE'
        >>> normalize_exam_series("1")
        'MAY/JUNE'
        >>> normalize_exam_series("MAY/JUNE")
        'MAY/JUNE'
    """
    if not exam_series:
        return None

    # Normalize input: strip whitespace
    normalized_input = exam_series.strip()

    # Try exact match first (case-insensitive)
    normalized_lower = normalized_input.lower()

    # Look up in aliases dictionary (case-insensitive lookup)
    if normalized_lower in EXAM_SERIES_ALIASES:
        return EXAM_SERIES_ALIASES[normalized_lower]

    # Try with underscores/slashes normalized
    normalized_key = normalized_lower.replace(" ", "_").replace("-", "_")
    if normalized_key in EXAM_SERIES_ALIASES:
        return EXAM_SERIES_ALIASES[normalized_key]

    # If not found, try original (might be a canonical name with different case)
    if normalized_input in EXAM_SERIES_ALIASES:
        return EXAM_SERIES_ALIASES[normalized_input]

    # If still not found, return original (allows invalid values to pass through for validation error)
    return normalized_input
