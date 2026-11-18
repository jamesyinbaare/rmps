"""Service for parsing and validating programme pricing upload files."""

import io
from typing import Any

import pandas as pd


class ProgrammePricingUploadParseError(Exception):
    """Raised when file parsing fails."""

    pass


class ProgrammePricingUploadValidationError(Exception):
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
        ProgrammePricingUploadParseError: If file cannot be parsed
    """
    try:
        # Detect file type from extension
        file_lower = filename.lower()
        if file_lower.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_content), engine="openpyxl")
        elif file_lower.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_content))
        else:
            raise ProgrammePricingUploadParseError(
                f"Unsupported file type. Expected .xlsx, .xls, or .csv, got {filename}"
            )

        # Remove empty rows
        df = df.dropna(how="all")

        if df.empty:
            raise ProgrammePricingUploadParseError("File is empty or contains no data")

        return df
    except pd.errors.EmptyDataError:
        raise ProgrammePricingUploadParseError("File is empty or contains no data")
    except Exception as e:
        if isinstance(e, (ProgrammePricingUploadParseError, ProgrammePricingUploadValidationError)):
            raise
        raise ProgrammePricingUploadParseError(f"Failed to parse file: {str(e)}")


def validate_required_columns(df: pd.DataFrame) -> None:
    """
    Validate that required columns exist in the DataFrame.

    Args:
        df: DataFrame to validate

    Raises:
        ProgrammePricingUploadValidationError: If required columns are missing
    """
    required_columns = {"programme_code", "price"}
    df_columns = set(df.columns.str.lower().str.strip())

    missing_columns = required_columns - df_columns
    if missing_columns:
        raise ProgrammePricingUploadValidationError(
            f"Missing required columns: {', '.join(sorted(missing_columns))}. "
            f"Found columns: {', '.join(sorted(df_columns))}"
        )


def parse_programme_pricing_row(row: pd.Series) -> dict[str, Any]:
    """
    Parse a single row from the DataFrame into a structured programme pricing data dict.

    Args:
        row: Pandas Series representing one row

    Returns:
        Dictionary with parsed programme pricing data:
        - programme_code: str
        - price: float
    """
    # Normalize column names (case-insensitive, strip whitespace)
    row_dict = {col.lower().strip(): val for col, val in row.items()}

    # Extract required fields - handle NaN values properly
    programme_code_raw = row_dict.get("programme_code", "")
    if pd.isna(programme_code_raw):
        programme_code = ""
    else:
        programme_code = str(programme_code_raw).strip()

    # Extract price
    price_raw = row_dict.get("price", "")
    price = None
    if not pd.isna(price_raw):
        try:
            price = float(price_raw)
            if price < 0:
                price = None
        except (ValueError, TypeError):
            price = None

    return {
        "programme_code": programme_code,
        "price": price,
    }
