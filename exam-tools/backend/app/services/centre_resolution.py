"""Resolve examination centre topology per examination (UNIFIED or SPLIT)."""
from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    CentreStructureMode,
    ExamInspectorSubjectScope,
    Examination,
    ExaminationCentre,
    ExaminationCentreMembership,
    ExaminationCentreMembershipScope,
    School,
)
from app.schemas.timetable import TimetableDownloadFilter
from app.schemas.examination import StaffCandidateWriteDestination

_MEMBERSHIP_SCOPE_SORT = (
    ExaminationCentreMembershipScope.ALL,
    ExaminationCentreMembershipScope.CORE,
    ExaminationCentreMembershipScope.ELECTIVE,
)


def _normalize_membership_scope(
    scope: ExaminationCentreMembershipScope | str,
) -> ExaminationCentreMembershipScope:
    if isinstance(scope, ExaminationCentreMembershipScope):
        return scope
    return ExaminationCentreMembershipScope(scope)


def _normalize_inspector_scope(
    scope: ExamInspectorSubjectScope | str,
) -> ExamInspectorSubjectScope:
    if isinstance(scope, ExamInspectorSubjectScope):
        return scope
    return ExamInspectorSubjectScope(scope)


def school_code_matches_centre_code(school_code: str, centre_code: str) -> bool:
    """True when the school's code is the examination centre code (this school hosts the centre)."""
    return school_code.strip().upper() == centre_code.strip().upper()


def membership_scope_for_inspector_scope(
    exam: Examination,
    inspector_scope: ExamInspectorSubjectScope | str,
) -> ExaminationCentreMembershipScope:
    """Map inspector posting scope to centre membership scope for lookups."""
    mode = exam.centre_structure_mode
    if isinstance(mode, str):
        mode = CentreStructureMode(mode)
    ins = _normalize_inspector_scope(inspector_scope)
    if mode == CentreStructureMode.UNIFIED:
        return ExaminationCentreMembershipScope.ALL
    if ins == ExamInspectorSubjectScope.ALL:
        # SPLIT exams have no ALL rows; upgrade converts ALL memberships to CORE.
        return ExaminationCentreMembershipScope.CORE
    if ins == ExamInspectorSubjectScope.CORE:
        return ExaminationCentreMembershipScope.CORE
    return ExaminationCentreMembershipScope.ELECTIVE


async def get_examination_or_404(session: AsyncSession, examination_id: int) -> Examination:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return exam


async def get_examination_centre_or_404(
    session: AsyncSession,
    examination_id: int,
    centre_id: UUID,
) -> ExaminationCentre:
    centre = await session.get(ExaminationCentre, centre_id)
    if centre is None or centre.examination_id != examination_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination centre not found")
    return centre


async def resolve_centre_for_school(
    session: AsyncSession,
    examination_id: int,
    school_id: UUID,
    *,
    membership_scope: ExaminationCentreMembershipScope | str,
) -> ExaminationCentre:
    scope = _normalize_membership_scope(membership_scope)
    scopes_to_try: list[ExaminationCentreMembershipScope] = [scope]
    if scope == ExaminationCentreMembershipScope.ALL:
        exam = await get_examination_or_404(session, examination_id)
        mode = exam.centre_structure_mode
        if isinstance(mode, str):
            mode = CentreStructureMode(mode)
        if mode == CentreStructureMode.SPLIT:
            scopes_to_try = [
                ExaminationCentreMembershipScope.CORE,
                ExaminationCentreMembershipScope.ELECTIVE,
            ]

    for try_scope in scopes_to_try:
        stmt = (
            select(ExaminationCentre)
            .join(
                ExaminationCentreMembership,
                ExaminationCentreMembership.examination_centre_id == ExaminationCentre.id,
            )
            .where(
                ExaminationCentreMembership.examination_id == examination_id,
                ExaminationCentreMembership.school_id == school_id,
                ExaminationCentreMembership.subject_scope == try_scope,
            )
        )
        result = await session.execute(stmt)
        centre = result.scalar_one_or_none()
        if centre is not None:
            return centre

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No examination centre membership for this school and scope",
    )


def inspector_scope_from_membership_scopes(
    mode: CentreStructureMode | str,
    membership_scopes: set[ExaminationCentreMembershipScope],
) -> ExamInspectorSubjectScope:
    """Map a school's centre membership rows to an effective inspector subject scope."""
    if not membership_scopes:
        raise ValueError("School has no examination centre membership for this examination")
    if isinstance(mode, str):
        mode = CentreStructureMode(mode)
    if mode == CentreStructureMode.UNIFIED:
        return ExamInspectorSubjectScope.ALL
    has_core = ExaminationCentreMembershipScope.CORE in membership_scopes
    has_elective = ExaminationCentreMembershipScope.ELECTIVE in membership_scopes
    if has_core and has_elective:
        return ExamInspectorSubjectScope.ALL
    if has_elective:
        return ExamInspectorSubjectScope.ELECTIVE
    if has_core:
        return ExamInspectorSubjectScope.CORE
    if ExaminationCentreMembershipScope.ALL in membership_scopes:
        return ExamInspectorSubjectScope.ALL
    raise ValueError("School has no examination centre membership for this examination")


