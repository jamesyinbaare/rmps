from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models import AllocationRunStatus, Region, Zone
from app.services.script_allocation import build_eligible_pairs, run_allocation_solve


def test_build_eligible_pairs_respects_subject_and_zone() -> None:
    eid = uuid4()
    env = SimpleNamespace(id=eid, booklet_count=10)
    series = SimpleNamespace(subject_id=101, series_number=1)
    school = SimpleNamespace(zone=Zone.B, region=Region.OTI)

    ex_ok = SimpleNamespace(
        id=uuid4(),
        subjects=[SimpleNamespace(subject_id=101)],
        allowed_zones=[SimpleNamespace(zone=Zone.B)],
    )
    ex_wrong_subject = SimpleNamespace(
        id=uuid4(),
        subjects=[SimpleNamespace(subject_id=99)],
        allowed_zones=[SimpleNamespace(zone=Zone.B)],
    )
    ex_wrong_zone = SimpleNamespace(
        id=uuid4(),
        subjects=[SimpleNamespace(subject_id=101)],
        allowed_zones=[SimpleNamespace(zone=Zone.A)],
    )

    pairs, _ = build_eligible_pairs([(env, series, school)], [ex_ok, ex_wrong_subject, ex_wrong_zone])
    assert len(pairs) == 1
    assert pairs[0].examiner_id == ex_ok.id
    assert pairs[0].envelope_id == eid


def test_build_eligible_pairs_no_match_when_examiner_has_no_allowed_zones() -> None:
    eid = uuid4()
    env = SimpleNamespace(id=eid, booklet_count=10)
    series = SimpleNamespace(subject_id=101, series_number=1)
    school = SimpleNamespace(zone=Zone.B, region=Region.OTI)

    ex = SimpleNamespace(
        id=uuid4(),
        subjects=[SimpleNamespace(subject_id=101)],
        allowed_zones=[],
    )
    pairs, _ = build_eligible_pairs([(env, series, school)], [ex])
    assert pairs == []


def test_build_eligible_pairs_skips_zero_booklets() -> None:
    eid = uuid4()
    env = SimpleNamespace(id=eid, booklet_count=0)
    series = SimpleNamespace(subject_id=1, series_number=1)
    school = SimpleNamespace(zone=Zone.A, region=Region.ASHANTI)
    ex = SimpleNamespace(
        id=uuid4(),
        subjects=[SimpleNamespace(subject_id=1)],
        allowed_zones=[SimpleNamespace(zone=Zone.A)],
    )
    pairs, _ = build_eligible_pairs([(env, series, school)], [ex])
    assert pairs == []


def test_build_eligible_pairs_excludes_examiner_zone() -> None:
    eid = uuid4()
    env = SimpleNamespace(id=eid, booklet_count=10)
    series = SimpleNamespace(subject_id=101, series_number=1)
    school = SimpleNamespace(zone=Zone.B, region=Region.OTI)
    ex = SimpleNamespace(
        id=uuid4(),
        zone=Zone.B,
        subjects=[SimpleNamespace(subject_id=101)],
        allowed_zones=[SimpleNamespace(zone=Zone.B)],
    )
    pairs, _ = build_eligible_pairs([(env, series, school)], [ex], exclude_home_zone_or_region=True)
    assert pairs == []


def test_build_eligible_pairs_cross_rules_allow_targets_without_allowed_zones() -> None:
    """When cross_marking_rules are set, allowed_zones on the examiner are not used for eligibility."""
    eid = uuid4()
    env = SimpleNamespace(id=eid, booklet_count=10)
    series = SimpleNamespace(subject_id=101, series_number=1)
    school = SimpleNamespace(zone=Zone.C, region=Region.OTI)
    ex = SimpleNamespace(
        id=uuid4(),
        zone=Zone.B,
        region=None,
        subjects=[SimpleNamespace(subject_id=101)],
        allowed_zones=[],
    )
    pairs, _ = build_eligible_pairs(
        [(env, series, school)],
        [ex],
        allocation_scope="zone",
        cross_marking_rules={"B": ["C"]},
    )
    assert len(pairs) == 1
    assert pairs[0].examiner_id == ex.id


def test_build_eligible_pairs_region_cross_rules_use_examiner_region() -> None:
    eid = uuid4()
    env = SimpleNamespace(id=eid, booklet_count=10)
    series = SimpleNamespace(subject_id=101, series_number=1)
    school = SimpleNamespace(zone=Zone.C, region=Region.ASHANTI)
    ex = SimpleNamespace(
        id=uuid4(),
        zone=None,
        region=Region.VOLTA,
        subjects=[SimpleNamespace(subject_id=101)],
        allowed_zones=[],
    )
    pairs, _ = build_eligible_pairs(
        [(env, series, school)],
        [ex],
        allocation_scope="region",
        cross_marking_rules={"Volta": ["Ashanti"]},
    )
    assert len(pairs) == 1


def test_build_eligible_pairs_zone_cross_rule_filters_targets() -> None:
    eid = uuid4()
    env = SimpleNamespace(id=eid, booklet_count=10)
    series = SimpleNamespace(subject_id=101, series_number=1)
    school = SimpleNamespace(zone=Zone.C, region=Region.OTI)
    ex = SimpleNamespace(
        id=uuid4(),
        zone=Zone.B,
        subjects=[SimpleNamespace(subject_id=101)],
        allowed_zones=[SimpleNamespace(zone=Zone.C)],
    )
    pairs, _ = build_eligible_pairs(
        [(env, series, school)],
        [ex],
        allocation_scope="zone",
        cross_marking_rules={"B": ["A"]},
    )
    assert pairs == []


@pytest.mark.asyncio
async def test_run_allocation_solve_fails_when_allocation_has_no_selected_examiners() -> None:
    class _ScalarResult:
        def scalars(self):
            return self

        def all(self):
            return []

    class _Session:
        def __init__(self):
            self.added = []

        async def execute(self, _stmt):
            return _ScalarResult()

        def add(self, row):
            self.added.append(row)

        async def flush(self):
            return None

    session = _Session()
    allocation = SimpleNamespace(id=uuid4(), examination_id=1, subject_id=101, paper_number=1, scripts_allocation_quotas=[])
    run = await run_allocation_solve(
        session,  # type: ignore[arg-type]
        allocation,  # type: ignore[arg-type]
        created_by_id=None,
        unassigned_penalty=1.0,
        time_limit_sec=10.0,
        allocation_scope="zone",
        fairness_weight=0.0,
        enforce_single_series_per_examiner=True,
        cross_marking_rules={},
        exclude_home_zone_or_region=True,
    )
    assert run.status == AllocationRunStatus.ERROR
    assert run.solver_message == "No examiners selected for this allocation"
