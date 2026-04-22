"""MILP-based assignment of script envelopes to examiners (whole envelopes, quota deviation)."""
from __future__ import annotations

import math
import time
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Allocation,
    AllocationAssignment,
    AllocationExaminer,
    AllocationRun,
    AllocationRunStatus,
    Examiner,
    ExaminerGroup,
    ExaminerGroupMember,
    ExaminerGroupSourceRegion,
    ExaminerSubject,
    ExaminerType,
    Region,
    School,
    ScriptEnvelope,
    ScriptPackingSeries,
    Subject,
    Zone,
)
from app.schemas.script_allocation import (
    AllocationAssignmentItem,
    AllocationRunResponse,
    AllocationRunStatusSchema,
    AllocationSolveModeSchema,
    AllocationSubgroupItem,
    AllocationSubgroupStatusSchema,
    ExaminerSubjectRunSummary,
    ExaminerTypeSchema,
    UnassignedEnvelopeItem,
)
from app.services.script_allocation_milp import EligiblePair, SlackTarget, solve_script_allocation_milp

DEFAULT_DEVIATION_WEIGHT: dict[ExaminerType, float] = {
    ExaminerType.CHIEF: 2.0,
    ExaminerType.ASSISTANT: 1.0,
    ExaminerType.TEAM_LEADER: 1.5,
}


def deviation_weight_for_examiner(ex: Examiner) -> float:
    if ex.deviation_weight is not None:
        return float(ex.deviation_weight)
    return DEFAULT_DEVIATION_WEIGHT.get(ex.examiner_type, 1.0)


def parse_zone(value: str | None) -> Zone | None:
    if value is None or not str(value).strip():
        return None
    v = str(value).strip().upper()
    try:
        return Zone[v]
    except KeyError:
        for z in Zone:
            if z.value == v:
                return z
    raise ValueError(f"Unknown zone: {value!r}")


def zones_from_strings(values: list[str]) -> list[Zone]:
    return [parse_zone(s) for s in values]


def parse_region(value: str | None) -> Region | None:
    if value is None or not str(value).strip():
        return None
    v = str(value).strip()
    enum_key = v.upper().replace(" ", "_")
    try:
        return Region[enum_key]
    except KeyError:
        for region in Region:
            if region.value.lower() == v.lower():
                return region
    raise ValueError(f"Unknown region: {value!r}")


def parse_group_cross_marking_rules(rules: dict[str, list[str]] | None) -> dict[UUID, set[UUID]]:
    """Keys: marking group id (examiners). Values: source script cohort group ids allowed for that marking group."""
    out: dict[UUID, set[UUID]] = {}
    if not rules:
        return out
    for key, values in rules.items():
        try:
            mk = UUID(str(key).strip())
        except ValueError:
            continue
        targets: set[UUID] = set()
        for raw in values or []:
            try:
                targets.add(UUID(str(raw).strip()))
            except ValueError:
                continue
        out[mk] = targets
    return out


async def load_examiner_group_marking_maps(
    session: AsyncSession,
    examination_id: int,
) -> tuple[dict[Region, UUID], dict[UUID, UUID]]:
    stmt_sr = (
        select(ExaminerGroupSourceRegion)
        .join(ExaminerGroup, ExaminerGroupSourceRegion.group_id == ExaminerGroup.id)
        .where(ExaminerGroup.examination_id == examination_id)
    )
    region_to_source: dict[Region, UUID] = {}
    for row in (await session.execute(stmt_sr)).scalars().all():
        region_to_source[row.region] = row.group_id

    stmt_m = (
        select(ExaminerGroupMember)
        .join(ExaminerGroup, ExaminerGroupMember.group_id == ExaminerGroup.id)
        .where(ExaminerGroup.examination_id == examination_id)
    )
    examiner_to_marking: dict[UUID, UUID] = {}
    for row in (await session.execute(stmt_m)).scalars().all():
        examiner_to_marking[row.examiner_id] = row.group_id

    return region_to_source, examiner_to_marking


