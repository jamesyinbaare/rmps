from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examiner, ExaminerGroup, ExaminerGroupMember, ExaminerGroupSourceRegion, Examination, Region
from app.schemas.examiner_groups import (
    ExaminerGroupCreate,
    ExaminerGroupMembersReplace,
    ExaminerGroupResponse,
    ExaminerGroupSourceRegionsReplace,
    ExaminerGroupUpdate,
)
from app.services.examiner_roster import parse_region

router = APIRouter(tags=["examiner-groups"])


async def _sync_group_members_to_cohort_regions(
    session: AsyncSession,
    *,
    examination_id: int,
    group_id: UUID,
    regions: list[Region],
) -> None:
    """
    Assign group membership from examiner home regions matching `regions`.

    Each selected region means: include every examiner on this examination whose `Examiner.region`
    is that value. For allocation, the same regions also map schools in those regions to this
    group's script cohort (envelopes are bucketed by school.region).
    """
    await session.execute(delete(ExaminerGroupMember).where(ExaminerGroupMember.group_id == group_id))
    if not regions:
        return
    region_set = set(regions)
    stmt = select(Examiner.id).where(
        Examiner.examination_id == examination_id,
        Examiner.region.in_(region_set),
    )
    ids = list(dict.fromkeys((await session.execute(stmt)).scalars().all()))
    if not ids:
        return
    other_groups = select(ExaminerGroup.id).where(
        ExaminerGroup.examination_id == examination_id,
        ExaminerGroup.id != group_id,
    )
    await session.execute(
        delete(ExaminerGroupMember).where(
            ExaminerGroupMember.examiner_id.in_(ids),
            ExaminerGroupMember.group_id.in_(other_groups),
        )
    )
    for eid in ids:
        session.add(ExaminerGroupMember(group_id=group_id, examiner_id=eid))


