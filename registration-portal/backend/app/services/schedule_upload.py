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
    # Accept either "subject_code" or "original_code" (subject_code is the display name, original_code is the internal name)
    required_columns = {"subject_name"}
    df_columns = set(df.columns.str.lower().str.strip())

    # Check for subject_code or original_code
    has_code_column = "subject_code" in df_columns or "original_code" in df_columns
    if not has_code_column:
        raise ScheduleUploadValidationError(
            f"Missing required column: subject_code (or original_code). "
            f"Found columns: {', '.join(sorted(df_columns))}"
        )

    missing_columns = required_columns - df_columns
    if missing_columns:
        raise ScheduleUploadValidationError(
            f"Missing required columns: {', '.join(sorted(missing_columns))}. "
            f"Found columns: {', '.join(sorted(df_columns))}"
        )

    # Check that at least one paper date column exists
    paper_date_columns = {"paper1_date", "paper2_date"}
    has_paper_date = bool(paper_date_columns & df_columns)
    if not has_paper_date:
        raise ScheduleUploadValidationError(
            f"At least one paper date column is required (paper1_date or paper2_date). "
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
        - papers: list[dict] - List of paper entries with date, start_time, end_time
        - venue: str | None
        - duration_minutes: int | None
        - instructions: str | None
    """
    # Normalize column names (case-insensitive, strip whitespace)
    row_dict = {col.lower().strip(): val for col, val in row.items()}

    # Extract required fields
    # Accept either "subject_code" (display name) or "original_code" (internal name)
    original_code_raw = row_dict.get("subject_code") or row_dict.get("original_code", "")
    if pd.isna(original_code_raw):
        original_code = ""
    else:
        original_code = str(original_code_raw).strip()

    subject_name_raw = row_dict.get("subject_name", "")
    if pd.isna(subject_name_raw):
        subject_name = ""
    else:
        subject_name = str(subject_name_raw).strip()

    # Paper handling - require paper dates
    papers = []

    # Parse paper1
    paper1_date_raw = row_dict.get("paper1_date")
    paper1_start_time_raw = row_dict.get("paper1_start_time")
    paper1_end_time_raw = row_dict.get("paper1_end_time")
    paper1 = False
    paper1_date_obj = None
    paper1_start_time = None
    paper1_end_time = None

    if paper1_date_raw is not None and not pd.isna(paper1_date_raw):
        try:
            if isinstance(paper1_date_raw, str):
                paper1_date_obj = pd.to_datetime(paper1_date_raw).date()
            elif isinstance(paper1_date_raw, date):
                paper1_date_obj = paper1_date_raw
            else:
                paper1_date_obj = pd.to_datetime(paper1_date_raw).date()

            # Parse start_time (required)
            if paper1_start_time_raw is not None and not pd.isna(paper1_start_time_raw):
                if isinstance(paper1_start_time_raw, str):
                    time_parts = paper1_start_time_raw.split(":")
                    if len(time_parts) >= 2:
                        hour = int(time_parts[0])
                        minute = int(time_parts[1])
                        paper1_start_time = time(hour, minute)
                elif isinstance(paper1_start_time_raw, time):
                    paper1_start_time = paper1_start_time_raw
                else:
                    pd_time = pd.to_datetime(paper1_start_time_raw).time()
                    paper1_start_time = time(pd_time.hour, pd_time.minute)

            if paper1_start_time:
                paper1 = True
                paper1_entry = {
                    "paper": 1,
                    "date": paper1_date_obj.isoformat(),
                    "start_time": paper1_start_time.isoformat(),
                }

                # Parse end_time (optional)
                if paper1_end_time_raw is not None and not pd.isna(paper1_end_time_raw):
                    try:
                        if isinstance(paper1_end_time_raw, str):
                            time_parts = paper1_end_time_raw.split(":")
                            if len(time_parts) >= 2:
                                hour = int(time_parts[0])
                                minute = int(time_parts[1])
                                paper1_end_time = time(hour, minute)
                                paper1_entry["end_time"] = paper1_end_time.isoformat()
                        elif isinstance(paper1_end_time_raw, time):
                            paper1_end_time = paper1_end_time_raw
                            paper1_entry["end_time"] = paper1_end_time.isoformat()
                    except Exception:
                        pass

                papers.append(paper1_entry)
        except Exception:
            pass

    # Parse write_together flag (1/0, "1"/"0", True/False, or empty)
    write_together_raw = row_dict.get("write_together")
    write_together = False
    if write_together_raw is not None and not pd.isna(write_together_raw):
        try:
            if isinstance(write_together_raw, (int, float)):
                write_together = bool(int(write_together_raw))
            elif isinstance(write_together_raw, str):
                write_together = write_together_raw.strip() in ("1", "true", "True", "TRUE", "yes", "Yes", "YES")
            elif isinstance(write_together_raw, bool):
                write_together = write_together_raw
        except Exception:
            pass

    # Parse paper2
    # If write_together is 1 and paper1 is valid, use paper1 values for paper2
    if write_together and paper1 and paper1_date_obj and paper1_start_time:
        # Directly create paper2 entry using paper1 values
        paper2 = True
        paper2_entry = {
            "paper": 2,
            "date": paper1_date_obj.isoformat(),
            "start_time": paper1_start_time.isoformat(),
        }
        if paper1_end_time:
            paper2_entry["end_time"] = paper1_end_time.isoformat()
        papers.append(paper2_entry)
    else:
        # Parse paper2 from columns normally
        paper2_date_raw = row_dict.get("paper2_date")
        paper2_start_time_raw = row_dict.get("paper2_start_time")
        paper2_end_time_raw = row_dict.get("paper2_end_time")
        paper2 = False

        if paper2_date_raw is not None and not pd.isna(paper2_date_raw):
            try:
                if isinstance(paper2_date_raw, str):
                    paper2_date_obj = pd.to_datetime(paper2_date_raw).date()
                elif isinstance(paper2_date_raw, date):
                    paper2_date_obj = paper2_date_raw
                else:
                    paper2_date_obj = pd.to_datetime(paper2_date_raw).date()

                # Parse start_time (required)
                paper2_start_time = None
                if paper2_start_time_raw is not None and not pd.isna(paper2_start_time_raw):
                    if isinstance(paper2_start_time_raw, str):
                        time_parts = paper2_start_time_raw.split(":")
                        if len(time_parts) >= 2:
                            hour = int(time_parts[0])
                            minute = int(time_parts[1])
                            paper2_start_time = time(hour, minute)
                    elif isinstance(paper2_start_time_raw, time):
                        paper2_start_time = paper2_start_time_raw
                    else:
                        pd_time = pd.to_datetime(paper2_start_time_raw).time()
                        paper2_start_time = time(pd_time.hour, pd_time.minute)

                if paper2_start_time:
                    paper2 = True
                    paper2_entry = {
                        "paper": 2,
                        "date": paper2_date_obj.isoformat(),
                        "start_time": paper2_start_time.isoformat(),
                    }

                    # Parse end_time (optional)
                    if paper2_end_time_raw is not None and not pd.isna(paper2_end_time_raw):
                        try:
                            if isinstance(paper2_end_time_raw, str):
                                time_parts = paper2_end_time_raw.split(":")
                                if len(time_parts) >= 2:
                                    hour = int(time_parts[0])
                                    minute = int(time_parts[1])
                                    paper2_end_time = time(hour, minute)
                                    paper2_entry["end_time"] = paper2_end_time.isoformat()
                            elif isinstance(paper2_end_time_raw, time):
                                paper2_entry["end_time"] = paper2_end_time_raw.isoformat()
                        except Exception:
                            pass

                    papers.append(paper2_entry)
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

    if not papers:
        raise ValueError("At least one paper with date and start_time is required")

    return {
        "original_code": original_code,
        "subject_name": subject_name,
        "papers": papers,
        "venue": venue,
        "duration_minutes": duration_minutes,
        "instructions": instructions,
    }
