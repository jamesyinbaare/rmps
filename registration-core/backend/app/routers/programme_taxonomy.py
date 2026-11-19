"""Admin endpoints for programme types and exam series catalog."""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, func

from app.dependencies.auth import SystemAdminDep
from app.dependencies.database import DBSessionDep
from app.models import ExamSeriesDefinition, Programme, ProgrammeType, RegistrationExam
from app.schemas.exam_series_def import (
    ExamSeriesDefinitionCreate,
    ExamSeriesDefinitionResponse,
    ExamSeriesDefinitionUpdate,
)
from app.schemas.programme_type import (
    ProgrammeTypeCreate,
    ProgrammeTypeResponse,
    ProgrammeTypeTreeNode,
    ProgrammeTypeUpdate,
)
from app.services.programme_type_service import (
    build_programme_type_tree,
    list_all_programme_types,
)

router = APIRouter(prefix="/api/v1/admin", tags=["programme-taxonomy"])


# ---- Programme types ----


@router.get("/programme-types", response_model=list[ProgrammeTypeResponse])
async def list_programme_types(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    active_only: bool = Query(False),
) -> list[ProgrammeTypeResponse]:
    types = await list_all_programme_types(session, active_only=active_only)
    return [ProgrammeTypeResponse.model_validate(t) for t in types]


@router.get("/programme-types/tree", response_model=list[ProgrammeTypeTreeNode])
async def get_programme_type_tree(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    active_only: bool = Query(True),
) -> list[ProgrammeTypeTreeNode]:
    types = await list_all_programme_types(session, active_only=active_only)
    tree = build_programme_type_tree(types)
    return [ProgrammeTypeTreeNode.model_validate(node) for node in tree]


@router.get("/programme-types/roots", response_model=list[ProgrammeTypeResponse])
async def list_root_programme_types(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    active_only: bool = Query(True),
) -> list[ProgrammeTypeResponse]:
    types = await list_all_programme_types(session, active_only=active_only)
    roots = [t for t in types if t.parent_id is None]
    return [ProgrammeTypeResponse.model_validate(t) for t in roots]


