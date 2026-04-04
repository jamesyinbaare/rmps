"""Service for parsing and validating programme upload files."""

import io
from typing import Any

import pandas as pd


class ProgrammeUploadParseError(Exception):
    pass


class ProgrammeUploadValidationError(Exception):
    pass


def parse_upload_file(file_content: bytes, filename: str) -> pd.DataFrame:
    try:
        file_lower = filename.lower()
        if file_lower.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_content), engine="openpyxl")
        elif file_lower.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_content))
        else:
            raise ProgrammeUploadParseError(
                f"Unsupported file type. Expected .xlsx, .xls, or .csv, got {filename}"
            )

        df = df.dropna(how="all")

        if df.empty:
            raise ProgrammeUploadParseError("File is empty or contains no data")

        return df
    except pd.errors.EmptyDataError:
        raise ProgrammeUploadParseError("File is empty or contains no data")
    except Exception as e:
        if isinstance(e, (ProgrammeUploadParseError, ProgrammeUploadValidationError)):
            raise
        raise ProgrammeUploadParseError(f"Failed to parse file: {str(e)}") from e


def validate_required_columns(df: pd.DataFrame) -> None:
    required_columns = {"code", "name"}
    df_columns = set(df.columns.str.lower().str.strip())

    missing_columns = required_columns - df_columns
    if missing_columns:
        raise ProgrammeUploadValidationError(
            f"Missing required columns: {', '.join(sorted(missing_columns))}. "
            f"Found columns: {', '.join(sorted(df_columns))}"
        )


def parse_programme_row(row: pd.Series) -> dict[str, Any]:
    row_dict = {col.lower().strip(): val for col, val in row.items()}

    code = str(row_dict.get("code", "")).strip()
    name = str(row_dict.get("name", "")).strip()

    return {
        "code": code,
        "name": name,
    }