async def load_allocation_or_none(session: AsyncSession, allocation_id: UUID) -> Allocation | None:
    stmt = (
        select(Allocation)
        .where(Allocation.id == allocation_id)
        .options(
            selectinload(Allocation.scripts_allocation_quotas),
        )
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def load_examiners_for_examination(session: AsyncSession, examination_id: int) -> list[Examiner]:
    stmt = (
        select(Examiner)
        .where(Examiner.examination_id == examination_id)
        .options(
            selectinload(Examiner.subjects),
            selectinload(Examiner.group_membership),
        )
        .order_by(Examiner.name)
    )
    return list((await session.execute(stmt)).scalars().all())


async def load_envelopes_for_allocation(
    session: AsyncSession,
    allocation: Allocation,
) -> list[tuple[ScriptEnvelope, ScriptPackingSeries, School]]:
    stmt = (
        select(ScriptEnvelope, ScriptPackingSeries, School)
        .join(ScriptPackingSeries, ScriptEnvelope.packing_series_id == ScriptPackingSeries.id)
        .join(School, ScriptPackingSeries.school_id == School.id)
        .where(ScriptPackingSeries.examination_id == allocation.examination_id)
        .order_by(
            ScriptPackingSeries.subject_id,
            ScriptPackingSeries.paper_number,
            ScriptPackingSeries.series_number,
            ScriptEnvelope.booklet_count.desc(),
            School.code,
            ScriptEnvelope.envelope_number,
        )
    )
    stmt = stmt.where(ScriptPackingSeries.subject_id == allocation.subject_id)
    stmt = stmt.where(ScriptPackingSeries.paper_number == allocation.paper_number)

    result = await session.execute(stmt)
    return list(result.all())


def build_eligible_pairs(
    envelopes: list[tuple[ScriptEnvelope, ScriptPackingSeries, School]],
    examiners: list[Examiner],
    *,
    region_to_source_group: dict[Region, UUID],
    examiner_to_marking_group: dict[UUID, UUID],
    cross_marking_rules: dict[UUID, set[UUID]],
    exclude_home_zone_or_region: bool = True,
) -> tuple[list[EligiblePair], dict[UUID, int]]:
    """Returns pairs and mapping envelope_id -> contiguous index 0..E-1.

    Examiners never receive envelopes whose script cohort equals their marking group (no marking own cohort),
    even if cross_marking_rules incorrectly lists that mapping.
    """
    env_ids = [row[0].id for row in envelopes]
    env_id_to_ix = {eid: i for i, eid in enumerate(env_ids)}
    examiners_list = list(examiners)
    pairs: list[EligiblePair] = []
    if not cross_marking_rules:
        return pairs, env_id_to_ix

    for env, series, school in envelopes:
        if env.booklet_count <= 0:
            continue
        source_group = region_to_source_group.get(school.region)
        if source_group is None:
            continue
        eix = env_id_to_ix[env.id]
        for j, ex in enumerate(examiners_list):
            sub_ids = {s.subject_id for s in ex.subjects}
            if series.subject_id not in sub_ids:
                continue
            marking_group = examiner_to_marking_group.get(ex.id)
            if marking_group is None:
                continue
            allowed_sources = cross_marking_rules.get(marking_group)
            if not allowed_sources or source_group not in allowed_sources:
                continue
            if marking_group == source_group:
                continue
            if exclude_home_zone_or_region and ex.region == school.region:
                continue
            pairs.append(
                EligiblePair(
                    envelope_id=env.id,
                    envelope_index=eix,
                    examiner_index=j,
                    examiner_id=ex.id,
                    subject_id=int(series.subject_id),
                    series_number=int(series.series_number),
                    booklet_count=int(env.booklet_count),
                    school_id=school.id,
                )
            )
    return pairs, env_id_to_ix


def ordered_marking_group_ids(
    campaign_groups: set[UUID],
    preferred_order: list[UUID] | None,
) -> list[UUID]:
    """Sequential cross-marking: process marking groups in `preferred_order` first; append remaining in UUID sort."""
    seen: set[UUID] = set()
    out: list[UUID] = []
    for g in preferred_order or []:
        if g in campaign_groups and g not in seen:
            out.append(g)
            seen.add(g)
    rest = sorted(campaign_groups - seen, key=lambda u: str(u))
    out.extend(rest)
    return out


def booklet_totals_by_series_from_pairs(pairs: list[EligiblePair]) -> dict[int, int]:
    """Sum booklet counts per series for distinct envelopes appearing in pairs."""
    seen_env: set[UUID] = set()
    totals: dict[int, int] = {}
    for p in pairs:
        if p.envelope_id in seen_env:
            continue
        seen_env.add(p.envelope_id)
        s = int(p.series_number)
        totals[s] = totals.get(s, 0) + int(p.booklet_count)
    return totals


def assign_examiners_to_series_by_booklet_ratio(
    examiners: list[Examiner],
    series_booklets: dict[int, int],
) -> dict[UUID, int]:
    """Map examiner_id -> series_number using largest-remainder on booklet shares (plan: ratio bucketing)."""
    positive = sorted((s, b) for s, b in series_booklets.items() if b > 0)
    if not examiners:
        return {}
    if not positive:
        return {}
    total_b = sum(b for _s, b in positive)
    if total_b <= 0:
        return {}
    series_ids = [s for s, _b in positive]
    weights = [b / total_b for _s, b in positive]
    n = len(examiners)
    raw = [n * w for w in weights]
    floors = [int(math.floor(x)) for x in raw]
    rem = n - sum(floors)
    order = sorted(
        range(len(weights)),
        key=lambda i: (-(raw[i] - floors[i]), -series_ids[i]),
    )
    counts = list(floors)
    for k in range(min(rem, len(order))):
        counts[order[k]] += 1
    sorted_ex = sorted(examiners, key=lambda e: str(e.id))
    out: dict[UUID, int] = {}
    cursor = 0
    for i, s in enumerate(series_ids):
        c = counts[i]
        for ex in sorted_ex[cursor : cursor + c]:
            out[ex.id] = s
        cursor += c
    if cursor < n:
        s_fallback = series_ids[int(max(range(len(series_ids)), key=lambda j: (weights[j], -series_ids[j])))]
        for ex in sorted_ex[cursor:]:
            out[ex.id] = s_fallback
    return out


def remap_pairs_for_subproblem(
    pairs: list[EligiblePair],
    sub_examiners: list[Examiner],
) -> tuple[list[EligiblePair], int]:
    """Local examiner indices 0..J-1 and envelope indices 0..E-1 for a subset MILP."""
    ex_id_to_local = {e.id: i for i, e in enumerate(sub_examiners)}
    env_booklets: dict[UUID, int] = {}
    for p in pairs:
        env_booklets[p.envelope_id] = max(env_booklets.get(p.envelope_id, 0), int(p.booklet_count))
    env_ids = sorted(env_booklets, key=lambda u: (-env_booklets[u], str(u)))
    env_id_to_local = {eid: i for i, eid in enumerate(env_ids)}
    new_pairs: list[EligiblePair] = []
    for p in pairs:
        li = ex_id_to_local.get(p.examiner_id)
        ei = env_id_to_local.get(p.envelope_id)
        if li is None or ei is None:
            continue
        new_pairs.append(
            EligiblePair(
                envelope_id=p.envelope_id,
                envelope_index=ei,
                examiner_index=li,
                examiner_id=p.examiner_id,
                subject_id=p.subject_id,
                series_number=p.series_number,
                booklet_count=p.booklet_count,
                school_id=p.school_id,
            )
        )
    return new_pairs, len(env_ids)


def slack_targets_for_examiner_list(
    examiners: list[Examiner],
    quota_by_type_subject: dict[tuple[ExaminerType, int], int],
) -> list[SlackTarget]:
    slack_targets: list[SlackTarget] = []
    for j, ex in enumerate(examiners):
        w = deviation_weight_for_examiner(ex)
        sub_ids = {int(s.subject_id) for s in ex.subjects}
        for sid in sorted(sub_ids):
            key = (ex.examiner_type, sid)
            if key not in quota_by_type_subject:
                continue
            slack_targets.append(
                SlackTarget(
                    examiner_index=j,
                    subject_id=sid,
                    quota=int(quota_by_type_subject[key]),
                    weight=w,
                )
            )
    return slack_targets


def _decomposed_subgroup_time_limit_sec(
    *,
    pair_count: int,
    time_budget_remaining: float,
    subgroups_finished_before: int,
    n_planned: int,
) -> float:
    """Seconds to pass to HiGHS for one subgroup MILP.

    Large subproblems (many binary pair variables) need more than an even split of the total wall budget.
    """
    k_rem = max(1, n_planned - subgroups_finished_before)
    share = float(time_budget_remaining) / k_rem
    # Heuristic: ~0.022 s per pair row (tunable); cap so one stage cannot claim unbounded wall time.
    size_floor = max(25.0, min(900.0, float(pair_count) * 0.022))
    per = min(float(time_budget_remaining), max(15.0, size_floor, share))
    return max(5.0, per)


def _estimate_decomposed_subgroup_count(
    rows: list[tuple[ScriptEnvelope, ScriptPackingSeries, School]],
    examiners: list[Examiner],
    *,
    region_to_source: dict[Region, UUID],
    examiner_to_marking: dict[UUID, UUID],
    cross_parsed: dict[UUID, set[UUID]],
    ordered_groups: list[UUID],
    exclude_home_zone_or_region: bool,
) -> int:
    """Upper-bound count of non-empty (marking group, series) MILPs using full pool (ignores sequential removal)."""
    n = 0
    for gid in ordered_groups:
        ex_g = [e for e in examiners if examiner_to_marking.get(e.id) == gid]
        if not ex_g:
            continue
        pairs, _ = build_eligible_pairs(
            rows,
            ex_g,
            region_to_source_group=region_to_source,
            examiner_to_marking_group=examiner_to_marking,
            cross_marking_rules=cross_parsed,
            exclude_home_zone_or_region=exclude_home_zone_or_region,
        )
        if not pairs:
            continue
        by_ser = booklet_totals_by_series_from_pairs(pairs)
        buckets = assign_examiners_to_series_by_booklet_ratio(ex_g, by_ser)
        for s in sorted(set(buckets.values())):
            sub_ex = [e for e in ex_g if buckets.get(e.id) == s]
            sub_ids = {e.id for e in sub_ex}
            pp = [p for p in pairs if int(p.series_number) == s and p.examiner_id in sub_ids]
            if pp:
                n += 1
    return max(1, n)


def _subgroup_status_from_milp(
    milp_ok: bool,
    message: str | None,
    status_code: int,
    *,
    proven_optimal: bool = True,
) -> AllocationSubgroupStatusSchema:
    if milp_ok:
        if not proven_optimal:
            return AllocationSubgroupStatusSchema.stopped_feasible
        return AllocationSubgroupStatusSchema.optimal
    if message and "time" in message.lower():
        return AllocationSubgroupStatusSchema.timeout
    if status_code == -1:
        return AllocationSubgroupStatusSchema.error
    return AllocationSubgroupStatusSchema.infeasible


def _run_status_for_failure(message: str | None, status_code: int) -> AllocationRunStatus:
    if status_code == -1:
        return AllocationRunStatus.ERROR
    if message and "time" in message.lower():
        return AllocationRunStatus.TIMEOUT
    return AllocationRunStatus.INFEASIBLE


def _rebalance_envelope_meta(
    rows: list[tuple[ScriptEnvelope, ScriptPackingSeries, School]],
) -> dict[UUID, dict[str, object]]:
    meta: dict[UUID, dict[str, object]] = {}
    for env, series, school in rows:
        meta[env.id] = {
            "booklet_count": int(env.booklet_count),
            "subject_id": int(series.subject_id),
            "series_number": int(series.series_number),
            "school_id": school.id,
            "school_code": school.code,
            "envelope_number": int(env.envelope_number),
        }
    return meta


def apply_post_solve_rebalance(
    *,
    pair_assignments: list[EligiblePair],
    all_eligible_pairs: list[EligiblePair],
    envelope_meta: dict[UUID, dict[str, object]],
    examiner_type_by_id: dict[UUID, ExaminerType],
    quota_by_type_subject: dict[tuple[ExaminerType, int], int],
    tolerance_booklets: int,
) -> tuple[list[EligiblePair], dict[str, object]]:
    """Greedy post-pass: trim over-quota assignments and reassign to eligible under-quota examiners."""
    tolerance = max(0, int(tolerance_booklets))
    if not pair_assignments:
        return pair_assignments, {
            "post_rebalance_enabled": True,
            "post_rebalance_tolerance_booklets": tolerance,
            "post_rebalance_removed_count": 0,
            "post_rebalance_reassigned_count": 0,
            "post_rebalance_removed_booklets": 0,
            "post_rebalance_examiner_adjustments": {},
        }

    assignments_by_env: dict[UUID, EligiblePair] = {p.envelope_id: p for p in pair_assignments}
    eligible_by_env: dict[UUID, set[UUID]] = {}
    examiner_index_by_id: dict[UUID, int] = {}
    for p in all_eligible_pairs:
        eligible_by_env.setdefault(p.envelope_id, set()).add(p.examiner_id)
        examiner_index_by_id[p.examiner_id] = int(p.examiner_index)

    assigned_booklets: dict[tuple[UUID, int], int] = {}
    assigned_envs_by_examiner: dict[UUID, set[UUID]] = {}
    for p in assignments_by_env.values():
        key = (p.examiner_id, int(p.subject_id))
        assigned_booklets[key] = assigned_booklets.get(key, 0) + int(p.booklet_count)
        assigned_envs_by_examiner.setdefault(p.examiner_id, set()).add(p.envelope_id)

    def _quota(examiner_id: UUID, subject_id: int) -> int | None:
        ex_type = examiner_type_by_id.get(examiner_id)
        if ex_type is None:
            return None
        return quota_by_type_subject.get((ex_type, int(subject_id)))

    adjustments: dict[UUID, dict[str, int]] = {}
    removed_count = 0
    reassigned_count = 0
    removed_booklets = 0

    def _adj(eid: UUID) -> dict[str, int]:
        return adjustments.setdefault(eid, {"removed_booklets": 0, "reassigned_in_booklets": 0})

    over_keys: list[tuple[UUID, int, int]] = []
    for (eid, sid), assigned in assigned_booklets.items():
        q = _quota(eid, sid)
        if q is None:
            continue
        excess = int(assigned) - int(q)
        if excess > tolerance:
            over_keys.append((eid, sid, excess))
    over_keys.sort(key=lambda x: (-x[2], str(x[0]), x[1]))

    for examiner_id, subject_id, _ in over_keys:
        while True:
            key = (examiner_id, int(subject_id))
            assigned = int(assigned_booklets.get(key, 0))
            q = _quota(examiner_id, int(subject_id))
            if q is None or assigned <= int(q) + tolerance:
                break

            env_candidates = [
                env_id
                for env_id in sorted(assigned_envs_by_examiner.get(examiner_id, set()), key=lambda u: str(u))
                if int(assignments_by_env[env_id].subject_id) == int(subject_id)
            ]
            if not env_candidates:
                break

            ranked_removals: list[tuple[int, int, str, int, str, UUID]] = []
            envs_for_examiner = assigned_envs_by_examiner.get(examiner_id, set())
            for env_id in env_candidates:
                p = assignments_by_env[env_id]
                m = envelope_meta.get(env_id, {})
                remaining_schools = {
                    envelope_meta[eid]["school_id"]
                    for eid in envs_for_examiner
                    if eid != env_id and eid in envelope_meta
                }
                ranked_removals.append(
                    (
                        int(p.booklet_count),
                        int(len(remaining_schools)),
                        str(m.get("school_code", "")),
                        int(m.get("envelope_number", 0)),
                        str(env_id),
                        env_id,
                    )
                )
            ranked_removals.sort()
            env_to_remove = ranked_removals[0][-1]
            removed_pair = assignments_by_env.pop(env_to_remove)
            assigned_envs_by_examiner.setdefault(examiner_id, set()).discard(env_to_remove)
            assigned_booklets[key] = int(assigned_booklets.get(key, 0)) - int(removed_pair.booklet_count)

            removed_count += 1
            removed_booklets += int(removed_pair.booklet_count)
            _adj(examiner_id)["removed_booklets"] += int(removed_pair.booklet_count)

            m = envelope_meta.get(env_to_remove, {})
            school_id = m.get("school_id")
            recipient_candidates: list[tuple[int, int, str, UUID]] = []
            for cand in sorted(eligible_by_env.get(env_to_remove, set()), key=lambda u: str(u)):
                if cand == examiner_id:
                    continue
                cand_quota = _quota(cand, int(subject_id))
                if cand_quota is None:
                    continue
                cand_key = (cand, int(subject_id))
                cand_assigned = int(assigned_booklets.get(cand_key, 0))
                if cand_assigned >= int(cand_quota) - tolerance:
                    continue
                if cand_assigned + int(removed_pair.booklet_count) > int(cand_quota) + tolerance:
                    continue
                cand_envs = assigned_envs_by_examiner.get(cand, set())
                same_school = 0
                if school_id is not None and any(envelope_meta.get(eid, {}).get("school_id") == school_id for eid in cand_envs):
                    same_school = 1
                gap = int(cand_quota) - cand_assigned
                recipient_candidates.append((-gap, -same_school, str(cand), cand))
            recipient_candidates.sort()
            if recipient_candidates:
                new_examiner_id = recipient_candidates[0][-1]
                new_pair = EligiblePair(
                    envelope_id=removed_pair.envelope_id,
                    envelope_index=removed_pair.envelope_index,
                    examiner_index=examiner_index_by_id.get(new_examiner_id, removed_pair.examiner_index),
                    examiner_id=new_examiner_id,
                    subject_id=removed_pair.subject_id,
                    series_number=removed_pair.series_number,
                    booklet_count=removed_pair.booklet_count,
                    school_id=removed_pair.school_id,
                )
                assignments_by_env[env_to_remove] = new_pair
                assigned_envs_by_examiner.setdefault(new_examiner_id, set()).add(env_to_remove)
                new_key = (new_examiner_id, int(subject_id))
                assigned_booklets[new_key] = int(assigned_booklets.get(new_key, 0)) + int(removed_pair.booklet_count)
                reassigned_count += 1
                _adj(new_examiner_id)["reassigned_in_booklets"] += int(removed_pair.booklet_count)

    final_assignments = sorted(assignments_by_env.values(), key=lambda p: str(p.envelope_id))
    clean_adjustments = {str(k): v for k, v in adjustments.items() if any(int(x) != 0 for x in v.values())}
    stats = {
        "post_rebalance_enabled": True,
        "post_rebalance_tolerance_booklets": tolerance,
        "post_rebalance_removed_count": removed_count,
        "post_rebalance_reassigned_count": reassigned_count,
        "post_rebalance_removed_booklets": removed_booklets,
        "post_rebalance_examiner_adjustments": clean_adjustments,
    }
    return final_assignments, stats


def parse_marking_group_solve_order(raw: list[str] | None) -> list[UUID]:
    out: list[UUID] = []
    for s in raw or []:
        try:
            out.append(UUID(str(s).strip()))
        except ValueError:
            continue
    return out


async def run_decomposed_allocation_solve(
    session: AsyncSession,
    allocation: Allocation,
    *,
    created_by_id: UUID | None,
    rows: list[tuple[ScriptEnvelope, ScriptPackingSeries, School]],
    examiners: list[Examiner],
    region_to_source: dict[Region, UUID],
    examiner_to_marking: dict[UUID, UUID],
    cross_parsed: dict[UUID, set[UUID]],
    quota_by_type_subject: dict[tuple[ExaminerType, int], int],
    unassigned_penalty: float,
    time_limit_sec: float,
    fairness_weight: float,
    school_cohesion_weight: float,
    prefer_larger_booklets_epsilon: float,
    enable_post_rebalance: bool,
    rebalance_tolerance_booklets: int,
    exclude_home_zone_or_region: bool,
    marking_group_solve_order: list[str] | None,
) -> AllocationRun:
    """Decomposed allocation (see plan).

    **Cross-marking policy:** Marking groups run **sequentially** in `marking_group_solve_order` (then sorted UUID).
    After each group finishes all its series MILPs, assigned envelopes are removed from the pool so later groups
    cannot claim the same physical envelope (avoids double assignment when multiple groups share cohort rules).
    Within a group, examiners are split into **series buckets** by largest-remainder on booklet counts in the
    current pool; each (group, series) runs an independent MILP on reindexed examiners and envelopes.
    """
    campaign_groups = {examiner_to_marking[e.id] for e in examiners}
    preferred = parse_marking_group_solve_order(marking_group_solve_order)
    ordered_groups = ordered_marking_group_ids(campaign_groups, preferred)

    n_est = _estimate_decomposed_subgroup_count(
        rows,
        examiners,
        region_to_source=region_to_source,
        examiner_to_marking=examiner_to_marking,
        cross_parsed=cross_parsed,
        ordered_groups=ordered_groups,
        exclude_home_zone_or_region=exclude_home_zone_or_region,
    )

    time_budget = float(time_limit_sec)
    subgroups_milp_finished = 0

    assigned_global: set[UUID] = set()
    subgroup_stats: list[dict[str, object]] = []
    pair_assignments_all: list[EligiblePair] = []
    objective_sum = 0.0
    pair_assignments_rebalanced: list[EligiblePair] = []
    rebalance_stats: dict[str, object] | None = None

    for gid in ordered_groups:
        rem_rows = [row for row in rows if row[0].id not in assigned_global]
        ex_g = [e for e in examiners if examiner_to_marking.get(e.id) == gid]
        if not ex_g:
            continue
        pairs_g, _ = build_eligible_pairs(
            rem_rows,
            ex_g,
            region_to_source_group=region_to_source,
            examiner_to_marking_group=examiner_to_marking,
            cross_marking_rules=cross_parsed,
            exclude_home_zone_or_region=exclude_home_zone_or_region,
        )
        if not pairs_g:
            subgroup_stats.append(
                {
                    "marking_group_id": str(gid),
                    "series_number": 0,
                    "status": AllocationSubgroupStatusSchema.skipped_empty.value,
                    "examiner_count": len(ex_g),
                    "envelope_count": 0,
                    "eligible_pair_count": 0,
                    "objective_value": None,
                    "message": "No eligible pairs for this marking group at this stage",
                }
            )
            continue

        by_ser = booklet_totals_by_series_from_pairs(pairs_g)
        buckets = assign_examiners_to_series_by_booklet_ratio(ex_g, by_ser)
        series_order = sorted(set(buckets.values()))

        for s in series_order:
            sub_ex = [e for e in ex_g if buckets.get(e.id) == s]
            if not sub_ex:
                continue
            sub_ids = {e.id for e in sub_ex}
            pp = [p for p in pairs_g if int(p.series_number) == s and p.examiner_id in sub_ids]
            if not pp:
                subgroup_stats.append(
                    {
                        "marking_group_id": str(gid),
                        "series_number": int(s),
                        "status": AllocationSubgroupStatusSchema.skipped_empty.value,
                        "examiner_count": len(sub_ex),
                        "envelope_count": 0,
                        "eligible_pair_count": 0,
                        "objective_value": None,
                        "message": "No eligible pairs for this series bucket",
                    }
                )
                continue

            remapped, num_env = remap_pairs_for_subproblem(pp, sub_ex)
            slack = slack_targets_for_examiner_list(sub_ex, quota_by_type_subject)
            per_this = _decomposed_subgroup_time_limit_sec(
                pair_count=len(remapped),
                time_budget_remaining=time_budget,
                subgroups_finished_before=subgroups_milp_finished,
                n_planned=n_est,
            )
            t_solve_start = time.perf_counter()
            milp_out = solve_script_allocation_milp(
                pairs=remapped,
                slack_targets=slack,
                num_envelopes=num_env,
                num_examiners=len(sub_ex),
                unassigned_penalty=unassigned_penalty,
                time_limit_sec=per_this,
                fairness_weight=fairness_weight,
                enforce_single_series_per_examiner=False,
                school_cohesion_weight=school_cohesion_weight,
                prefer_larger_booklets_epsilon=prefer_larger_booklets_epsilon,
            )
            time_budget -= time.perf_counter() - t_solve_start
            if time_budget < 0.0:
                time_budget = 0.0
            subgroups_milp_finished += 1

            st = _subgroup_status_from_milp(
                milp_out.success,
                milp_out.message,
                milp_out.status_code,
                proven_optimal=milp_out.proven_optimal,
            )
            subgroup_stats.append(
                {
                    "marking_group_id": str(gid),
                    "series_number": int(s),
                    "status": st.value,
                    "examiner_count": len(sub_ex),
                    "envelope_count": num_env,
                    "eligible_pair_count": len(remapped),
                    "objective_value": milp_out.objective,
                    "message": (milp_out.message or "")[:2000] or None,
                    "time_limit_allocated_sec": round(per_this, 3),
                }
            )

            if not milp_out.success:
                run = AllocationRun(
                    allocation_id=allocation.id,
                    status=_run_status_for_failure(milp_out.message, milp_out.status_code),
                    objective_value=milp_out.objective,
                    solver_message=(milp_out.message or "")[:4000] or None,
                    created_by_id=created_by_id,
                    solver_stats={
                        "solve_mode": AllocationSolveModeSchema.decomposed.value,
                        "subgroups": subgroup_stats,
                        "milp_status": milp_out.status_code,
                    },
                )
                session.add(run)
                await session.flush()
                return run

            for p in milp_out.pair_assignments:
                assigned_global.add(p.envelope_id)
                pair_assignments_all.append(p)
            if milp_out.objective is not None:
                objective_sum += float(milp_out.objective)

    if enable_post_rebalance:
        all_eligible_pairs, _ = build_eligible_pairs(
            rows,
            examiners,
            region_to_source_group=region_to_source,
            examiner_to_marking_group=examiner_to_marking,
            cross_marking_rules=cross_parsed,
            exclude_home_zone_or_region=exclude_home_zone_or_region,
        )
        examiner_type_by_id = {ex.id: ex.examiner_type for ex in examiners}
        pair_assignments_rebalanced, rebalance_stats = apply_post_solve_rebalance(
            pair_assignments=pair_assignments_all,
            all_eligible_pairs=all_eligible_pairs,
            envelope_meta=_rebalance_envelope_meta(rows),
            examiner_type_by_id=examiner_type_by_id,
            quota_by_type_subject=quota_by_type_subject,
            tolerance_booklets=rebalance_tolerance_booklets,
        )
        pair_assignments_all = pair_assignments_rebalanced
        assigned_global = {p.envelope_id for p in pair_assignments_all}
    unassigned = [env.id for env, _s, _sch in rows if env.id not in assigned_global and env.booklet_count > 0]

    run = AllocationRun(
        allocation_id=allocation.id,
        status=AllocationRunStatus.OPTIMAL,
        objective_value=objective_sum,
        solver_message=None,
        created_by_id=created_by_id,
        solver_stats={
            "solve_mode": AllocationSolveModeSchema.decomposed.value,
            "subgroups": subgroup_stats,
            "eligible_pairs": sum(int(sg.get("eligible_pair_count") or 0) for sg in subgroup_stats),
            "envelopes": len(rows),
            "examiners": len(examiners),
            "unassigned_count": len(unassigned),
            "decomposed_planned_subgroups": n_est,
            "decomposed_wall_budget_sec": float(time_limit_sec),
            **(rebalance_stats or {"post_rebalance_enabled": False}),
        },
    )
    session.add(run)
    await session.flush()

    env_by_id = {env.id: env for env, _s, _sch in rows}
    for p in pair_assignments_all:
        env = env_by_id[p.envelope_id]
        session.add(
            AllocationAssignment(
                allocation_run_id=run.id,
                script_envelope_id=p.envelope_id,
                examiner_id=p.examiner_id,
                booklet_count=int(env.booklet_count),
            )
        )
    await session.flush()
    return run


async def run_allocation_solve(
    session: AsyncSession,
    allocation: Allocation,
    *,
    created_by_id: UUID | None,
    unassigned_penalty: float,
    time_limit_sec: float,
    allocation_scope: str = "zone",
    fairness_weight: float = 0.25,
    school_cohesion_weight: float = 0.0,
    prefer_larger_booklets_epsilon: float = 0.0,
    enable_post_rebalance: bool = False,
    rebalance_tolerance_booklets: int = 20,
    enforce_single_series_per_examiner: bool = True,
    cross_marking_rules: dict[str, list[str]] | None = None,
    exclude_home_zone_or_region: bool = True,
    solve_mode: str = "monolithic",
    marking_group_solve_order: list[str] | None = None,
) -> AllocationRun:
    _ = allocation_scope  # deprecated; kept for API compatibility with AllocationSolveOptions.
    await session.execute(delete(AllocationRun).where(AllocationRun.allocation_id == allocation.id))
    await session.flush()

    member_stmt = select(AllocationExaminer.examiner_id).where(AllocationExaminer.allocation_id == allocation.id)
    member_ids = list((await session.execute(member_stmt)).scalars().all())
    if not member_ids:
        run = AllocationRun(
            allocation_id=allocation.id,
            status=AllocationRunStatus.ERROR,
            objective_value=None,
            solver_message="No examiners selected for this allocation",
            created_by_id=created_by_id,
            solver_stats=None,
        )
        session.add(run)
        await session.flush()
        return run

    all_examiners = await load_examiners_for_examination(session, allocation.examination_id)
    examiners = [ex for ex in all_examiners if ex.id in set(member_ids)]
    if not examiners:
        run = AllocationRun(
            allocation_id=allocation.id,
            status=AllocationRunStatus.ERROR,
            objective_value=None,
            solver_message="No examiners configured for this examination",
            created_by_id=created_by_id,
            solver_stats=None,
        )
        session.add(run)
        await session.flush()
        return run

    rows = await load_envelopes_for_allocation(session, allocation)
    if not rows:
        run = AllocationRun(
            allocation_id=allocation.id,
            status=AllocationRunStatus.ERROR,
            objective_value=None,
            solver_message="No script envelopes match this allocation filters",
            created_by_id=created_by_id,
            solver_stats=None,
        )
        session.add(run)
        await session.flush()
        return run

    rules_raw: dict[str, list[str]] = dict(getattr(allocation, "cross_marking_rules", None) or {})
    if cross_marking_rules is not None:
        rules_raw = dict(cross_marking_rules)
    cross_parsed = parse_group_cross_marking_rules(rules_raw)
    if not cross_parsed:
        if not rules_raw:
            msg = (
                "cross_marking_rules is empty. Open Configure allocation, add at least one row mapping a marking group "
                "to allowed script cohort groups, click Save solver settings, then run the solve again."
            )
        else:
            msg = (
                "cross_marking_rules could not be read: each key must be a marking group UUID and each value must list "
                "script cohort group UUIDs (legacy region/zone keys are not supported). Re-save rules from the admin UI."
            )
        run = AllocationRun(
            allocation_id=allocation.id,
            status=AllocationRunStatus.ERROR,
            objective_value=None,
            solver_message=msg,
            created_by_id=created_by_id,
            solver_stats=None,
        )
        session.add(run)
        await session.flush()
        return run

    region_to_source, examiner_to_marking = await load_examiner_group_marking_maps(
        session,
        allocation.examination_id,
    )
    ungrouped = [ex for ex in examiners if ex.id not in examiner_to_marking]
    if ungrouped:
        names = ", ".join(ex.name for ex in ungrouped[:10])
        suffix = "…" if len(ungrouped) > 10 else ""
        run = AllocationRun(
            allocation_id=allocation.id,
            status=AllocationRunStatus.ERROR,
            objective_value=None,
            solver_message=f"Every selected examiner must belong to an examiner group (not in a group: {names}{suffix})",
            created_by_id=created_by_id,
            solver_stats={"ungrouped_count": len(ungrouped)},
        )
        session.add(run)
        await session.flush()
        return run

    pairs, _env_map = build_eligible_pairs(
        rows,
        examiners,
        region_to_source_group=region_to_source,
        examiner_to_marking_group=examiner_to_marking,
        cross_marking_rules=cross_parsed,
        exclude_home_zone_or_region=exclude_home_zone_or_region,
    )
    if not pairs:
        run = AllocationRun(
            allocation_id=allocation.id,
            status=AllocationRunStatus.ERROR,
            objective_value=None,
            solver_message=(
                "No eligible examiner–envelope pairs (check subjects, cross_marking_rules, and that rules map cohorts to "
                "*other* cohorts—examiners never mark their own cohort's scripts; optional exclude-home-region also applies)"
            ),
            created_by_id=created_by_id,
            solver_stats={"envelopes": len(rows), "examiners": len(examiners)},
        )
        session.add(run)
        await session.flush()
        return run

    quota_by_type_subject: dict[tuple[ExaminerType, int], int] = {}
    for row in allocation.scripts_allocation_quotas:
        quota_by_type_subject[(row.examiner_type, int(row.subject_id))] = int(row.quota_booklets)

    mode = str(solve_mode).strip().lower()
    if mode == AllocationSolveModeSchema.decomposed.value:
        return await run_decomposed_allocation_solve(
            session,
            allocation,
            created_by_id=created_by_id,
            rows=rows,
            examiners=examiners,
            region_to_source=region_to_source,
            examiner_to_marking=examiner_to_marking,
            cross_parsed=cross_parsed,
            quota_by_type_subject=quota_by_type_subject,
            unassigned_penalty=unassigned_penalty,
            time_limit_sec=time_limit_sec,
            fairness_weight=fairness_weight,
            school_cohesion_weight=school_cohesion_weight,
            prefer_larger_booklets_epsilon=prefer_larger_booklets_epsilon,
            enable_post_rebalance=enable_post_rebalance,
            rebalance_tolerance_booklets=rebalance_tolerance_booklets,
            exclude_home_zone_or_region=exclude_home_zone_or_region,
            marking_group_solve_order=marking_group_solve_order,
        )

    slack_targets: list[SlackTarget] = []
    for j, ex in enumerate(examiners):
        w = deviation_weight_for_examiner(ex)
        sub_ids = {int(s.subject_id) for s in ex.subjects}
        for sid in sorted(sub_ids):
            key = (ex.examiner_type, sid)
            if key not in quota_by_type_subject:
                continue
            slack_targets.append(
                SlackTarget(
                    examiner_index=j,
                    subject_id=sid,
                    quota=int(quota_by_type_subject[key]),
                    weight=w,
                )
            )

    num_envelopes = len(rows)

    milp_out = solve_script_allocation_milp(
        pairs=pairs,
        slack_targets=slack_targets,
        num_envelopes=num_envelopes,
        num_examiners=len(examiners),
        unassigned_penalty=unassigned_penalty,
        time_limit_sec=time_limit_sec,
        fairness_weight=fairness_weight,
        enforce_single_series_per_examiner=enforce_single_series_per_examiner,
        school_cohesion_weight=school_cohesion_weight,
        prefer_larger_booklets_epsilon=prefer_larger_booklets_epsilon,
    )

    if not milp_out.success:
        run = AllocationRun(
            allocation_id=allocation.id,
            status=_run_status_for_failure(milp_out.message, milp_out.status_code),
            objective_value=milp_out.objective,
            solver_message=(milp_out.message or "")[:4000] or None,
            created_by_id=created_by_id,
            solver_stats={
                "solve_mode": AllocationSolveModeSchema.monolithic.value,
                "milp_status": milp_out.status_code,
            },
        )
        session.add(run)
        await session.flush()
        return run

    final_pair_assignments = milp_out.pair_assignments
    rebalance_stats: dict[str, object] | None = None
    if enable_post_rebalance:
        examiner_type_by_id = {ex.id: ex.examiner_type for ex in examiners}
        final_pair_assignments, rebalance_stats = apply_post_solve_rebalance(
            pair_assignments=milp_out.pair_assignments,
            all_eligible_pairs=pairs,
            envelope_meta=_rebalance_envelope_meta(rows),
            examiner_type_by_id=examiner_type_by_id,
            quota_by_type_subject=quota_by_type_subject,
            tolerance_booklets=rebalance_tolerance_booklets,
        )
    assigned_env: set[UUID] = {p.envelope_id for p in final_pair_assignments}
    unassigned = [env.id for env, _s, _sch in rows if env.id not in assigned_env and env.booklet_count > 0]

    run = AllocationRun(
        allocation_id=allocation.id,
        status=AllocationRunStatus.OPTIMAL,
        objective_value=milp_out.objective,
        solver_message=(milp_out.message or "")[:4000] or None,
        created_by_id=created_by_id,
        solver_stats={
            "solve_mode": AllocationSolveModeSchema.monolithic.value,
            "milp_status": milp_out.status_code,
            "eligible_pairs": len(pairs),
            "envelopes": num_envelopes,
            "examiners": len(examiners),
            "unassigned_count": len(unassigned),
            **(rebalance_stats or {"post_rebalance_enabled": False}),
        },
    )
    session.add(run)
    await session.flush()

    env_by_id = {env.id: env for env, _s, _sch in rows}
    for p in final_pair_assignments:
        env = env_by_id[p.envelope_id]
        session.add(
            AllocationAssignment(
                allocation_run_id=run.id,
                script_envelope_id=p.envelope_id,
                examiner_id=p.examiner_id,
                booklet_count=int(env.booklet_count),
            )
        )
    await session.flush()
    return run


async def sync_examiner_subjects(
    session: AsyncSession,
    examiner: Examiner,
    subject_ids: list[int],
) -> None:
    # Avoid relationship .clear() — it can lazy-load / emit IO in a sync context under AsyncSession.
    await session.execute(delete(ExaminerSubject).where(ExaminerSubject.examiner_id == examiner.id))
    await session.flush()
    for sid in subject_ids:
        session.add(ExaminerSubject(examiner_id=examiner.id, subject_id=sid))


async def sync_examiner_zones(session: AsyncSession, examiner: Examiner, zones: list[Zone]) -> None:
    """No-op: per-examiner allowed zones were removed; use examiner groups + cross_marking_rules."""
    del session, examiner, zones


async def load_run_with_assignments(session: AsyncSession, run_id: UUID) -> AllocationRun | None:
    stmt = (
        select(AllocationRun)
        .where(AllocationRun.id == run_id)
        .options(
            selectinload(AllocationRun.assignments),
        )
    )
    return (await session.execute(stmt)).scalar_one_or_none()


class ManualAssignmentError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


async def upsert_manual_assignment(
    session: AsyncSession,
    run_id: UUID,
    script_envelope_id: UUID,
    examiner_id: UUID,
) -> None:
    """Create or replace assignment for one envelope on a run. Caller commits."""
    run = await load_run_with_assignments(session, run_id)
    if run is None:
        raise ManualAssignmentError(404, "Run not found")
    allocation = await load_allocation_or_none(session, run.allocation_id)
    if allocation is None:
        raise ManualAssignmentError(404, "Allocation not found")

    env_row: ScriptEnvelope | None = None
    school_row: School | None = None
    for env, _series, school in await load_envelopes_for_allocation(session, allocation):
        if env.id == script_envelope_id:
            env_row = env
            school_row = school
            break
    if env_row is None:
        raise ManualAssignmentError(404, "Script envelope not in this allocation pool")
    if int(env_row.booklet_count) <= 0:
        raise ManualAssignmentError(400, "Cannot assign an empty envelope")

    member = await session.get(AllocationExaminer, (allocation.id, examiner_id))
    if member is None:
        raise ManualAssignmentError(400, "Examiner is not in this allocation campaign")

    stmt_ex = (
        select(Examiner)
        .where(Examiner.id == examiner_id)
        .options(selectinload(Examiner.subjects))
    )
    examiner = (await session.execute(stmt_ex)).scalar_one_or_none()
    if examiner is None:
        raise ManualAssignmentError(404, "Examiner not found")
    subject_ids = {int(s.subject_id) for s in examiner.subjects}
    if int(allocation.subject_id) not in subject_ids:
        raise ManualAssignmentError(400, "Examiner is not eligible for this allocation subject")

    region_to_source, examiner_to_marking = await load_examiner_group_marking_maps(
        session,
        int(allocation.examination_id),
    )
    if school_row is not None:
        source_group = region_to_source.get(school_row.region)
        marking_group = examiner_to_marking.get(examiner_id)
        if (
            source_group is not None
            and marking_group is not None
            and source_group == marking_group
        ):
            raise ManualAssignmentError(
                400,
                "Cannot assign scripts from an examiner's own cohort (marking group equals script source group).",
            )

    stmt_a = select(AllocationAssignment).where(
        AllocationAssignment.allocation_run_id == run_id,
        AllocationAssignment.script_envelope_id == script_envelope_id,
    )
    existing = (await session.execute(stmt_a)).scalar_one_or_none()
    bc = int(env_row.booklet_count)
    if existing is None:
        session.add(
            AllocationAssignment(
                allocation_run_id=run_id,
                script_envelope_id=script_envelope_id,
                examiner_id=examiner_id,
                booklet_count=bc,
            )
        )
    else:
        existing.examiner_id = examiner_id
        existing.booklet_count = bc
    await session.flush()


async def delete_manual_assignment(
    session: AsyncSession,
    run_id: UUID,
    script_envelope_id: UUID,
) -> None:
    """Remove assignment for envelope on run. Caller commits."""
    run = await session.get(AllocationRun, run_id)
    if run is None:
        raise ManualAssignmentError(404, "Run not found")
    result = await session.execute(
        delete(AllocationAssignment).where(
            AllocationAssignment.allocation_run_id == run_id,
            AllocationAssignment.script_envelope_id == script_envelope_id,
        )
    )
    if result.rowcount == 0:
        raise ManualAssignmentError(404, "Assignment not found")
    await session.flush()


async def build_run_response(session: AsyncSession, run: AllocationRun) -> dict:
    """Serializable dict for AllocationRunResponse."""
    allocation = await session.get(
        Allocation,
        run.allocation_id,
        options=[
            selectinload(Allocation.scripts_allocation_quotas),
        ],
    )
    examiners_by_id: dict[UUID, Examiner] = {}
    quota_by_type_subject: dict[tuple[ExaminerType, int], int] = {}
    if allocation:
        member_stmt = select(AllocationExaminer.examiner_id).where(
            AllocationExaminer.allocation_id == allocation.id
        )
        selected_ids = set((await session.execute(member_stmt)).scalars().all())
        examiners_list = await load_examiners_for_examination(session, allocation.examination_id)
        examiners_list = [e for e in examiners_list if e.id in selected_ids]
        examiners_by_id = {e.id: e for e in examiners_list}
        for qrow in allocation.scripts_allocation_quotas:
            quota_by_type_subject[(qrow.examiner_type, int(qrow.subject_id))] = int(qrow.quota_booklets)

    stmt = (
        select(
            AllocationAssignment,
            ScriptEnvelope,
            ScriptPackingSeries,
            School,
            Subject,
        )
        .join(ScriptEnvelope, AllocationAssignment.script_envelope_id == ScriptEnvelope.id)
        .join(ScriptPackingSeries, ScriptEnvelope.packing_series_id == ScriptPackingSeries.id)
        .join(School, ScriptPackingSeries.school_id == School.id)
        .join(Subject, ScriptPackingSeries.subject_id == Subject.id)
        .where(AllocationAssignment.allocation_run_id == run.id)
    )
    result = await session.execute(stmt)
    assignment_items: list[AllocationAssignmentItem] = []
    assigned_by_ex_subject: dict[tuple[UUID, int], int] = {}
    for row in result.all():
        aa, env, series, school, subj = row
        key = (aa.examiner_id, int(subj.id))
        assigned_by_ex_subject[key] = assigned_by_ex_subject.get(key, 0) + int(aa.booklet_count)
        assignment_items.append(
            AllocationAssignmentItem(
                script_envelope_id=aa.script_envelope_id,
                examiner_id=aa.examiner_id,
                booklet_count=int(aa.booklet_count),
                school_code=school.code,
                school_name=school.name,
                zone=school.zone.value,
                subject_id=subj.id,
                subject_code=subj.code,
                subject_name=subj.name,
                paper_number=int(series.paper_number),
                series_number=int(series.series_number),
                envelope_number=int(env.envelope_number),
            )
        )

    unassigned_ids: list[UUID] = []
    unassigned_items: list[UnassignedEnvelopeItem] = []
    if allocation:
        rows = await load_envelopes_for_allocation(session, allocation)
        assigned_env_ids = {a.script_envelope_id for a in run.assignments}
        unassigned_triples: list[tuple[ScriptEnvelope, ScriptPackingSeries, School]] = []
        for env, series, school in rows:
            if env.booklet_count <= 0 or env.id in assigned_env_ids:
                continue
            unassigned_ids.append(env.id)
            unassigned_triples.append((env, series, school))
        subj_ids = {int(s.subject_id) for _e, s, _sch in unassigned_triples}
        subject_lookup: dict[int, Subject] = {}
        if subj_ids:
            sub_stmt = select(Subject).where(Subject.id.in_(subj_ids))
            sub_res = await session.execute(sub_stmt)
            subject_lookup = {int(s.id): s for s in sub_res.scalars().all()}
        for env, series, school in unassigned_triples:
            subj = subject_lookup.get(int(series.subject_id))
            unassigned_items.append(
                UnassignedEnvelopeItem(
                    script_envelope_id=env.id,
                    booklet_count=int(env.booklet_count),
                    school_code=school.code,
                    school_name=school.name,
                    region=school.region.value,
                    zone=school.zone.value,
                    subject_id=int(series.subject_id),
                    subject_code=subj.code if subj else "",
                    subject_name=subj.name if subj else "",
                    paper_number=int(series.paper_number),
                    series_number=int(series.series_number),
                    envelope_number=int(env.envelope_number),
                )
            )

    subject_by_id: dict[int, Subject] = {}
    if assigned_by_ex_subject:
        sids = {sid for (_eid, sid) in assigned_by_ex_subject}
        for ex in examiners_by_id.values():
            sids |= {int(s.subject_id) for s in ex.subjects}
        sids |= {sid for (_t, sid) in quota_by_type_subject}
        if sids:
            sub_stmt = select(Subject).where(Subject.id.in_(sids))
            sub_res = await session.execute(sub_stmt)
            subject_by_id = {int(s.id): s for s in sub_res.scalars().all()}

    type_to_schema = {
        ExaminerType.CHIEF: ExaminerTypeSchema.chief_examiner,
        ExaminerType.ASSISTANT: ExaminerTypeSchema.assistant_examiner,
        ExaminerType.TEAM_LEADER: ExaminerTypeSchema.team_leader,
    }

    summaries: list[ExaminerSubjectRunSummary] = []
    for eid, ex in examiners_by_id.items():
        ex_type_schema = type_to_schema[ex.examiner_type]
        subjects_for_row = {int(s.subject_id) for s in ex.subjects}
        for sid in sorted(subjects_for_row):
            sub = subject_by_id.get(sid)
            qkey = (ex.examiner_type, sid)
            qv = quota_by_type_subject.get(qkey)
            assigned = assigned_by_ex_subject.get((eid, sid), 0)
            summaries.append(
                ExaminerSubjectRunSummary(
                    examiner_id=eid,
                    examiner_name=ex.name,
                    examiner_type=ex_type_schema,
                    subject_id=sid,
                    subject_code=sub.code if sub else "",
                    subject_name=sub.name if sub else "",
                    quota_booklets=qv,
                    assigned_booklets=int(assigned),
                    deviation=int(assigned - qv) if qv is not None else None,
                )
            )

    status_map = {
        AllocationRunStatus.DRAFT: AllocationRunStatusSchema.draft,
        AllocationRunStatus.OPTIMAL: AllocationRunStatusSchema.optimal,
        AllocationRunStatus.INFEASIBLE: AllocationRunStatusSchema.infeasible,
        AllocationRunStatus.TIMEOUT: AllocationRunStatusSchema.timeout,
        AllocationRunStatus.ERROR: AllocationRunStatusSchema.error,
    }

    stats_raw = run.solver_stats if isinstance(run.solver_stats, dict) else {}
    solve_mode_resp: AllocationSolveModeSchema | None = None
    sm = stats_raw.get("solve_mode")
    if sm == AllocationSolveModeSchema.monolithic.value:
        solve_mode_resp = AllocationSolveModeSchema.monolithic
    elif sm == AllocationSolveModeSchema.decomposed.value:
        solve_mode_resp = AllocationSolveModeSchema.decomposed

    subgroups_out: list[AllocationSubgroupItem] = []
    for raw in stats_raw.get("subgroups") or []:
        if not isinstance(raw, dict):
            continue
        try:
            mg_id = UUID(str(raw["marking_group_id"]))
            sn = int(raw.get("series_number", 0))
            st = AllocationSubgroupStatusSchema(str(raw["status"]))
            ov = raw.get("objective_value")
            tlim = raw.get("time_limit_allocated_sec")
            subgroups_out.append(
                AllocationSubgroupItem(
                    marking_group_id=mg_id,
                    series_number=sn,
                    status=st,
                    examiner_count=int(raw.get("examiner_count", 0)),
                    envelope_count=int(raw.get("envelope_count", 0)),
                    eligible_pair_count=int(raw.get("eligible_pair_count", 0)),
                    objective_value=float(ov) if ov is not None else None,
                    message=raw.get("message") if isinstance(raw.get("message"), str) else None,
                    time_limit_allocated_sec=float(tlim) if tlim is not None else None,
                )
            )
        except (ValueError, TypeError, KeyError):
            continue

    resp = AllocationRunResponse(
        id=run.id,
        allocation_id=run.allocation_id,
        status=status_map.get(run.status, AllocationRunStatusSchema.error),
        objective_value=float(run.objective_value) if run.objective_value is not None else None,
        solver_message=run.solver_message,
        created_at=run.created_at,
        examiner_subject_summaries=summaries,
        assignments=assignment_items,
        unassigned_envelope_ids=unassigned_ids,
        unassigned_envelopes=unassigned_items,
        solve_mode=solve_mode_resp,
        subgroups=subgroups_out,
    )
    return resp.model_dump(mode="json")