def consolidate_write_destinations_by_centre(
    destinations: list[StaffCandidateWriteDestination],
) -> list[StaffCandidateWriteDestination]:
    """When CORE and ELECTIVE memberships share a centre, return one ALL row for that centre."""
    if len(destinations) <= 1:
        return destinations

    by_centre: dict[UUID, list[StaffCandidateWriteDestination]] = {}
    for d in destinations:
        by_centre.setdefault(d.centre_id, []).append(d)

    consolidated: list[StaffCandidateWriteDestination] = []
    for group in sorted(by_centre.values(), key=lambda g: g[0].centre_code):
        scopes = {d.subject_scope.upper() for d in group}
        first = group[0]
        if "ALL" in scopes or ("CORE" in scopes and "ELECTIVE" in scopes):
            consolidated.append(
                StaffCandidateWriteDestination(
                    subject_scope=ExaminationCentreMembershipScope.ALL.value,
                    centre_id=first.centre_id,
                    centre_code=first.centre_code,
                    centre_name=first.centre_name,
                    centre_region=first.centre_region,
                )
            )
        else:
            order = {s.value: i for i, s in enumerate(_MEMBERSHIP_SCOPE_SORT)}
            consolidated.extend(
                sorted(group, key=lambda d: order.get(d.subject_scope, 99))
            )

    order = {s.value: i for i, s in enumerate(_MEMBERSHIP_SCOPE_SORT)}
    return sorted(consolidated, key=lambda d: order.get(d.subject_scope, 99))


async def list_candidate_write_destinations_for_school(
    session: AsyncSession,
    examination_id: int,
    school_id: UUID,
) -> list[StaffCandidateWriteDestination]:
    """Each examination-centre membership row for this school (ALL, CORE, and/or ELECTIVE)."""
    stmt = (
        select(ExaminationCentreMembership, ExaminationCentre)
        .join(
            ExaminationCentre,
            ExaminationCentre.id == ExaminationCentreMembership.examination_centre_id,
        )
        .where(
            ExaminationCentreMembership.examination_id == examination_id,
            ExaminationCentreMembership.school_id == school_id,
        )
    )
    result = await session.execute(stmt)
    rows = result.all()
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No examination centre membership for this school",
        )

    by_scope: dict[ExaminationCentreMembershipScope, StaffCandidateWriteDestination] = {}
    for mem, centre in rows:
        scope = _normalize_membership_scope(mem.subject_scope)
        region = centre.region.value if centre.region is not None else "—"
        by_scope[scope] = StaffCandidateWriteDestination(
            subject_scope=scope.value,
            centre_id=centre.id,
            centre_code=str(centre.code),
            centre_name=str(centre.name),
            centre_region=region,
        )

    order = {s: i for i, s in enumerate(_MEMBERSHIP_SCOPE_SORT)}
    per_scope = sorted(by_scope.values(), key=lambda d: order.get(ExaminationCentreMembershipScope(d.subject_scope), 99))
    return consolidate_write_destinations_by_centre(per_scope)


async def list_candidate_write_destinations_per_scope_for_school(
    session: AsyncSession,
    examination_id: int,
    school_id: UUID,
) -> list[StaffCandidateWriteDestination]:
    """Per membership scope write destinations (before consolidating CORE+ELECTIVE at the same centre)."""
    stmt = (
        select(ExaminationCentreMembership, ExaminationCentre)
        .join(
            ExaminationCentre,
            ExaminationCentre.id == ExaminationCentreMembership.examination_centre_id,
        )
        .where(
            ExaminationCentreMembership.examination_id == examination_id,
            ExaminationCentreMembership.school_id == school_id,
        )
    )
    result = await session.execute(stmt)
    rows = result.all()
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No examination centre membership for this school",
        )

    by_scope: dict[ExaminationCentreMembershipScope, StaffCandidateWriteDestination] = {}
    for mem, centre in rows:
        scope = _normalize_membership_scope(mem.subject_scope)
        region = centre.region.value if centre.region is not None else "—"
        by_scope[scope] = StaffCandidateWriteDestination(
            subject_scope=scope.value,
            centre_id=centre.id,
            centre_code=str(centre.code),
            centre_name=str(centre.name),
            centre_region=region,
        )

    order = {s: i for i, s in enumerate(_MEMBERSHIP_SCOPE_SORT)}
    return sorted(by_scope.values(), key=lambda d: order.get(ExaminationCentreMembershipScope(d.subject_scope), 99))


