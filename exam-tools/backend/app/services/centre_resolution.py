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
        return core_ids & elect_ids
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
