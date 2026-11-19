"""Exam type and series code normalization utilities."""
from typing import Optional


# Exam type aliases mapping to canonical names
EXAM_TYPE_ALIASES: dict[str, str] = {
    # Short aliases (primary)
    "cert2": "Certificate II",
    "cert_ii": "Certificate II",
    "certificate_ii": "Certificate II",
    "traditional": "Traditional",
    "advance": "Traditional",
    "tech1": "Traditional",
    "tech_i": "Traditional",
    "technician_i": "Traditional",
    "tech2": "Traditional",
    "tech_ii": "Traditional",
    "technician_ii": "Traditional",
    "tech3": "Traditional",
    "tech_iii": "Traditional",
    "technician_iii": "Traditional",
    "diploma": "Traditional",
    "dbs": "Traditional",

    # Numeric codes (alternative)
    "1": "Certificate II",
    "2": "Traditional",
    "3": "Traditional",
    "4": "Traditional",
    "5": "Traditional",
    "6": "Traditional",

    # Canonical / display names (identity + legacy)
    "Certificate II": "Certificate II",
    "Traditional": "Traditional",
    "Certificate II Examinations": "Certificate II",
    "Advance": "Traditional",
    "Technician Part I": "Traditional",
    "Technician Part II": "Traditional",
    "Technician Part III": "Traditional",
    "Diploma": "Traditional",

    # Common variations
    "Certificate II Examination": "Certificate II",
    "Certificate 2 Examinations": "Certificate II",
    "Cert II": "Certificate II",
    "Technician Part 1": "Traditional",
    "Technician Part 2": "Traditional",
    "Technician Part 3": "Traditional",
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
    "main": "MAIN",

    # Numeric codes (alternative)
    "1": "MAY/JUNE",
    "2": "NOV/DEC",
    "3": "MAIN",

    # Canonical names (for backward compatibility - identity mapping)
    "MAY/JUNE": "MAY/JUNE",
    "NOV/DEC": "NOV/DEC",
    "MAIN": "MAIN",

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
    "Main Sitting": "MAIN",
    "Main": "MAIN",
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
