"""Tests for exam progress score-entry aggregation helpers."""

from app.services.exam_progress_scoring import score_entry_breakdown, slots_per_registration


def test_slots_per_registration_obj_essay_only() -> None:
    assert slots_per_registration(has_pract_max=False) == 2


def test_slots_per_registration_includes_pract() -> None:
    assert slots_per_registration(has_pract_max=True) == 3


def test_score_entry_breakdown_completion() -> None:
    result = score_entry_breakdown(expected=4, actual=3)
    assert result["expected"] == 4
    assert result["actual"] == 3
    assert result["completion_percentage"] == 75.0


def test_score_entry_breakdown_zero_expected() -> None:
    result = score_entry_breakdown(expected=0, actual=0)
    assert result["completion_percentage"] == 0.0


def test_core_elective_scenario_from_plan() -> None:
    """CORE: max scores set, obj+essay entered (2/2). ELECTIVE: no max scores, obj entered (1/2)."""
    core = score_entry_breakdown(expected=2, actual=2)
    elective = score_entry_breakdown(expected=2, actual=1)
    all_expected = 2 + 2
    all_actual = 2 + 1

    assert core["expected"] == 2
    assert core["actual"] == 2
    assert elective["expected"] == 2
    assert elective["actual"] == 1

    all_breakdown = score_entry_breakdown(all_expected, all_actual)
    assert all_breakdown["expected"] == 4
    assert all_breakdown["actual"] == 3
    assert all_breakdown["completion_percentage"] == 75.0


def test_elective_expected_without_max_scores() -> None:
    """Elective registrations always expect obj + essay even without max scores configured."""
    elective = score_entry_breakdown(
        expected=slots_per_registration(has_pract_max=False),
        actual=1,
    )
    assert elective["expected"] == 2
    assert elective["actual"] == 1
    assert elective["completion_percentage"] == 50.0
