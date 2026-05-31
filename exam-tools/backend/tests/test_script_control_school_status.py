"""Unit tests for script control school-status helpers."""

from unittest.mock import MagicMock
from uuid import uuid4

from app.schemas.script_control import ScriptControlSchoolStatusCounts
from app.services.script_control_school_status import _overall_status


def test_overall_status_missing() -> None:
    assert _overall_status(3, 0, 0) == "missing"


def test_overall_status_partial_few_recorded() -> None:
    assert _overall_status(3, 1, 0) == "partial"


def test_overall_status_complete_all_recorded_not_verified() -> None:
    assert _overall_status(3, 3, 1) == "complete"


def test_overall_status_verified() -> None:
    assert _overall_status(3, 3, 3) == "verified"


def test_status_counts_defaults() -> None:
    c = ScriptControlSchoolStatusCounts()
    assert c.total == 0
    assert c.missing == 0


def test_packing_to_admin_row_shape() -> None:
    from app.services.script_control_school_status import _packing_to_admin_row

    env = MagicMock()
    env.envelope_number = 1
    env.booklet_count = 10
    env.verified_at = None

    ps = MagicMock()
    ps.id = uuid4()
    ps.examination_id = 1
    ps.school_id = uuid4()
    ps.subject_id = 2
    ps.paper_number = 1
    ps.series_number = 1
    ps.no_scripts = False
    ps.envelopes = [env]

    sch = MagicMock()
    sch.code = "SCH01"
    sch.name = "Test School"
    sch.region = None
    sch.zone = None

    sub = MagicMock()
    sub.code = "ENG"
    sub.original_code = None
    sub.name = "English"

    row = _packing_to_admin_row(ps, sch=sch, sub=sub, irregular=False)
    assert row.school_code == "SCH01"
    assert row.total_booklets == 10
    assert row.series_number == 1
