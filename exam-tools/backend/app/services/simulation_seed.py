"""Simulation seed generation for Mathematics Paper 2 allocation testing."""

from __future__ import annotations

import random
from datetime import date
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import script_envelope_cap
from app.models import (
    Examination,
    ExaminationCandidate,
    ExaminationCandidateSubject,
    ExaminationSchedule,
    ExaminationSubjectScriptSeries,
    Examiner,
    ExaminerSubject,
    ExaminerType,
    Region,
    School,
    ScriptEnvelope,
    ScriptPackingSeries,
    Subject,
    SubjectType,
    Zone,
)

SIM_EXAM_TYPE = "Certificate II"
SIM_EXAM_SERIES = "20250"
SIM_EXAM_YEAR = 2025
SIM_EXAM_DESCRIPTION = "Simulation dataset for Mathematics Paper 2 script allocation."
SIM_TOTAL_CANDIDATES = 70_000
SIM_MIN_CANDIDATES_PER_SCHOOL = 10
SIM_MAX_CANDIDATES_PER_SCHOOL = 2_500
SIM_SMALL_SCHOOL_MIN = 10
SIM_SMALL_SCHOOL_MAX = 100
SIM_MEDIUM_SCHOOL_MIN = 101
SIM_MEDIUM_SCHOOL_MAX = 400
SIM_LARGE_SCHOOL_MIN = 401
SIM_LARGE_SCHOOL_MAX = 2_500
SIM_SMALL_RATIO = 0.30
SIM_MEDIUM_RATIO = 0.50
SIM_LARGE_RATIO = 0.20
SIM_EXAMINER_COUNT = 250
SIM_PAPER_NUMBER = 2
SIM_RANDOM_SEED = 20260421
SIM_DEFAULT_SERIES_COUNT = 6
SIM_SUBJECT_CODE = "C704"
SIM_SUBJECT_NAME = "Core Mathematics"


def _deterministic_envelope_counts(
    *,
    total_booklets: int,
    cap: int,
) -> list[int]:
    if total_booklets <= 0:
        return []
    full = total_booklets // cap
    remainder = total_booklets % cap
    counts = [cap] * full
    if remainder > 0:
        counts.append(remainder)
    return counts


def _apply_random_envelope_deductions(
    rng: random.Random,
    *,
    counts: list[int],
) -> list[int]:
    out: list[int] = []
    for count in counts:
        if count <= 0:
            out.append(0)
            continue
        reduction = rng.randint(0, 5)
        out.append(max(1, count - reduction))
    return out


async def _get_or_create_examination(session: AsyncSession) -> Examination:
    stmt = select(Examination).where(
        Examination.exam_type == SIM_EXAM_TYPE,
        Examination.exam_series == SIM_EXAM_SERIES,
    )
    exam = (await session.execute(stmt)).scalar_one_or_none()
    if exam is None:
        exam = Examination(
            exam_type=SIM_EXAM_TYPE,
            exam_series=SIM_EXAM_SERIES,
            year=SIM_EXAM_YEAR,
            description=SIM_EXAM_DESCRIPTION,
        )
        session.add(exam)
        await session.flush()
    return exam


async def _get_or_create_core_mathematics_subject(session: AsyncSession) -> Subject:
    by_code_or_original = (
        await session.execute(
            select(Subject).where(
                or_(
                    Subject.code == SIM_SUBJECT_CODE,
                    Subject.original_code == SIM_SUBJECT_CODE,
                )
            )
        )
    ).scalars().first()
    if by_code_or_original is not None:
        return by_code_or_original
    stmt = select(Subject).where(
        func.lower(Subject.name) == SIM_SUBJECT_NAME.lower(),
        Subject.subject_type == SubjectType.CORE,
    )
    by_name = (await session.execute(stmt)).scalar_one_or_none()
    if by_name is not None:
        return by_name
    # Choose a non-conflicting code/original_code pair for new inserts.
    code_value = SIM_SUBJECT_CODE
    existing_code = (await session.execute(select(Subject).where(Subject.code == code_value))).scalar_one_or_none()
    if existing_code is not None:
        code_value = f"{SIM_SUBJECT_CODE}_SIM"

    original_code_value = SIM_SUBJECT_CODE
    existing_original = (
        await session.execute(select(Subject).where(Subject.original_code == original_code_value))
    ).scalar_one_or_none()
    if existing_original is not None:
        original_code_value = None

    created = Subject(
        code=code_value,
        original_code=original_code_value,
        name=SIM_SUBJECT_NAME,
        subject_type=SubjectType.CORE,
    )
    session.add(created)
    await session.flush()
    return created


