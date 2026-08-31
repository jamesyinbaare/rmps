"""Unit tests for elective component-based multi-subject results export."""

from __future__ import annotations

import pytest

from app.services.results_export import (
    _component_index,
    _elective_component_column_headers,
    _resolve_programme_ids,
    _sanitize_excel_sheet_name,
    _subject_score_column_headers,
    parse_export_test_types,
)


class TestComponentIndex:
    def test_last_digit_component(self):
        assert _component_index("C30-1-01") == 1
        assert _component_index("C701") == 1
        assert _component_index("ENG2") == 2

    def test_non_digit_tail_returns_none(self):
        assert _component_index("MATH") is None
        assert _component_index("C30-A") is None

    def test_empty_or_none(self):
        assert _component_index("") is None
        assert _component_index(None) is None


class TestParseExportTestTypes:
    def test_single_legacy_test_type(self):
        assert parse_export_test_types(test_type="obj") == ["obj"]
        assert parse_export_test_types(test_type="essay") == ["essay"]

    def test_comma_separated_test_types(self):
        assert parse_export_test_types(test_types="essay,obj") == ["obj", "essay"]

    def test_list_test_types(self):
        assert parse_export_test_types(test_types=["essay"]) == ["essay"]

    def test_requires_at_least_one(self):
        with pytest.raises(ValueError, match="At least one test type"):
            parse_export_test_types()

    def test_rejects_invalid(self):
        with pytest.raises(ValueError, match="Invalid test_types"):
            parse_export_test_types(test_types="obj,pract")


class TestElectiveComponentColumnHeaders:
    def test_both_papers(self):
        headers = _elective_component_column_headers([1, 2], ["obj", "essay"])
        assert headers == [
            "COMPONENT_1",
            "COMPONENT_1_OBJ_SCORE",
            "COMPONENT_1_ESSAY_SCORE",
            "COMPONENT_2",
            "COMPONENT_2_OBJ_SCORE",
            "COMPONENT_2_ESSAY_SCORE",
        ]

    def test_paper_one_only(self):
        headers = _elective_component_column_headers([1], ["obj"])
        assert headers == ["COMPONENT_1", "COMPONENT_1_OBJ_SCORE"]

    def test_paper_two_only(self):
        headers = _elective_component_column_headers([3], ["essay"])
        assert headers == ["COMPONENT_3", "COMPONENT_3_ESSAY_SCORE"]


class TestSubjectScoreColumnHeaders:
    def test_core_single_paper(self):
        assert _subject_score_column_headers(["MATH", "ENG"], ["obj"]) == ["MATH", "ENG"]

    def test_core_both_papers(self):
        assert _subject_score_column_headers(["MATH"], ["obj", "essay"]) == [
            "MATH_OBJ",
            "MATH_ESSAY",
        ]


class TestSanitizeExcelSheetName:
    def test_replaces_invalid_characters(self):
        assert _sanitize_excel_sheet_name("C361-03 - Practical/Project") == "C361-03 - Practical_Project"

    def test_truncates_to_31_chars(self):
        long_name = "A" * 40
        assert len(_sanitize_excel_sheet_name(long_name)) == 31

    def test_empty_fallback(self):
        assert _sanitize_excel_sheet_name("") == "Sheet"
        assert _sanitize_excel_sheet_name("[]:*?/\\") == "Sheet"

    def test_write_workbook_accepts_slashes_in_subject_name(self):
        from app.services.results_export import _write_workbook

        payload = _write_workbook([("C361-03 - Practical/Project", [{"Score": "42"}])])
        assert len(payload) > 0


class TestResolveProgrammeIds:
    def test_single_programme_id(self):
        assert _resolve_programme_ids(5, None) == [5]

    def test_programme_ids_list(self):
        assert _resolve_programme_ids(None, [3, 1, 2]) == [1, 2, 3]

    def test_rejects_both(self):
        with pytest.raises(ValueError, match="cannot both be specified"):
            _resolve_programme_ids(1, [2, 3])


def _build_component_row(
    component_indices: list[int],
    papers: list[str],
    comps: dict[int, dict[str, str | None]],
) -> dict[str, str]:
    """Mirror elective component row mapping in generate_multi_subject_export."""
    row: dict[str, str] = {}
    for n in component_indices:
        entry = comps.get(n)
        if entry is None:
            row[f"COMPONENT_{n}"] = "N/A"
            if "obj" in papers:
                row[f"COMPONENT_{n}_OBJ_SCORE"] = "N/A"
            if "essay" in papers:
                row[f"COMPONENT_{n}_ESSAY_SCORE"] = "N/A"
        else:
            row[f"COMPONENT_{n}"] = entry["code"] or ""
            if "obj" in papers:
                val = entry["obj"]
                row[f"COMPONENT_{n}_OBJ_SCORE"] = val if val is not None else ""
            if "essay" in papers:
                val = entry["essay"]
                row[f"COMPONENT_{n}_ESSAY_SCORE"] = val if val is not None else ""
    return row


class TestComponentRowMapping:
    def test_registered_with_scores(self):
        row = _build_component_row(
            [1, 2],
            ["obj", "essay"],
            {
                1: {"code": "C30-1-01", "obj": "38", "essay": "52"},
                2: {"code": "C701", "obj": "25", "essay": "41"},
            },
        )
        assert row["COMPONENT_1"] == "C30-1-01"
        assert row["COMPONENT_1_OBJ_SCORE"] == "38"
        assert row["COMPONENT_1_ESSAY_SCORE"] == "52"
        assert row["COMPONENT_2"] == "C701"

    def test_not_registered_is_na(self):
        row = _build_component_row(
            [1],
            ["obj"],
            {},
        )
        assert row == {"COMPONENT_1": "N/A", "COMPONENT_1_OBJ_SCORE": "N/A"}

    def test_registered_missing_score_is_empty(self):
        row = _build_component_row(
            [1],
            ["obj", "essay"],
            {1: {"code": "C701", "obj": None, "essay": "41"}},
        )
        assert row["COMPONENT_1"] == "C701"
        assert row["COMPONENT_1_OBJ_SCORE"] == ""
        assert row["COMPONENT_1_ESSAY_SCORE"] == "41"
