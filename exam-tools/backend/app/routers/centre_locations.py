"""Centre GPS locations (keyed by centre code) and per-examination centre capture."""

from __future__ import annotations

import csv
import io
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, select

from app.dependencies.auth import (
    CurrentUserDep,
    InspectorJwtPostingIdDep,
    SuperAdminOrFinanceOfficerDep,
)
from app.dependencies.database import DBSessionDep
from app.models import CentreLocation, CentreLocationSource, User, UserRole
from app.schemas.centre_location import (
    CentreLocationListResponse,
    CentreLocationResponse,
    CentreLocationUpdate,
)
from app.services.centre_location_service import (
    delete_location_by_code,
    get_location_by_code,
    location_to_dict,
    normalize_centre_code,
    upsert_centre_location,
)
from app.services.centre_resolution import get_examination_centre_or_404
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.inspector_posting import resolve_inspector_workspace

exam_router = APIRouter(prefix="/examinations", tags=["centre-locations"])
admin_router = APIRouter(prefix="/centre-locations", tags=["centre-locations"])


def _row_to_response(row: CentreLocation) -> CentreLocationResponse:
    data = location_to_dict(row)
    assert data is not None
    return CentreLocationResponse(**data)


async def _authorize_centre_location_write(
    session: DBSessionDep,
    *,
    examination_id: int,
    centre_id: UUID,
    user: User,
    jwt_posting_id: UUID | None,
) -> None:
    if user.role in (UserRole.SUPER_ADMIN, UserRole.FINANCE_OFFICER):
        await get_examination_centre_or_404(session, examination_id, centre_id)
        return
    if user.role != UserRole.INSPECTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None
    ctx = await resolve_inspector_workspace(
        session,
        examination_id=examination_id,
        user=user,
        posting_id=None,
        jwt_posting_id=jwt_posting_id,
    )
    if ctx.examination_centre.id != centre_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only record location for your posted examination centre",
        )


@exam_router.get(
    "/{examination_id}/centres/{centre_id}/location",
    response_model=CentreLocationResponse,
)
async def get_examination_centre_location(
    examination_id: int,
    centre_id: UUID,
    session: DBSessionDep,
    user: CurrentUserDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
) -> CentreLocationResponse:
    await _authorize_centre_location_write(
        session,
        examination_id=examination_id,
        centre_id=centre_id,
        user=user,
        jwt_posting_id=jwt_posting_id,
    )
    centre = await get_examination_centre_or_404(session, examination_id, centre_id)
    row = await get_location_by_code(session, str(centre.code))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Centre location not recorded")
    return _row_to_response(row)


@exam_router.put(
    "/{examination_id}/centres/{centre_id}/location",
    response_model=CentreLocationResponse,
)
async def upsert_examination_centre_location(
    examination_id: int,
    centre_id: UUID,
    body: CentreLocationUpdate,
    session: DBSessionDep,
    user: CurrentUserDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    replace: bool = Query(
        False,
        description="Inspectors must pass true to overwrite an existing location for this centre code.",
    ),
) -> CentreLocationResponse:
    await _authorize_centre_location_write(
        session,
        examination_id=examination_id,
        centre_id=centre_id,
        user=user,
        jwt_posting_id=jwt_posting_id,
    )
    centre = await get_examination_centre_or_404(session, examination_id, centre_id)
    if user.role == UserRole.INSPECTOR:
        existing = await get_location_by_code(session, str(centre.code))
        if existing is not None and not replace:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "A location is already recorded for this centre. "
                    "Choose “Change location” on the app to replace it."
                ),
            )
    source = (
        CentreLocationSource.INSPECTOR_GPS
        if user.role == UserRole.INSPECTOR
        else CentreLocationSource.ADMIN_MANUAL
    )
    row = await upsert_centre_location(
        session,
        centre_code=str(centre.code),
        latitude=body.latitude,
        longitude=body.longitude,
        accuracy_m=body.accuracy_m,
        source=source,
        captured_by_user_id=user.id,
    )
    await session.commit()
    await session.refresh(row)
    return _row_to_response(row)


@admin_router.get("", response_model=CentreLocationListResponse)
async def list_centre_locations(
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    offset: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=2000),
) -> CentreLocationListResponse:
    total = int(await session.scalar(select(func.count()).select_from(CentreLocation)) or 0)
    stmt = (
        select(CentreLocation)
        .order_by(CentreLocation.centre_code)
        .offset(offset)
        .limit(limit)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return CentreLocationListResponse(
        items=[_row_to_response(r) for r in rows],
        total=total,
    )


@admin_router.get("/export.csv")
async def export_centre_locations_csv(
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
) -> Response:
    rows = list(
        (await session.execute(select(CentreLocation).order_by(CentreLocation.centre_code))).scalars().all()
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "centre_code",
            "latitude",
            "longitude",
            "accuracy_m",
            "source",
            "captured_at",
        ]
    )
    for row in rows:
        source = row.source.value if hasattr(row.source, "value") else str(row.source)
        writer.writerow(
            [
                row.centre_code,
                float(row.latitude),
                float(row.longitude),
                row.accuracy_m if row.accuracy_m is not None else "",
                source,
                row.captured_at.isoformat() if row.captured_at else "",
            ]
        )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="centre_locations.csv"'},
    )


@admin_router.get("/{centre_code}", response_model=CentreLocationResponse)
async def get_centre_location_by_code(
    centre_code: str,
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
) -> CentreLocationResponse:
    row = await get_location_by_code(session, centre_code)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Centre location not found")
    return _row_to_response(row)


@admin_router.put("/{centre_code}", response_model=CentreLocationResponse)
async def admin_upsert_centre_location_by_code(
    centre_code: str,
    body: CentreLocationUpdate,
    session: DBSessionDep,
    user: SuperAdminOrFinanceOfficerDep,
) -> CentreLocationResponse:
    row = await upsert_centre_location(
        session,
        centre_code=centre_code,
        latitude=body.latitude,
        longitude=body.longitude,
        accuracy_m=body.accuracy_m,
        source=CentreLocationSource.ADMIN_MANUAL,
        captured_by_user_id=user.id,
    )
    await session.commit()
    await session.refresh(row)
    return _row_to_response(row)


@admin_router.delete("/{centre_code}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_centre_location(
    centre_code: str,
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
) -> None:
    key = normalize_centre_code(centre_code)
    deleted = await delete_location_by_code(session, key)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Centre location not found")
    await session.commit()
