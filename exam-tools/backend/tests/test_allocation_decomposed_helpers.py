"""Unit tests for decomposed allocation helpers (ratio bucketing)."""
from __future__ import annotations

from uuid import uuid4

from app.models import Examiner, ExaminerType, Region
from app.services.script_allocation import (
    _decomposed_subgroup_time_limit_sec,
    assign_examiners_to_series_by_booklet_ratio,
)


def _make_examiner() -> Examiner:
    ex = Examiner(
        id=uuid4(),
        examination_id=1,
        name="E",
        examiner_type=ExaminerType.ASSISTANT,
        region=Region.ASHANTI,
    )
    return ex


def test_largest_remainder_buckets_sum_to_examiner_count() -> None:
    examiners = [_make_examiner() for _ in range(5)]
    series_booklets = {1: 60, 2: 40}
    buckets = assign_examiners_to_series_by_booklet_ratio(examiners, series_booklets)
    assert len(buckets) == 5
    assert set(buckets.values()) <= {1, 2}
    assert sum(1 for s in buckets.values() if s == 1) == 3
    assert sum(1 for s in buckets.values() if s == 2) == 2


def test_single_series_all_examiners() -> None:
    examiners = [_make_examiner() for _ in range(3)]
    buckets = assign_examiners_to_series_by_booklet_ratio(examiners, {7: 100})
    assert all(s == 7 for s in buckets.values())


def test_empty_examiners() -> None:
    assert assign_examiners_to_series_by_booklet_ratio([], {1: 10}) == {}


def test_decomposed_time_limit_scales_with_pair_count() -> None:
    """Large MILPs must not get only time_budget / n_planned when n_planned > 1."""
    t = _decomposed_subgroup_time_limit_sec(
        pair_count=5412,
        time_budget_remaining=120.0,
        subgroups_finished_before=0,
        n_planned=5,
    )
    assert t >= 90.0
    t_one = _decomposed_subgroup_time_limit_sec(
        pair_count=5412,
        time_budget_remaining=120.0,
        subgroups_finished_before=0,
        n_planned=1,
    )
    assert t_one >= 115.0
