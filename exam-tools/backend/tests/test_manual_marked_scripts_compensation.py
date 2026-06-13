"""Tests for compensation with manual effective script counts."""

from decimal import Decimal
from uuid import uuid4

from app.models import ExaminerType, Region
from app.services.examiner_compensation import compensation_for_examiner


def _subject_link(subject_id: int, code: str, name: str):
    from unittest.mock import MagicMock

    subject = MagicMock()
    subject.id = subject_id
    subject.code = code
    subject.original_code = code
    subject.name = name
    link = MagicMock()
    link.subject_id = subject_id
    link.subject = subject
    return link


def test_manual_counts_on_p2_only_in_breakdown() -> None:
    from unittest.mock import MagicMock

    ex = MagicMock()
    ex.id = uuid4()
    ex.examiner_type = ExaminerType.ASSISTANT
    ex.region = Region.ASHANTI
    ex.subjects = [_subject_link(1, "MATH", "Mathematics")]

    marking_rates = {(1, 1): Decimal("2"), (1, 2): Decimal("5")}
    allocated = {(ex.id, 1, 2): 7}

    comp = compensation_for_examiner(ex, {}, marking_rates, {}, {}, {}, {}, allocated)
    assert comp.total_allocated_scripts == 7
    assert comp.marking_allowance_ghs == Decimal("35")
    assert len(comp.subject_breakdowns) == 1
    assert comp.subject_breakdowns[0].paper_number == 2
    assert comp.subject_breakdowns[0].allocated_booklets == 7
