"""Utility for generating Excel template files for bulk uploads."""

import io
from typing import TYPE_CHECKING

import pandas as pd
from openpyxl.styles import Font, PatternFill
from openpyxl.styles.numbers import FORMAT_TEXT

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


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


def generate_candidate_template(exam_series: str | None = None) -> bytes:
    """
    Generate Excel template for candidate bulk upload.
    All columns are formatted as text to preserve leading zeros.

    Args:
        exam_series: Exam series (e.g., "MAY/JUNE", "NOV/DEC").
        - For "MAY/JUNE": no subject columns (optional_core_groups and optional_subjects excluded)
        - For "NOV/DEC": only optional_subjects column (optional_core_groups excluded)

    Returns:
        Bytes of Excel file
    """
    # Normalize exam series
    from app.services.subject_selection import normalize_exam_series
    normalized_series = normalize_exam_series(exam_series)
    is_may_june = normalized_series == "MAY/JUNE"
    is_nov_dec = normalized_series == "NOV/DEC"

    # Required columns first
    data = {
        "firstname": ["John", "Jane"],
        "lastname": ["Doe", "Smith"],
        "othername": ["", "Mary"],
        "date_of_birth": ["2005-01-15", "2005-03-20"],
        "gender": ["M", "F"],
        "programme_code": ["PROG01", "PROG02"],
    }

    # Optional columns
    data.update({
        "national_id": ["123456789", "987654321"],
        "contact_email": ["john@example.com", "jane@example.com"],
        "contact_phone": ["+1234567890", "+0987654321"],
        "address": ["123 Main St", "456 Oak Ave"],
        "guardian_name": ["John Doe Sr.", "Jane Smith Sr."],
        "guardian_phone": ["+1234567891", "+0987654322"],
        "disability": ["", "Visual"],
        "registration_type": ["free_tvet", "referral"],
        "guardian_digital_address": ["GA-123-4567", "GA-789-0123"],
        "guardian_national_id": ["GHA-123456789-1", "GHA-987654321-2"],
    })

    # Subject columns only for NOV/DEC (explicitly check for NOV/DEC)
    # For NOV/DEC: only include optional_subjects (optional_core_groups removed)
    # For MAY/JUNE: no subject columns
    # For unknown/None exam_series: no subject columns (default to MAY/JUNE behavior)
    if is_nov_dec:
        data.update({
            "optional_subjects": ["701,702", "703"],
        })

    # Convert all values to strings to ensure text formatting
    df = pd.DataFrame(data)
    for col in df.columns:
        df[col] = df[col].astype(str)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Candidates")

        # Get the worksheet to format columns as text
        worksheet = writer.sheets["Candidates"]

        # Format all columns as text and add colors to headers
        # Define colors for headers
        required_fill = PatternFill(start_color="E8F5E9", end_color="E8F5E9", fill_type="solid")  # Light green
        optional_fill = PatternFill(start_color="FFF9C4", end_color="FFF9C4", fill_type="solid")  # Light yellow

        # Define required columns
        required_columns = {"firstname", "lastname", "date_of_birth", "gender", "programme_code"}

        # Get column headers from first row
        header_row = 1
        for col_idx, col in enumerate(worksheet.columns, start=1):
            header_cell = worksheet.cell(row=header_row, column=col_idx)
            column_name = str(header_cell.value).lower() if header_cell.value else ""

            # Format header cell
            header_cell.font = Font(bold=True)

            # Apply color based on whether column is required or optional
            if column_name in required_columns:
                header_cell.fill = required_fill
            else:
                header_cell.fill = optional_fill

            # Format data cells as text
            for cell in col:
                if cell.row > header_row:  # Data rows
                    cell.number_format = FORMAT_TEXT
                    # Ensure value is stored as text
                    if cell.value is not None:
                        cell.value = str(cell.value)

    output.seek(0)
    return output.getvalue()


