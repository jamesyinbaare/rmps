from uuid import uuid4

from app.models import ExaminerType
from app.services.script_allocation import apply_post_solve_rebalance
from app.services.script_allocation_milp import EligiblePair


def test_rebalance_removes_smallest_first_and_reassigns_to_under_quota() -> None:
    ex_over = uuid4()
    ex_under = uuid4()
    sid = 101
    school = uuid4()
    env_small, env_big = uuid4(), uuid4()

    current = [
        EligiblePair(env_small, 0, 0, ex_over, sid, 1, 15, school),
        EligiblePair(env_big, 1, 0, ex_over, sid, 1, 70, school),
    ]
    eligible = [
        EligiblePair(env_small, 0, 0, ex_over, sid, 1, 15, school),
        EligiblePair(env_small, 0, 1, ex_under, sid, 1, 15, school),
        EligiblePair(env_big, 1, 0, ex_over, sid, 1, 70, school),
    ]
    meta = {
        env_small: {
            "booklet_count": 15,
            "subject_id": sid,
            "series_number": 1,
            "school_id": school,
            "school_code": "S01",
            "envelope_number": 1,
        },
        env_big: {
            "booklet_count": 70,
            "subject_id": sid,
            "series_number": 1,
            "school_id": school,
            "school_code": "S01",
            "envelope_number": 2,
        },
    }
    ex_type = {ex_over: ExaminerType.ASSISTANT, ex_under: ExaminerType.ASSISTANT}
    quotas = {(ExaminerType.ASSISTANT, sid): 60}

    out, stats = apply_post_solve_rebalance(
        pair_assignments=current,
        all_eligible_pairs=eligible,
        envelope_meta=meta,
        examiner_type_by_id=ex_type,
        quota_by_type_subject=quotas,
        tolerance_booklets=20,
    )

    by_env = {p.envelope_id: p.examiner_id for p in out}
    assert by_env[env_small] == ex_under
    assert by_env[env_big] == ex_over
    assert stats["post_rebalance_removed_count"] == 1
    assert stats["post_rebalance_reassigned_count"] == 1


def test_rebalance_prefers_removal_that_reduces_school_diversity() -> None:
    ex = uuid4()
    sid = 102
    school_a, school_b = uuid4(), uuid4()
    env_a_small, env_b_small, env_a_large = uuid4(), uuid4(), uuid4()

    current = [
        EligiblePair(env_a_small, 0, 0, ex, sid, 1, 10, school_a),
        EligiblePair(env_b_small, 1, 0, ex, sid, 1, 10, school_b),
        EligiblePair(env_a_large, 2, 0, ex, sid, 1, 50, school_a),
    ]
    eligible = list(current)
    meta = {
        env_a_small: {
            "booklet_count": 10,
            "subject_id": sid,
            "series_number": 1,
            "school_id": school_a,
            "school_code": "A",
            "envelope_number": 1,
        },
        env_b_small: {
            "booklet_count": 10,
            "subject_id": sid,
            "series_number": 1,
            "school_id": school_b,
            "school_code": "B",
            "envelope_number": 2,
        },
        env_a_large: {
            "booklet_count": 50,
            "subject_id": sid,
            "series_number": 1,
            "school_id": school_a,
            "school_code": "A",
            "envelope_number": 3,
        },
    }
    ex_type = {ex: ExaminerType.ASSISTANT}
    quotas = {(ExaminerType.ASSISTANT, sid): 40}

    out, _stats = apply_post_solve_rebalance(
        pair_assignments=current,
        all_eligible_pairs=eligible,
        envelope_meta=meta,
        examiner_type_by_id=ex_type,
        quota_by_type_subject=quotas,
        tolerance_booklets=20,
    )

    kept_envs = {p.envelope_id for p in out}
    assert env_b_small not in kept_envs
    assert env_a_small in kept_envs
    assert env_a_large in kept_envs


def test_rebalance_noop_when_within_tolerance() -> None:
    ex = uuid4()
    sid = 103
    school = uuid4()
    env = uuid4()
    current = [EligiblePair(env, 0, 0, ex, sid, 1, 70, school)]
    eligible = list(current)
    meta = {
        env: {
            "booklet_count": 70,
            "subject_id": sid,
            "series_number": 1,
            "school_id": school,
            "school_code": "X",
            "envelope_number": 1,
        }
    }
    ex_type = {ex: ExaminerType.ASSISTANT}
    quotas = {(ExaminerType.ASSISTANT, sid): 60}

    out, stats = apply_post_solve_rebalance(
        pair_assignments=current,
        all_eligible_pairs=eligible,
        envelope_meta=meta,
        examiner_type_by_id=ex_type,
        quota_by_type_subject=quotas,
        tolerance_booklets=20,
    )

    assert out == current
    assert stats["post_rebalance_removed_count"] == 0
    assert stats["post_rebalance_reassigned_count"] == 0


def test_rebalance_leaves_removed_envelope_unassigned_when_no_recipient() -> None:
    ex_over = uuid4()
    sid = 104
    school = uuid4()
    env_small, env_big = uuid4(), uuid4()
    current = [
        EligiblePair(env_small, 0, 0, ex_over, sid, 1, 15, school),
        EligiblePair(env_big, 1, 0, ex_over, sid, 1, 70, school),
    ]
    eligible = list(current)
    meta = {
        env_small: {
            "booklet_count": 15,
            "subject_id": sid,
            "series_number": 1,
            "school_id": school,
            "school_code": "X",
            "envelope_number": 1,
        },
        env_big: {
            "booklet_count": 70,
            "subject_id": sid,
            "series_number": 1,
            "school_id": school,
            "school_code": "X",
            "envelope_number": 2,
        },
    }
    ex_type = {ex_over: ExaminerType.ASSISTANT}
    quotas = {(ExaminerType.ASSISTANT, sid): 60}

    out, stats = apply_post_solve_rebalance(
        pair_assignments=current,
        all_eligible_pairs=eligible,
        envelope_meta=meta,
        examiner_type_by_id=ex_type,
        quota_by_type_subject=quotas,
        tolerance_booklets=20,
    )

    kept = {p.envelope_id for p in out}
    assert env_small not in kept
    assert env_big in kept
    assert stats["post_rebalance_removed_count"] == 1
    assert stats["post_rebalance_reassigned_count"] == 0
