"""Tests for exam-scoped examiner allowance groups."""

from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

from app.models import ExaminerRosterSource, ExaminerType, Region, RosterAllowanceKey
from app.services.examiner_allowance_groups import (
    GENERAL_GROUP_NAME,
    is_group_allowance_enabled,
    parse_allowance_groups_cell,
)
from app.services.examiner_compensation import compensation_for_examiner
from app.services.examiner_roster_allowance_eligibility import default_eligibility_map


def _examiner(*, roster_source: ExaminerRosterSource = ExaminerRosterSource.MANUAL) -> MagicMock:
    ex = MagicMock()
    ex.id = uuid4()
    ex.examiner_type = ExaminerType.ASSISTANT
    ex.region = Region.GREATER_ACCRA
    ex.subjects = []
    ex.chief_examiners_report_count = 0
    ex.reporting_allowance_enabled = False
    ex.num_days = 2
    ex.roster_source = roster_source
    return ex


def test_parse_allowance_groups_cell() -> None:
    assert parse_allowance_groups_cell(None) == []
    assert parse_allowance_groups_cell("") == []
    assert parse_allowance_groups_cell("Sitting eligible, Zone A") == ["Sitting eligible", "Zone A"]
    assert parse_allowance_groups_cell(GENERAL_GROUP_NAME) == [GENERAL_GROUP_NAME]


def test_is_group_allowance_enabled_or_across_memberships() -> None:
    examiner_id = uuid4()
    enabled = {
        examiner_id: {RosterAllowanceKey.MARKING, RosterAllowanceKey.TRAVEL},
    }
    assert is_group_allowance_enabled(enabled, examiner_id, RosterAllowanceKey.MARKING) is True
    assert is_group_allowance_enabled(enabled, examiner_id, RosterAllowanceKey.SITTING) is False
    assert is_group_allowance_enabled(None, examiner_id, RosterAllowanceKey.SITTING) is True
    # No membership row yet → treat as enabled until backfilled
    assert is_group_allowance_enabled({}, examiner_id, RosterAllowanceKey.SITTING) is True


def test_sitting_paid_only_when_group_enables_it() -> None:
    ex = _examiner()
    sitting_rates = {ExaminerType.ASSISTANT: Decimal("50")}
    roster = default_eligibility_map()
    # General sitting off: empty enabled set for examiner
    group_map = {ex.id: {RosterAllowanceKey.MARKING}}
    blocked = compensation_for_examiner(
        ex,
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        sitting_rates=sitting_rates,
        default_days={ExaminerType.ASSISTANT: 2},
        roster_eligibility=roster,
        group_eligibility=group_map,
    )
    assert blocked.sitting_allowance_ghs == Decimal("0")

    # Custom group enables sitting
    group_map_ok = {ex.id: {RosterAllowanceKey.SITTING, RosterAllowanceKey.MARKING}}
    paid = compensation_for_examiner(
        ex,
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        sitting_rates=sitting_rates,
        default_days={ExaminerType.ASSISTANT: 2},
        roster_eligibility=roster,
        group_eligibility=group_map_ok,
    )
    assert paid.sitting_allowance_ghs == Decimal("100")


def test_special_roster_sitting_off_blocks_even_if_group_enables() -> None:
    ex = _examiner(roster_source=ExaminerRosterSource.SPECIAL)
    sitting_rates = {ExaminerType.ASSISTANT: Decimal("50")}
    roster = default_eligibility_map()
    # Special defaults sitting off; group still enables sitting → still unpaid
    group_map = {ex.id: set(RosterAllowanceKey)}
    comp = compensation_for_examiner(
        ex,
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        sitting_rates=sitting_rates,
        default_days={ExaminerType.ASSISTANT: 2},
        roster_eligibility=roster,
        group_eligibility=group_map,
    )
    assert comp.sitting_allowance_ghs == Decimal("0")
