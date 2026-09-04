"""Tests for roster allowance eligibility defaults and parsing."""

from app.models import ExaminerRosterSource, RosterAllowanceKey
from app.services.examiner_roster_allowance_eligibility import (
    default_eligibility_enabled,
    default_eligibility_map,
    is_allowance_enabled,
)


def test_special_examiners_default_role_allowances_and_marking() -> None:
    assert default_eligibility_enabled(ExaminerRosterSource.SPECIAL, RosterAllowanceKey.MARKING) is True
    assert default_eligibility_enabled(ExaminerRosterSource.SPECIAL, RosterAllowanceKey.RESPONSIBILITY) is True
    assert default_eligibility_enabled(ExaminerRosterSource.SPECIAL, RosterAllowanceKey.INCONVENIENCE) is True
    assert default_eligibility_enabled(
        ExaminerRosterSource.SPECIAL, RosterAllowanceKey.CHIEF_EXAMINERS_REPORT
    ) is True
    assert default_eligibility_enabled(ExaminerRosterSource.SPECIAL, RosterAllowanceKey.SITTING) is False
    assert default_eligibility_enabled(ExaminerRosterSource.MANUAL, RosterAllowanceKey.SITTING) is True


def test_legacy_payout_override_maps_to_special() -> None:
    assert ExaminerRosterSource.from_stored("payout_override") == ExaminerRosterSource.SPECIAL


def test_is_allowance_enabled_uses_defaults_when_map_empty() -> None:
    assert is_allowance_enabled(None, ExaminerRosterSource.SPECIAL, RosterAllowanceKey.TRAVEL) is False
    assert is_allowance_enabled(None, ExaminerRosterSource.SPECIAL, RosterAllowanceKey.RESPONSIBILITY) is True
    assert is_allowance_enabled(default_eligibility_map(), ExaminerRosterSource.INVITATION, RosterAllowanceKey.TRAVEL) is True
