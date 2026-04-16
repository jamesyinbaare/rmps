"""Pure MILP for script envelope assignment (no SQLAlchemy / DB imports)."""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp


@dataclass(frozen=True)
class EligiblePair:
    envelope_id: UUID
    envelope_index: int
    examiner_index: int
    examiner_id: UUID
    subject_id: int
    series_number: int
    booklet_count: int


@dataclass(frozen=True)
class SlackTarget:
    """L1 deviation slack for one examiner index and subject (quota target for that pair)."""

    examiner_index: int
    subject_id: int
    quota: int
    weight: float


@dataclass(frozen=True)
class MilpSolveResult:
    pair_assignments: list[EligiblePair]
    objective: float | None
    message: str
    success: bool
    status_code: int


def solve_script_allocation_milp(
    pairs: list[EligiblePair],
    slack_targets: list[SlackTarget],
    num_envelopes: int,
    num_examiners: int,
    unassigned_penalty: float,
    time_limit_sec: float,
    fairness_weight: float = 0.0,
    enforce_single_series_per_examiner: bool = False,
) -> MilpSolveResult:
    """
    Minimize sum_m w_m(p_m+n_m) + λ sum_e u_e with whole-envelope assignment,
    at most one examiner per envelope, and L1 deviation per (examiner, subject) quota.
    """
    if not pairs:
        return MilpSolveResult(
            pair_assignments=[],
            objective=None,
            message="No eligible examiner–envelope pairs",
            success=False,
            status_code=-1,
        )
    p_count = len(pairs)
    m_count = len(slack_targets)
    e_count = num_envelopes
    j_count = max(0, int(num_examiners))
    fair_count = 2 if fairness_weight > 0 and j_count > 0 else 0

    series_keys: list[tuple[int, int]] = []
    series_var_index: dict[tuple[int, int], int] = {}
    if enforce_single_series_per_examiner:
        seen: set[tuple[int, int]] = set()
        for pair in pairs:
            key = (pair.examiner_index, int(pair.series_number))
            if key in seen:
                continue
            seen.add(key)
            series_var_index[key] = len(series_keys)
            series_keys.append(key)
    series_count = len(series_keys)

    n_vars = p_count + 2 * m_count + e_count + series_count + fair_count
    c = np.zeros(n_vars, dtype=np.float64)
    for m in range(m_count):
        w = float(slack_targets[m].weight)
        c[p_count + m] = w
        c[p_count + m_count + m] = w
    c[p_count + 2 * m_count : p_count + 2 * m_count + e_count] = float(unassigned_penalty)
    if fair_count == 2:
        c[-2] = float(fairness_weight)
        c[-1] = -float(fairness_weight)

    lb = np.zeros(n_vars, dtype=np.float64)
    ub = np.full(n_vars, np.inf, dtype=np.float64)
    ub[:p_count] = 1.0
    if series_count > 0:
        series_start = p_count + 2 * m_count + e_count
        ub[series_start : series_start + series_count] = 1.0

    integrality = np.zeros(n_vars, dtype=np.int32)
    integrality[:p_count] = 1
    if series_count > 0:
        series_start = p_count + 2 * m_count + e_count
        integrality[series_start : series_start + series_count] = 1

    env_idx = np.array([p.envelope_index for p in pairs], dtype=np.int32)
    ex_idx = np.array([p.examiner_index for p in pairs], dtype=np.int32)
    subj_idx = np.array([p.subject_id for p in pairs], dtype=np.int64)
    ser_idx = np.array([p.series_number for p in pairs], dtype=np.int64)
    book = np.array([float(p.booklet_count) for p in pairs], dtype=np.float64)

    rows: list[np.ndarray] = []
    row_lb: list[float] = []
    row_ub: list[float] = []

    for e in range(e_count):
        row = np.zeros(n_vars, dtype=np.float64)
        mask = env_idx == e
        if np.any(mask):
            row[:p_count][mask] = 1.0
        rows.append(row)
        row_lb.append(-np.inf)
        row_ub.append(1.0)

    for e in range(e_count):
        row = np.zeros(n_vars, dtype=np.float64)
        mask = env_idx == e
        if np.any(mask):
            row[:p_count][mask] = -1.0
        row[p_count + 2 * m_count + e] = -1.0
        rows.append(row)
        row_lb.append(-np.inf)
        row_ub.append(-1.0)

    for m, st in enumerate(slack_targets):
        j = st.examiner_index
        s = int(st.subject_id)
        q = int(st.quota)
        row = np.zeros(n_vars, dtype=np.float64)
        mask = (ex_idx == j) & (subj_idx == s)
        if np.any(mask):
            row[:p_count][mask] = book[mask]
        row[p_count + m] = -1.0
        rows.append(row)
        row_lb.append(-np.inf)
        row_ub.append(float(q))

        row2 = np.zeros(n_vars, dtype=np.float64)
        if np.any(mask):
            row2[:p_count][mask] = -book[mask]
        row2[p_count + m_count + m] = -1.0
        rows.append(row2)
        row_lb.append(-np.inf)
        row_ub.append(float(-q))

    if series_count > 0:
        series_start = p_count + 2 * m_count + e_count
        for j in range(j_count):
            row = np.zeros(n_vars, dtype=np.float64)
            has_any = False
            for s in np.unique(ser_idx[ex_idx == j]):
                key = (j, int(s))
                si = series_var_index.get(key)
                if si is None:
                    continue
                row[series_start + si] = 1.0
                has_any = True
            if not has_any:
                continue
            rows.append(row)
            row_lb.append(-np.inf)
            row_ub.append(1.0)

        for k, pair in enumerate(pairs):
            key = (pair.examiner_index, int(pair.series_number))
            si = series_var_index.get(key)
            if si is None:
                continue
            row = np.zeros(n_vars, dtype=np.float64)
            row[k] = 1.0
            row[series_start + si] = -1.0
            rows.append(row)
            row_lb.append(-np.inf)
            row_ub.append(0.0)

    if fair_count == 2:
        load_max_ix = n_vars - 2
        load_min_ix = n_vars - 1
        for j in range(j_count):
            row = np.zeros(n_vars, dtype=np.float64)
            mask = ex_idx == j
            if np.any(mask):
                row[:p_count][mask] = book[mask]
            row[load_max_ix] = -1.0
            rows.append(row)
            row_lb.append(-np.inf)
            row_ub.append(0.0)

            row2 = np.zeros(n_vars, dtype=np.float64)
            if np.any(mask):
                row2[:p_count][mask] = -book[mask]
            row2[load_min_ix] = 1.0
            rows.append(row2)
            row_lb.append(-np.inf)
            row_ub.append(0.0)

    a_mat = np.vstack(rows)
    constraint = LinearConstraint(
        a_mat,
        lb=np.array(row_lb, dtype=np.float64),
        ub=np.array(row_ub, dtype=np.float64),
    )

    bounds = Bounds(lb=lb, ub=ub)
    options = {"time_limit": float(time_limit_sec)}
    res = milp(
        c=c,
        integrality=integrality,
        bounds=bounds,
        constraints=[constraint],
        options=options,
    )

    if res.x is None or not res.success:
        return MilpSolveResult(
            pair_assignments=[],
            objective=float(res.fun) if res.fun is not None else None,
            message=res.message or "Solver did not return a feasible solution",
            success=False,
            status_code=int(res.status),
        )

    x = res.x[:p_count]
    chosen: list[EligiblePair] = []
    for k in range(p_count):
        if x[k] > 0.5:
            chosen.append(pairs[k])
    return MilpSolveResult(
        pair_assignments=chosen,
        objective=float(res.fun),
        message=res.message or "ok",
        success=True,
        status_code=int(res.status),
    )
