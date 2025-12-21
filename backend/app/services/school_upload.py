"""Service for parsing and validating school upload files."""

import io
from typing import Any

import pandas as pd

from app.models import SchoolRegion, SchoolType, SchoolZone


class SchoolUploadParseError(Exception):
    """Raised when file parsing fails."""

    pass


class SchoolUploadValidationError(Exception):
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
        SchoolUploadParseError: If file cannot be parsed
    """
    try:
        # Detect file type from extension
        file_lower = filename.lower()
        if file_lower.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_content), engine="openpyxl")
        elif file_lower.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_content))
        else:
            raise SchoolUploadParseError(
                f"Unsupported file type. Expected .xlsx, .xls, or .csv, got {filename}"
            )

        # Remove empty rows
        df = df.dropna(how="all")

        if df.empty:
            raise SchoolUploadParseError("File is empty or contains no data")

        return df
    except pd.errors.EmptyDataError:
        raise SchoolUploadParseError("File is empty or contains no data")
    except Exception as e:
        if isinstance(e, (SchoolUploadParseError, SchoolUploadValidationError)):
            raise
        raise SchoolUploadParseError(f"Failed to parse file: {str(e)}")


def validate_required_columns(df: pd.DataFrame) -> None:
    """
    Validate that required columns exist in the DataFrame.

    Args:
        df: DataFrame to validate

    Raises:
        SchoolUploadValidationError: If required columns are missing
    """
    required_columns = {"code", "name", "region", "zone"}
    df_columns = set(df.columns.str.lower().str.strip())

    missing_columns = required_columns - df_columns
    if missing_columns:
        raise SchoolUploadValidationError(
            f"Missing required columns: {', '.join(sorted(missing_columns))}. "
            f"Found columns: {', '.join(sorted(df_columns))}"
        )


def find_programmes_column(df: pd.DataFrame) -> str | None:
    """
    Find the programmes column name from DataFrame.

    Looks for a column containing comma-separated programme code values.
    Supports multiple possible column names with case-insensitive matching.

    Args:
        df: DataFrame to search

    Returns:
        Column name if found, None otherwise
    """
    df_columns_lower = {col.lower().strip(): col for col in df.columns}

    # Priority order for column name matching
    possible_names = ["programme_codes", "programmes", "programme_list", "programme_code"]

    for name in possible_names:
        if name in df_columns_lower:
            return df_columns_lower[name]

    # Fallback: check for any column starting with "programme" (case-insensitive)
    for col in df.columns:
        col_lower = col.lower().strip()
        if col_lower == "programme" or col_lower.startswith("programme_"):
            return col

    return None


def parse_school_row(row: pd.Series, programmes_column: str | None) -> dict[str, Any]:
    """
    Parse a single row from the DataFrame into a structured school data dict.

    Args:
        row: Pandas Series representing one row
        programmes_column: Name of the column containing comma-separated programme code values

    Returns:
        Dictionary with parsed school data:
        - code: str
        - name: str
        - region: SchoolRegion
        - zone: SchoolZone
        - school_type: SchoolType | None
        - programme_codes: list[str]
    """
    # Normalize column names (case-insensitive, strip whitespace)
    row_dict = {col.lower().strip(): val for col, val in row.items()}

    # Extract required fields
    code = str(row_dict.get("code", "")).strip()
    name = str(row_dict.get("name", "")).strip()
    region_str = str(row_dict.get("region", "")).strip()
    zone_str = str(row_dict.get("zone", "")).strip()

    # Parse region
    region = None
    if region_str:
        try:
            # Try to match by enum value or name
            for reg in SchoolRegion:
                if reg.value.lower() == region_str.lower() or reg.name == region_str.upper().replace(" ", "_"):
                    region = reg
                    break
        except Exception:
            pass

    # Parse zone
    zone = None
    if zone_str:
        try:
            # Zone is a single letter
            zone_upper = zone_str.upper().strip()
            if len(zone_upper) == 1 and zone_upper.isalpha():
                for z in SchoolZone:
                    if z.value == zone_upper:
                        zone = z
                        break
        except Exception:
            pass

    # Extract optional school_type
    school_type = None
    school_type_str = row_dict.get("school_type")
    if school_type_str is not None:
        school_type_str = str(school_type_str).strip().upper()
        if school_type_str and school_type_str.lower() != "nan":
            if school_type_str == "PRIVATE":
                school_type = SchoolType.PRIVATE
            elif school_type_str == "PUBLIC":
                school_type = SchoolType.PUBLIC

    # Extract programme codes from comma-separated column
    programme_codes = []
    if programmes_column:
        # Find the normalized key for the programmes column
        programmes_col_lower = programmes_column.lower().strip()
        if programmes_col_lower in row_dict:
            programmes_str = row_dict[programmes_col_lower]
            if programmes_str is not None:
                programmes_str = str(programmes_str).strip()
                if programmes_str and programmes_str.lower() != "nan":
                    # Split by comma and trim whitespace from each value
                    programme_codes = [
                        code.strip()
                        for code in programmes_str.split(",")
                        if code.strip()
                    ]

    return {
        "code": code,
        "name": name,
        "region": region,
        "zone": zone,
        "school_type": school_type,
        "programme_codes": programme_codes,
    }