async def inspector_scope_for_member_school(
    session: AsyncSession,
    examination_id: int,
    school_id: UUID,
) -> ExamInspectorSubjectScope:
    """Effective inspector scope for a supervisor or school-linked inspector."""
    exam = await get_examination_or_404(session, examination_id)
    stmt = select(ExaminationCentreMembership.subject_scope).where(
        ExaminationCentreMembership.examination_id == examination_id,
        ExaminationCentreMembership.school_id == school_id,
    )
    result = await session.execute(stmt)
    raw_scopes = {row[0] for row in result.all()}
    membership_scopes: set[ExaminationCentreMembershipScope] = set()
    for s in raw_scopes:
        membership_scopes.add(_normalize_membership_scope(s))
    if not membership_scopes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No examination centre membership for this school",
        )
    try:
        return inspector_scope_from_membership_scopes(exam.centre_structure_mode, membership_scopes)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


async def resolve_centre_for_user_school(
    session: AsyncSession,
    examination_id: int,
    school: School,
    *,
    inspector_scope: ExamInspectorSubjectScope | str = ExamInspectorSubjectScope.ALL,
) -> ExaminationCentre:
    exam = await get_examination_or_404(session, examination_id)
    mem_scope = membership_scope_for_inspector_scope(exam, inspector_scope)
    return await resolve_centre_for_school(
        session, examination_id, school.id, membership_scope=mem_scope
    )


async def centre_scope_school_ids(
    session: AsyncSession,
    centre: ExaminationCentre,
    *,
    membership_scope: ExaminationCentreMembershipScope | str | None = None,
) -> set[UUID]:
    scope = membership_scope
    if scope is None:
        exam = await session.get(Examination, centre.examination_id)
        if exam is None:
            return set()
        mode = exam.centre_structure_mode
        if isinstance(mode, str):
            mode = CentreStructureMode(mode)
        scope = (
            ExaminationCentreMembershipScope.ALL
            if mode == CentreStructureMode.UNIFIED
            else ExaminationCentreMembershipScope.CORE
        )
    scope = _normalize_membership_scope(scope)

    stmt = select(ExaminationCentreMembership.school_id).where(
        ExaminationCentreMembership.examination_centre_id == centre.id,
        ExaminationCentreMembership.subject_scope == scope,
    )
    result = await session.execute(stmt)
    return {row[0] for row in result.all()}


async def centre_scope_school_ids_for_host_overview(
    session: AsyncSession,
    centre: ExaminationCentre,
) -> set[UUID]:
    """All schools writing at this centre (host dashboard): union of scopes on SPLIT, not intersection."""
    exam = await get_examination_or_404(session, centre.examination_id)
    mode = exam.centre_structure_mode
    if isinstance(mode, str):
        mode = CentreStructureMode(mode)
    if mode == CentreStructureMode.UNIFIED:
        return await centre_scope_school_ids(
            session, centre, membership_scope=ExaminationCentreMembershipScope.ALL
        )
    core_ids = await centre_scope_school_ids(
        session, centre, membership_scope=ExaminationCentreMembershipScope.CORE
    )
    elect_ids = await centre_scope_school_ids(
        session, centre, membership_scope=ExaminationCentreMembershipScope.ELECTIVE
    )
    return core_ids | elect_ids


def membership_scope_for_timetable_filter(
    subject_filter: TimetableDownloadFilter,
) -> ExaminationCentreMembershipScope | None:
    """Map timetable subject filter to centre membership scope (SPLIT exams)."""
    if subject_filter == TimetableDownloadFilter.CORE_ONLY:
        return ExaminationCentreMembershipScope.CORE
    if subject_filter == TimetableDownloadFilter.ELECTIVE_ONLY:
        return ExaminationCentreMembershipScope.ELECTIVE
    return None


async def school_membership_scopes_at_centre(
    session: AsyncSession,
    examination_id: int,
    school_id: UUID,
    centre_id: UUID,
) -> set[ExaminationCentreMembershipScope]:
    stmt = select(ExaminationCentreMembership.subject_scope).where(
        ExaminationCentreMembership.examination_id == examination_id,
        ExaminationCentreMembership.school_id == school_id,
        ExaminationCentreMembership.examination_centre_id == centre_id,
    )
    result = await session.execute(stmt)
    scopes: set[ExaminationCentreMembershipScope] = set()
    for row in result.all():
        scopes.add(_normalize_membership_scope(row[0]))
    return scopes


