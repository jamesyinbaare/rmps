"""Utility for generating Excel template files for bulk uploads."""

import io

import pandas as pd
from openpyxl.styles.numbers import FORMAT_TEXT


def generate_programme_template() -> bytes:
    """
    Generate Excel template for programme upload.

    Returns:
        Bytes of Excel file
    """
    data = {
        "code": ["PROG01", "PROG02"],
        "name": ["Example Programme 1", "Example Programme 2"],
    }
    df = pd.DataFrame(data)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Programmes")
    output.seek(0)
    return output.getvalue()


def generate_subject_template() -> bytes:
    """
    Generate Excel template for subject upload.

    Returns:
        Bytes of Excel file
    """
    data = {
        "code": ["301", "302", "303", "701"],
        "original_code": ["MATH301", "ENG302", "PHY303", "SCI701"],
        "name": ["Mathematics", "English", "Physics", "Science"],
        "subject_type": ["CORE", "CORE", "CORE", "ELECTIVE"],
        "choice_group_id": ["", "1", "1", ""],
    }
    df = pd.DataFrame(data)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Subjects")
    output.seek(0)
    return output.getvalue()


def generate_candidate_template() -> bytes:
    """
    Generate Excel template for candidate bulk upload.
    All columns are formatted as text to preserve leading zeros.

    Returns:
        Bytes of Excel file
    """
    # Create sample data with all values as strings
    data = {
        "name": ["John Doe", "Jane Smith"],
        "date_of_birth": ["2005-01-15", "2005-03-20"],
        "gender": ["M", "F"],
        "programme_code": ["PROG01", "PROG02"],
        "national_id": ["123456789", "987654321"],
        "contact_email": ["john@example.com", "jane@example.com"],
        "contact_phone": ["+1234567890", "+0987654321"],
        "address": ["123 Main St", "456 Oak Ave"],
        "optional_subjects": ["701,702", "703"],
        "optional_core_groups": ['{"1": "301"}', '{"1": "302"}'],
    }

    # Convert all values to strings to ensure text formatting
    df = pd.DataFrame(data)
    for col in df.columns:
        df[col] = df[col].astype(str)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Candidates")

        # Get the workbook and worksheet to format columns as text
        workbook = writer.book
        worksheet = writer.sheets["Candidates"]

        # Format all columns as text
        from openpyxl.styles import Font

        for col in worksheet.columns:
            for cell in col:
                if cell.row == 1:  # Header row
                    cell.font = Font(bold=True)
                else:  # Data rows
                    cell.number_format = FORMAT_TEXT
                    # Ensure value is stored as text
                    if cell.value is not None:
                        cell.value = str(cell.value)

    output.seek(0)
    return output.getvalue()
