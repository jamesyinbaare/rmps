"""Tests for regional cross-marking eligibility and greedy allocation."""

from __future__ import annotations

from uuid import uuid4

from app.models import ExaminerType, Region
from app.services.script_allocation import build_eligible_pairs, parse_region_cross_marking_rules
from app.services.script_allocation_regional_greedy import regional_greedy_solve, sort_envelope_rows


class _Env:
    def __init__(self, *, eid, booklets: int, envelope_number: int = 1) -> None:
        self.id = eid
        self.booklet_count = booklets
        self.envelope_number = envelope_number


class _Series:
    def __init__(self, subject_id: int = 1, series_number: int = 1) -> None:
        self.subject_id = subject_id
        self.series_number = series_number
        self.paper_number = 1


class _School:
    def __init__(self, *, code: str, region: Region) -> None:
        self.id = uuid4()
        self.code = code
        self.region = region
        self.zone = None


class _Subject:
    subject_id = 1


class _Examiner:
    def __init__(self, *, name: str, region: Region, eid=None) -> None:
        self.id = eid or uuid4()
        self.name = name
        self.region = region
        self.examiner_type = ExaminerType.ASSISTANT
        self.subjects = [_Subject()]


def test_parse_region_cross_marking_rules() -> None:
    parsed = parse_region_cross_marking_rules(
        {"Ashanti": ["Greater Accra", "Eastern"], "Greater Accra": ["Greater Accra", "Eastern"]},
    )
    assert Region.ASHANTI in parsed
    assert Region.GREATER_ACCRA in parsed[Region.ASHANTI]
    assert Region.GREATER_ACCRA in parsed[Region.GREATER_ACCRA]


def test_build_eligible_pairs_region_rules_allow_self_region() -> None:
    env_id = uuid4()
    rows = [(_Env(eid=env_id, booklets=10), _Series(), _School(code="S1", region=Region.GREATER_ACCRA))]
    examiners = [_Examiner(name="A", region=Region.GREATER_ACCRA)]
    region_rules = {Region.GREATER_ACCRA: {Region.GREATER_ACCRA, Region.EASTERN}}

    pairs, _ = build_eligible_pairs(
        rows,
        examiners,
        cross_marking_region_rules=region_rules,
    )

    assert len(pairs) == 1
    assert pairs[0].envelope_id == env_id


def test_build_eligible_pairs_region_rules_blocks_unlisted_region() -> None:
    env_id = uuid4()
    rows = [(_Env(eid=env_id, booklets=10), _Series(), _School(code="S1", region=Region.EASTERN))]
    examiners = [_Examiner(name="A", region=Region.ASHANTI)]
    region_rules = {Region.ASHANTI: {Region.GREATER_ACCRA}}

    pairs, _ = build_eligible_pairs(rows, examiners, cross_marking_region_rules=region_rules)

    assert pairs == []


def test_regional_greedy_one_series_per_examiner() -> None:
    env1 = uuid4()
    env2 = uuid4()
    rows = [
        (_Env(eid=env1, booklets=50, envelope_number=1), _Series(series_number=1), _School(code="A1", region=Region.EASTERN)),
        (_Env(eid=env2, booklets=40, envelope_number=2), _Series(series_number=2), _School(code="A1", region=Region.EASTERN)),
    ]
    examiners = [_Examiner(name="Zed", region=Region.ASHANTI)]
    region_rules = {Region.ASHANTI: {Region.EASTERN}}

    result = regional_greedy_solve(
        rows,
        examiners,
        subject_id=1,
        cross_marking_region_rules=region_rules,
        quota_by_type_subject={(ExaminerType.ASSISTANT, 1): 100},
        quota_tolerance_booklets=20,
    )

    assert len(result.assignments) == 1
    assert result.assignments[0].series_number == 1


def test_build_eligible_pairs_region_rules_blocks_self_region_without_diagonal() -> None:
    env_id = uuid4()
    rows = [(_Env(eid=env_id, booklets=10), _Series(), _School(code="S1", region=Region.GREATER_ACCRA))]
    examiners = [_Examiner(name="A", region=Region.GREATER_ACCRA)]
    region_rules = {Region.GREATER_ACCRA: {Region.EASTERN}}

    pairs, _ = build_eligible_pairs(rows, examiners, cross_marking_region_rules=region_rules)

    assert pairs == []


def test_regional_greedy_quota_band() -> None:
    env1 = uuid4()
    env2 = uuid4()
    env3 = uuid4()
    rows = [
        (_Env(eid=env1, booklets=50, envelope_number=1), _Series(series_number=1), _School(code="A1", region=Region.EASTERN)),
        (_Env(eid=env2, booklets=50, envelope_number=2), _Series(series_number=1), _School(code="A1", region=Region.EASTERN)),
        (_Env(eid=env3, booklets=50, envelope_number=3), _Series(series_number=1), _School(code="A1", region=Region.EASTERN)),
    ]
    examiners = [_Examiner(name="Ash", region=Region.ASHANTI)]
    region_rules = {Region.ASHANTI: {Region.EASTERN}}

    result = regional_greedy_solve(
        rows,
        examiners,
        subject_id=1,
        cross_marking_region_rules=region_rules,
        quota_by_type_subject={(ExaminerType.ASSISTANT, 1): 100},
        quota_tolerance_booklets=20,
    )

    assigned_booklets = sum(a.booklet_count for a in result.assignments)
    assert 80 <= assigned_booklets <= 120
    assert len(result.assignments) == 2


def test_regional_greedy_pooled_regions_and_sort() -> None:
    env_big = uuid4()
    env_small = uuid4()
    rows = [
        (_Env(eid=env_small, booklets=30, envelope_number=2), _Series(), _School(code="B2", region=Region.EASTERN)),
        (_Env(eid=env_big, booklets=60, envelope_number=1), _Series(), _School(code="B2", region=Region.EASTERN)),
    ]
    sorted_rows = sort_envelope_rows(rows)
    assert sorted_rows[0][0].id == env_big

    examiners = [
        _Examiner(name="Ash", region=Region.ASHANTI),
        _Examiner(name="Acc", region=Region.GREATER_ACCRA),
    ]
    region_rules = {
        Region.ASHANTI: {Region.EASTERN},
        Region.GREATER_ACCRA: {Region.EASTERN},
    }

    result = regional_greedy_solve(
        rows,
        examiners,
        subject_id=1,
        cross_marking_region_rules=region_rules,
        quota_by_type_subject={(ExaminerType.ASSISTANT, 1): 100},
        quota_tolerance_booklets=50,
        marking_region_solve_order=[Region.ASHANTI, Region.GREATER_ACCRA],
    )

    assigned_ids = {a.envelope_id for a in result.assignments}
    assert env_big in assigned_ids
    assert len(result.subgroup_stats) == 2
