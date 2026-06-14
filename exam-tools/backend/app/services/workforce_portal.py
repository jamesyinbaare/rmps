"""Portal token generation and URLs for workforce rosters."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import DataEntryClerk, Examination, ScriptChecker
from app.services.exam_official_export import examination_label
from app.services.examiner_invitation import generate_invitation_token


def generate_portal_token() -> str:
    return generate_invitation_token()


def script_checker_portal_url(token: str) -> str:
    base = settings.examiner_invitation_base_url.rstrip("/")
    return f"{base}/sc/{token}"


def data_entry_clerk_portal_url(token: str) -> str:
    base = settings.examiner_invitation_base_url.rstrip("/")
    return f"{base}/de/{token}"


async def resolve_script_checker_by_token(session: AsyncSession, token: str) -> ScriptChecker | None:
    stmt = (
        select(ScriptChecker)
        .where(ScriptChecker.portal_token == token)
        .options(
            selectinload(ScriptChecker.examination),
            selectinload(ScriptChecker.bank_account),
            selectinload(ScriptChecker.assignment_batches),
        )
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def resolve_data_entry_clerk_by_token(session: AsyncSession, token: str) -> DataEntryClerk | None:
    stmt = (
        select(DataEntryClerk)
        .where(DataEntryClerk.portal_token == token)
        .options(
            selectinload(DataEntryClerk.examination),
            selectinload(DataEntryClerk.bank_account),
            selectinload(DataEntryClerk.assignment_batches),
        )
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def _exam_label(exam: Examination | None) -> str:
    if exam is None:
        return ""
    return examination_label(exam)


async def public_script_checker_portal_view(session: AsyncSession, checker: ScriptChecker) -> dict:
    from app.services.workforce_assignment_batches import batches_to_public_rows
    from app.services.workforce_availability import can_respond_to_workforce_availability

    exam = checker.examination
    active, completed = await batches_to_public_rows(session, checker.assignment_batches)
    status = checker.availability_status
    return {
        "id": checker.id,
        "name": checker.name,
        "examination_id": int(checker.examination_id),
        "examination_label": _exam_label(exam),
        "reference_code": checker.reference_code,
        "region": checker.region.value if checker.region is not None else None,
        "role_label": "Script checker",
        "availability_status": status.value if hasattr(status, "value") else str(status),
        "availability_responded_at": checker.availability_responded_at,
        "availability_deadline": checker.availability_deadline,
        "can_respond": can_respond_to_workforce_availability(checker),
        "active_batches": active,
        "completed_batches": completed,
        "has_bank_account": checker.bank_account is not None,
    }


async def public_data_entry_clerk_portal_view(session: AsyncSession, clerk: DataEntryClerk) -> dict:
    from app.services.workforce_assignment_batches import batches_to_public_rows
    from app.services.workforce_availability import can_respond_to_workforce_availability

    exam = clerk.examination
    active, completed = await batches_to_public_rows(session, clerk.assignment_batches)
    status = clerk.availability_status
    return {
        "id": clerk.id,
        "name": clerk.name,
        "examination_id": int(clerk.examination_id),
        "examination_label": _exam_label(exam),
        "reference_code": clerk.reference_code,
        "region": clerk.region.value if clerk.region is not None else None,
        "role_label": "Data entry clerk",
        "availability_status": status.value if hasattr(status, "value") else str(status),
        "availability_responded_at": clerk.availability_responded_at,
        "availability_deadline": clerk.availability_deadline,
        "can_respond": can_respond_to_workforce_availability(clerk),
        "active_batches": active,
        "completed_batches": completed,
        "has_bank_account": clerk.bank_account is not None,
    }
