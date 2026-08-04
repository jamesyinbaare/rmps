"""Application settings endpoints."""

from fastapi import APIRouter

from app.dependencies.auth import CurrentUserDep, RegistrarDep
from app.dependencies.database import DBSessionDep
from app.schemas.settings import ClerkDigitalEntrySetting, ClerkDigitalEntryUpdate
from app.services.app_settings_service import (
    is_clerk_digital_entry_enabled,
    set_clerk_digital_entry_enabled,
)

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.get("/clerk-digital-entry", response_model=ClerkDigitalEntrySetting)
async def get_clerk_digital_entry(
    session: DBSessionDep,
    _: CurrentUserDep,
) -> ClerkDigitalEntrySetting:
    """Any authenticated user may read this (clerks need it for nav/gates)."""
    enabled = await is_clerk_digital_entry_enabled(session)
    return ClerkDigitalEntrySetting(enabled=enabled)


@router.put("/clerk-digital-entry", response_model=ClerkDigitalEntrySetting)
async def put_clerk_digital_entry(
    body: ClerkDigitalEntryUpdate,
    session: DBSessionDep,
    current_user: RegistrarDep,
) -> ClerkDigitalEntrySetting:
    """Registrar or above may enable/disable digital entry for all dataclerks."""
    settings = await set_clerk_digital_entry_enabled(
        session,
        enabled=body.enabled,
        updated_by_user_id=current_user.id,
    )
    await session.commit()
    return ClerkDigitalEntrySetting(enabled=bool(settings.clerk_digital_entry_enabled))