def timetable_filters_for_memberships(
    memberships: set[ExaminationCentreMembershipScope],
    requested: TimetableDownloadFilter,
) -> list[TimetableDownloadFilter]:
    """
    Which timetable subject filters apply for a school at a centre.

    When requested is ALL on SPLIT exams, only include core and/or elective papers
    that match this school's membership at this centre (not every subject they sit nationally).
    """
    if ExaminationCentreMembershipScope.ALL in memberships:
        has_core = True
        has_elective = True
    else:
        has_core = ExaminationCentreMembershipScope.CORE in memberships
        has_elective = ExaminationCentreMembershipScope.ELECTIVE in memberships

    if requested == TimetableDownloadFilter.CORE_ONLY:
        return [TimetableDownloadFilter.CORE_ONLY] if has_core else []
    if requested == TimetableDownloadFilter.ELECTIVE_ONLY:
        return [TimetableDownloadFilter.ELECTIVE_ONLY] if has_elective else []
    filters: list[TimetableDownloadFilter] = []
    if has_core:
        filters.append(TimetableDownloadFilter.CORE_ONLY)
    if has_elective:
        filters.append(TimetableDownloadFilter.ELECTIVE_ONLY)
    return filters


async def scope_ids_for_centre_subject_filter(
    session: AsyncSession,
    centre: ExaminationCentre,
    scope_ids: set[UUID],
    *,
    subject_filter: TimetableDownloadFilter,
) -> set[UUID]:
    """On SPLIT exams, limit schools to those with the matching membership at this centre."""
    mem_scope = membership_scope_for_timetable_filter(subject_filter)
    if mem_scope is None:
        return scope_ids
    membership_ids = await centre_scope_school_ids(
        session, centre, membership_scope=mem_scope
    )
    return scope_ids & membership_ids


async def centre_scope_school_ids_for_inspector_scope(
    session: AsyncSession,
    centre: ExaminationCentre,
    inspector_scope: ExamInspectorSubjectScope | str,
) -> set[UUID]:
    exam = await get_examination_or_404(session, centre.examination_id)
    mem_scope = membership_scope_for_inspector_scope(exam, inspector_scope)
    ins = _normalize_inspector_scope(inspector_scope)
    if (
        exam.centre_structure_mode == CentreStructureMode.SPLIT
        and ins == ExamInspectorSubjectScope.ALL
    ):
        core_ids = await centre_scope_school_ids(
            session, centre, membership_scope=ExaminationCentreMembershipScope.CORE
        )
        elect_ids = await centre_scope_school_ids(
            session, centre, membership_scope=ExaminationCentreMembershipScope.ELECTIVE
        )
        # For inspectors assigned to BOTH CORE and ELECTIVE at this centre,
        # include schools that write only CORE or only ELECTIVE (union), not only
        # schools that appear in both scopes (intersection).
        return core_ids | elect_ids
    return await centre_scope_school_ids(session, centre, membership_scope=mem_scope)


async def schools_in_centre_scope_ordered(
    session: AsyncSession,
    centre: ExaminationCentre,
    *,
    membership_scope: ExaminationCentreMembershipScope | str | None = None,
) -> list[School]:
    ids = await centre_scope_school_ids(session, centre, membership_scope=membership_scope)
    if not ids:
        return []
    stmt = select(School).where(School.id.in_(ids)).order_by(School.code)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def list_centres_for_examination(
    session: AsyncSession,
    examination_id: int,
    *,
    membership_scope: ExaminationCentreMembershipScope | str | None = None,
) -> list[ExaminationCentre]:
    stmt = (
        select(ExaminationCentre)
        .where(ExaminationCentre.examination_id == examination_id)
        .options(selectinload(ExaminationCentre.memberships))
        .order_by(ExaminationCentre.code)
    )
    result = await session.execute(stmt)
    centres = list(result.scalars().all())
    if membership_scope is None:
        return centres
    scope = _normalize_membership_scope(membership_scope)
    filtered: list[ExaminationCentre] = []
    for c in centres:
        if any(m.subject_scope == scope for m in c.memberships):
            filtered.append(c)
    return filtered


async def hosted_school_count(
    session: AsyncSession,
    centre: ExaminationCentre,
    *,
    membership_scope: ExaminationCentreMembershipScope | str | None = None,
) -> int:
    scope = membership_scope
    if scope is None:
        exam = await session.get(Examination, centre.examination_id)
        if exam is None:
            return 0
        mode = exam.centre_structure_mode
        if isinstance(mode, str):
            mode = CentreStructureMode(mode)
        scope = (
            ExaminationCentreMembershipScope.ALL
            if mode == CentreStructureMode.UNIFIED
            else ExaminationCentreMembershipScope.CORE
        )
    scope = _normalize_membership_scope(scope)
    stmt = select(ExaminationCentreMembership).where(
        ExaminationCentreMembership.examination_centre_id == centre.id,
        ExaminationCentreMembership.subject_scope == scope,
    )
    result = await session.execute(stmt)
    return len(result.scalars().all())
