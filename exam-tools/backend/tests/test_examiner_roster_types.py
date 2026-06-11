"""Tests for examiner roster type parsing."""

from app.models import ExaminerType
from app.services.examiner_roster import parse_examiner_type_cell


def test_parse_examiner_type_assistant_chief_aliases() -> None:
    assert parse_examiner_type_cell("ace") == ExaminerType.ASSISTANT_CHIEF
    assert parse_examiner_type_cell("assistant_chief_examiner") == ExaminerType.ASSISTANT_CHIEF
    assert parse_examiner_type_cell("Assistant Chief") == ExaminerType.ASSISTANT_CHIEF
