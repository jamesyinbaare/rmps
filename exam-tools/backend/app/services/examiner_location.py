"""Town and GhanaPost GPS address for rostered examiners."""

from __future__ import annotations

from datetime import datetime
from typing import cast
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Examiner

GHANAPOST_GPS_MAX_LEN = 50


def normalize_town(raw: str) -> str:
    town = raw.strip()
    if not town:
        raise ValueError("Town is required.")
    if len(town) > 255:
        raise ValueError("Town must be 255 characters or fewer.")
    return town


def normalize_ghanapost_gps(raw: str) -> str:
    text = raw.strip()
    if not text:
        raise ValueError("GhanaPost GPS address is required.")
    if len(text) > GHANAPOST_GPS_MAX_LEN:
        raise ValueError("GhanaPost GPS address must be 50 characters or fewer.")
    return text


def examiner_has_location(examiner: Examiner) -> bool:
    town = cast(str | None, examiner.town)
    gps = cast(str | None, examiner.ghanapost_gps_address)
    return bool(town and town.strip() and gps and gps.strip())


def location_to_dict(examiner: Examiner) -> dict:
    return {
        "town": cast(str, examiner.town),
        "ghanapost_gps_address": cast(str, examiner.ghanapost_gps_address),
        "updated_at": cast(datetime, examiner.updated_at),
    }


async def get_location_by_examiner_id(
    session: AsyncSession,
    examiner_id: UUID,
) -> Examiner | None:
    examiner = await session.get(Examiner, examiner_id)
    if examiner is None or not examiner_has_location(examiner):
        return None
    return examiner


async def upsert_location_for_examiner(
    session: AsyncSession,
    *,
    examiner_id: UUID,
    town: str,
    ghanapost_gps_address: str,
) -> Examiner:
    examiner = await session.get(Examiner, examiner_id)
    if examiner is None:
        raise ValueError("Examiner not found.")

    normalized_town = normalize_town(town)
    normalized_gps = normalize_ghanapost_gps(ghanapost_gps_address)

    now = datetime.utcnow()
    examiner.town = normalized_town
    examiner.ghanapost_gps_address = normalized_gps
    examiner.updated_at = now
    await session.flush()
    await session.refresh(examiner)
    return examiner