async def _get_examination_or_404(session: AsyncSession, examination_id: int) -> Examination:
    row = await session.get(Examination, examination_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return row


def _group_response(g: ExaminerGroup) -> ExaminerGroupResponse:
    return ExaminerGroupResponse(
        id=g.id,
        examination_id=int(g.examination_id),
        name=g.name,
        examiner_ids=[m.examiner_id for m in g.members],
        source_regions=[r.region.value for r in g.source_regions],
        created_at=g.created_at,
        updated_at=g.updated_at,
    )


async def _load_group(
    session: AsyncSession,
    *,
    examination_id: int,
    group_id: UUID,
) -> ExaminerGroup | None:
    stmt = (
        select(ExaminerGroup)
        .where(ExaminerGroup.id == group_id, ExaminerGroup.examination_id == examination_id)
        .options(selectinload(ExaminerGroup.members), selectinload(ExaminerGroup.source_regions))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


@router.get("/examinations/{examination_id}/examiner-groups", response_model=list[ExaminerGroupResponse])
async def list_examiner_groups(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
) -> list[ExaminerGroupResponse]:
    await _get_examination_or_404(session, examination_id)
    stmt = (
        select(ExaminerGroup)
        .where(ExaminerGroup.examination_id == examination_id)
        .options(selectinload(ExaminerGroup.members), selectinload(ExaminerGroup.source_regions))
        .order_by(ExaminerGroup.name)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return [_group_response(g) for g in rows]


@router.post(
    "/examinations/{examination_id}/examiner-groups",
    response_model=ExaminerGroupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_examiner_group(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    body: ExaminerGroupCreate,
) -> ExaminerGroupResponse:
    await _get_examination_or_404(session, examination_id)
    g = ExaminerGroup(examination_id=examination_id, name=body.name.strip())
    session.add(g)
    await session.flush()

    regions: list[Region] = []
    seen: set[str] = set()
    for raw in body.source_regions:
        key = str(raw).strip()
        if not key:
            continue
        if key.lower() in seen:
            continue
        seen.add(key.lower())
        regions.append(parse_region(key))

    for r in regions:
        session.add(
            ExaminerGroupSourceRegion(
                group_id=g.id,
                examination_id=examination_id,
                region=r,
            )
        )
    await _sync_group_members_to_cohort_regions(
        session,
        examination_id=examination_id,
        group_id=g.id,
        regions=regions,
    )
    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Each region may belong to at most one group's cohort for this examination.",
        ) from e

    g2 = await _load_group(session, examination_id=examination_id, group_id=g.id)
    assert g2 is not None
    return _group_response(g2)


@router.get(
    "/examinations/{examination_id}/examiner-groups/{group_id}",
    response_model=ExaminerGroupResponse,
)
async def get_examiner_group(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    group_id: UUID,
) -> ExaminerGroupResponse:
    g = await _load_group(session, examination_id=examination_id, group_id=group_id)
    if g is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner group not found")
    return _group_response(g)


@router.patch(
    "/examinations/{examination_id}/examiner-groups/{group_id}",
    response_model=ExaminerGroupResponse,
)
async def update_examiner_group(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    group_id: UUID,
    body: ExaminerGroupUpdate,
) -> ExaminerGroupResponse:
    g = await _load_group(session, examination_id=examination_id, group_id=group_id)
    if g is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner group not found")
    if body.name is not None:
        g.name = body.name.strip()
    await session.commit()
    g2 = await _load_group(session, examination_id=examination_id, group_id=group_id)
    assert g2 is not None
    return _group_response(g2)


@router.delete(
    "/examinations/{examination_id}/examiner-groups/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_examiner_group(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    group_id: UUID,
) -> None:
    g = await _load_group(session, examination_id=examination_id, group_id=group_id)
    if g is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner group not found")
    await session.delete(g)
    await session.commit()


@router.put(
    "/examinations/{examination_id}/examiner-groups/{group_id}/members",
    response_model=ExaminerGroupResponse,
)
async def replace_examiner_group_members(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    group_id: UUID,
    body: ExaminerGroupMembersReplace,
) -> ExaminerGroupResponse:
    g = await _load_group(session, examination_id=examination_id, group_id=group_id)
    if g is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner group not found")

    ids = list(dict.fromkeys(body.examiner_ids))
    if ids:
        stmt = select(Examiner.id).where(Examiner.examination_id == examination_id, Examiner.id.in_(ids))
        found = set((await session.execute(stmt)).scalars().all())
        missing = [str(i) for i in ids if i not in found]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Examiners not in this examination: {', '.join(missing)}",
            )

    await session.execute(delete(ExaminerGroupMember).where(ExaminerGroupMember.group_id == group_id))
    if ids:
        other_groups = select(ExaminerGroup.id).where(
            ExaminerGroup.examination_id == examination_id,
            ExaminerGroup.id != group_id,
        )
        await session.execute(
            delete(ExaminerGroupMember).where(
                ExaminerGroupMember.examiner_id.in_(ids),
                ExaminerGroupMember.group_id.in_(other_groups),
            )
        )
    for eid in ids:
        session.add(ExaminerGroupMember(group_id=group_id, examiner_id=eid))
    await session.commit()

    g2 = await _load_group(session, examination_id=examination_id, group_id=group_id)
    assert g2 is not None
    return _group_response(g2)


@router.put(
    "/examinations/{examination_id}/examiner-groups/{group_id}/source-regions",
    response_model=ExaminerGroupResponse,
)
async def replace_examiner_group_source_regions(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    group_id: UUID,
    body: ExaminerGroupSourceRegionsReplace,
) -> ExaminerGroupResponse:
    g = await _load_group(session, examination_id=examination_id, group_id=group_id)
    if g is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner group not found")

    regions: list[Region] = []
    seen: set[str] = set()
    for raw in body.regions:
        key = str(raw).strip()
        if not key:
            continue
        if key.lower() in seen:
            continue
        seen.add(key.lower())
        regions.append(parse_region(key))

    await session.execute(delete(ExaminerGroupSourceRegion).where(ExaminerGroupSourceRegion.group_id == group_id))
    for r in regions:
        session.add(
            ExaminerGroupSourceRegion(
                group_id=group_id,
                examination_id=examination_id,
                region=r,
            )
        )
    await _sync_group_members_to_cohort_regions(
        session,
        examination_id=examination_id,
        group_id=group_id,
        regions=regions,
    )
    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Each region may belong to at most one group's cohort for this examination.",
        ) from e

    g2 = await _load_group(session, examination_id=examination_id, group_id=group_id)
    assert g2 is not None
    return _group_response(g2)
