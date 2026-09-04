"""Unit tests for score validation report classification and exports."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path
from types import SimpleNamespace

import openpyxl
import pytest

from app.models import SubjectScore
from app.services.score_validation_report import (
    ReportDetailRow,
    ReportMeta,
    ScoreValidationReportData,
    _school_file_basename,
    _slice_report_for_school,
    build_summary,
    classify_paper,
    classify_score_papers,
    detail_columns_for_status,
    expected_for_invalid,
    generate_validation_report_excel,
    generate_validation_report_pdf,
    group_rows_for_pdf,
    missing_p1_p2_label,
    parse_statuses,
    parse_test_types,
    primary_report_status,
    should_use_report_job,
)


def _make_score(**kwargs) -> SubjectScore:
    score = SubjectScore(
        id=1,
        subject_registration_id=1,
        obj_raw_score=None,
        essay_raw_score=None,
        pract_raw_score=None,
        total_score=0.0,
    )
    for key, value in kwargs.items():
        setattr(score, key, value)
    return score


def _make_exam_subject(**kwargs):
    defaults = {
        "obj_max_score": 40.0,
        "essay_max_score": 60.0,
        "pract_max_score": None,
        "pract_pct": None,
        "obj_pct": 40.0,
        "essay_pct": 60.0,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _detail_row(**overrides) -> ReportDetailRow:
    base = dict(
        school_id=1,
        school_code="SCH01",
        school_name="Sample School",
        subject_id=1,
        subject_code="MATH",
        subject_name="Mathematics",
        subject_type="CORE",
        candidate_id=1,
        index_number="0011223344",
        candidate_name="Test Candidate",
        test_type=1,
        paper_label="Paper 1 (Objectives)",
        paper_short="P1",
        raw_score=None,
        max_score=40.0,
        status="missing",
        message="Objectives score is missing. Maximum score is 40",
        extraction_method=None,
        expected=None,
    )
    base.update(overrides)
    return ReportDetailRow(**base)


def test_classify_missing_and_entered() -> None:
    score = _make_score(obj_raw_score=None, essay_raw_score="45")
    exam_subject = _make_exam_subject()
    status, message, expected = classify_paper(score, exam_subject, 1)
    assert status == "missing"
    assert message and "missing" in message.lower()
    assert expected is None

    status2, message2, expected2 = classify_paper(score, exam_subject, 2)
    assert status2 == "entered"
    assert message2 is None
    assert expected2 is None


def test_classify_invalid_and_absent() -> None:
    score = _make_score(obj_raw_score="99", essay_raw_score="A")
    exam_subject = _make_exam_subject(obj_max_score=40.0, essay_max_score=60.0)
    status, message, expected = classify_paper(score, exam_subject, 1)
    assert status == "invalid"
    assert message
    assert expected == "0–40"

    status2, _, expected2 = classify_paper(score, exam_subject, 2)
    assert status2 == "absent"
    assert expected2 is None


def test_expected_for_invalid_whole_number_and_range() -> None:
    assert expected_for_invalid(message="Must be a whole number", max_score=40.0) == "Whole number"
    assert expected_for_invalid(message="Score exceeds maximum", max_score=60.0) == "0–60"
    assert expected_for_invalid(message="bad", max_score=None) == "Valid score"


def test_classify_score_papers_filters_test_types() -> None:
    score = _make_score(obj_raw_score="10", essay_raw_score=None, pract_raw_score="A")
    exam_subject = _make_exam_subject(pract_max_score=20.0)
    papers = classify_score_papers(score, exam_subject, test_types={1, 3})
    assert [p[0] for p in papers] == [1, 3]
    assert papers[0][1] == "entered"
    assert papers[1][1] == "absent"
    assert papers[0][5] is None  # expected


def test_classify_skips_non_required_papers() -> None:
    score = _make_score()
    exam_subject = _make_exam_subject(
        obj_max_score=40.0,
        essay_max_score=None,
        pract_max_score=None,
        pract_pct=None,
    )
    papers = classify_score_papers(score, exam_subject)
    assert len(papers) == 1
    assert papers[0][0] == 1


def test_missing_p1_p2_label_both() -> None:
    score = _make_score(obj_raw_score=None, essay_raw_score=None)
    exam_subject = _make_exam_subject()
    assert missing_p1_p2_label(score, exam_subject) == "P1/P2"


def test_missing_p1_p2_label_only_p1() -> None:
    score = _make_score(obj_raw_score=None, essay_raw_score="40")
    exam_subject = _make_exam_subject()
    assert missing_p1_p2_label(score, exam_subject) == "P1"


def test_missing_p1_p2_label_only_p2() -> None:
    score = _make_score(obj_raw_score="10", essay_raw_score=None)
    exam_subject = _make_exam_subject()
    assert missing_p1_p2_label(score, exam_subject) == "P2"


def test_missing_p1_p2_label_neither() -> None:
    score = _make_score(obj_raw_score="10", essay_raw_score="40")
    exam_subject = _make_exam_subject()
    assert missing_p1_p2_label(score, exam_subject) is None


def test_missing_p1_p2_label_only_p1_required() -> None:
    score = _make_score(obj_raw_score=None, essay_raw_score=None)
    exam_subject = _make_exam_subject(essay_max_score=None)
    assert missing_p1_p2_label(score, exam_subject) == "P1"


def test_parse_statuses_single_required() -> None:
    assert parse_statuses(None) == ["missing"]
    assert parse_statuses("") == ["missing"]
    assert parse_statuses("invalid") == ["invalid"]
    with pytest.raises(ValueError, match="exactly one"):
        parse_statuses("all")
    with pytest.raises(ValueError, match="exactly one"):
        parse_statuses("entered,absent")
    with pytest.raises(ValueError):
        parse_statuses("foo")


def test_parse_test_types() -> None:
    assert parse_test_types(None) is None
    assert parse_test_types("1,2") == [1, 2]
    with pytest.raises(ValueError):
        parse_test_types("9")


def test_detail_columns_by_status() -> None:
    missing = [c.header for c in detail_columns_for_status("missing")]
    assert missing == ["Index number", "Candidate name"]

    combined = [c.header for c in detail_columns_for_status("missing", combine_p1_p2=True)]
    assert combined == ["Index number", "Candidate name", "Missing papers"]

    invalid = [c.header for c in detail_columns_for_status("invalid")]
    assert invalid == ["Index number", "Candidate name", "Value", "Expected"]

    absent = [c.header for c in detail_columns_for_status("absent")]
    assert absent == ["Index number", "Candidate name"]

    entered = [c.header for c in detail_columns_for_status("entered")]
    assert entered == ["Index number", "Candidate name", "Score"]


def test_build_summary_and_sort_groups() -> None:
    rows = [
        _detail_row(
            school_id=2,
            school_code="B01",
            school_name="Beta",
            index_number="2",
            candidate_name="Bob",
            status="missing",
            message="missing",
        ),
        _detail_row(
            school_id=1,
            school_code="A01",
            school_name="Alpha",
            candidate_id=2,
            index_number="1",
            candidate_name="Ann",
            raw_score="12",
            status="entered",
            message=None,
        ),
        _detail_row(
            school_id=1,
            school_code="A01",
            school_name="Alpha",
            subject_id=2,
            subject_code="ENG",
            subject_name="English",
            candidate_id=2,
            index_number="1",
            candidate_name="Ann",
            test_type=2,
            paper_label="Paper 2 (Essay)",
            paper_short="P2",
            raw_score="999",
            max_score=60.0,
            status="invalid",
            message="too high",
            expected="0–60",
        ),
    ]
    rows.sort(key=lambda r: (r.school_code, r.test_type, r.subject_code, r.index_number))
    summary = build_summary(rows)
    assert summary.total == 3
    assert summary.entered == 1
    assert summary.missing == 1
    assert summary.invalid == 1
    assert summary.by_school[0]["school_code"] == "A01"
    sections = group_rows_for_pdf(rows)
    assert sections[0]["school_code"] == "A01"
    # Papers are separate top-level groups under the school
    assert [p["test_type"] for p in sections[0]["papers"]] == [1, 2]
    assert sections[0]["papers"][0]["subjects"][0]["subject_code"] in {"MATH", "ENG"}


def test_papers_not_mixed_in_sections() -> None:
    rows = [
        _detail_row(test_type=1, paper_short="P1", paper_label="Paper 1 (Objectives)", status="missing"),
        _detail_row(
            test_type=2,
            paper_short="P2",
            paper_label="Paper 2 (Essay)",
            max_score=60.0,
            status="missing",
            candidate_id=2,
            index_number="2",
        ),
        _detail_row(
            test_type=1,
            paper_short="P1",
            paper_label="Paper 1 (Objectives)",
            status="missing",
            candidate_id=3,
            index_number="3",
        ),
    ]
    rows.sort(key=lambda r: (r.school_code, r.test_type, r.subject_code, r.index_number))
    sections = group_rows_for_pdf(rows)
    papers = sections[0]["papers"]
    assert len(papers) == 2
    assert papers[0]["test_type"] == 1
    assert papers[1]["test_type"] == 2
    assert all(r.test_type == 1 for r in papers[0]["subjects"][0]["rows"])
    assert all(r.test_type == 2 for r in papers[1]["subjects"][0]["rows"])
    assert papers[0]["subjects"][0]["max_score"] == "40"
    assert papers[1]["subjects"][0]["max_score"] == "60"


def test_should_use_report_job() -> None:
    assert should_use_report_job(school_id=None, report_format="pdf") is True
    assert should_use_report_job(school_id=1, report_format="xlsx", estimated_rows=100) is False
    assert should_use_report_job(school_id=1, report_format="xlsx", estimated_rows=6000) is True
    assert should_use_report_job(school_id=1, report_format="xlsx", school_count=3) is True


def _sample_report_data(
    *,
    status: str = "missing",
    rows: list[ReportDetailRow] | None = None,
) -> ScoreValidationReportData:
    if rows is None:
        rows = [
            _detail_row(
                status=status,
                message="Objectives score is missing. Maximum score is 40"
                if status == "missing"
                else None,
                expected="0–40" if status == "invalid" else None,
                raw_score="99" if status == "invalid" else ("12" if status == "entered" else None),
            )
        ]
    meta = ReportMeta(
        exam_id=1,
        exam_label="2026 MAY/JUNE CERT2",
        exam_year=2026,
        exam_series="MAY/JUNE",
        exam_type="CERT2",
        school_id=rows[0].school_id if len({r.school_id for r in rows}) == 1 else None,
        school_label=f"{rows[0].school_code} — {rows[0].school_name}"
        if len({r.school_id for r in rows}) == 1
        else None,
        school_code=rows[0].school_code if len({r.school_id for r in rows}) == 1 else None,
        subject_type="CORE",
        subject_ids=None,
        subject_labels=[],
        test_types=[1],
        statuses=[status],
        generated_at="2026-08-30 12:00 UTC",
        row_count=len(rows),
    )
    return ScoreValidationReportData(meta=meta, summary=build_summary(rows), rows=rows)


def test_excel_export_adaptive_columns_and_subject_sheets() -> None:
    rows = [
        _detail_row(status="invalid", raw_score="99", expected="0–40", message="too high"),
        _detail_row(
            subject_id=2,
            subject_code="ENG",
            subject_name="English",
            status="invalid",
            raw_score="abc",
            expected="Whole number",
            message="Must be a whole number",
            test_type=2,
            paper_label="Paper 2 (Essay)",
            paper_short="P2",
            max_score=60.0,
        ),
    ]
    data = _sample_report_data(status="invalid", rows=rows)
    excel_bytes = generate_validation_report_excel(data)
    assert excel_bytes[:2] == b"PK"

    wb = openpyxl.load_workbook(io.BytesIO(excel_bytes))
    math_ws = wb["P1_MATH"]
    headers = [math_ws.cell(4, c).value for c in range(1, 6)]
    assert headers == ["#", "Index number", "Candidate name", "Value", "Expected"]
    assert math_ws.cell(5, 1).value == 1
    assert math_ws.cell(5, 4).value == "99"
    assert math_ws.cell(5, 5).value == "0–40"
    assert "P1" in math_ws.cell(1, 1).value or "Maximum" in (math_ws.cell(2, 1).value or "")

    assert "P2_ENG" in wb.sheetnames
    assert "MATH" not in wb.sheetnames  # no mixed paper-free subject sheet

    missing_data = _sample_report_data(status="missing")
    missing_wb = openpyxl.load_workbook(io.BytesIO(generate_validation_report_excel(missing_data)))
    missing_headers = [missing_wb["P1_MATH"].cell(4, c).value for c in range(1, 5)]
    assert missing_headers == ["#", "Index number", "Candidate name", None]


def test_pdf_export_subject_page_breaks(monkeypatch: pytest.MonkeyPatch) -> None:
    templates = Path(__file__).resolve().parents[1] / "templates"
    monkeypatch.setattr(
        "app.services.score_validation_report.settings.templates_path",
        str(templates),
    )
    assert (templates / "score_validation_report" / "main.html").is_file()

    rows = [
        _detail_row(status="missing"),
        _detail_row(
            subject_id=2,
            subject_code="ENG",
            subject_name="English",
            status="missing",
            message="Essay score is missing",
        ),
    ]
    data = _sample_report_data(status="missing", rows=rows)
    pdf_bytes = generate_validation_report_pdf(data)
    assert pdf_bytes[:4] == b"%PDF"
    assert len(pdf_bytes) > 100

    # Rendered HTML path uses page-break between subjects — assert via template render.
    from jinja2 import Environment, FileSystemLoader

    from app.services.score_validation_report import detail_columns_for_status, primary_report_status

    env = Environment(loader=FileSystemLoader(str(templates)))
    template = env.get_template("score_validation_report/main.html")
    report_status = primary_report_status(data.meta.statuses)
    html = template.render(
        meta=data.meta,
        summary=data.summary,
        sections=group_rows_for_pdf(data.rows),
        report_status=report_status,
        status_count=getattr(data.summary, report_status),
        columns=detail_columns_for_status(report_status),
        logo_src="score_sheets/logo-crest-only.png",
        status_labels={
            "entered": "Entered",
            "missing": "Missing",
            "invalid": "Invalid",
            "absent": "Absent",
        },
    )
    assert "page-break" in html
    assert "MATH" in html and "ENG" in html
    assert "Score Correction Worksheet" in html or "Score correction worksheet" in html
    assert "col-score" in html
    assert ">Score</th>" in html or "Correct score" in html
    assert "Maximum mark" in html
    assert "Initials" not in html
    assert "Validation sign-off" not in html
    assert "Issue message" not in html
    assert "Extraction method" not in html
    assert "A4 portrait" in (templates / "score_validation_report" / "main.html").read_text()


def test_pdf_invalid_has_correct_score_column(monkeypatch: pytest.MonkeyPatch) -> None:
    templates = Path(__file__).resolve().parents[1] / "templates"
    monkeypatch.setattr(
        "app.services.score_validation_report.settings.templates_path",
        str(templates),
    )
    from jinja2 import Environment, FileSystemLoader

    rows = [
        _detail_row(status="invalid", raw_score="99", expected="0–40", message="too high"),
    ]
    data = _sample_report_data(status="invalid", rows=rows)
    env = Environment(loader=FileSystemLoader(str(templates)))
    template = env.get_template("score_validation_report/main.html")
    html = template.render(
        meta=data.meta,
        summary=data.summary,
        sections=group_rows_for_pdf(data.rows),
        report_status="invalid",
        status_count=1,
        columns=detail_columns_for_status("invalid"),
        logo_src="score_sheets/logo-crest-only.png",
        status_labels={
            "entered": "Entered",
            "missing": "Missing",
            "invalid": "Invalid",
            "absent": "Absent",
        },
    )
    assert "Correct score" in html
    assert ">Expected</th>" not in html
    assert "bad-value" in html
    pdf_bytes = generate_validation_report_pdf(data)
    assert pdf_bytes[:4] == b"%PDF"


def test_pdf_combine_p1_p2_has_dual_score_columns(monkeypatch: pytest.MonkeyPatch) -> None:
    templates = Path(__file__).resolve().parents[1] / "templates"
    monkeypatch.setattr(
        "app.services.score_validation_report.settings.templates_path",
        str(templates),
    )
    from jinja2 import Environment, FileSystemLoader

    rows = [
        _detail_row(
            test_type=0,
            paper_label="Paper 1 or 2 (combined)",
            paper_short="P1/P2",
            status="missing",
            missing_papers="P1/P2",
            message="Missing score(s): P1/P2",
            raw_score=None,
            max_score=None,
        ),
        _detail_row(
            candidate_id=2,
            index_number="002",
            candidate_name="Only P1 Missing",
            test_type=0,
            paper_label="Paper 1 or 2 (combined)",
            paper_short="P1",
            status="missing",
            missing_papers="P1",
            message="Missing score(s): P1",
            raw_score=None,
            max_score=None,
        ),
    ]
    data = _sample_report_data(status="missing", rows=rows)
    data.meta.combine_p1_p2 = True
    data.meta.test_types = [1, 2]

    env = Environment(loader=FileSystemLoader(str(templates)))
    template = env.get_template("score_validation_report/main.html")
    html = template.render(
        meta=data.meta,
        summary=data.summary,
        sections=group_rows_for_pdf(data.rows),
        report_status="missing",
        status_count=2,
        columns=detail_columns_for_status("missing", combine_p1_p2=True),
        combine_p1_p2=True,
        logo_src="score_sheets/logo-crest-only.png",
        status_labels={
            "entered": "Entered",
            "missing": "Missing",
            "invalid": "Invalid",
            "absent": "Absent",
        },
    )
    assert "Missing papers" in html
    assert ">P1</th>" in html
    assert ">P2</th>" in html
    assert html.count("col-score-dual write-box") >= 2
    assert "P1 and/or <strong>P2</strong>" in html or "P1</strong> and/or <strong>P2" in html
    # Single Score write column should not be the only write-in for combined mode
    assert "Write-in:</strong> P1 and P2 score columns" in html

    pdf_bytes = generate_validation_report_pdf(data)
    assert isinstance(pdf_bytes, (bytes, bytearray))
    assert len(pdf_bytes) > 100
    assert pdf_bytes[:4] == b"%PDF"


def test_slice_and_multi_school_zip_structure() -> None:
    rows = [
        _detail_row(school_id=1, school_code="A01", school_name="Alpha", status="missing"),
        _detail_row(
            school_id=2,
            school_code="B01",
            school_name="Beta",
            candidate_id=2,
            index_number="2",
            candidate_name="Bob",
            status="missing",
        ),
    ]
    data = _sample_report_data(status="missing", rows=rows)
    assert primary_report_status(data.meta.statuses) == "missing"

    school_a = _slice_report_for_school(data, 1)
    assert school_a.meta.school_id == 1
    assert school_a.meta.school_code == "A01"
    assert len(school_a.rows) == 1

    school_b = _slice_report_for_school(data, 2)
    name_a = _school_file_basename(school_a, "xlsx")
    name_b = _school_file_basename(school_b, "xlsx")
    assert name_a.startswith("A01_Alpha_") and name_a.endswith(".xlsx")
    assert name_b.startswith("B01_Beta_") and name_b.endswith(".xlsx")
    assert name_a != name_b

    # Package like generate_score_validation_report_bytes multi-school path
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for sid in (1, 2):
            school_data = _slice_report_for_school(data, sid)
            entry = _school_file_basename(school_data, "xlsx")
            zf.writestr(entry, generate_validation_report_excel(school_data))

    zip_buf.seek(0)
    with zipfile.ZipFile(zip_buf, "r") as zf:
        names = zf.namelist()
    assert len(names) == 2
    assert any("A01" in n for n in names)
    assert any("B01" in n for n in names)
    for name in names:
        assert name.endswith(".xlsx")
