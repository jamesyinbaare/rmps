"""Utility for generating Excel template files for bulk uploads."""

import io
from typing import TYPE_CHECKING

import pandas as pd
from datetime import date, time

from openpyxl.styles import Font, PatternFill
from openpyxl.styles.numbers import FORMAT_TEXT
from openpyxl.utils import get_column_letter

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
        "programme_type_code": ["CERT_II", "ADVANCE"],
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

    Upload creates catalog rows only. Attach subjects to programmes via the
    programme UI (compulsory/optional core and choice groups are set there).
    Optional column programme_code (not in sample) links ELECTIVE rows only.

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


def generate_candidate_template(
    exam_series: str | None = None,
    *,
    exam_kind: str | None = None,
    allows_referral_registration: bool = True,
    allows_free_tvet: bool = False,
) -> bytes:
    """
    Generate Excel template for candidate bulk upload.
    All columns are formatted as text to preserve leading zeros.

    Args:
        exam_series: Exam series (e.g., "MAY/JUNE", "NOV/DEC") — still used for subject_codes layout.
        exam_kind: "school" or "private".
        allows_referral_registration: Whether school exams may include referral type column.
        allows_free_tvet: When True, school uses free_tvet (not regular); when False, regular.
    """
    from app.services.subject_selection import normalize_exam_series

    normalized_series = normalize_exam_series(exam_series)
    is_nov_dec = normalized_series == "NOV/DEC"
    kind = (exam_kind or "school").strip().lower()
    is_private = kind == "private"

    # Required columns first — sample programmes: C301, C421, C601
    data: dict[str, list[str]] = {
        "firstname": ["John", "Jane", "Kwame"],
        "lastname": ["Doe", "Smith", "Mensah"],
        "othername": ["", "Mary", "Kofi"],
        "date_of_birth": ["15/01/2005", "20/03/2005", "08/11/2004"],
        "gender": ["M", "F", "M"],
        "programme_code": ["C301", "C421", "C601"],
    }

    # School structured uploads require option (SOC/ENT)
    if not is_private:
        data["option"] = ["SOC", "ENT", "SOC"]

    # Optional columns
    optional_cols: dict[str, list[str]] = {
        "national_id": ["123456789", "987654321", "456789123"],
        "contact_email": ["john@example.com", "jane@example.com", "kwame@example.com"],
        "contact_phone": ["0244123456", "0554210052", "0201234567"],
        "address": ["123 Main St", "456 Oak Ave", "12 Ring Road"],
        "guardian_name": ["John Doe Sr.", "Jane Smith Sr.", "Ama Mensah"],
        "guardian_phone": ["0201234567", "0277654321", "0244987654"],
        "disability": ["", "Visual", ""],
        "guardian_digital_address": ["GA-123-4567", "GA-789-0123", "AK-456-7890"],
        "guardian_national_id": ["GHA-123456789-1", "GHA-987654321-2", "GHA-456789123-3"],
    }

    if is_private:
        optional_cols["registration_type"] = ["private", "private", "private"]
        optional_cols["examination_center"] = ["", "", ""]  # defaults to registering school
    else:
        primary = "free_tvet" if allows_free_tvet else "regular"
        if allows_referral_registration:
            optional_cols["registration_type"] = [primary, "referral", primary]
        else:
            optional_cols["registration_type"] = [primary, primary, primary]

    data.update(optional_cols)

    # subject_codes for NOV/DEC series layout or private exams (lenient subject pick)
    if is_nov_dec or is_private:
        data["subject_codes"] = ["C701,C702", "C30-1-01", "C701,C705"]

    # Convert all values to strings to ensure text formatting
    df = pd.DataFrame(data)
    for col in df.columns:
        df[col] = df[col].astype(str)

    # Columns Excel commonly auto-converts to numbers (losing leading zeros)
    force_text_columns = {
        "contact_phone",
        "guardian_phone",
        "national_id",
        "guardian_national_id",
        "date_of_birth",
        "programme_code",
        "option",
    }

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
        if not is_private:
            required_columns.add("option")
        if is_private:
            required_columns.add("subject_codes")

        # Pre-format many empty rows as Text so newly typed phones keep leading zeros
        text_preformat_rows = 500
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

            col_letter = get_column_letter(col_idx)
            # Entire column default format as text (helps Excel keep phone as text)
            worksheet.column_dimensions[col_letter].number_format = FORMAT_TEXT

            # Format sample + blank rows as text; store values as Excel strings
            for row_idx in range(header_row + 1, text_preformat_rows + 2):
                cell = worksheet.cell(row=row_idx, column=col_idx)
                cell.number_format = FORMAT_TEXT
                if cell.value is not None:
                    text_value = str(cell.value)
                    # Leading apostrophe is unnecessary when data_type is string + @ format,
                    # but phone/id columns must never become numeric.
                    cell.value = text_value
                    cell.data_type = "s"

            if column_name in force_text_columns:
                for row_idx in range(header_row + 1, text_preformat_rows + 2):
                    cell = worksheet.cell(row=row_idx, column=col_idx)
                    cell.number_format = FORMAT_TEXT

    output.seek(0)
    return output.getvalue()


