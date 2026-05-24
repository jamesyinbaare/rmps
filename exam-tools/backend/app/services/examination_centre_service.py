"""CRUD and upgrade helpers for examination centres."""
from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    CentreStructureMode,
    Examination,
    ExaminationCentre,
    ExaminationCentreMembership,
    ExaminationCentreMembershipScope,
    Region,
    School,
    Zone,
)
from app.services.centre_resolution import hosted_school_count


async def upgrade_examination_to_split(session: AsyncSession, examination_id: int) -> tuple[int, int]:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    mode = exam.centre_structure_mode
    if isinstance(mode, str):
        mode = CentreStructureMode(mode)
    if mode == CentreStructureMode.SPLIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Examination is already in SPLIT mode",
        )

    all_memberships = list(
        (
            await session.execute(
                select(ExaminationCentreMembership).where(
                    ExaminationCentreMembership.examination_id == examination_id,
                    ExaminationCentreMembership.subject_scope == ExaminationCentreMembershipScope.ALL,
                )
            )
        ).scalars().all()
    )

    created = 0
    for m in all_memberships:
        for scope in (
            ExaminationCentreMembershipScope.CORE,
            ExaminationCentreMembershipScope.ELECTIVE,
        ):
            session.add(
                ExaminationCentreMembership(
                    examination_id=examination_id,
                    examination_centre_id=m.examination_centre_id,
                    school_id=m.school_id,
                    subject_scope=scope,
                )
            )
            created += 1

    removed = len(all_memberships)
    if all_memberships:
        await session.execute(
            delete(ExaminationCentreMembership).where(
                ExaminationCentreMembership.examination_id == examination_id,
                ExaminationCentreMembership.subject_scope == ExaminationCentreMembershipScope.ALL,
            )
        )

    exam.centre_structure_mode = CentreStructureMode.SPLIT
    await session.flush()
    return created, removed


async def clone_centres_from_examination(
    session: AsyncSession,
    *,
    target_examination_id: int,
    source_examination_id: int,
) -> int:
    if target_examination_id == source_examination_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and target examination must differ",
        )
    source_exam = await session.get(Examination, source_examination_id)
    target_exam = await session.get(Examination, target_examination_id)
    if source_exam is None or target_exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")

    existing = await session.scalar(
        select(func.count())
        .select_from(ExaminationCentre)
        .where(ExaminationCentre.examination_id == target_examination_id)
    )
    if existing and int(existing) > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target examination already has centres; delete them first or use a new examination",
        )

    source_centres = list(
        (
            await session.execute(
                select(ExaminationCentre).where(
                    ExaminationCentre.examination_id == source_examination_id
                )
            )
        ).scalars().all()
    )
    id_map: dict[UUID, UUID] = {}
    for sc in source_centres:
        nc = ExaminationCentre(
            examination_id=target_examination_id,
            code=sc.code,
            name=sc.name,
            region=sc.region,
            zone=sc.zone,
        )
        session.add(nc)
        await session.flush()
        id_map[sc.id] = nc.id

    source_memberships = list(
        (
            await session.execute(
                select(ExaminationCentreMembership).where(
                    ExaminationCentreMembership.examination_id == source_examination_id
                )
            )
        ).scalars().all()
    )
    for sm in source_memberships:
        new_centre_id = id_map.get(sm.examination_centre_id)
        if new_centre_id is None:
            continue
        session.add(
            ExaminationCentreMembership(
                examination_id=target_examination_id,
                examination_centre_id=new_centre_id,
                school_id=sm.school_id,
                subject_scope=sm.subject_scope,
            )
        )

    target_exam.centre_structure_mode = source_exam.centre_structure_mode
    await session.flush()
    return len(source_centres)


def parse_region_zone(
    region: str | None,
    zone: str | None,
) -> tuple[Region | None, Zone | None]:
    reg: Region | None = None
    zn: Zone | None = None
    if region and region.strip():
        try:
            reg = Region(region.strip())
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid region: {region}",
            ) from exc
    if zone and zone.strip():
        try:
            zn = Zone(zone.strip())
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid zone: {zone}",
            ) from exc
    return reg, zn


async def centre_to_response(session: AsyncSession, centre: ExaminationCentre) -> dict:
    count = await hosted_school_count(session, centre)
    return {
        "id": centre.id,
        "examination_id": centre.examination_id,
        "code": centre.code,
        "name": centre.name,
        "region": centre.region.value if centre.region is not None else None,
        "zone": centre.zone.value if centre.zone is not None else None,
        "hosted_school_count": count,
        "created_at": centre.created_at,
        "updated_at": centre.updated_at,
    }
