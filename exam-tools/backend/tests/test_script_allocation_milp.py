from uuid import uuid4

from app.services.script_allocation_milp import EligiblePair, SlackTarget, solve_script_allocation_milp


def test_milp_assigns_disjoint_envelopes_to_match_per_subject_quotas() -> None:
    eid0, eid1 = uuid4(), uuid4()
    ex0, ex1 = uuid4(), uuid4()
    sid_a, sid_b = 101, 102
    pairs = [
        EligiblePair(eid0, 0, 0, ex0, sid_a, 1, 10),
        EligiblePair(eid1, 1, 1, ex1, sid_b, 2, 5),
    ]
    slack_targets = [
        SlackTarget(0, sid_a, 10, 1.0),
        SlackTarget(1, sid_b, 5, 1.0),
    ]
    r = solve_script_allocation_milp(
        pairs=pairs,
        slack_targets=slack_targets,
        num_envelopes=2,
        num_examiners=2,
        unassigned_penalty=100.0,
        time_limit_sec=60.0,
    )
    assert r.success
    assert len(r.pair_assignments) == 2
    assert {p.envelope_id for p in r.pair_assignments} == {eid0, eid1}
    assert r.objective is not None
    assert abs(float(r.objective)) < 0.01


def test_milp_prefers_unassigned_when_quota_zero_and_penalty_low() -> None:
    """Quota zero and tiny unassigned penalty → assigning booklets only increases deviation cost."""
    eid = uuid4()
    ex0 = uuid4()
    sid = 201
    pairs = [EligiblePair(eid, 0, 0, ex0, sid, 1, 50)]
    slack_targets = [SlackTarget(0, sid, 0, 1.0)]
    r = solve_script_allocation_milp(
        pairs=pairs,
        slack_targets=slack_targets,
        num_envelopes=1,
        num_examiners=1,
        unassigned_penalty=0.01,
        time_limit_sec=60.0,
    )
    assert r.success
    assert r.pair_assignments == []


def test_milp_empty_pairs_returns_failure() -> None:
    r = solve_script_allocation_milp(
        pairs=[],
        slack_targets=[SlackTarget(0, 1, 1, 1.0)],
        num_envelopes=1,
        num_examiners=0,
        unassigned_penalty=1.0,
        time_limit_sec=60.0,
    )
    assert not r.success
    assert r.status_code == -1


def test_milp_single_series_constraint_prevents_mixed_series_for_one_examiner() -> None:
    ex = uuid4()
    sid = 301
    pairs = [
        EligiblePair(uuid4(), 0, 0, ex, sid, 1, 10),
        EligiblePair(uuid4(), 1, 0, ex, sid, 2, 10),
    ]
    r = solve_script_allocation_milp(
        pairs=pairs,
        slack_targets=[],
        num_envelopes=2,
        num_examiners=1,
        unassigned_penalty=100.0,
        time_limit_sec=60.0,
        enforce_single_series_per_examiner=True,
    )
    assert r.success
    assert len(r.pair_assignments) == 1


def test_milp_school_cohesion_prefers_reusing_school_when_slack_equal() -> None:
    """Given two quota-optimal assignments, prefer the one with fewer distinct (examiner, school) pairs."""
    school_a, school_d = uuid4(), uuid4()
    e0, e1, e2 = uuid4(), uuid4(), uuid4()
    ex0, ex1 = uuid4(), uuid4()
    sid = 601
    ser = 1
    pairs = [
        EligiblePair(e0, 0, 0, ex0, sid, ser, 10, school_a),
        EligiblePair(e0, 0, 1, ex1, sid, ser, 10, school_a),
        EligiblePair(e1, 1, 0, ex0, sid, ser, 10, school_a),
        EligiblePair(e1, 1, 1, ex1, sid, ser, 10, school_a),
        EligiblePair(e2, 2, 0, ex0, sid, ser, 10, school_d),
        EligiblePair(e2, 2, 1, ex1, sid, ser, 10, school_d),
    ]
    slack_targets = [
        SlackTarget(0, sid, 20, 1.0),
        SlackTarget(1, sid, 10, 1.0),
    ]
    r = solve_script_allocation_milp(
        pairs=pairs,
        slack_targets=slack_targets,
        num_envelopes=3,
        num_examiners=2,
        unassigned_penalty=100.0,
        time_limit_sec=60.0,
        fairness_weight=0.0,
        school_cohesion_weight=1.0,
    )
    assert r.success
    assert len(r.pair_assignments) == 3
    by_ex = {ex0: [], ex1: []}
    for p in r.pair_assignments:
        by_ex[p.examiner_id].append(p.envelope_id)
    assert set(by_ex[ex0]) == {e0, e1}
    assert by_ex[ex1] == [e2]


def test_milp_prefer_larger_booklets_breaks_tie_between_series_choices() -> None:
    ex = uuid4()
    sid = 701
    small_env, large_env = uuid4(), uuid4()
    pairs = [
        EligiblePair(small_env, 0, 0, ex, sid, 1, 5),
        EligiblePair(large_env, 1, 0, ex, sid, 2, 20),
    ]
    r = solve_script_allocation_milp(
        pairs=pairs,
        slack_targets=[],
        num_envelopes=2,
        num_examiners=1,
        unassigned_penalty=10.0,
        time_limit_sec=60.0,
        enforce_single_series_per_examiner=True,
        prefer_larger_booklets_epsilon=1e-3,
    )
    assert r.success
    assert len(r.pair_assignments) == 1
    assert r.pair_assignments[0].envelope_id == large_env


def test_milp_fairness_weight_spreads_load_between_examiners() -> None:
    ex0, ex1 = uuid4(), uuid4()
    sid = 401
    eids = [uuid4(), uuid4()]
    pairs = [
        EligiblePair(eids[0], 0, 0, ex0, sid, 1, 10),
        EligiblePair(eids[0], 0, 1, ex1, sid, 1, 10),
        EligiblePair(eids[1], 1, 0, ex0, sid, 1, 10),
        EligiblePair(eids[1], 1, 1, ex1, sid, 1, 10),
    ]
    r = solve_script_allocation_milp(
        pairs=pairs,
        slack_targets=[],
        num_envelopes=2,
        num_examiners=2,
        unassigned_penalty=100.0,
        time_limit_sec=60.0,
        fairness_weight=1.0,
    )
    assert r.success
    assigned_by_examiner = {ex0: 0, ex1: 0}
    for p in r.pair_assignments:
        assigned_by_examiner[p.examiner_id] += p.booklet_count
    assert assigned_by_examiner[ex0] == 10
    assert assigned_by_examiner[ex1] == 10
