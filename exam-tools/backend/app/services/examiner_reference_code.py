"""Stable human-readable examiner reference codes (e.g. MATH301-NAE1, ENGL302-STL1)."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Examiner,
    ExaminerType,
    ExaminationExaminerRegionGroup,
    ExaminationExaminerRegionGroupRegion,
    Region,
    Subject,
)

ROLE_SHORT_CODES: dict[ExaminerType, str] = {
    ExaminerType.CHIEF: "CE",
    ExaminerType.ASSISTANT_CHIEF: "ACE",
    ExaminerType.ASSISTANT: "AE",
    ExaminerType.TEAM_LEADER: "TL",
}

ALL_REGIONS: tuple[Region, ...] = tuple(Region)

DEFAULT_REGION_GROUPS: tuple[tuple[str, str, tuple[Region, ...]], ...] = (
    (
        "North",
        "N",
        (
            Region.NORTHERN,
            Region.NORTH_EAST,
            Region.SAVANNAH,
            Region.UPPER_EAST,
            Region.UPPER_WEST,
        ),
    ),
    (
        "South",
        "S",
        (
            Region.GREATER_ACCRA,
            Region.CENTRAL,
            Region.WESTERN,
            Region.WESTERN_NORTH,
            Region.VOLTA,
        ),
    ),
    ("East", "E", (Region.EASTERN, Region.OTI)),
    ("Middle", "M", (Region.ASHANTI, Region.BONO, Region.BONO_EAST, Region.AHAFO)),
)

REGION_NOT_MAPPED_MESSAGE = "Assign region groups for this examination before adding examiners."

_PREFIX_PATTERN = re.compile(r"^[A-Z]{1,2}$")
_CODE_SUFFIX_PATTERN = re.compile(r"^(\d+)$")
_SUBJECT_PREFIX_PATTERN = re.compile(r"^[A-Z0-9]{1,50}$")
_MAX_REFERENCE_CODE_LEN = 64
_MAX_ASSIGN_RETRIES = 8


@dataclass(frozen=True)
class ReferenceCodeStats:
    roster_total: int
    with_code_count: int
    missing_code_count: int


@dataclass(frozen=True)
class ReferenceCodeActionResult:
    assigned_count: int
    skipped_count: int
    roster_total: int


def role_short_code(examiner_type: ExaminerType) -> str:
    return ROLE_SHORT_CODES[examiner_type]


def subject_reference_prefix(*, original_code: str | None, code: str) -> str:
    """Full original subject code (fallback: internal code when original is unset)."""
    original = (original_code or "").strip()
    source = original if original else (code or "").strip()
    if not source:
        raise ValueError("Subject code is required for reference code assignment.")
    prefix = re.sub(r"[^A-Za-z0-9]", "", source).upper()
    if not prefix or not _SUBJECT_PREFIX_PATTERN.fullmatch(prefix):
        raise ValueError("Could not derive a subject prefix for the reference code.")
    return prefix


def _normalize_prefix(prefix: str) -> str:
    return prefix.strip().upper()


def validate_code_prefix(prefix: str) -> str:
    normalized = _normalize_prefix(prefix)
    if not _PREFIX_PATTERN.fullmatch(normalized):
        raise ValueError("Code prefix must be 1–2 uppercase letters.")
    return normalized


def _region_value(region: Region | str) -> str:
    if isinstance(region, Region):
        return region.value
    return str(region).strip()


def _examiner_type_value(examiner_type: ExaminerType) -> ExaminerType:
    if isinstance(examiner_type, ExaminerType):
        return examiner_type
    return ExaminerType(str(examiner_type))


async def resolve_group_prefix(session: AsyncSession, examination_id: int, region: Region | str) -> str:
    region_val = _region_value(region)
    stmt = (
        select(ExaminationExaminerRegionGroup.code_prefix)
        .join(
            ExaminationExaminerRegionGroupRegion,
            ExaminationExaminerRegionGroupRegion.group_id == ExaminationExaminerRegionGroup.id,
        )
        .where(
            ExaminationExaminerRegionGroup.examination_id == examination_id,
            ExaminationExaminerRegionGroupRegion.examination_id == examination_id,
            ExaminationExaminerRegionGroupRegion.region == region_val,
        )
    )
    prefix = (await session.execute(stmt)).scalar_one_or_none()
    if prefix is None:
        raise ValueError(REGION_NOT_MAPPED_MESSAGE)
    return _normalize_prefix(cast(str, prefix))


async def _max_sequence_for_prefix_role(
    session: AsyncSession,
    examination_id: int,
    prefix_role: str,
) -> int:
    stmt = select(Examiner.reference_code).where(
        Examiner.examination_id == examination_id,
        Examiner.reference_code.isnot(None),
        Examiner.reference_code.like(f"{prefix_role}%"),
    )
    codes = (await session.execute(stmt)).scalars().all()
    max_seq = 0
    for code in codes:
        if code is None:
            continue
        suffix = code[len(prefix_role) :]
        match = _CODE_SUFFIX_PATTERN.fullmatch(suffix)
        if match:
            max_seq = max(max_seq, int(match.group(1)))
    return max_seq


async def assign_reference_code(
    session: AsyncSession,
    examination_id: int,
    region: Region | str,
    examiner_type: ExaminerType,
    subject_id: int,
) -> str:
    subject = await session.get(Subject, subject_id)
    if subject is None:
        raise ValueError("Subject not found.")
    subject_prefix = subject_reference_prefix(
        original_code=subject.original_code,
        code=subject.code,
    )
    region_prefix = await resolve_group_prefix(session, examination_id, region)
    role_code = role_short_code(_examiner_type_value(examiner_type))
    prefix_role = f"{subject_prefix}-{region_prefix}{role_code}"
    next_seq = (await _max_sequence_for_prefix_role(session, examination_id, prefix_role)) + 1

    for _ in range(_MAX_ASSIGN_RETRIES):
        candidate = f"{prefix_role}{next_seq}"
        if len(candidate) > _MAX_REFERENCE_CODE_LEN:
            raise ValueError("Reference code exceeds maximum length.")
        conflict = (
            await session.execute(
                select(Examiner.id).where(
                    Examiner.examination_id == examination_id,
                    Examiner.reference_code == candidate,
                )
            )
        ).scalar_one_or_none()
        if conflict is None:
            return candidate
        next_seq += 1

    raise RuntimeError("Could not assign a unique examiner reference code.")


def _examiner_subject_id(examiner: Examiner) -> int:
    subject_ids = [int(es.subject_id) for es in examiner.subjects]
    if len(subject_ids) != 1:
        raise ValueError("Exactly one subject is required to assign a reference code.")
    return subject_ids[0]


async def _set_reference_code_on_examiner(
    session: AsyncSession,
    examiner: Examiner,
    *,
    subject_id: int | None = None,
) -> str:
    resolved_subject_id = subject_id if subject_id is not None else _examiner_subject_id(examiner)
    code = await assign_reference_code(
        session,
        int(examiner.examination_id),
        examiner.region,
        _examiner_type_value(examiner.examiner_type),
        resolved_subject_id,
    )
    examiner.reference_code = code
    return code


async def assign_reference_code_to_examiner(
    session: AsyncSession,
    examiner: Examiner,
    *,
    subject_id: int | None = None,
) -> str:
    if examiner.reference_code:
        return cast(str, examiner.reference_code)
    await ensure_default_region_groups(session, int(examiner.examination_id))
    if subject_id is None and not examiner.subjects:
        await session.refresh(examiner, attribute_names=["subjects"])
    return await _set_reference_code_on_examiner(session, examiner, subject_id=subject_id)


async def reference_code_stats(session: AsyncSession, examination_id: int) -> ReferenceCodeStats:
    roster_total = int(
        (
            await session.execute(
                select(func.count())
                .select_from(Examiner)
                .where(Examiner.examination_id == examination_id)
            )
        ).scalar_one()
        or 0
    )
    with_code_count = int(
        (
            await session.execute(
                select(func.count())
                .select_from(Examiner)
                .where(
                    Examiner.examination_id == examination_id,
                    Examiner.reference_code.isnot(None),
                )
            )
        ).scalar_one()
        or 0
    )
    return ReferenceCodeStats(
        roster_total=roster_total,
        with_code_count=with_code_count,
        missing_code_count=roster_total - with_code_count,
    )


async def ensure_default_region_groups(session: AsyncSession, examination_id: int) -> bool:
    """Seed default region groups when none exist. Returns True if groups were created."""
    existing = (
        await session.execute(
            select(func.count())
            .select_from(ExaminationExaminerRegionGroup)
            .where(ExaminationExaminerRegionGroup.examination_id == examination_id)
        )
    ).scalar_one()
    if int(existing or 0) > 0:
        return False

    for name, prefix, regions in DEFAULT_REGION_GROUPS:
        group = ExaminationExaminerRegionGroup(
            examination_id=examination_id,
            name=name,
            code_prefix=prefix,
        )
        session.add(group)
        await session.flush()
        for region in regions:
            session.add(
                ExaminationExaminerRegionGroupRegion(
                    examination_id=examination_id,
                    group_id=group.id,
                    region=region,
                )
            )
    await session.flush()
    return True


async def regions_fully_mapped(session: AsyncSession, examination_id: int) -> bool:
    count = (
        await session.execute(
            select(func.count())
            .select_from(ExaminationExaminerRegionGroupRegion)
            .where(ExaminationExaminerRegionGroupRegion.examination_id == examination_id)
        )
    ).scalar_one()
    return int(count or 0) == len(ALL_REGIONS)


def validate_region_group_payload(
    groups: Sequence[dict[str, object]],
) -> list[tuple[str, str, list[str]]]:
    """Validate PUT payload; returns normalized (name, prefix, regions) tuples."""
    if not groups:
        raise ValueError("At least one region group is required.")

    seen_regions: set[str] = set()
    seen_prefixes: set[str] = set()
    normalized: list[tuple[str, str, list[str]]] = []

    for group in groups:
        name = str(group.get("name", "")).strip()
        if not name:
            raise ValueError("Each region group must have a name.")
        prefix = validate_code_prefix(str(group.get("code_prefix", "")))
        if prefix in seen_prefixes:
            raise ValueError(f"Duplicate code prefix '{prefix}' within this examination.")
        seen_prefixes.add(prefix)

        raw_regions = group.get("regions")
        if not isinstance(raw_regions, list) or not raw_regions:
            raise ValueError(f"Group '{name}' must include at least one region.")
        regions: list[str] = []
        for raw in raw_regions:
            region_val = str(raw).strip()
            if region_val in seen_regions:
                raise ValueError(f"Region '{region_val}' is assigned to more than one group.")
            seen_regions.add(region_val)
            regions.append(region_val)

        normalized.append((name, prefix, regions))

    expected = {r.value for r in ALL_REGIONS}
    if seen_regions != expected:
        missing = sorted(expected - seen_regions)
        extra = sorted(seen_regions - expected)
        if missing:
            raise ValueError(f"Unassigned regions: {', '.join(missing)}.")
        if extra:
            raise ValueError(f"Unknown regions: {', '.join(extra)}.")
    return normalized


async def _ordered_examiners_for_examination(session: AsyncSession, examination_id: int) -> list[Examiner]:
    stmt = (
        select(Examiner)
        .where(Examiner.examination_id == examination_id)
        .options(selectinload(Examiner.subjects))
        .order_by(Examiner.created_at, Examiner.id)
    )
    return list((await session.execute(stmt)).scalars().all())


async def _assign_codes_to_examiners(
    session: AsyncSession,
    examiners: Sequence[Examiner],
) -> tuple[int, int]:
    assigned = 0
    skipped = 0
    for examiner in examiners:
        try:
            await _set_reference_code_on_examiner(session, examiner)
            assigned += 1
        except ValueError:
            skipped += 1
        except IntegrityError:
            await session.rollback()
            raise
    if assigned:
        await session.flush()
    return assigned, skipped


async def backfill_reference_codes_for_examination(
    session: AsyncSession,
    examination_id: int,
) -> ReferenceCodeActionResult:
    """Assign reference codes to examiners missing one, in deterministic order."""
    await ensure_default_region_groups(session, examination_id)
    if not await regions_fully_mapped(session, examination_id):
        raise ValueError(REGION_NOT_MAPPED_MESSAGE)
    stats = await reference_code_stats(session, examination_id)
    stmt = (
        select(Examiner)
        .where(
            Examiner.examination_id == examination_id,
            Examiner.reference_code.is_(None),
        )
        .options(selectinload(Examiner.subjects))
        .order_by(Examiner.created_at, Examiner.id)
    )
    examiners = list((await session.execute(stmt)).scalars().all())
    assigned, skipped = await _assign_codes_to_examiners(session, examiners)
    return ReferenceCodeActionResult(
        assigned_count=assigned,
        skipped_count=skipped,
        roster_total=stats.roster_total,
    )


async def regenerate_reference_codes_for_examination(
    session: AsyncSession,
    examination_id: int,
) -> ReferenceCodeActionResult:
    """Replace all reference codes using current region groups, region, role, and subject."""
    if not await regions_fully_mapped(session, examination_id):
        raise ValueError(REGION_NOT_MAPPED_MESSAGE)
    examiners = await _ordered_examiners_for_examination(session, examination_id)
    stats = await reference_code_stats(session, examination_id)
    for examiner in examiners:
        examiner.reference_code = None
    if examiners:
        await session.flush()
    assigned, skipped = await _assign_codes_to_examiners(session, examiners)
    return ReferenceCodeActionResult(
        assigned_count=assigned,
        skipped_count=skipped,
        roster_total=stats.roster_total,
    )


async def backfill_all_reference_codes(session: AsyncSession) -> int:
    exam_ids = list(
        (
            await session.execute(select(Examiner.examination_id).distinct().order_by(Examiner.examination_id))
        ).scalars().all()
    )
    total = 0
    for exam_id in exam_ids:
        result = await backfill_reference_codes_for_examination(session, int(exam_id))
        total += result.assigned_count
    return total
