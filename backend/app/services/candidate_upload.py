"""Service for parsing and validating candidate upload files."""

import io
from typing import Any

import pandas as pd


class CandidateUploadParseError(Exception):
    """Raised when file parsing fails."""

    pass


class CandidateUploadValidationError(Exception):
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
        CandidateUploadParseError: If file cannot be parsed
    """
    try:
        # Detect file type from extension
        file_lower = filename.lower()
        if file_lower.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_content), engine="openpyxl")
        elif file_lower.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_content))
        else:
            raise CandidateUploadParseError(f"Unsupported file type. Expected .xlsx, .xls, or .csv, got {filename}")

        # Remove empty rows
        df = df.dropna(how="all")

        if df.empty:
            raise CandidateUploadParseError("File is empty or contains no data")

        return df
    except pd.errors.EmptyDataError:
        raise CandidateUploadParseError("File is empty or contains no data")
    except Exception as e:
        if isinstance(e, (CandidateUploadParseError, CandidateUploadValidationError)):
            raise
        raise CandidateUploadParseError(f"Failed to parse file: {str(e)}")


def validate_required_columns(df: pd.DataFrame) -> None:
    """
    Validate that required columns exist in the DataFrame.

    Args:
        df: DataFrame to validate

    Raises:
        CandidateUploadValidationError: If required columns are missing
    """
    required_columns = {"school_code", "name", "index_number"}
    df_columns = set(df.columns.str.lower().str.strip())

    missing_columns = required_columns - df_columns
    if missing_columns:
        raise CandidateUploadValidationError(
            f"Missing required columns: {', '.join(sorted(missing_columns))}. "
            f"Found columns: {', '.join(sorted(df_columns))}"
        )


def extract_subject_columns(df: pd.DataFrame) -> list[str]:
    """
    Extract subject code columns from DataFrame.

    Subject columns are identified by patterns like:
    - subject_code_1, subject_code_2, ...
    - subject_1, subject_2, ...
    - Any column starting with 'subject'

    Args:
        df: DataFrame to search

    Returns:
        List of column names that contain subject codes
    """
    df_columns = df.columns.str.lower().str.strip()
    subject_columns = []

    for col in df.columns:
        col_lower = col.lower().strip()
        if (
            col_lower.startswith("subject_code")
            or col_lower.startswith("subject_")
            or (col_lower.startswith("subject") and col_lower != "subject")
        ):
            subject_columns.append(col)

    return subject_columns


def parse_candidate_row(row: pd.Series, subject_columns: list[str]) -> dict[str, Any]:
    """
    Parse a single row from the DataFrame into a structured candidate data dict.

    Args:
        row: Pandas Series representing one row
        subject_columns: List of column names that contain subject codes

    Returns:
        Dictionary with parsed candidate data:
        - school_code: str
        - programme_code: str | None
        - name: str
        - index_number: str
        - subject_codes: list[str]
    """
    # Normalize column names (case-insensitive, strip whitespace)
    row_dict = {col.lower().strip(): val for col, val in row.items()}

    # Extract required fields
    school_code = str(row_dict.get("school_code", "")).strip()
    name = str(row_dict.get("name", "")).strip()
    index_number = str(row_dict.get("index_number", "")).strip()

    # Extract optional programme_code
    programme_code = row_dict.get("programme_code")
    if programme_code is not None:
        programme_code = str(programme_code).strip()
        if not programme_code or programme_code.lower() == "nan":
            programme_code = None

    # Extract subject codes from subject columns
    subject_codes = []
    for col in subject_columns:
        val = row_dict.get(col.lower().strip())
        if val is not None:
            val_str = str(val).strip()
            if val_str and val_str.lower() != "nan":
                subject_codes.append(val_str)

    return {
        "school_code": school_code,
        "programme_code": programme_code,
        "name": name,
        "index_number": index_number,
        "subject_codes": subject_codes,
    }
