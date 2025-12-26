"""Utility functions for score validation and parsing."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import DataExtractionMethod, Document


def validate_score_value(value: str | float | None) -> bool:
    """
    Validate that score value is allowed format.
    Returns True if value is: None, numeric string (>=0), "A", or "AA"
    """
    if value is None:
        return True

    value_str = str(value).strip().upper()

    # Check for absence indicators
    if value_str in ("A", "AA"):
        return True

    # Check for numeric value (>= 0)
    try:
        num_value = float(value_str)
        return num_value >= 0
    except ValueError:
        return False


def parse_score_value(value: str | float | None) -> str | None:
    """
    Parse and normalize score value.
    Returns: None, numeric string (>=0), "A", or "AA"
    Raises ValueError if invalid format.
    """
    if value is None:
        return None

    value_str = str(value).strip().upper()

    # Handle empty string as None
    if not value_str:
        return None

    # Check for absence indicators
    if value_str in ("A", "AA"):
        return value_str

    # Parse as numeric
    try:
        num_value = float(value_str)
        if num_value < 0:
            raise ValueError(f"Score cannot be negative: {value_str}")
        # Return as string, removing unnecessary trailing zeros for integers
        if num_value == int(num_value):
            return str(int(num_value))
        return str(num_value)
    except ValueError as e:
        if "cannot be negative" in str(e):
            raise
        raise ValueError(f"Score must be a number (>=0), 'A', 'AA', or None. Got: {value_str}")


def is_absent(score: str | None) -> bool:
    """Check if score indicates absence."""
    if score is None:
        return False
    return str(score).strip().upper() in ("A", "AA")


def is_present(score: str | None) -> bool:
    """Check if score indicates presence."""
    if score is None:
        return False
    return not is_absent(score)


def is_entered(score: str | None) -> bool:
    """Check if score has been entered (not NULL)."""
    return score is not None


def get_numeric_score(score: str | None) -> float | None:
    """
    Extract numeric value if present, None if absent or not entered.
    Raises ValueError if score format is invalid.
    """
    if score is None or is_absent(score):
        return None

    try:
        num_value = float(str(score))
        if num_value < 0:
            raise ValueError("Score cannot be negative")
        return num_value
    except ValueError as e:
        if "cannot be negative" in str(e):
            raise
        raise ValueError(f"Invalid score format: {score}")


def calculate_total_score(
    obj_raw_score: str | None, essay_raw_score: str | None, pract_raw_score: str | None
) -> float:
    """
    Calculate total score from raw scores.
    Returns 0.0 if all scores are absent or not entered.
    Only includes numeric scores in the calculation.
    """
    total = 0.0

    obj_num = get_numeric_score(obj_raw_score)
    if obj_num is not None:
        total += obj_num

    essay_num = get_numeric_score(essay_raw_score)
    if essay_num is not None:
        total += essay_num

    pract_num = get_numeric_score(pract_raw_score)
    if pract_num is not None:
        total += pract_num

    return total


def validate_score_range(score: str | None, max_score: float) -> tuple[bool, str | None]:
    """
    Validate that a score value is within the allowed range (0 to max_score) or is "A"/"AA".

    Args:
        score: The score value to validate (can be None, "A", "AA", or numeric string)
        max_score: The maximum allowed score value

    Returns:
        Tuple of (is_valid, error_message). is_valid is True if score is valid, False otherwise.
        error_message is None if valid, otherwise contains the error description.
    """
    if score is None:
        return False, "Score is required but not set"

    score_str = str(score).strip().upper()

    # Format max_score to remove unnecessary decimals
    max_score_display = int(max_score) if max_score == int(max_score) else max_score

    # Check for absence indicators - these are always valid
    if score_str in ("A", "AA"):
        return True, None

    # Check for numeric value
    try:
        num_value = float(score_str)
        if num_value < 0:
            return False, f"Score cannot be negative. Please enter a value between 0 and {max_score_display}, or 'A'/'AA' for absent"
        if num_value > max_score:
            return False, f"Score {score_str} exceeds the maximum of {max_score_display}. Please enter a value between 0 and {max_score_display}, or 'A'/'AA' for absent"
        return True, None
    except ValueError:
        return False, f"Invalid score format. Please enter a number between 0 and {max_score_display}, or 'A'/'AA' for absent"


def add_extraction_method_to_document(
    document: "Document", extraction_method: "DataExtractionMethod"
) -> None:
    """
    Add an extraction method to a document's scores_extraction_methods array.
    Handles NULL arrays by initializing as empty, and avoids duplicates.

    Args:
        document: The Document model instance to update
        extraction_method: The DataExtractionMethod enum value to add
    """
    if document.scores_extraction_methods is None:
        document.scores_extraction_methods = []

    # Convert to set to avoid duplicates, then back to list
    methods_set = set(document.scores_extraction_methods)
    methods_set.add(extraction_method)
    document.scores_extraction_methods = list(methods_set)
