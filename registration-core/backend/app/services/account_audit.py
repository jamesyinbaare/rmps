"""Append-only account lifecycle audit events."""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PortalAccountEvent

# Canonical action strings
USER_CREATED = "user.created"
USER_DEACTIVATED = "user.deactivated"
USER_ACTIVATED = "user.activated"
INVITE_SENT = "invite.sent"
INVITE_RESENT = "invite.resent"
PASSWORD_RESET_SENT = "password.reset_sent"
PASSWORD_CHANGED = "password.changed"
USERS_BULK_IMPORTED = "users.bulk_imported"


async def record_account_event(
    session: AsyncSession,
    *,
    action: str,
    target_user_id: UUID | None = None,
    actor_user_id: UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> PortalAccountEvent:
    event = PortalAccountEvent(
        actor_user_id=actor_user_id,
        target_user_id=target_user_id,
        action=action,
        event_metadata=metadata,
    )
    session.add(event)
    await session.flush()
    return event