async def _ensure_schedule_for_paper_two(
    session: AsyncSession,
    examination_id: int,
    subject: Subject,
) -> None:
    schedule_code = subject.original_code if subject.original_code else subject.code
    stmt = select(ExaminationSchedule).where(
        ExaminationSchedule.examination_id == examination_id,
        ExaminationSchedule.subject_code == schedule_code,
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        papers = list(existing.papers or [])
        has_p2 = any(int((p or {}).get("paper", 0)) == SIM_PAPER_NUMBER for p in papers if isinstance(p, dict))
        if not has_p2:
            papers.append({"paper": SIM_PAPER_NUMBER, "date": date(SIM_EXAM_YEAR, 10, 1).isoformat()})
            existing.papers = papers
        return
    session.add(
        ExaminationSchedule(
            examination_id=examination_id,
            subject_code=schedule_code,
            subject_name=subject.name,
            papers=[{"paper": SIM_PAPER_NUMBER, "date": date(SIM_EXAM_YEAR, 10, 1).isoformat()}],
            venue="Simulation Hall",
            duration_minutes=150,
            instructions="Simulation timetable entry for script packing tests.",
        )
    )


async def _ensure_series_count(
    session: AsyncSession,
    examination_id: int,
    subject_id: int,
) -> int:
    row = (
        await session.execute(
            select(ExaminationSubjectScriptSeries).where(
                ExaminationSubjectScriptSeries.examination_id == examination_id,
                ExaminationSubjectScriptSeries.subject_id == subject_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = ExaminationSubjectScriptSeries(
            examination_id=examination_id,
            subject_id=subject_id,
            series_count=SIM_DEFAULT_SERIES_COUNT,
        )
        session.add(row)
        return SIM_DEFAULT_SERIES_COUNT
    return int(row.series_count)


async def _load_school_rows(session: AsyncSession) -> list[School]:
    schools = list((await session.execute(select(School).order_by(School.code))).scalars().all())
    if not schools:
        raise ValueError("No schools found; cannot generate simulation data.")
    return schools


def _distribution_by_school_id(
    rng: random.Random,
    schools: list[School],
) -> dict[UUID, int]:
    n = len(schools)

    small_n = round(n * SIM_SMALL_RATIO)
    medium_n = round(n * SIM_MEDIUM_RATIO)
    large_n = n - small_n - medium_n
    if large_n < 0:
        raise ValueError("Invalid school category count allocation.")

    bounds: list[tuple[int, int]] = (
        [(SIM_SMALL_SCHOOL_MIN, SIM_SMALL_SCHOOL_MAX)] * small_n
        + [(SIM_MEDIUM_SCHOOL_MIN, SIM_MEDIUM_SCHOOL_MAX)] * medium_n
        + [(SIM_LARGE_SCHOOL_MIN, SIM_LARGE_SCHOOL_MAX)] * large_n
    )
    if len(bounds) != n:
        raise ValueError("School category allocation mismatch.")

    min_total = sum(lo for lo, _ in bounds)
    max_total = sum(hi for _, hi in bounds)
    if not (min_total <= SIM_TOTAL_CANDIDATES <= max_total):
        raise ValueError(
            f"Cannot allocate {SIM_TOTAL_CANDIDATES} candidates across {n} schools "
            f"with configured category bounds; feasible range is [{min_total}, {max_total}]"
        )

    rng.shuffle(bounds)
    counts = [rng.randint(lo, hi) for lo, hi in bounds]
    current_total = sum(counts)
    diff = SIM_TOTAL_CANDIDATES - current_total

    if diff > 0:
        expandable = [i for i, ((_, hi), count) in enumerate(zip(bounds, counts, strict=False)) if count < hi]
        while diff > 0 and expandable:
            i = rng.choice(expandable)
            _, hi = bounds[i]
            if counts[i] >= hi:
                expandable.remove(i)
                continue
            counts[i] += 1
            diff -= 1
    elif diff < 0:
        shrinkable = [i for i, ((lo, _), count) in enumerate(zip(bounds, counts, strict=False)) if count > lo]
        while diff < 0 and shrinkable:
            i = rng.choice(shrinkable)
            lo, _ = bounds[i]
            if counts[i] <= lo:
                shrinkable.remove(i)
                continue
            counts[i] -= 1
            diff += 1

    if sum(counts) != SIM_TOTAL_CANDIDATES:
        raise ValueError("Failed to rebalance school candidate distribution to required total.")

    return {school.id: counts[i] for i, school in enumerate(schools)}


async def _seed_candidates_and_series(
    session: AsyncSession,
    *,
    exam_id: int,
    subject: Subject,
    series_count: int,
    school_distribution: dict[UUID, int],
) -> dict[UUID, dict[int, int]]:
    existing_count = (
        await session.execute(
            select(func.count(ExaminationCandidate.id)).where(ExaminationCandidate.examination_id == exam_id)
        )
    ).scalar_one()
    if int(existing_count or 0) > 0:
        # Read existing per-school/series totals for downstream envelope generation.
        rows = (
            await session.execute(
                select(
                    ExaminationCandidate.school_id,
                    ExaminationCandidateSubject.series,
                    func.count(ExaminationCandidateSubject.id),
                )
                .join(
                    ExaminationCandidateSubject,
                    ExaminationCandidateSubject.examination_candidate_id == ExaminationCandidate.id,
                )
                .where(
                    ExaminationCandidate.examination_id == exam_id,
                    ExaminationCandidateSubject.subject_id == subject.id,
                )
                .group_by(ExaminationCandidate.school_id, ExaminationCandidateSubject.series)
            )
        ).all()
        out: dict[UUID, dict[int, int]] = {}
        for school_id, series_num, count in rows:
            if school_id is None or series_num is None:
                continue
            out.setdefault(school_id, {})[int(series_num)] = int(count)
        return out

    per_school_series_totals: dict[UUID, dict[int, int]] = {}
    registration_serial = 1
    source_serial = 1
    for school_id, school_total in school_distribution.items():
        per_series = {s: 0 for s in range(1, series_count + 1)}
        for i in range(school_total):
            series = (i % series_count) + 1
            candidate = ExaminationCandidate(
                examination_id=exam_id,
                school_id=school_id,
                programme_id=None,
                registration_number=f"SIM{SIM_EXAM_SERIES}{registration_serial:07d}",
                index_number=f"{registration_serial:07d}",
                full_name=f"Simulation Candidate {registration_serial:07d}",
                registration_status="registered",
                source_candidate_id=source_serial,
            )
            candidate.subject_selections.append(
                ExaminationCandidateSubject(
                    subject_id=subject.id,
                    subject_code=subject.code,
                    subject_name=subject.name,
                    series=series,
                )
            )
            session.add(candidate)
            per_series[series] += 1
            registration_serial += 1
            source_serial += 1
        per_school_series_totals[school_id] = per_series
        await session.flush()
    return per_school_series_totals


async def _seed_script_packing(
    session: AsyncSession,
    *,
    rng: random.Random,
    examination_id: int,
    subject_id: int,
    series_count: int,
    school_series_counts: dict[UUID, dict[int, int]],
) -> None:
    has_existing = (
        await session.execute(
            select(func.count(ScriptPackingSeries.id)).where(
                ScriptPackingSeries.examination_id == examination_id,
                ScriptPackingSeries.subject_id == subject_id,
                ScriptPackingSeries.paper_number == SIM_PAPER_NUMBER,
            )
        )
    ).scalar_one()
    if int(has_existing or 0) > 0:
        return

    cap = script_envelope_cap(SIM_PAPER_NUMBER)
    for school_id, series_map in school_series_counts.items():
        for series_number in range(1, series_count + 1):
            candidates_in_series = int(series_map.get(series_number, 0))
            packing = ScriptPackingSeries(
                examination_id=examination_id,
                school_id=school_id,
                subject_id=subject_id,
                paper_number=SIM_PAPER_NUMBER,
                series_number=series_number,
            )
            session.add(packing)
            await session.flush()
            counts = _deterministic_envelope_counts(total_booklets=candidates_in_series, cap=cap)
            counts = _apply_random_envelope_deductions(rng, counts=counts)
            for idx, cnt in enumerate(counts, start=1):
                session.add(
                    ScriptEnvelope(
                        packing_series_id=packing.id,
                        envelope_number=idx,
                        booklet_count=cnt,
                    )
                )


async def _seed_examiners(
    session: AsyncSession,
    *,
    rng: random.Random,
    examination_id: int,
    subject_id: int,
) -> None:
    existing = (
        await session.execute(
            select(func.count(Examiner.id)).where(Examiner.examination_id == examination_id)
        )
    ).scalar_one()
    if int(existing or 0) >= SIM_EXAMINER_COUNT:
        return
    schools = await _load_school_rows(session)
    region_to_zones: dict[Region, set[Zone]] = {}
    for s in schools:
        region_to_zones.setdefault(s.region, set()).add(s.zone)
    eligible_regions = [r for r, zs in region_to_zones.items() if zs]
    if not eligible_regions:
        raise ValueError("No region/zone data found from schools for examiner generation.")

    types = [ExaminerType.CHIEF, ExaminerType.TEAM_LEADER, ExaminerType.ASSISTANT]
    weights = [0.08, 0.24, 0.68]
    start = int(existing or 0)
    needed = SIM_EXAMINER_COUNT - start
    for i in range(needed):
        region = rng.choice(eligible_regions)
        examiner_type = rng.choices(types, weights=weights, k=1)[0]
        examiner = Examiner(
            examination_id=examination_id,
            name=f"Core Math Examiner {start + i + 1:03d}",
            examiner_type=examiner_type,
            region=region,
        )
        session.add(examiner)
        await session.flush()
        session.add(ExaminerSubject(examiner_id=examiner.id, subject_id=subject_id))


async def _validate_seed(
    session: AsyncSession,
    *,
    exam_id: int,
    subject_id: int,
    series_count: int,
) -> None:
    total_candidates = (
        await session.execute(
            select(func.count(ExaminationCandidate.id)).where(ExaminationCandidate.examination_id == exam_id)
        )
    ).scalar_one()
    if int(total_candidates or 0) != SIM_TOTAL_CANDIDATES:
        raise ValueError(f"Expected {SIM_TOTAL_CANDIDATES} candidates, got {total_candidates}")

    school_totals = (
        await session.execute(
            select(ExaminationCandidate.school_id, func.count(ExaminationCandidate.id))
            .where(ExaminationCandidate.examination_id == exam_id)
            .group_by(ExaminationCandidate.school_id)
        )
    ).all()
    for _school_id, cnt in school_totals:
        c = int(cnt)
        if c < SIM_MIN_CANDIDATES_PER_SCHOOL or c > SIM_MAX_CANDIDATES_PER_SCHOOL:
            raise ValueError(f"School candidate count out of bounds: {c}")
        if not (
            SIM_SMALL_SCHOOL_MIN <= c <= SIM_SMALL_SCHOOL_MAX
            or SIM_MEDIUM_SCHOOL_MIN <= c <= SIM_MEDIUM_SCHOOL_MAX
            or SIM_LARGE_SCHOOL_MIN <= c <= SIM_LARGE_SCHOOL_MAX
        ):
            raise ValueError(f"School candidate count not in small/medium/large range: {c}")

    school_count = len(school_totals)
    expected_small = round(school_count * SIM_SMALL_RATIO)
    expected_medium = round(school_count * SIM_MEDIUM_RATIO)
    expected_large = school_count - expected_small - expected_medium
    actual_small = sum(1 for _sid, cnt in school_totals if SIM_SMALL_SCHOOL_MIN <= int(cnt) <= SIM_SMALL_SCHOOL_MAX)
    actual_medium = sum(
        1 for _sid, cnt in school_totals if SIM_MEDIUM_SCHOOL_MIN <= int(cnt) <= SIM_MEDIUM_SCHOOL_MAX
    )
    actual_large = sum(1 for _sid, cnt in school_totals if SIM_LARGE_SCHOOL_MIN <= int(cnt) <= SIM_LARGE_SCHOOL_MAX)
    if (actual_small, actual_medium, actual_large) != (expected_small, expected_medium, expected_large):
        raise ValueError(
            "School category distribution mismatch: "
            f"expected {(expected_small, expected_medium, expected_large)}, "
            f"got {(actual_small, actual_medium, actual_large)}"
        )

    cap = script_envelope_cap(SIM_PAPER_NUMBER)
    over_cap = (
        await session.execute(
            select(func.count(ScriptEnvelope.id))
            .join(ScriptPackingSeries, ScriptPackingSeries.id == ScriptEnvelope.packing_series_id)
            .where(
                ScriptPackingSeries.examination_id == exam_id,
                ScriptPackingSeries.subject_id == subject_id,
                ScriptPackingSeries.paper_number == SIM_PAPER_NUMBER,
                ScriptEnvelope.booklet_count > cap,
            )
        )
    ).scalar_one()
    if int(over_cap or 0) > 0:
        raise ValueError("Found envelopes above cap.")

    candidate_series_rows = (
        await session.execute(
            select(
                ExaminationCandidate.school_id,
                ExaminationCandidateSubject.series,
                func.count(ExaminationCandidateSubject.id),
            )
            .join(
                ExaminationCandidateSubject,
                ExaminationCandidateSubject.examination_candidate_id == ExaminationCandidate.id,
            )
            .where(
                ExaminationCandidate.examination_id == exam_id,
                ExaminationCandidateSubject.subject_id == subject_id,
            )
            .group_by(ExaminationCandidate.school_id, ExaminationCandidateSubject.series)
        )
    ).all()
    candidate_map: dict[tuple[UUID, int], int] = {}
    for school_id, series_number, cnt in candidate_series_rows:
        if school_id is None or series_number is None:
            continue
        candidate_map[(school_id, int(series_number))] = int(cnt)

    booklet_rows = (
        await session.execute(
            select(
                ScriptPackingSeries.school_id,
                ScriptPackingSeries.series_number,
                func.coalesce(func.sum(ScriptEnvelope.booklet_count), 0),
            )
            .join(ScriptEnvelope, ScriptEnvelope.packing_series_id == ScriptPackingSeries.id, isouter=True)
            .where(
                ScriptPackingSeries.examination_id == exam_id,
                ScriptPackingSeries.subject_id == subject_id,
                ScriptPackingSeries.paper_number == SIM_PAPER_NUMBER,
            )
            .group_by(ScriptPackingSeries.school_id, ScriptPackingSeries.series_number)
        )
    ).all()
    for school_id, series_number, total in booklet_rows:
        if school_id is None:
            continue
        key = (school_id, int(series_number))
        if int(total or 0) > candidate_map.get(key, 0):
            raise ValueError(f"Booklets exceed candidate total for school/series {key}")

    envelope_rows = (
        await session.execute(
            select(
                ScriptPackingSeries.school_id,
                ScriptPackingSeries.series_number,
                ScriptEnvelope.booklet_count,
            )
            .join(ScriptEnvelope, ScriptEnvelope.packing_series_id == ScriptPackingSeries.id)
            .where(
                ScriptPackingSeries.examination_id == exam_id,
                ScriptPackingSeries.subject_id == subject_id,
                ScriptPackingSeries.paper_number == SIM_PAPER_NUMBER,
            )
        )
    ).all()
    for school_id, series_number, booklet_count in envelope_rows:
        if school_id is None:
            continue
        if int(booklet_count) < 1:
            raise ValueError(f"Envelope booklet count must be >= 1 for school/series {(school_id, int(series_number))}")

    distinct_series_used = (
        await session.execute(
            select(func.count(func.distinct(ExaminationCandidateSubject.series))).where(
                ExaminationCandidateSubject.subject_id == subject_id,
                ExaminationCandidateSubject.series.is_not(None),
            )
        )
    ).scalar_one()
    if int(distinct_series_used or 0) != int(series_count):
        raise ValueError(f"Expected {series_count} series values, found {distinct_series_used}")

    examiner_count = (
        await session.execute(
            select(func.count(Examiner.id)).where(Examiner.examination_id == exam_id)
        )
    ).scalar_one()
    if int(examiner_count or 0) != SIM_EXAMINER_COUNT:
        raise ValueError(f"Expected {SIM_EXAMINER_COUNT} examiners, got {examiner_count}")


async def ensure_mathematics_paper2_simulation_seed(session: AsyncSession) -> None:
    """Seed deterministic simulation data for script-allocation testing."""
    rng = random.Random(SIM_RANDOM_SEED)
    exam = await _get_or_create_examination(session)
    subject = await _get_or_create_core_mathematics_subject(session)
    await _ensure_schedule_for_paper_two(session, exam.id, subject)
    series_count = await _ensure_series_count(session, exam.id, subject.id)
    schools = await _load_school_rows(session)
    school_distribution = _distribution_by_school_id(rng, schools)
    school_series_counts = await _seed_candidates_and_series(
        session,
        exam_id=exam.id,
        subject=subject,
        series_count=series_count,
        school_distribution=school_distribution,
    )
    await _seed_script_packing(
        session,
        rng=rng,
        examination_id=exam.id,
        subject_id=subject.id,
        series_count=series_count,
        school_series_counts=school_series_counts,
    )
    await _seed_examiners(
        session,
        rng=rng,
        examination_id=exam.id,
        subject_id=subject.id,
    )
    await session.commit()
    await _validate_seed(session, exam_id=exam.id, subject_id=subject.id, series_count=series_count)
