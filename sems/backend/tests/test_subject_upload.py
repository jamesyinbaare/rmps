"""Tests for subject upload parsing (registration-portal parity for choice_group_id)."""

import pandas as pd
import pytest

from app.models import ExamType, ProgrammeType, SubjectType
from app.services.subject_upload import core_programme_link_flags, parse_subject_row


def _row(**kwargs: object) -> pd.Series:
    base = {
        "code": "301",
        "original_code": "C30-1-01",
        "name": "Mathematics",
        "subject_type": "CORE",
        "exam_type": "Certificate II Examinations",
        "programme_type": "CERT2",
    }
    base.update(kwargs)
    return pd.Series(base)


@pytest.mark.parametrize(
    "choice_val,expected",
    [
        (None, None),
        ("", None),
        ("  ", None),
        (1, 1),
        ("1", 1),
        ("1.0", 1),
        (0, None),
        ("0", None),
        (-1, None),
        ("-1", None),
        ("abc", None),
        (float("nan"), None),
    ],
)
def test_parse_choice_group_id(choice_val: object, expected: int | None) -> None:
    r = _row(choice_group_id=choice_val)
    out = parse_subject_row(r)
    assert out["choice_group_id"] == expected


def test_parse_choice_group_id_missing_column() -> None:
    r2 = pd.Series(
        {
            "code": "301",
            "original_code": "C30-1-01",
            "name": "Mathematics",
            "subject_type": "CORE",
            "exam_type": "Certificate II Examinations",
            "programme_type": "CERT2",
        }
    )
    out = parse_subject_row(r2)
    assert out["choice_group_id"] is None


def test_parse_programme_code_nan() -> None:
    r = _row(programme_code=float("nan"))
    out = parse_subject_row(r)
    assert out["programme_code"] is None


def test_parse_core_subject_fields() -> None:
    out = parse_subject_row(_row())
    assert out["subject_type"] == SubjectType.CORE
    assert out["exam_type"] == ExamType.CERTIFICATE_II
    assert out["programme_type"] == ProgrammeType.CERT2


@pytest.mark.parametrize(
    "parsed,expected_compulsory,expected_group",
    [
        (None, True, None),
        (0, True, None),
        (-3, True, None),
        (1, False, 1),
        (99, False, 99),
    ],
)
def test_core_programme_link_flags(
    parsed: int | None, expected_compulsory: bool, expected_group: int | None
) -> None:
    comp, gid = core_programme_link_flags(parsed)
    assert comp is expected_compulsory
    assert gid == expected_group
