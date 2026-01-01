"""Service for parsing and validating exam subject upload files."""

from typing import Any

import pandas as pd

from app.services.subject_upload import (
    SubjectUploadParseError,
    SubjectUploadValidationError,
    parse_upload_file,
)


def validate_exam_subject_columns(df: pd.DataFrame) -> None:
    """
    Validate that required columns exist in the DataFrame.

    Args:
        df: DataFrame to validate

    Raises:
        SubjectUploadValidationError: If required columns are missing
    """
    required_columns = {"original_code", "subject_name"}
    df_columns = set(df.columns.str.lower().str.strip())

    missing_columns = required_columns - df_columns
    if missing_columns:
        raise SubjectUploadValidationError(
            f"Missing required columns: {', '.join(sorted(missing_columns))}. "
            f"Found columns: {', '.join(sorted(df_columns))}"
        )


def parse_exam_subject_row(row: pd.Series) -> dict[str, Any]:
    """
    Parse a single row from the DataFrame into a structured exam subject data dict.

    Args:
        row: Pandas Series representing one row

    Returns:
        Dictionary with parsed exam subject data:
        - original_code: str
        - obj_pct: float | None
        - essay_pct: float | None
        - pract_pct: float | None
        - obj_max_score: float | None
        - essay_max_score: float | None
    """
    # Normalize column names (case-insensitive, strip whitespace)
    row_dict = {col.lower().strip(): val for col, val in row.items()}

    # Extract required fields
    original_code = str(row_dict.get("original_code", "")).strip()

    # Extract optional percentage fields
    def parse_float_or_none(value) -> float | None:
        if pd.isna(value) or value == "" or str(value).strip().lower() == "nan":
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    obj_pct = parse_float_or_none(row_dict.get("obj_pct"))
    essay_pct = parse_float_or_none(row_dict.get("essay_pct"))
    pract_pct = parse_float_or_none(row_dict.get("pract_pct"))
    obj_max_score = parse_float_or_none(row_dict.get("obj_max_score"))
    essay_max_score = parse_float_or_none(row_dict.get("essay_max_score"))

    return {
        "original_code": original_code,
        "obj_pct": obj_pct,
        "essay_pct": essay_pct,
        "pract_pct": pract_pct,
        "obj_max_score": obj_max_score,
        "essay_max_score": essay_max_score,
    }
