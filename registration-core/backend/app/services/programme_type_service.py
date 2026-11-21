"""Helpers for programme type taxonomy and exam enablement."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ExamEnabledProgrammeType, Programme, ProgrammeType, RegistrationExam


async def get_programme_type_or_404(session: AsyncSession, programme_type_id: int) -> ProgrammeType:
    result = await session.execute(select(ProgrammeType).where(ProgrammeType.id == programme_type_id))
    pt = result.scalar_one_or_none()
    if not pt:
        raise ValueError(f"Programme type {programme_type_id} not found")
    return pt


async def list_all_programme_types(session: AsyncSession, active_only: bool = False) -> list[ProgrammeType]:
    query = select(ProgrammeType).order_by(ProgrammeType.sort_order, ProgrammeType.name)
    if active_only:
        query = query.where(ProgrammeType.is_active.is_(True))
    result = await session.execute(query)
    return list(result.scalars().all())


def build_programme_type_tree(
    types: list[ProgrammeType],
) -> list[dict]:
    """Build nested tree dicts with path labels from a flat list."""
    by_id = {t.id: t for t in types}
    children_map: dict[int | None, list[ProgrammeType]] = {}
    for t in types:
        children_map.setdefault(t.parent_id, []).append(t)

    def path_for(node: ProgrammeType) -> str:
        parts: list[str] = []
        current: ProgrammeType | None = node
        while current is not None:
            parts.append(current.name)
            current = by_id.get(current.parent_id) if current.parent_id else None
        return " / ".join(reversed(parts))

    def build(node: ProgrammeType) -> dict:
        kids = sorted(children_map.get(node.id, []), key=lambda x: (x.sort_order, x.name))
        return {
            "id": node.id,
            "code": node.code,
            "name": node.name,
            "parent_id": node.parent_id,
            "sort_order": node.sort_order,
            "is_active": node.is_active,
            "created_at": node.created_at,
            "updated_at": node.updated_at,
            "path": path_for(node),
            "children": [build(c) for c in kids],
        }

    roots = sorted(children_map.get(None, []), key=lambda x: (x.sort_order, x.name))
    return [build(r) for r in roots]


def collect_subtree_ids(types: list[ProgrammeType], root_id: int) -> set[int]:
    """Return root_id plus all descendant ids."""
    children_map: dict[int | None, list[int]] = {}
    for t in types:
        children_map.setdefault(t.parent_id, []).append(t.id)

    collected: set[int] = set()

    def walk(nid: int) -> None:
        collected.add(nid)
        for child_id in children_map.get(nid, []):
            walk(child_id)

    walk(root_id)
    return collected


async def assert_root_programme_type(session: AsyncSession, programme_type_id: int) -> ProgrammeType:
    pt = await get_programme_type_or_404(session, programme_type_id)
    if pt.parent_id is not None:
        raise ValueError("Examination programme_type_id must be a top-level (root) programme type")
    if not pt.is_active:
        raise ValueError("Programme type is inactive")
    return pt


async def validate_enabled_programme_type_ids(
    session: AsyncSession,
    root_type_id: int,
    enabled_ids: list[int],
) -> list[int]:
    """Ensure every enabled id is the root or a descendant of the root."""
    if not enabled_ids:
        raise ValueError("At least one programme type must be enabled for the examination")

    types = await list_all_programme_types(session, active_only=False)
    allowed = collect_subtree_ids(types, root_type_id)
    unique_ids = list(dict.fromkeys(enabled_ids))
    invalid = [i for i in unique_ids if i not in allowed]
    if invalid:
        raise ValueError(
            f"Enabled programme type ids {invalid} are not under root programme type {root_type_id}"
        )
    type_by_id = {t.id: t for t in types}
    inactive = [i for i in unique_ids if not type_by_id[i].is_active]
    if inactive:
        raise ValueError(f"Cannot enable inactive programme types: {inactive}")
    return unique_ids


async def replace_exam_enabled_types(
    session: AsyncSession,
    exam: RegistrationExam,
    enabled_ids: list[int],
) -> None:
    """Replace enablement rows for an exam (explicit delete; no async lazy-load)."""
    if exam.id is None:
        await session.flush()

    await session.execute(
        delete(ExamEnabledProgrammeType).where(ExamEnabledProgrammeType.exam_id == exam.id)
    )
    await session.flush()
    for pt_id in enabled_ids:
        session.add(ExamEnabledProgrammeType(exam_id=exam.id, programme_type_id=pt_id))


async def get_enabled_programme_type_ids(session: AsyncSession, exam_id: int) -> set[int]:
    result = await session.execute(
        select(ExamEnabledProgrammeType.programme_type_id).where(
            ExamEnabledProgrammeType.exam_id == exam_id
        )
    )
    return set(result.scalars().all())


async def is_programme_enabled_for_exam(
    session: AsyncSession, exam_id: int, programme_id: int
) -> bool:
    result = await session.execute(select(Programme).where(Programme.id == programme_id))
    programme = result.scalar_one_or_none()
    if not programme or programme.programme_type_id is None:
        return False
    enabled = await get_enabled_programme_type_ids(session, exam_id)
    return programme.programme_type_id in enabled


async def list_programmes_for_exam(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
) -> list[Programme]:
    """Programmes whose type is exactly enabled on the exam; optionally intersect with school."""
    from app.models import school_programmes

    enabled = await get_enabled_programme_type_ids(session, exam_id)
    if not enabled:
        return []

    if school_id is not None:
        query = (
            select(Programme)
            .options(selectinload(Programme.programme_type))
            .join(school_programmes, school_programmes.c.programme_id == Programme.id)
            .where(school_programmes.c.school_id == school_id)
            .where(Programme.programme_type_id.in_(enabled))
            .order_by(Programme.name)
        )
    else:
        query = (
            select(Programme)
            .options(selectinload(Programme.programme_type))
            .where(Programme.programme_type_id.in_(enabled))
            .order_by(Programme.name)
        )
    result = await session.execute(query)
    return list(result.scalars().unique().all())


async def load_exam_with_taxonomy(session: AsyncSession, exam_id: int) -> RegistrationExam | None:
    result = await session.execute(
        select(RegistrationExam)
        .options(
            selectinload(RegistrationExam.registration_period),
            selectinload(RegistrationExam.programme_type),
            selectinload(RegistrationExam.series_definition),
            selectinload(RegistrationExam.enabled_programme_types),
        )
        .where(RegistrationExam.id == exam_id)
    )
    return result.scalar_one_or_none()
