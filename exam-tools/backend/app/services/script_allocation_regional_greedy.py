"""Deterministic regional greedy script allocation (whole envelopes, quota band, one series per examiner)."""
from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from app.models import Examiner, ExaminerType, Region, School, ScriptEnvelope, ScriptPackingSeries


@dataclass(frozen=True)
class GreedyAssignment:
    envelope_id: UUID
    examiner_id: UUID
    subject_id: int
    series_number: int
    booklet_count: int


@dataclass
class RegionalGreedyResult:
    assignments: list[GreedyAssignment] = field(default_factory=list)
    subgroup_stats: list[dict[str, object]] = field(default_factory=list)
    unassigned_envelope_ids: list[UUID] = field(default_factory=list)


def ordered_marking_regions(
    rule_regions: set[Region],
    pool_regions: set[Region],
    preferred_order: list[Region] | None,
) -> list[Region]:
    active = rule_regions & pool_regions
    seen: set[Region] = set()
    out: list[Region] = []
    for region in preferred_order or []:
        if region in active and region not in seen:
            out.append(region)
            seen.add(region)
    rest = sorted(active - seen, key=lambda r: r.value)
    out.extend(rest)
    return out


def sort_envelope_rows(
    rows: list[tuple[ScriptEnvelope, ScriptPackingSeries, School]],
) -> list[tuple[ScriptEnvelope, ScriptPackingSeries, School]]:
    return sorted(
        rows,
        key=lambda row: (
            row[2].code or "",
            -int(row[0].booklet_count),
            int(row[0].envelope_number),
        ),
    )


def _quota_for_examiner(
    examiner: Examiner,
    subject_id: int,
    quota_by_type_subject: dict[tuple[ExaminerType, int], int],
) -> int | None:
    return quota_by_type_subject.get((examiner.examiner_type, int(subject_id)))


def regional_greedy_solve(
    rows: list[tuple[ScriptEnvelope, ScriptPackingSeries, School]],
    examiners: list[Examiner],
    *,
    subject_id: int,
    cross_marking_region_rules: dict[Region, set[Region]],
    quota_by_type_subject: dict[tuple[ExaminerType, int], int],
    quota_tolerance_booklets: int,
    marking_region_solve_order: list[Region] | None = None,
) -> RegionalGreedyResult:
    tolerance = max(0, int(quota_tolerance_booklets))
    assigned_global: set[UUID] = set()
    assignments: list[GreedyAssignment] = []
    subgroup_stats: list[dict[str, object]] = []

    pool_regions = {ex.region for ex in examiners if ex.region is not None}
    rule_regions = set(cross_marking_region_rules.keys())
    region_order = ordered_marking_regions(rule_regions, pool_regions, marking_region_solve_order)

    for marking_region in region_order:
        allowed_script_regions = cross_marking_region_rules.get(marking_region) or set()
        if not allowed_script_regions:
            continue

        group_examiners = sorted(
            [ex for ex in examiners if ex.region == marking_region],
            key=lambda ex: ex.name,
        )
        if not group_examiners:
            continue

        rem_rows = [
            row
            for row in rows
            if row[0].id not in assigned_global
            and row[0].booklet_count > 0
            and row[2].region in allowed_script_regions
            and int(row[1].subject_id) == int(subject_id)
        ]
        sorted_pool = sort_envelope_rows(rem_rows)
        group_assigned_count = 0

        for examiner in group_examiners:
            quota = _quota_for_examiner(examiner, subject_id, quota_by_type_subject)
            if quota is None:
                continue
            floor = max(0, int(quota) - tolerance)
            ceiling = int(quota) + tolerance
            assigned_booklets = 0
            locked_series: int | None = None

            for env, series, _school in sorted_pool:
                if env.id in assigned_global:
                    continue
                series_no = int(series.series_number)
                if locked_series is not None and series_no != locked_series:
                    continue
                next_total = assigned_booklets + int(env.booklet_count)
                if next_total > ceiling:
                    continue
                assigned_global.add(env.id)
                if locked_series is None:
                    locked_series = series_no
                assigned_booklets = next_total
                assignments.append(
                    GreedyAssignment(
                        envelope_id=env.id,
                        examiner_id=examiner.id,
                        subject_id=int(subject_id),
                        series_number=series_no,
                        booklet_count=int(env.booklet_count),
                    )
                )
                group_assigned_count += 1
                if assigned_booklets >= floor:
                    break

        subgroup_stats.append(
            {
                "marking_region": marking_region.value,
                "examiner_count": len(group_examiners),
                "envelope_count": len(rem_rows),
                "assignments_count": group_assigned_count,
                "eligible_pool_size": len(sorted_pool),
            }
        )

    unassigned = [
        env.id
        for env, series, _school in rows
        if env.id not in assigned_global and env.booklet_count > 0 and int(series.subject_id) == int(subject_id)
    ]
    return RegionalGreedyResult(
        assignments=assignments,
        subgroup_stats=subgroup_stats,
        unassigned_envelope_ids=unassigned,
    )
