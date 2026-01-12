"""Service for parsing and validating schedule upload files."""

import io
from datetime import date, time
from typing import Any

import pandas as pd


class ScheduleUploadParseError(Exception):
    """Raised when file parsing fails."""

    pass


class ScheduleUploadValidationError(Exception):
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
        ScheduleUploadParseError: If file cannot be parsed
    """
    try:
        # Detect file type from extension
        file_lower = filename.lower()
        if file_lower.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_content), engine="openpyxl")
        elif file_lower.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_content))
        else:
            raise ScheduleUploadParseError(
                f"Unsupported file type. Expected .xlsx, .xls, or .csv, got {filename}"
            )

        # Remove empty rows
        df = df.dropna(how="all")

        if df.empty:
            raise ScheduleUploadParseError("File is empty or contains no data")

        return df
    except pd.errors.EmptyDataError:
        raise ScheduleUploadParseError("File is empty or contains no data")
    except Exception as e:
        if isinstance(e, (ScheduleUploadParseError, ScheduleUploadValidationError)):
            raise
        raise ScheduleUploadParseError(f"Failed to parse file: {str(e)}")


def validate_required_columns(df: pd.DataFrame) -> None:
    """
    Validate that required columns exist in the DataFrame.

    Args:
        df: DataFrame to validate

    Raises:
        ScheduleUploadValidationError: If required columns are missing
    """
    required_columns = {"original_code", "subject_name", "examination_date", "examination_time"}
    df_columns = set(df.columns.str.lower().str.strip())

    missing_columns = required_columns - df_columns
    if missing_columns:
        raise ScheduleUploadValidationError(
            f"Missing required columns: {', '.join(sorted(missing_columns))}. "
            f"Found columns: {', '.join(sorted(df_columns))}"
        )


def parse_schedule_row(row: pd.Series) -> dict[str, Any]:
    """
    Parse a single row from the DataFrame into a structured schedule data dict.

    Args:
        row: Pandas Series representing one row

    Returns:
        Dictionary with parsed schedule data:
        - original_code: str
        - subject_name: str
        - examination_date: date
        - examination_time: time
        - examination_end_time: time | None
        - paper1: bool
        - paper1_start_time: time | None
        - paper1_end_time: time | None
        - paper2: bool
        - paper2_start_time: time | None
        - paper2_end_time: time | None
        - venue: str | None
        - duration_minutes: int | None
        - instructions: str | None
    """
    # Normalize column names (case-insensitive, strip whitespace)
    row_dict = {col.lower().strip(): val for col, val in row.items()}

    # Extract required fields
    original_code_raw = row_dict.get("original_code", "")
    if pd.isna(original_code_raw):
        original_code = ""
    else:
        original_code = str(original_code_raw).strip()

    subject_name_raw = row_dict.get("subject_name", "")
    if pd.isna(subject_name_raw):
        subject_name = ""
    else:
        subject_name = str(subject_name_raw).strip()

    examination_date_raw = row_dict.get("examination_date", "")
    examination_date = None
    if not pd.isna(examination_date_raw):
        try:
            if isinstance(examination_date_raw, str):
                examination_date = pd.to_datetime(examination_date_raw).date()
            elif isinstance(examination_date_raw, date):
                examination_date = examination_date_raw
            else:
                examination_date = pd.to_datetime(examination_date_raw).date()
        except Exception:
            pass

    examination_time_raw = row_dict.get("examination_time", "")
    examination_time = None
    if not pd.isna(examination_time_raw):
        try:
            if isinstance(examination_time_raw, str):
                # Handle "HH:MM" or "HH:MM:SS" format
                time_parts = examination_time_raw.split(":")
                if len(time_parts) >= 2:
                    hour = int(time_parts[0])
                    minute = int(time_parts[1])
                    examination_time = time(hour, minute)
            elif isinstance(examination_time_raw, time):
                examination_time = examination_time_raw
            else:
                # Try pandas time parsing
                pd_time = pd.to_datetime(examination_time_raw).time()
                examination_time = time(pd_time.hour, pd_time.minute)
        except Exception:
            pass

    # Extract optional fields
    examination_end_time_raw = row_dict.get("examination_end_time")
    examination_end_time = None
    if examination_end_time_raw is not None and not pd.isna(examination_end_time_raw):
        try:
            if isinstance(examination_end_time_raw, str):
                time_parts = examination_end_time_raw.split(":")
                if len(time_parts) >= 2:
                    hour = int(time_parts[0])
                    minute = int(time_parts[1])
                    examination_end_time = time(hour, minute)
            elif isinstance(examination_end_time_raw, time):
                examination_end_time = examination_end_time_raw
            else:
                pd_time = pd.to_datetime(examination_end_time_raw).time()
                examination_end_time = time(pd_time.hour, pd_time.minute)
        except Exception:
            pass

    # Paper handling - support both simple (paper1, paper2) and detailed (paper1_start_time, etc.)
    paper1 = False
    paper1_start_time = None
    paper1_end_time = None
    paper2 = False
    paper2_start_time = None
    paper2_end_time = None

    # Check for paper1 column (boolean)
    paper1_raw = row_dict.get("paper1")
    if paper1_raw is not None and not pd.isna(paper1_raw):
        paper1 = bool(paper1_raw) if not isinstance(paper1_raw, str) else paper1_raw.lower() in ("true", "1", "yes", "y")

    # Check for paper2 column (boolean)
    paper2_raw = row_dict.get("paper2")
    if paper2_raw is not None and not pd.isna(paper2_raw):
        paper2 = bool(paper2_raw) if not isinstance(paper2_raw, str) else paper2_raw.lower() in ("true", "1", "yes", "y")

    # Check for detailed paper times
    paper1_start_raw = row_dict.get("paper1_start_time")
    if paper1_start_raw is not None and not pd.isna(paper1_start_raw):
        try:
            if isinstance(paper1_start_raw, str):
                time_parts = paper1_start_raw.split(":")
                if len(time_parts) >= 2:
                    hour = int(time_parts[0])
                    minute = int(time_parts[1])
                    paper1_start_time = time(hour, minute)
            elif isinstance(paper1_start_raw, time):
                paper1_start_time = paper1_start_raw
        except Exception:
            pass
        if paper1_start_time:
            paper1 = True

    paper1_end_raw = row_dict.get("paper1_end_time")
    if paper1_end_raw is not None and not pd.isna(paper1_end_raw):
        try:
            if isinstance(paper1_end_raw, str):
                time_parts = paper1_end_raw.split(":")
                if len(time_parts) >= 2:
                    hour = int(time_parts[0])
                    minute = int(time_parts[1])
                    paper1_end_time = time(hour, minute)
            elif isinstance(paper1_end_raw, time):
                paper1_end_time = paper1_end_raw
        except Exception:
            pass

    paper2_start_raw = row_dict.get("paper2_start_time")
    if paper2_start_raw is not None and not pd.isna(paper2_start_raw):
        try:
            if isinstance(paper2_start_raw, str):
                time_parts = paper2_start_raw.split(":")
                if len(time_parts) >= 2:
                    hour = int(time_parts[0])
                    minute = int(time_parts[1])
                    paper2_start_time = time(hour, minute)
            elif isinstance(paper2_start_raw, time):
                paper2_start_time = paper2_start_raw
        except Exception:
            pass
        if paper2_start_time:
            paper2 = True

    paper2_end_raw = row_dict.get("paper2_end_time")
    if paper2_end_raw is not None and not pd.isna(paper2_end_raw):
        try:
            if isinstance(paper2_end_raw, str):
                time_parts = paper2_end_raw.split(":")
                if len(time_parts) >= 2:
                    hour = int(time_parts[0])
                    minute = int(time_parts[1])
                    paper2_end_time = time(hour, minute)
            elif isinstance(paper2_end_raw, time):
                paper2_end_time = paper2_end_raw
        except Exception:
            pass

    # Venue
    venue = row_dict.get("venue")
    if venue is not None and not pd.isna(venue):
        venue = str(venue).strip()
        if not venue or venue.lower() in ("nan", "none", ""):
            venue = None
    else:
        venue = None

    # Duration minutes
    duration_minutes = None
    duration_raw = row_dict.get("duration_minutes")
    if duration_raw is not None and not pd.isna(duration_raw):
        try:
            duration_minutes = int(float(str(duration_raw).strip()))
            if duration_minutes <= 0:
                duration_minutes = None
        except (ValueError, TypeError):
            duration_minutes = None

    # Instructions
    instructions = row_dict.get("instructions")
    if instructions is not None and not pd.isna(instructions):
        instructions = str(instructions).strip()
        if not instructions or instructions.lower() in ("nan", "none", ""):
            instructions = None
    else:
        instructions = None

    return {
        "original_code": original_code,
        "subject_name": subject_name,
        "examination_date": examination_date,
        "examination_time": examination_time,
        "examination_end_time": examination_end_time,
        "paper1": paper1,
        "paper1_start_time": paper1_start_time,
        "paper1_end_time": paper1_end_time,
        "paper2": paper2,
        "paper2_start_time": paper2_start_time,
        "paper2_end_time": paper2_end_time,
        "venue": venue,
        "duration_minutes": duration_minutes,
        "instructions": instructions,
    }
