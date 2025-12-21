"""Utility for generating Excel template files for bulk uploads."""

import io
from typing import Any

import pandas as pd


def generate_programme_template() -> bytes:
    """
    Generate Excel template for programme upload.

    Returns:
        Bytes of Excel file
    """
    data = {
        "code": ["PROG01", "PROG02"],
        "name": ["Example Programme 1", "Example Programme 2"],
        "exam_type": ["Certificate II Examination", "CBT"],
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
        "code": ["301", "302", "701"],
        "original_code": ["C30-1-01", "C30-1-02", "C701"],
        "name": ["Mathematics", "English", "Science"],
        "subject_type": ["CORE", "CORE", "ELECTIVE"],
        "exam_type": ["Certificate II Examination", "Certificate II Examination", "CBT"],
        "programme_code": ["PROG01", "PROG01", ""],
    }
    df = pd.DataFrame(data)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Subjects")
    output.seek(0)
    return output.getvalue()


def generate_candidate_template() -> bytes:
    """
    Generate Excel template for candidate upload.

    Returns:
        Bytes of Excel file
    """
    data = {
        "school_code": ["SCH001", "SCH001"],
        "programme_code": ["PROG01", "PROG01"],
        "name": ["John Doe", "Jane Smith"],
        "index_number": ["1234567890", "0987654321"],
        "subject_codes": ["MAT,ENG,SCI", "MAT,ENG"],
    }
    df = pd.DataFrame(data)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Candidates")
    output.seek(0)
    return output.getvalue()
