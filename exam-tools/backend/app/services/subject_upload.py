"""Service for parsing and validating subject upload files."""

import io
from typing import Any

import pandas as pd

from app.models import SubjectType


class SubjectUploadParseError(Exception):
    pass


class SubjectUploadValidationError(Exception):
    pass


def parse_upload_file(file_content: bytes, filename: str) -> pd.DataFrame:
    try:
        file_lower = filename.lower()
        if file_lower.endswith((".xlsx", ".xls")):
            df = pd.read_excel(
                io.BytesIO(file_content), engine="openpyxl", dtype=str
            ).fillna("")
        elif file_lower.endswith(".csv"):
            try:
                text = file_content.decode("utf-8")
            except UnicodeDecodeError:
                text = file_content.decode("latin-1")
            df = pd.read_csv(io.StringIO(text), dtype=str).fillna("")
        else:
            raise SubjectUploadParseError(
                f"Unsupported file type. Expected .xlsx, .xls, or .csv, got {filename}"
            )

        df = df.dropna(how="all")

        if df.empty:
            raise SubjectUploadParseError("File is empty or contains no data")

        return df
    except pd.errors.EmptyDataError:
        raise SubjectUploadParseError("File is empty or contains no data")
    except Exception as e:
        if isinstance(e, (SubjectUploadParseError, SubjectUploadValidationError)):
            raise
        raise SubjectUploadParseError(f"Failed to parse file: {str(e)}") from e


def validate_required_columns(df: pd.DataFrame) -> None:
    required_columns = {"code", "name", "subject_type"}
    df_columns = set(df.columns.str.lower().str.strip())

    missing_columns = required_columns - df_columns
    if missing_columns:
        raise SubjectUploadValidationError(
            f"Missing required columns: {', '.join(sorted(missing_columns))}. "
            f"Found columns: {', '.join(sorted(df_columns))}"
        )


def parse_subject_row(row: pd.Series) -> dict[str, Any]:
    row_dict = {col.lower().strip(): val for col, val in row.items()}

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

    subject_type = None
    if subject_type_str == "CORE":
        subject_type = SubjectType.CORE
    elif subject_type_str == "ELECTIVE":
        subject_type = SubjectType.ELECTIVE

    original_code = row_dict.get("original_code")
    if original_code is not None:
        if pd.isna(original_code):
            original_code = None
        else:
            original_code = str(original_code).strip()
            if not original_code or original_code.lower() in ("nan", "none", ""):
                original_code = None

    choice_group_id = None
    choice_group_str = row_dict.get("choice_group_id")
    if choice_group_str is not None and not pd.isna(choice_group_str):
        try:
            choice_group_str = str(choice_group_str).strip()
            if choice_group_str and choice_group_str.lower() not in ("nan", "none", ""):
                choice_group_id = int(float(choice_group_str))
                if choice_group_id <= 0:
                    choice_group_id = None
        except (ValueError, TypeError, OverflowError):
            choice_group_id = None

    programme_code = row_dict.get("programme_code")
    if programme_code is not None:
        if pd.isna(programme_code):
            programme_code = None
        else:
            programme_code = str(programme_code).strip()
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
