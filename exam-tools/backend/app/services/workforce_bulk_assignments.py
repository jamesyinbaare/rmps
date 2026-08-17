"""Exam-wide bulk assignment for script checkers (P1/P2 totals + days at post)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Examination, ScriptCheckerBulkAssignment, WorkforceAvailabilityStatus
from app.services.workforce_roster import WorkforceRosterNotFoundError, get_script_checker_or_404


def _require_assignable(person) -> None:
    status = person.availability_status
    value = status.value if hasattr(status, "value") else str(status)
    if value != WorkforceAvailabilityStatus.CONFIRMED.value:
        raise ValueError("This person must confirm their availability before scripts can be assigned.")


def bulk_assignment_to_dict(row: ScriptCheckerBulkAssignment) -> dict:
    return {
        "id": row.id,
        "examination_id": int(row.examination_id),
        "checker_id": row.checker_id,
        "paper1_script_count": int(row.paper1_script_count),
        "paper2_script_count": int(row.paper2_script_count),
        "num_days": int(row.num_days),
        "assigned_at": row.assigned_at,
        "assigned_by_user_id": row.assigned_by_user_id,
        "updated_at": row.updated_at,
        "updated_by_user_id": row.updated_by_user_id,
    }


async def upsert_script_checker_bulk_assignment(
    session: AsyncSession,
    *,
    examination_id: int,
    checker_id: UUID,
    paper1_script_count: int,
    paper2_script_count: int,
    num_days: int,
    actor_user_id: UUID | None,
) -> dict:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")

    if paper1_script_count < 0 or paper2_script_count < 0:
        raise ValueError("Script counts cannot be negative.")
    if paper1_script_count + paper2_script_count < 1:
        raise ValueError("Enter at least one script for Paper 1 or Paper 2.")
    if num_days < 1:
        raise ValueError("Days at post must be at least 1.")

    checker = await get_script_checker_or_404(
        session,
        examination_id=examination_id,
        checker_id=checker_id,
    )
    _require_assignable(checker)

    stmt = select(ScriptCheckerBulkAssignment).where(
        ScriptCheckerBulkAssignment.examination_id == examination_id,
        ScriptCheckerBulkAssignment.checker_id == checker_id,
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    now = datetime.utcnow()
    if existing is None:
        existing = ScriptCheckerBulkAssignment(
            examination_id=examination_id,
            checker_id=checker_id,
            paper1_script_count=paper1_script_count,
            paper2_script_count=paper2_script_count,
            num_days=num_days,
            assigned_at=now,
            assigned_by_user_id=actor_user_id,
            updated_at=now,
            updated_by_user_id=actor_user_id,
        )
        session.add(existing)
    else:
        existing.paper1_script_count = paper1_script_count
        existing.paper2_script_count = paper2_script_count
        existing.num_days = num_days
        existing.updated_at = now
        existing.updated_by_user_id = actor_user_id

    await session.flush()
    return bulk_assignment_to_dict(existing)
