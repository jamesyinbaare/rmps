"""Unit tests for absent-review helpers."""

from types import SimpleNamespace

from app.services.absent_review import (
    AbsentPaperRow,
    field_still_absent,
    filter_unconfirmed_rows,
    flatten_absent_papers,
    normalize_absent_marker,
    paginate_rows,
    paper_matches_filters,
    score_has_matching_absent,
    sort_absent_papers,
)
from app.models import SubjectScore


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


def test_normalize_absent_marker() -> None:
    assert normalize_absent_marker("a") == "A"
    assert normalize_absent_marker(" AA ") == "AA"
    assert normalize_absent_marker("5") is None
    assert normalize_absent_marker(None) is None


def test_paper_matches_filters_test_type() -> None:
    assert paper_matches_filters("A", 1, test_type_filter=1, absent_marker_filter=None)
    assert not paper_matches_filters("A", 1, test_type_filter=2, absent_marker_filter=None)
    assert not paper_matches_filters("5", 1, test_type_filter=1, absent_marker_filter=None)


def test_paper_matches_filters_marker() -> None:
    assert paper_matches_filters("AA", 2, test_type_filter=None, absent_marker_filter="AA")
    assert not paper_matches_filters("A", 2, test_type_filter=None, absent_marker_filter="AA")


def test_score_has_matching_absent() -> None:
    score = _make_score(obj_raw_score="A", essay_raw_score="10")
    assert score_has_matching_absent(score, test_type_filter=None, absent_marker_filter=None)
    assert score_has_matching_absent(score, test_type_filter=1, absent_marker_filter=None)
    assert not score_has_matching_absent(score, test_type_filter=2, absent_marker_filter=None)


def test_flatten_absent_papers_single_field() -> None:
    score = _make_score(
        id=10,
        obj_raw_score="A",
        essay_raw_score="5",
        obj_document_id="DOC001",
        total_score=5.0,
    )
    candidate = SimpleNamespace(id=1, name="Jane Doe", index_number="0123456789")
    school = SimpleNamespace(id=2, name="Test School", code="TS01")
    exam = SimpleNamespace(id=3)
    exam_subject = SimpleNamespace(obj_max_score=40.0, essay_max_score=60.0, pract_max_score=None)
    subject = SimpleNamespace(id=4, code="MATH", name="Mathematics")
    doc = SimpleNamespace(id=99, file_name="sheet.jpg", mime_type="image/jpeg")

    rows = flatten_absent_papers(
        score,
        candidate=candidate,
        school=school,
        exam=exam,
        exam_subject=exam_subject,
        subject=subject,
        documents_by_extracted_id={"DOC001": doc},
        test_type_filter=None,
        absent_marker_filter=None,
    )

    assert len(rows) == 1
    assert rows[0].field_name == "obj_raw_score"
    assert rows[0].absent_marker == "A"
    assert rows[0].test_type == 1
    assert rows[0].document_file_name == "sheet.jpg"
    assert rows[0].max_score == 40.0


def test_flatten_absent_papers_all_three_absent() -> None:
    score = _make_score(
        obj_raw_score="A",
        essay_raw_score="AA",
        pract_raw_score="AAA",
    )
    candidate = SimpleNamespace(id=1, name="John", index_number="0000000001")
    exam = SimpleNamespace(id=1)
    exam_subject = SimpleNamespace(obj_max_score=10.0, essay_max_score=20.0, pract_max_score=30.0)
    subject = SimpleNamespace(id=1, code="ENG", name="English")

    rows = flatten_absent_papers(
        score,
        candidate=candidate,
        school=None,
        exam=exam,
        exam_subject=exam_subject,
        subject=subject,
        documents_by_extracted_id={},
        test_type_filter=None,
        absent_marker_filter=None,
    )

    assert len(rows) == 3
    assert {r.test_type for r in rows} == {1, 2, 3}


def test_sort_and_paginate() -> None:
    score = _make_score(obj_raw_score="A", essay_raw_score="AA")
    candidate = SimpleNamespace(id=1, name="A", index_number="2")
    exam = SimpleNamespace(id=1)
    exam_subject = SimpleNamespace(obj_max_score=1.0, essay_max_score=1.0, pract_max_score=1.0)
    subject = SimpleNamespace(id=1, code="B", name="B")

    rows = flatten_absent_papers(
        score,
        candidate=candidate,
        school=None,
        exam=exam,
        exam_subject=exam_subject,
        subject=subject,
        documents_by_extracted_id={},
        test_type_filter=None,
        absent_marker_filter=None,
    )

    candidate2 = SimpleNamespace(id=2, name="B", index_number="1")
    rows2 = flatten_absent_papers(
        _make_score(obj_raw_score="A"),
        candidate=candidate2,
        school=None,
        exam=exam,
        exam_subject=exam_subject,
        subject=subject,
        documents_by_extracted_id={},
        test_type_filter=None,
        absent_marker_filter=None,
    )

    sorted_rows = sort_absent_papers(rows + rows2)
    assert sorted_rows[0].candidate_index_number == "1"

    page = paginate_rows(sorted_rows, page=1, page_size=1)
    assert len(page) == 1


def test_filter_unconfirmed_rows() -> None:
    rows = [
        AbsentPaperRow(
            score_id=1,
            candidate_id=1,
            candidate_name="A",
            candidate_index_number="1",
            school_id=None,
            school_name=None,
            school_code=None,
            subject_id=1,
            subject_code="M",
            subject_name="Math",
            exam_id=1,
            test_type=1,
            field_name="obj_raw_score",
            absent_marker="A",
            obj_raw_score="A",
            essay_raw_score=None,
            pract_raw_score=None,
            total_score=0.0,
            grade=None,
            max_score=10.0,
            document_id=None,
            document_file_name=None,
            document_numeric_id=None,
            document_mime_type=None,
        ),
        AbsentPaperRow(
            score_id=1,
            candidate_id=1,
            candidate_name="A",
            candidate_index_number="1",
            school_id=None,
            school_name=None,
            school_code=None,
            subject_id=1,
            subject_code="M",
            subject_name="Math",
            exam_id=1,
            test_type=2,
            field_name="essay_raw_score",
            absent_marker="AA",
            obj_raw_score="A",
            essay_raw_score="AA",
            pract_raw_score=None,
            total_score=0.0,
            grade=None,
            max_score=10.0,
            document_id=None,
            document_file_name=None,
            document_numeric_id=None,
            document_mime_type=None,
        ),
    ]
    filtered = filter_unconfirmed_rows(rows, {(1, "obj_raw_score")})
    assert len(filtered) == 1
    assert filtered[0].field_name == "essay_raw_score"


def test_field_still_absent() -> None:
    assert field_still_absent("obj_raw_score", {"obj_raw_score": "A"})
    assert not field_still_absent("obj_raw_score", {"obj_raw_score": "5"})
    assert not field_still_absent("obj_raw_score", {"obj_raw_score": None})