def generate_bulk_upload_instructions_pdf(
    *,
    exam_year: int | None = None,
    exam_series: str | None = None,
    exam_type: str | None = None,
    exam_kind: str | None = None,
    allows_referral_registration: bool = True,
    allows_free_tvet: bool = False,
) -> bytes:
    """Generate a short PDF guide for school bulk candidate upload."""
    from pathlib import Path

    from app.services.pdf_generator import PdfGenerator, render_html
    from app.services.subject_selection import normalize_exam_series

    kind = (exam_kind or "school").strip().lower()
    is_private = kind == "private"
    normalized_series = normalize_exam_series(exam_series)
    primary_type = "free_tvet" if allows_free_tvet else "regular"

    example_programmes = [
        {"code": "C301", "name": "Building Construction"},
        {"code": "C421", "name": "Electrical Engineering Technology"},
        {"code": "C601", "name": "Catering and Hospitality Management"},
    ]

    context = {
        "exam_year": exam_year,
        "exam_series": exam_series,
        "exam_type": exam_type,
        "exam_kind": kind,
        "is_private": is_private,
        "normalized_series": normalized_series,
        "allows_referral_registration": allows_referral_registration,
        "allows_free_tvet": allows_free_tvet,
        "primary_registration_type": primary_type,
        "example_programmes": example_programmes,
    }

    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "bulk-upload/instructions.html", templates_dir)
    app_dir = Path(__file__).parent.parent.resolve()

    pdf_gen = PdfGenerator(
        main_html=main_html,
        header_html=None,
        footer_html=None,
        base_url=str(app_dir),
        side_margin=1.5,
        extra_vertical_margin=16,
    )
    return pdf_gen.render_pdf()


async def generate_schedule_template(
    session: "AsyncSession",
    exam_year: int | None = None,  # noqa: ARG001
    exam_series: str | None = None,  # noqa: ARG001
    exam_type: str | None = None,  # noqa: ARG001
) -> bytes:
    """
    Generate Excel template for schedule upload prepopulated with subjects.

    Args:
        session: Database session to query subjects
        exam_year: Exam year for filename
        exam_series: Exam series for filename
        exam_type: Exam type for filename

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
    # Note: Header shows "subject_code" for user clarity, but contains original_code values
    if subjects:
        data = {
            "subject_code": [
                subject.original_code if subject.original_code else subject.code for subject in subjects
            ],
            "subject_name": [subject.name for subject in subjects],
            "paper1_date": [""] * len(subjects),
            "paper1_start_time": [""] * len(subjects),
            "paper1_end_time": [""] * len(subjects),
            "paper2_date": [""] * len(subjects),
            "paper2_start_time": [""] * len(subjects),
            "paper2_end_time": [""] * len(subjects),
            "write_together": [0] * len(subjects),
        }
    else:
        # If no subjects, create empty template with just headers
        data = {
            "subject_code": [],
            "subject_name": [],
            "paper1_date": [],
            "paper1_start_time": [],
            "paper1_end_time": [],
            "paper2_date": [],
            "paper2_start_time": [],
            "paper2_end_time": [],
            "write_together": [],
        }

    df = pd.DataFrame(data)

    # Sample data for the second sheet
    sample_date = date.today().replace(month=1, day=15)  # Example: January 15
    sample_data = {
        "subject_code": ["C701", "C702"],
        "subject_name": ["English Language", "Mathematics"],
        "paper1_date": [sample_date, sample_date],
        "paper1_start_time": [time(9, 0), time(9, 0)],
        "paper1_end_time": [time(11, 0), time(11, 30)],
        "paper2_date": [sample_date, sample_date.replace(day=16)],
        "paper2_start_time": [time(9, 0), time(14, 0)],
        "paper2_end_time": [time(11, 0), time(16, 0)],
        "write_together": [1, 0],
    }
    df_sample = pd.DataFrame(sample_data)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        # Write main template sheet
        df.to_excel(writer, index=False, sheet_name="Schedules")
        worksheet = writer.sheets["Schedules"]

        # Find column indices dynamically
        date_columns = ["paper1_date", "paper2_date"]
        time_columns = ["paper1_start_time", "paper1_end_time", "paper2_start_time", "paper2_end_time"]
        number_columns = ["write_together"]

        # Get column letters for each column type
        date_col_letters = []
        time_col_letters = []
        number_col_letters = []

        for col_idx, col_name in enumerate(df.columns, start=1):
            col_letter = get_column_letter(col_idx)
            if col_name in date_columns:
                date_col_letters.append(col_letter)
            elif col_name in time_columns:
                time_col_letters.append(col_letter)
            elif col_name in number_columns:
                number_col_letters.append(col_letter)

        # Format date columns
        for col_letter in date_col_letters:
            for cell in worksheet[col_letter][1:]:  # Skip header
                cell.number_format = "yyyy-mm-dd"

        # Format time columns - use HH:mm for 24-hour format with leading zeros
        for col_letter in time_col_letters:
            for cell in worksheet[col_letter][1:]:  # Skip header
                cell.number_format = "HH:mm"

        # Format number columns
        for col_letter in number_col_letters:
            for cell in worksheet[col_letter][1:]:  # Skip header
                cell.number_format = "0"

        # Write sample data sheet
        df_sample.to_excel(writer, index=False, sheet_name="Sample Data")
        worksheet_sample = writer.sheets["Sample Data"]

        # Format sample data columns with same formatting
        for col_letter in date_col_letters:
            for cell in worksheet_sample[col_letter][1:]:  # Skip header
                cell.number_format = "yyyy-mm-dd"

        for col_letter in time_col_letters:
            for cell in worksheet_sample[col_letter][1:]:  # Skip header
                cell.number_format = "HH:mm"

        for col_letter in number_col_letters:
            for cell in worksheet_sample[col_letter][1:]:  # Skip header
                cell.number_format = "0"

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
