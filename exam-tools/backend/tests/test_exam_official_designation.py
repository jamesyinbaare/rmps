"""Designation sort order for exam centre officials."""

from uuid import uuid4

from app.models import ExamCentreOfficial, ExamOfficialDesignation
from app.services.exam_official_designation import (
    DESIGNATION_DISPLAY_ORDER,
    designation_pdf_label,
    designation_sort_rank,
    sort_officials_by_designation_then_name,
)


def _official(full_name: str, designation: ExamOfficialDesignation) -> ExamCentreOfficial:
    return ExamCentreOfficial(
        id=uuid4(),
        examination_id=1,
        center_id=uuid4(),
        full_name=full_name,
        designation=designation,
        bank_branch_id=uuid4(),
        account_number="1234567890123",
        num_days=1,
        telephone_number="0241234567",
        subject_scope="CORE",
    )


def test_designation_display_order_length() -> None:
    assert len(DESIGNATION_DISPLAY_ORDER) == 6


def test_designation_pdf_label() -> None:
    assert designation_pdf_label("Assistant Supervisor") == "Asst. Supervisor"
    assert designation_pdf_label("Police Officer") == "Police"
    assert designation_pdf_label("External Inspector") == "Ext. Inspector"
    assert designation_pdf_label("Supervisor") == "Supervisor"


def test_designation_sort_rank() -> None:
    assert designation_sort_rank("Supervisor") == 0
    assert designation_sort_rank("Invigilator") == 5
    assert designation_sort_rank("Unknown Role") == 6


def test_sort_officials_by_designation_then_name() -> None:
    rows = [
        _official("Zara", ExamOfficialDesignation.INVIGILATOR),
        _official("Amy", ExamOfficialDesignation.SUPERVISOR),
        _official("Bob", ExamOfficialDesignation.ASSISTANT_SUPERVISOR),
        _official("Cal", ExamOfficialDesignation.EXTERNAL_INSPECTOR),
        _official("Dan", ExamOfficialDesignation.DEPOT_KEEPER),
        _official("Eve", ExamOfficialDesignation.POLICE_OFFICER),
    ]
    sorted_rows = sort_officials_by_designation_then_name(rows)
    assert [r.full_name for r in sorted_rows] == ["Amy", "Bob", "Cal", "Dan", "Eve", "Zara"]
    assert [r.designation for r in sorted_rows] == [
        ExamOfficialDesignation.SUPERVISOR,
        ExamOfficialDesignation.ASSISTANT_SUPERVISOR,
        ExamOfficialDesignation.EXTERNAL_INSPECTOR,
        ExamOfficialDesignation.DEPOT_KEEPER,
        ExamOfficialDesignation.POLICE_OFFICER,
        ExamOfficialDesignation.INVIGILATOR,
    ]


def test_sort_tie_breaks_by_name_within_designation() -> None:
    rows = [
        _official("Zoe", ExamOfficialDesignation.INVIGILATOR),
        _official("Ann", ExamOfficialDesignation.INVIGILATOR),
    ]
    sorted_rows = sort_officials_by_designation_then_name(rows)
    assert [r.full_name for r in sorted_rows] == ["Ann", "Zoe"]
