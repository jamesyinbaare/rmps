"""Service for parsing and validating programme upload files."""

import io
from typing import Any

import pandas as pd

from app.models import ExamType


class ProgrammeUploadParseError(Exception):
    """Raised when file parsing fails."""

    pass


class ProgrammeUploadValidationError(Exception):
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
        ProgrammeUploadParseError: If file cannot be parsed
    """
    try:
        # Detect file type from extension
        file_lower = filename.lower()
        if file_lower.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_content), engine="openpyxl")
        elif file_lower.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_content))
        else:
            raise ProgrammeUploadParseError(
                f"Unsupported file type. Expected .xlsx, .xls, or .csv, got {filename}"
            )

        # Remove empty rows
        df = df.dropna(how="all")

        if df.empty:
            raise ProgrammeUploadParseError("File is empty or contains no data")

        return df
    except pd.errors.EmptyDataError:
        raise ProgrammeUploadParseError("File is empty or contains no data")
    except Exception as e:
        if isinstance(e, (ProgrammeUploadParseError, ProgrammeUploadValidationError)):
            raise
        raise ProgrammeUploadParseError(f"Failed to parse file: {str(e)}")


def validate_required_columns(df: pd.DataFrame) -> None:
    """
    Validate that required columns exist in the DataFrame.

    Args:
        df: DataFrame to validate

    Raises:
        ProgrammeUploadValidationError: If required columns are missing
    """
    required_columns = {"code", "name"}
    df_columns = set(df.columns.str.lower().str.strip())

    missing_columns = required_columns - df_columns
    if missing_columns:
        raise ProgrammeUploadValidationError(
            f"Missing required columns: {', '.join(sorted(missing_columns))}. "
            f"Found columns: {', '.join(sorted(df_columns))}"
        )


def parse_programme_row(row: pd.Series) -> dict[str, Any]:
    """
    Parse a single row from the DataFrame into a structured programme data dict.

    Args:
        row: Pandas Series representing one row

    Returns:
        Dictionary with parsed programme data:
        - code: str
        - name: str
        - exam_type: ExamType | None
    """
    # Normalize column names (case-insensitive, strip whitespace)
    row_dict = {col.lower().strip(): val for col, val in row.items()}

    # Extract required fields
    code = str(row_dict.get("code", "")).strip()
    name = str(row_dict.get("name", "")).strip()

    # Extract optional exam_type
    exam_type = None
    exam_type_str = row_dict.get("exam_type")
    if exam_type_str is not None:
        exam_type_str = str(exam_type_str).strip()
        if exam_type_str and exam_type_str.lower() != "nan":
            # Try to match exam type
            exam_type_str_upper = exam_type_str.upper().strip()
            if "CERTIFICATE" in exam_type_str_upper or exam_type_str_upper == "CERTIFICATE II":
                exam_type = ExamType.CERTIFICATE_II
            elif exam_type_str_upper == "ADVANCE":
                exam_type = ExamType.ADVANCE
            elif exam_type_str_upper == "TECHNICIAN PART I" or exam_type_str_upper == "TECHNICIAN_PART_I":
                exam_type = ExamType.TECHNICIAN_PART_I
            elif exam_type_str_upper == "TECHNICIAN PART II" or exam_type_str_upper == "TECHNICIAN_PART_II":
                exam_type = ExamType.TECHNICIAN_PART_II
            elif exam_type_str_upper == "TECHNICIAN PART III" or exam_type_str_upper == "TECHNICIAN_PART_III":
                exam_type = ExamType.TECHNICIAN_PART_III
            elif exam_type_str_upper == "DIPLOMA":
                exam_type = ExamType.DIPLOMA
            # If it doesn't match, leave as None (will be validated later)

    return {
        "code": code,
        "name": name,
        "exam_type": exam_type,
    }
