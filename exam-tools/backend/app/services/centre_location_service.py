"""Upsert and resolve centre_locations by examination centre code."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CentreLocation, CentreLocationSource, ExaminationCentre, User

# Approximate Ghana bounding box for sanity checks on field captures.
GHANA_LAT_MIN = 4.5
GHANA_LAT_MAX = 11.5
GHANA_LNG_MIN = -3.5
GHANA_LNG_MAX = 1.5


def normalize_centre_code(code: str) -> str:
    return code.strip().upper()


def validate_coordinates(latitude: float, longitude: float) -> None:
    if not (-90 <= latitude <= 90):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="latitude must be between -90 and 90",
        )
    if not (-180 <= longitude <= 180):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="longitude must be between -180 and 180",
        )
    if not (GHANA_LAT_MIN <= latitude <= GHANA_LAT_MAX and GHANA_LNG_MIN <= longitude <= GHANA_LNG_MAX):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Coordinates appear outside Ghana; check GPS reading or enter manually",
        )


def _decimal_coord(value: float) -> Decimal:
    return Decimal(str(round(value, 6)))


def _float_coord(value: Decimal | float) -> float:
    return float(value)


async def get_location_by_code(
    session: AsyncSession,
    centre_code: str,
) -> CentreLocation | None:
    key = normalize_centre_code(centre_code)
    return await session.scalar(select(CentreLocation).where(CentreLocation.centre_code == key))


async def get_locations_by_codes(
    session: AsyncSession,
    centre_codes: list[str],
) -> dict[str, CentreLocation]:
    if not centre_codes:
        return {}
    keys = {normalize_centre_code(c) for c in centre_codes if c and str(c).strip()}
    if not keys:
        return {}
    rows = list(
        (await session.execute(select(CentreLocation).where(CentreLocation.centre_code.in_(keys)))).scalars().all()
    )
    return {row.centre_code: row for row in rows}


def location_to_dict(row: CentreLocation | None) -> dict | None:
    if row is None:
        return None
    source = row.source
    if isinstance(source, CentreLocationSource):
        source_val = source
    else:
        source_val = CentreLocationSource(str(source))
    return {
        "centre_code": row.centre_code,
        "latitude": _float_coord(row.latitude),
        "longitude": _float_coord(row.longitude),
        "accuracy_m": row.accuracy_m,
        "source": source_val,
        "captured_at": row.captured_at,
        "captured_by_user_id": row.captured_by_user_id,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


async def location_for_examination_centre(
    session: AsyncSession,
    centre: ExaminationCentre,
) -> dict | None:
    row = await get_location_by_code(session, str(centre.code))
    return location_to_dict(row)


async def upsert_centre_location(
    session: AsyncSession,
    *,
    centre_code: str,
    latitude: float,
    longitude: float,
    source: CentreLocationSource,
    captured_by_user_id: UUID | None,
    accuracy_m: float | None = None,
) -> CentreLocation:
    validate_coordinates(latitude, longitude)
    key = normalize_centre_code(centre_code)
    if not key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="centre_code is required")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    existing = await get_location_by_code(session, key)
    lat_dec = _decimal_coord(latitude)
    lng_dec = _decimal_coord(longitude)

    if existing is None:
        row = CentreLocation(
            centre_code=key,
            latitude=lat_dec,
            longitude=lng_dec,
            accuracy_m=accuracy_m,
            source=source,
            captured_at=now,
            captured_by_user_id=captured_by_user_id,
        )
        session.add(row)
        await session.flush()
        return row

    existing.latitude = lat_dec
    existing.longitude = lng_dec
    existing.accuracy_m = accuracy_m
    existing.source = source
    existing.captured_at = now
    existing.captured_by_user_id = captured_by_user_id
    await session.flush()
    return existing


async def delete_location_by_code(session: AsyncSession, centre_code: str) -> bool:
    row = await get_location_by_code(session, centre_code)
    if row is None:
        return False
    await session.delete(row)
    await session.flush()
    return True
