"""MILP-based assignment of script envelopes to examiners (whole envelopes, quota deviation)."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    AllocationAssignment,
    Allocation,
    AllocationExaminer,
    AllocationRun,
    AllocationRunStatus,
    Examiner,
    ExaminerAllowedZone,
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


def _normalized_cross_rules(scope: str, rules: dict[str, list[str]] | None) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    if not rules:
        return out
    for key, values in rules.items():
        if not str(key).strip():
            continue
        if scope == "region":
            src_region = parse_region(key)
            if src_region is None:
                continue
            targets: set[str] = set()
            for raw in values or []:
                region = parse_region(raw)
                if region is not None:
                    targets.add(region.value)
            out[src_region.value] = targets
        else:
            src_zone = parse_zone(key)
            if src_zone is None:
                continue
            targets = set()
            for raw in values or []:
                zone = parse_zone(raw)
                if zone is not None:
                    targets.add(zone.value)
            out[src_zone.value] = targets
    return out


def _region_containing_zone(zone: Zone | None, region_to_zones: dict[Region, set[Zone]]) -> Region | None:
    if zone is None:
        return None
    for region, zones in region_to_zones.items():
        if zone in zones:
            return region
    return None


def _examiner_home_region(
    ex: Examiner,
    region_to_zones: dict[Region, set[Zone]],
) -> Region | None:
    er: Region | None = getattr(ex, "region", None)
    if er is not None:
        return er
    return _region_containing_zone(getattr(ex, "zone", None), region_to_zones)


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
            selectinload(Examiner.allowed_zones),
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
    allocation_scope: str = "zone",
    cross_marking_rules: dict[str, list[str]] | None = None,
    exclude_home_zone_or_region: bool = True,
) -> tuple[list[EligiblePair], dict[UUID, int]]:
    """Returns pairs and mapping envelope_id -> contiguous index 0..E-1."""
    env_ids = [row[0].id for row in envelopes]
    env_id_to_ix = {eid: i for i, eid in enumerate(env_ids)}
    examiners_list = list(examiners)
    region_to_zones: dict[Region, set[Zone]] = {}
    for _env, _series, school in envelopes:
        region_to_zones.setdefault(school.region, set()).add(school.zone)
    cross_rules = _normalized_cross_rules(allocation_scope, cross_marking_rules)
    use_cross_rules_for_geography = bool(cross_rules)
    pairs: list[EligiblePair] = []
    for env, series, school in envelopes:
        if env.booklet_count <= 0:
            continue
        eix = env_id_to_ix[env.id]
        for j, ex in enumerate(examiners_list):
            sub_ids = {s.subject_id for s in ex.subjects}
            if series.subject_id not in sub_ids:
                continue
            examiner_zone: Zone | None = getattr(ex, "zone", None)

            if use_cross_rules_for_geography:
                # Examiner home region/zone is the rule source; allowed targets come from cross_marking_rules only.
                if allocation_scope == "region":
                    src_region = _examiner_home_region(ex, region_to_zones)
                    source_key = src_region.value if src_region is not None else None
                    target_key = school.region.value
                else:
                    source_key = examiner_zone.value if examiner_zone is not None else None
                    target_key = school.zone.value
                if source_key is None or source_key not in cross_rules:
                    continue
                if target_key not in cross_rules[source_key]:
                    continue
            else:
                allowed = {z.zone for z in ex.allowed_zones}
                if school.zone not in allowed:
                    continue
                if allocation_scope == "region":
                    allowed_regions = {region for region, zones in region_to_zones.items() if zones & allowed}
                    if school.region not in allowed_regions:
                        continue

            if exclude_home_zone_or_region and examiner_zone is not None and school.zone == examiner_zone:
                continue
            if exclude_home_zone_or_region and allocation_scope == "region":
                examiner_region = _examiner_home_region(ex, region_to_zones)
                if examiner_region is not None and school.region == examiner_region:
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
                )
            )
    return pairs, env_id_to_ix


def _run_status_for_failure(message: str | None, status_code: int) -> AllocationRunStatus:
    if status_code == -1:
        return AllocationRunStatus.ERROR
    if message and "time" in message.lower():
        return AllocationRunStatus.TIMEOUT
    return AllocationRunStatus.INFEASIBLE


async def run_allocation_solve(
    session: AsyncSession,
    allocation: Allocation,
    *,
    created_by_id: UUID | None,
    unassigned_penalty: float,
    time_limit_sec: float,
    allocation_scope: str = "zone",
    fairness_weight: float = 0.25,
    enforce_single_series_per_examiner: bool = True,
    cross_marking_rules: dict[str, list[str]] | None = None,
    exclude_home_zone_or_region: bool = True,
) -> AllocationRun:
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

    pairs, _env_map = build_eligible_pairs(
        rows,
        examiners,
        allocation_scope=allocation_scope,
        cross_marking_rules=cross_marking_rules,
        exclude_home_zone_or_region=exclude_home_zone_or_region,
    )
    if not pairs:
        run = AllocationRun(
            allocation_id=allocation.id,
            status=AllocationRunStatus.ERROR,
            objective_value=None,
            solver_message="No eligible examiner–envelope pairs (check subjects, cross-marking rules vs home region/zone, and allowed zones if no rules are set)",
            created_by_id=created_by_id,
            solver_stats={"envelopes": len(rows), "examiners": len(examiners)},
        )
        session.add(run)
        await session.flush()
        return run

    quota_by_type_subject: dict[tuple[ExaminerType, int], int] = {}
    for row in allocation.scripts_allocation_quotas:
        quota_by_type_subject[(row.examiner_type, int(row.subject_id))] = int(row.quota_booklets)

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
    )

    if not milp_out.success:
        run = AllocationRun(
            allocation_id=allocation.id,
            status=_run_status_for_failure(milp_out.message, milp_out.status_code),
            objective_value=milp_out.objective,
            solver_message=(milp_out.message or "")[:4000] or None,
            created_by_id=created_by_id,
            solver_stats={"milp_status": milp_out.status_code},
        )
        session.add(run)
        await session.flush()
        return run

    assigned_env: set[UUID] = {p.envelope_id for p in milp_out.pair_assignments}
    unassigned = [env.id for env, _s, _sch in rows if env.id not in assigned_env and env.booklet_count > 0]

    run = AllocationRun(
        allocation_id=allocation.id,
        status=AllocationRunStatus.OPTIMAL,
        objective_value=milp_out.objective,
        solver_message=(milp_out.message or "")[:4000] or None,
        created_by_id=created_by_id,
        solver_stats={
            "milp_status": milp_out.status_code,
            "eligible_pairs": len(pairs),
            "envelopes": num_envelopes,
            "examiners": len(examiners),
            "unassigned_count": len(unassigned),
        },
    )
    session.add(run)
    await session.flush()

    env_by_id = {env.id: env for env, _s, _sch in rows}
    for p in milp_out.pair_assignments:
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
    await session.execute(
        delete(ExaminerAllowedZone).where(ExaminerAllowedZone.examiner_id == examiner.id)
    )
    await session.flush()
    for z in zones:
        session.add(ExaminerAllowedZone(examiner_id=examiner.id, zone=z))


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
    for env, _series, _school in await load_envelopes_for_allocation(session, allocation):
        if env.id == script_envelope_id:
            env_row = env
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
    )
    return resp.model_dump(mode="json")
