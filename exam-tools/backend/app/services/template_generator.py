"""Excel templates for bulk uploads."""

import io

import pandas as pd


def generate_programme_template() -> bytes:
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
