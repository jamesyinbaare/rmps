"""Service for parsing and validating subject upload files."""

import io
from typing import Any

import pandas as pd

from app.models import SubjectType


class SubjectUploadParseError(Exception):
    """Raised when file parsing fails."""

    pass


class SubjectUploadValidationError(Exception):
    """Raised when file validation fails."""

    pass


def parse_upload_file(file_content: bytes, filename: str) -> pd.DataFrame:
    """
    Parse Excel or CSV file and return DataFrame.

    Args:
        file_content: Raw file content as bytes
        filename: Original filename for type detection

    Returns:
        DataFrame with parsed data

    Raises:
        SubjectUploadParseError: If file cannot be parsed
    """
    try:
        # Detect file type from extension
        file_lower = filename.lower()
        if file_lower.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_content), engine="openpyxl")
        elif file_lower.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_content))
        else:
            raise SubjectUploadParseError(
                f"Unsupported file type. Expected .xlsx, .xls, or .csv, got {filename}"
            )

        # Remove empty rows
        df = df.dropna(how="all")

        if df.empty:
            raise SubjectUploadParseError("File is empty or contains no data")

        return df
    except pd.errors.EmptyDataError:
        raise SubjectUploadParseError("File is empty or contains no data")
    except Exception as e:
        if isinstance(e, (SubjectUploadParseError, SubjectUploadValidationError)):
            raise
        raise SubjectUploadParseError(f"Failed to parse file: {str(e)}")


def validate_required_columns(df: pd.DataFrame) -> None:
    """
    Validate that required columns exist in the DataFrame.

    Args:
        df: DataFrame to validate

    Raises:
        SubjectUploadValidationError: If required columns are missing
    """
    required_columns = {"code", "name", "subject_type"}
    df_columns = set(df.columns.str.lower().str.strip())

    missing_columns = required_columns - df_columns
    if missing_columns:
        raise SubjectUploadValidationError(
            f"Missing required columns: {', '.join(sorted(missing_columns))}. "
            f"Found columns: {', '.join(sorted(df_columns))}"
        )


def parse_subject_row(row: pd.Series) -> dict[str, Any]:
    """
    Parse a single row from the DataFrame into a structured subject data dict.

    Args:
        row: Pandas Series representing one row

    Returns:
        Dictionary with parsed subject data:
        - code: str
        - original_code: str | None
        - name: str
        - subject_type: SubjectType
        - choice_group_id: int | None (for optional core subjects)
        - programme_code: str | None (optional)
    """
    # Normalize column names (case-insensitive, strip whitespace)
    row_dict = {col.lower().strip(): val for col, val in row.items()}

    # Extract required fields - handle NaN values properly
    code_raw = row_dict.get("code", "")
    if pd.isna(code_raw):
        code = ""
    else:
        code = str(code_raw).strip()

    name_raw = row_dict.get("name", "")
    if pd.isna(name_raw):
        name = ""
    else:
        name = str(name_raw).strip()

    subject_type_raw = row_dict.get("subject_type", "")
    if pd.isna(subject_type_raw):
        subject_type_str = ""
    else:
        subject_type_str = str(subject_type_raw).strip().upper()

    # Parse subject_type
    subject_type = None
    if subject_type_str == "CORE":
        subject_type = SubjectType.CORE
    elif subject_type_str == "ELECTIVE":
        subject_type = SubjectType.ELECTIVE

    # Extract optional original_code
    original_code = row_dict.get("original_code")
    # Explicitly handle NaN values - convert to None before any operations
    if original_code is not None:
        # Check for pandas NaN first (must be before string conversion)
        if pd.isna(original_code):
            original_code = None
        else:
            original_code = str(original_code).strip()
            # Check if it's a meaningful value (not empty, not NaN string representation)
            if not original_code or original_code.lower() in ("nan", "none", ""):
                original_code = None

    # Extract optional choice_group_id (for optional core subjects)
    choice_group_id = None
    choice_group_str = row_dict.get("choice_group_id")
    # Handle pandas NaN, None, empty strings, and whitespace
    if choice_group_str is not None and not pd.isna(choice_group_str):
        try:
            # Convert to string and strip whitespace
            choice_group_str = str(choice_group_str).strip()
            # Check if it's a meaningful value (not empty, not NaN string representation)
            if choice_group_str and choice_group_str.lower() not in ("nan", "none", ""):
                # Try to convert to integer
                choice_group_id = int(float(choice_group_str))  # Use float() first to handle "1.0" -> 1
                # Ensure it's a positive integer
                if choice_group_id <= 0:
                    choice_group_id = None
        except (ValueError, TypeError, OverflowError):
            # If conversion fails, leave as None
            choice_group_id = None

    # Extract optional programme_code
    programme_code = row_dict.get("programme_code")
    # Explicitly handle NaN values - convert to None before any operations
    if programme_code is not None:
        # Check for pandas NaN first (must be before string conversion)
        if pd.isna(programme_code):
            programme_code = None
        else:
            programme_code = str(programme_code).strip()
            # Check if it's a meaningful value (not empty, not NaN string representation)
            if not programme_code or programme_code.lower() in ("nan", "none", ""):
                programme_code = None

    return {
        "code": code,
        "original_code": original_code,
        "name": name,
        "subject_type": subject_type,
        "choice_group_id": choice_group_id,
        "programme_code": programme_code,
    }
