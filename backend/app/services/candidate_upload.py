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
            # Read Excel file and convert index_number column to string to preserve leading zeros
            df = pd.read_excel(io.BytesIO(file_content), engine="openpyxl", dtype=str)
        elif file_lower.endswith(".csv"):
            # Read CSV file and convert index_number column to string to preserve leading zeros
            df = pd.read_csv(io.BytesIO(file_content), dtype=str)
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


def find_subjects_column(df: pd.DataFrame) -> str | None:
    """
    Find the subjects column name from DataFrame.

    Looks for a column containing comma-separated subject original_code values.
    Supports multiple possible column names with case-insensitive matching.

    Args:
        df: DataFrame to search

    Returns:
        Column name if found, None otherwise
    """
    df_columns_lower = {col.lower().strip(): col for col in df.columns}

    # Priority order for column name matching
    possible_names = ["subjects", "subject_codes", "subject_list", "registered_subjects"]

    for name in possible_names:
        if name in df_columns_lower:
            return df_columns_lower[name]

    # Fallback: check for any column starting with "subject" (case-insensitive)
    for col in df.columns:
        col_lower = col.lower().strip()
        if col_lower == "subject" or col_lower.startswith("subject_"):
            return col

    return None


def parse_candidate_row(row: pd.Series, subjects_column: str | None) -> dict[str, Any]:
    """
    Parse a single row from the DataFrame into a structured candidate data dict.

    Args:
        row: Pandas Series representing one row
        subjects_column: Name of the column containing comma-separated subject original_code values

    Returns:
        Dictionary with parsed candidate data:
        - school_code: str
        - programme_code: str | None
        - name: str
        - index_number: str
        - subject_original_codes: list[str]
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

    # Extract subject original_codes from comma-separated column
    subject_original_codes = []
    if subjects_column:
        # Find the normalized key for the subjects column
        subjects_col_lower = subjects_column.lower().strip()
        if subjects_col_lower in row_dict:
            subjects_str = row_dict[subjects_col_lower]
            if subjects_str is not None:
                subjects_str = str(subjects_str).strip()
                if subjects_str and subjects_str.lower() != "nan":
                    # Split by comma and trim whitespace from each value
                    subject_original_codes = [
                        code.strip()
                        for code in subjects_str.split(",")
                        if code.strip()
                    ]

    return {
        "school_code": school_code,
        "programme_code": programme_code,
        "name": name,
        "index_number": index_number,
        "subject_original_codes": subject_original_codes,
    }
