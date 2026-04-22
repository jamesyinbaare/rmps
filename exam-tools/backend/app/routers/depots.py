"""Super admin: depots, depot keepers, and depot school listing for depot keepers."""

from typing import cast
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import asc, func, select
from sqlalchemy.exc import IntegrityError

from app.core.security import get_password_hash
from app.dependencies.auth import DepotKeeperDep, SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import Depot, School, User, UserRole
from app.schemas.depot import (
    DepotCreate,
    DepotKeeperCreate,
    DepotKeeperCreatedResponse,
    DepotKeeperListResponse,
    DepotKeeperRow,
    DepotListResponse,
    DepotResponse,
    DepotSchoolListResponse,
    DepotSchoolRow,
    DepotUpdate,
)
from app.services.depot_scope import depot_center_host_ids

router_admin = APIRouter(prefix="/depots", tags=["depots"])
router_keeper = APIRouter(prefix="/depot-keeper", tags=["depot-keeper"])

_MAX_PAGE = 100
_DEFAULT_PAGE = 20
# Admin UI loads up to this many depots for dropdowns (e.g. when creating a depot keeper).
_MAX_DEPOTS_LIST = 500


@router_admin.get("", response_model=DepotListResponse)
async def list_depots(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_PAGE, ge=1, le=_MAX_DEPOTS_LIST),
) -> DepotListResponse:
    total = int(await session.scalar(select(func.count()).select_from(Depot)) or 0)
    stmt = select(Depot).order_by(asc(Depot.code)).offset(skip).limit(limit)
    rows = list((await session.execute(stmt)).scalars().all())
    return DepotListResponse(items=[DepotResponse.model_validate(r) for r in rows], total=total)


@router_admin.post("", response_model=DepotResponse, status_code=status.HTTP_201_CREATED)
async def create_depot(
    data: DepotCreate,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> DepotResponse:
    code = data.code.strip()
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Depot code is required")
    depot = Depot(code=code, name=data.name.strip())
    session.add(depot)
    try:
        await session.commit()
        await session.refresh(depot)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A depot with this code already exists",
        ) from None
    return DepotResponse.model_validate(depot)


@router_admin.patch("/{depot_id}", response_model=DepotResponse)
async def update_depot(
    depot_id: UUID,
    data: DepotUpdate,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> DepotResponse:
    depot = await session.get(Depot, depot_id)
    if depot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Depot not found")
    payload = data.model_dump(exclude_unset=True)
    if "name" in payload and payload["name"] is not None:
        depot.name = str(payload["name"]).strip()
    if not payload:
        return DepotResponse.model_validate(depot)
    try:
        await session.commit()
        await session.refresh(depot)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not update depot") from None
    return DepotResponse.model_validate(depot)


@router_admin.get("/keepers", response_model=DepotKeeperListResponse)
async def list_depot_keepers(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_PAGE, ge=1, le=_MAX_PAGE),
) -> DepotKeeperListResponse:
    count_stmt = (
        select(func.count())
        .select_from(User)
        .where(User.role == UserRole.DEPOT_KEEPER, User.depot_id.isnot(None))
    )
    total = int(await session.scalar(count_stmt) or 0)
    stmt = (
        select(User, Depot.code, Depot.name)
        .join(Depot, Depot.id == User.depot_id)
        .where(User.role == UserRole.DEPOT_KEEPER)
        .order_by(asc(Depot.code), asc(User.full_name))
        .offset(skip)
        .limit(limit)
    )
    result = await session.execute(stmt)
    items = [
        DepotKeeperRow(
            id=row[0].id,
            full_name=cast(str, row[0].full_name),
            username=cast(str | None, row[0].username),
            depot_code=cast(str, row[1]),
            depot_name=cast(str, row[2]),
        )
        for row in result.all()
    ]
    return DepotKeeperListResponse(items=items, total=total)


@router_admin.post("/keepers", response_model=DepotKeeperCreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_depot_keeper(
    data: DepotKeeperCreate,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> DepotKeeperCreatedResponse:
    code = data.depot_code.strip()
    stmt = select(Depot).where(Depot.code == code)
    depot = (await session.execute(stmt)).scalar_one_or_none()
    if depot is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"No depot with code {code!r}")

    uname = data.username.strip()
    if not uname:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username is required",
        )
    dup_user = await session.execute(select(User).where(User.username == uname))
    if dup_user.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This username is already in use",
        )

    user = User(
        depot_id=depot.id,
        username=uname,
        full_name=data.full_name.strip(),
        role=UserRole.DEPOT_KEEPER,
        hashed_password=get_password_hash(data.password),
        is_active=True,
    )
    session.add(user)
    try:
        await session.commit()
        await session.refresh(user)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create depot keeper",
        ) from None

    return DepotKeeperCreatedResponse(
        id=user.id,
        full_name=user.full_name,
        username=cast(str, user.username),
        depot_code=depot.code,
    )


@router_keeper.get("/schools", response_model=DepotSchoolListResponse)
async def list_my_depot_schools(
    session: DBSessionDep,
    user: DepotKeeperDep,
) -> DepotSchoolListResponse:
    if user.depot_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is not linked to a depot",
        )
    stmt = select(School).where(School.depot_id == user.depot_id).order_by(asc(School.code))
    schools = list((await session.execute(stmt)).scalars().all())
    items = [DepotSchoolRow(id=s.id, code=s.code, name=s.name) for s in schools]
    return DepotSchoolListResponse(items=items)


@router_keeper.get("/centers", response_model=DepotSchoolListResponse)
async def list_my_depot_centers(
    session: DBSessionDep,
    user: DepotKeeperDep,
) -> DepotSchoolListResponse:
    """Distinct examination centre hosts for schools in the depot (for question paper control)."""

    if user.depot_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is not linked to a depot",
        )
    center_ids = await depot_center_host_ids(session, user.depot_id)
    if not center_ids:
        return DepotSchoolListResponse(items=[])
    stmt = select(School).where(School.id.in_(center_ids)).order_by(asc(School.code))
    schools = list((await session.execute(stmt)).scalars().all())
    items = [DepotSchoolRow(id=s.id, code=s.code, name=s.name) for s in schools]
    return DepotSchoolListResponse(items=items)
