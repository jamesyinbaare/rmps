"""Admin school-status grid: all schools with registrations for a subject/paper, including gaps."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from sqlalchemy import distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ExaminationCandidate,
    ExaminationCandidateSubject,
    IrregularScriptEnvelope,
    IrregularScriptPackingSeries,
    Region,
    School,
    ScriptEnvelope,
    ScriptPackingSeries,
    Subject,
    Zone,
)
from app.schemas.script_control import (
    ScriptControlAdminRow,
    ScriptControlSchoolOverallStatus,
    ScriptControlSchoolStatusCounts,
    ScriptControlSchoolStatusRow,
    ScriptEnvelopeItem,
)
from app.services.exam_timetable_pdf import load_examination_or_raise, load_schedules_for_exam
from app.services.script_control import subject_series_count_map

SchoolStatusFilter = Literal["all", "missing", "partial", "complete", "verified"]


def _series_slot_verified_regular(ps: ScriptPackingSeries) -> bool:
    if ps.no_scripts:
        return True
    return len(ps.envelopes) > 0 and all(e.verified_at is not None for e in ps.envelopes)


def _series_slot_verified_irregular(ps: IrregularScriptPackingSeries) -> bool:
    return len(ps.envelopes) > 0 and all(e.verified_at is not None for e in ps.envelopes)


def _overall_status(
    expected: int,
    recorded: int,
    verified: int,
) -> ScriptControlSchoolOverallStatus:
    if recorded == 0:
        return "missing"
    if recorded < expected:
        return "partial"
    if verified >= expected:
        return "verified"
    return "complete"


def _packing_to_admin_row(
    ps: ScriptPackingSeries | IrregularScriptPackingSeries,
    *,
    sch: School,
    sub: Subject,
    irregular: bool,
) -> ScriptControlAdminRow:
    envs = sorted(ps.envelopes, key=lambda x: x.envelope_number)
    envelope_items = [
        ScriptEnvelopeItem(
            envelope_number=e.envelope_number,
            booklet_count=e.booklet_count,
            verified=e.verified_at is not None,
        )
        for e in envs
    ]
    no_scripts = bool(getattr(ps, "no_scripts", False)) if not irregular else False
    return ScriptControlAdminRow(
        packing_series_id=ps.id,
        examination_id=ps.examination_id,
        school_id=ps.school_id,
        school_code=sch.code,
        school_name=sch.name,
        region=sch.region.value if sch.region is not None else "",
        zone=sch.zone.value if sch.zone is not None else "",
        subject_id=ps.subject_id,
        subject_code=sub.code,
        subject_original_code=sub.original_code,
        subject_name=sub.name,
        paper_number=ps.paper_number,
        series_number=ps.series_number,
        envelope_count=len(envs),
        total_booklets=sum(e.booklet_count for e in envs),
        no_scripts=no_scripts,
        envelopes=envelope_items,
    )


async def _subject_has_paper_on_timetable(session: AsyncSession, exam_id: int, subject_id: int, paper_number: int) -> bool:
    sub = await session.get(Subject, subject_id)
    if sub is None:
        return False
    schedules = await load_schedules_for_exam(session, exam_id)
    codes = {sub.code}
    if sub.original_code:
        codes.add(sub.original_code)
    for sch in schedules:
        if sch.subject_code not in codes:
            continue
        for p in sch.papers or []:
            if not isinstance(p, dict):
                continue
            try:
                if int(p.get("paper", 1)) == paper_number:
                    return True
            except (TypeError, ValueError):
                continue
    return False


async def _schools_with_subject_registrations(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    region: Region | None,
    zone: Zone | None,
    school_q: str | None,
) -> list[tuple[School, int]]:
    """Schools with at least one registered candidate for subject; returns (school, candidate_count)."""
    stmt = (
        select(
            School,
            func.count(distinct(ExaminationCandidate.id)).label("candidate_count"),
        )
        .select_from(School)
        .join(ExaminationCandidate, ExaminationCandidate.school_id == School.id)
        .join(
            ExaminationCandidateSubject,
            ExaminationCandidateSubject.examination_candidate_id == ExaminationCandidate.id,
        )
        .where(
            ExaminationCandidate.examination_id == examination_id,
            ExaminationCandidate.school_id.isnot(None),
            ExaminationCandidateSubject.subject_id == subject_id,
        )
        .group_by(School.id)
        .order_by(School.code)
    )
    if region is not None:
        stmt = stmt.where(School.region == region)
    if zone is not None:
        stmt = stmt.where(School.zone == zone)
    if school_q and school_q.strip():
        pattern = f"%{school_q.strip()}%"
        stmt = stmt.where(or_(School.code.ilike(pattern), School.name.ilike(pattern)))

    result = await session.execute(stmt)
    return [(row[0], int(row[1])) for row in result.all()]


async def build_script_control_school_status_rows(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    paper_number: int,
    irregular: bool,
    region: Region | None = None,
    zone: Zone | None = None,
    school_q: str | None = None,
    status_filter: SchoolStatusFilter = "all",
) -> tuple[list[ScriptControlSchoolStatusRow], ScriptControlSchoolStatusCounts]:
    await load_examination_or_raise(session, examination_id)
    sub = await session.get(Subject, subject_id)
    if sub is None:
        return [], ScriptControlSchoolStatusCounts()

    if not await _subject_has_paper_on_timetable(session, examination_id, subject_id, paper_number):
        return [], ScriptControlSchoolStatusCounts()

    cmap = await subject_series_count_map(session, examination_id)
    expected_series = max(1, cmap.get(subject_id, 1))

    schools_with_counts = await _schools_with_subject_registrations(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        region=region,
        zone=zone,
        school_q=school_q,
    )
    if not schools_with_counts:
        return [], ScriptControlSchoolStatusCounts()

    school_ids = [sch.id for sch, _ in schools_with_counts]
    reg_by_school = {sch.id: cnt for sch, cnt in schools_with_counts}

    if irregular:
        pack_stmt = (
            select(IrregularScriptPackingSeries)
            .where(
                IrregularScriptPackingSeries.examination_id == examination_id,
                IrregularScriptPackingSeries.subject_id == subject_id,
                IrregularScriptPackingSeries.paper_number == paper_number,
                IrregularScriptPackingSeries.school_id.in_(school_ids),
            )
            .options(selectinload(IrregularScriptPackingSeries.envelopes))
        )
        pack_result = await session.execute(pack_stmt)
        packings = list(pack_result.scalars().unique().all())
        by_school: dict[UUID, dict[int, IrregularScriptPackingSeries]] = {}
        for ps in packings:
            by_school.setdefault(ps.school_id, {})[ps.series_number] = ps
        verify_fn = _series_slot_verified_irregular
    else:
        pack_stmt = (
            select(ScriptPackingSeries)
            .where(
                ScriptPackingSeries.examination_id == examination_id,
                ScriptPackingSeries.subject_id == subject_id,
                ScriptPackingSeries.paper_number == paper_number,
                ScriptPackingSeries.school_id.in_(school_ids),
            )
            .options(selectinload(ScriptPackingSeries.envelopes))
        )
        pack_result = await session.execute(pack_stmt)
        packings = list(pack_result.scalars().unique().all())
        by_school = {}
        for ps in packings:
            by_school.setdefault(ps.school_id, {})[ps.series_number] = ps
        verify_fn = _series_slot_verified_regular

    rows: list[ScriptControlSchoolStatusRow] = []
    counts = ScriptControlSchoolStatusCounts()

    for sch, reg_count in schools_with_counts:
        series_map = by_school.get(sch.id, {})
        series_items: list[ScriptControlAdminRow] = []
        recorded = 0
        verified = 0
        total_booklets = 0
        for sn in range(1, expected_series + 1):
            ps = series_map.get(sn)
            if ps is None:
                continue
            recorded += 1
            if verify_fn(ps):
                verified += 1
            row = _packing_to_admin_row(ps, sch=sch, sub=sub, irregular=irregular)
            series_items.append(row)
            total_booklets += row.total_booklets

        overall = _overall_status(expected_series, recorded, verified)
        counts.total += 1
        if overall == "missing":
            counts.missing += 1
        elif overall == "partial":
            counts.partial += 1
        elif overall == "complete":
            counts.complete += 1
        else:
            counts.verified += 1

        if status_filter != "all" and overall != status_filter:
            continue

        rows.append(
            ScriptControlSchoolStatusRow(
                school_id=sch.id,
                school_code=sch.code,
                school_name=sch.name,
                region=sch.region.value if sch.region is not None else "",
                zone=sch.zone.value if sch.zone is not None else "",
                examination_id=examination_id,
                subject_id=subject_id,
                subject_code=sub.code,
                subject_original_code=sub.original_code,
                subject_name=sub.name,
                paper_number=paper_number,
                registered_candidates=reg_count,
                expected_series=expected_series,
                recorded_series=recorded,
                verified_series=verified,
                total_booklets=total_booklets,
                overall_status=overall,
                series_items=series_items,
            )
        )

    return rows, counts