async def generate_schedule_template(session: "AsyncSession") -> bytes:
    """
    Generate Excel template for schedule upload prepopulated with subjects.

    Args:
        session: Database session to query subjects

    Returns:
        Bytes of Excel file
    """
    from sqlalchemy import select
    from app.models import Subject

    # Query all subjects from the database
    stmt = select(Subject).order_by(Subject.code)
    result = await session.execute(stmt)
    subjects = result.scalars().all()

    # Prepare data with subjects from database
    if subjects:
        data = {
            "original_code": [
                subject.original_code if subject.original_code else subject.code for subject in subjects
            ],
            "subject_name": [subject.name for subject in subjects],
            "examination_date": [""] * len(subjects),
            "examination_time": [""] * len(subjects),
            "examination_end_time": [""] * len(subjects),
            "paper1": [False] * len(subjects),
            "paper2": [False] * len(subjects),
        }
    else:
        # If no subjects, create empty template with just headers
        data = {
            "original_code": [],
            "subject_name": [],
            "examination_date": [],
            "examination_time": [],
            "examination_end_time": [],
            "paper1": [],
            "paper2": [],
        }

    df = pd.DataFrame(data)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Schedules")
    output.seek(0)
    return output.getvalue()


async def generate_subject_pricing_template(session: "AsyncSession", exam_id: int | None = None) -> bytes:
    """
    Generate Excel template for subject pricing upload prepopulated with subjects.

    Args:
        session: Database session to query subjects
        exam_id: Optional exam ID to include existing pricing

    Returns:
        Bytes of Excel file
    """
    from sqlalchemy import select
    from app.models import Subject, SubjectPricing

    # Query all subjects from the database
    stmt = select(Subject).order_by(Subject.code)
    result = await session.execute(stmt)
    subjects = result.scalars().all()

    # Get existing pricing if exam_id is provided
    existing_pricing = {}
    if exam_id:
        pricing_stmt = select(SubjectPricing).where(
            SubjectPricing.exam_id == exam_id,
            SubjectPricing.is_active == True
        )
        pricing_result = await session.execute(pricing_stmt)
        for pricing in pricing_result.scalars().all():
            existing_pricing[pricing.subject_id] = pricing.price

    # Prepare data with subjects from database
    if subjects:
        data = {
            "original_code": [
                subject.original_code if subject.original_code else subject.code for subject in subjects
            ],
            "subject_name": [subject.name for subject in subjects],
            "price": [
                str(existing_pricing.get(subject.id, "")) for subject in subjects
            ],
        }
    else:
        # If no subjects, create empty template with just headers
        data = {
            "original_code": [],
            "subject_name": [],
            "price": [],
        }

    df = pd.DataFrame(data)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="SubjectPricing")
    output.seek(0)
    return output.getvalue()


async def generate_programme_pricing_template(session: "AsyncSession", exam_id: int | None = None) -> bytes:
    """
    Generate Excel template for programme pricing upload prepopulated with programmes.

    Args:
        session: Database session to query programmes
        exam_id: Optional exam ID to include existing pricing

    Returns:
        Bytes of Excel file
    """
    from sqlalchemy import select
    from app.models import Programme, ProgrammePricing

    # Query all programmes from the database
    stmt = select(Programme).order_by(Programme.code)
    result = await session.execute(stmt)
    programmes = result.scalars().all()

    # Get existing pricing if exam_id is provided
    existing_pricing = {}
    if exam_id:
        pricing_stmt = select(ProgrammePricing).where(
            ProgrammePricing.exam_id == exam_id,
            ProgrammePricing.is_active == True
        )
        pricing_result = await session.execute(pricing_stmt)
        for pricing in pricing_result.scalars().all():
            existing_pricing[pricing.programme_id] = pricing.price

    # Prepare data with programmes from database
    if programmes:
        data = {
            "programme_code": [programme.code for programme in programmes],
            "programme_name": [programme.name for programme in programmes],
            "price": [
                str(existing_pricing.get(programme.id, "")) for programme in programmes
            ],
        }
    else:
        # If no programmes, create empty template with just headers
        data = {
            "programme_code": [],
            "programme_name": [],
            "price": [],
        }

    df = pd.DataFrame(data)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="ProgrammePricing")
    output.seek(0)
    return output.getvalue()