@router.post("/programme-types", response_model=ProgrammeTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_programme_type(
    data: ProgrammeTypeCreate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ProgrammeTypeResponse:
    existing = await session.execute(select(ProgrammeType).where(ProgrammeType.code == data.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Programme type code '{data.code}' already exists")

    if data.parent_id is not None:
        parent = await session.get(ProgrammeType, data.parent_id)
        if not parent:
            raise HTTPException(status_code=400, detail="Parent programme type not found")

    pt = ProgrammeType(
        code=data.code.strip(),
        name=data.name.strip(),
        parent_id=data.parent_id,
        sort_order=data.sort_order,
        is_active=data.is_active,
    )
    session.add(pt)
    await session.commit()
    await session.refresh(pt)
    return ProgrammeTypeResponse.model_validate(pt)


@router.get("/programme-types/{programme_type_id}", response_model=ProgrammeTypeResponse)
async def get_programme_type(
    programme_type_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ProgrammeTypeResponse:
    pt = await session.get(ProgrammeType, programme_type_id)
    if not pt:
        raise HTTPException(status_code=404, detail="Programme type not found")
    return ProgrammeTypeResponse.model_validate(pt)


@router.put("/programme-types/{programme_type_id}", response_model=ProgrammeTypeResponse)
async def update_programme_type(
    programme_type_id: int,
    data: ProgrammeTypeUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ProgrammeTypeResponse:
    pt = await session.get(ProgrammeType, programme_type_id)
    if not pt:
        raise HTTPException(status_code=404, detail="Programme type not found")

    update = data.model_dump(exclude_unset=True)
    if "code" in update and update["code"] != pt.code:
        existing = await session.execute(
            select(ProgrammeType).where(ProgrammeType.code == update["code"], ProgrammeType.id != pt.id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Programme type code '{update['code']}' already exists")

    if "parent_id" in update:
        new_parent = update["parent_id"]
        if new_parent == pt.id:
            raise HTTPException(status_code=400, detail="Programme type cannot be its own parent")
        if new_parent is not None:
            parent = await session.get(ProgrammeType, new_parent)
            if not parent:
                raise HTTPException(status_code=400, detail="Parent programme type not found")

    for key, value in update.items():
        setattr(pt, key, value)
    pt.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(pt)
    return ProgrammeTypeResponse.model_validate(pt)


@router.delete("/programme-types/{programme_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_programme_type(
    programme_type_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> None:
    pt = await session.get(ProgrammeType, programme_type_id)
    if not pt:
        raise HTTPException(status_code=404, detail="Programme type not found")

    child_count = await session.execute(
        select(func.count(ProgrammeType.id)).where(ProgrammeType.parent_id == programme_type_id)
    )
    if (child_count.scalar() or 0) > 0:
        raise HTTPException(status_code=400, detail="Cannot delete programme type with child types")

    prog_count = await session.execute(
        select(func.count(Programme.id)).where(Programme.programme_type_id == programme_type_id)
    )
    if (prog_count.scalar() or 0) > 0:
        raise HTTPException(status_code=400, detail="Cannot delete programme type with associated programmes")

    exam_count = await session.execute(
        select(func.count(RegistrationExam.id)).where(RegistrationExam.programme_type_id == programme_type_id)
    )
    if (exam_count.scalar() or 0) > 0:
        raise HTTPException(status_code=400, detail="Cannot delete programme type used by examinations")

    await session.delete(pt)
    await session.commit()


# ---- Exam series catalog ----


@router.get("/exam-series", response_model=list[ExamSeriesDefinitionResponse])
async def list_exam_series(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    active_only: bool = Query(False),
) -> list[ExamSeriesDefinitionResponse]:
    query = select(ExamSeriesDefinition).order_by(ExamSeriesDefinition.sort_order, ExamSeriesDefinition.short_name)
    if active_only:
        query = query.where(ExamSeriesDefinition.is_active.is_(True))
    result = await session.execute(query)
    return [ExamSeriesDefinitionResponse.model_validate(s) for s in result.scalars().all()]


@router.post("/exam-series", response_model=ExamSeriesDefinitionResponse, status_code=status.HTTP_201_CREATED)
async def create_exam_series(
    data: ExamSeriesDefinitionCreate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ExamSeriesDefinitionResponse:
    short_name = data.short_name.strip()
    existing = await session.execute(
        select(ExamSeriesDefinition).where(ExamSeriesDefinition.short_name == short_name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Exam series '{short_name}' already exists")

    series = ExamSeriesDefinition(
        short_name=short_name,
        long_name=data.long_name.strip(),
        sort_order=data.sort_order,
        is_active=data.is_active,
    )
    session.add(series)
    await session.commit()
    await session.refresh(series)
    return ExamSeriesDefinitionResponse.model_validate(series)


@router.put("/exam-series/{series_id}", response_model=ExamSeriesDefinitionResponse)
async def update_exam_series(
    series_id: int,
    data: ExamSeriesDefinitionUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ExamSeriesDefinitionResponse:
    series = await session.get(ExamSeriesDefinition, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Exam series not found")

    update = data.model_dump(exclude_unset=True)
    if "short_name" in update:
        update["short_name"] = update["short_name"].strip()
        existing = await session.execute(
            select(ExamSeriesDefinition).where(
                ExamSeriesDefinition.short_name == update["short_name"],
                ExamSeriesDefinition.id != series_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Exam series '{update['short_name']}' already exists")
    if "long_name" in update and update["long_name"] is not None:
        update["long_name"] = update["long_name"].strip()

    for key, value in update.items():
        setattr(series, key, value)
    series.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(series)
    return ExamSeriesDefinitionResponse.model_validate(series)


@router.delete("/exam-series/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exam_series(
    series_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> None:
    series = await session.get(ExamSeriesDefinition, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Exam series not found")

    exam_count = await session.execute(
        select(func.count(RegistrationExam.id)).where(RegistrationExam.exam_series_id == series_id)
    )
    if (exam_count.scalar() or 0) > 0:
        raise HTTPException(status_code=400, detail="Cannot delete exam series used by examinations")

    await session.delete(series)
    await session.commit()
