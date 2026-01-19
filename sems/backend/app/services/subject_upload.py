"""Service for parsing and validating subject upload files."""

import io
from typing import Any

import pandas as pd

from app.models import ExamType, ProgrammeType, SubjectType


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
    required_columns = {"code", "original_code", "name", "subject_type", "exam_type", "programme_type"}
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
        - original_code: str
        - name: str
        - subject_type: SubjectType
        - exam_type: ExamType
        - programme_type: ProgrammeType | None
        - programme_code: str | None (optional)
    """
    # Normalize column names (case-insensitive, strip whitespace)
    row_dict = {col.lower().strip(): val for col, val in row.items()}

    # Extract required fields
    code = str(row_dict.get("code", "")).strip()
    original_code = str(row_dict.get("original_code", "")).strip()
    name = str(row_dict.get("name", "")).strip()
    subject_type_str = str(row_dict.get("subject_type", "")).strip().upper()
    exam_type_str = str(row_dict.get("exam_type", "")).strip()
    programme_type_str = str(row_dict.get("programme_type", "")).strip().upper()

    # Parse subject_type
    subject_type = None
    if subject_type_str == "CORE":
        subject_type = SubjectType.CORE
    elif subject_type_str == "ELECTIVE":
        subject_type = SubjectType.ELECTIVE

    # Parse exam_type
    exam_type = None
    if exam_type_str:
        exam_type_str_upper = exam_type_str.upper().strip()
        # Map string values to enum values
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

    # Parse programme_type
    programme_type = None
    if programme_type_str:
        programme_type_str_upper = programme_type_str.upper()
        if programme_type_str_upper == "CERT2":
            programme_type = ProgrammeType.CERT2
        elif programme_type_str_upper == "NVTI":
            programme_type = ProgrammeType.NVTI

    # Extract optional programme_code
    programme_code = row_dict.get("programme_code")
    if programme_code is not None:
        programme_code = str(programme_code).strip()
        if not programme_code or programme_code.lower() == "nan":
            programme_code = None

    return {
        "code": code,
        "original_code": original_code,
        "name": name,
        "subject_type": subject_type,
        "exam_type": exam_type,
        "programme_type": programme_type,
        "programme_code": programme_code,
    }
