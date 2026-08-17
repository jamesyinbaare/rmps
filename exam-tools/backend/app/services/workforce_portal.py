"""Portal token generation and URLs for workforce rosters."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import DataEntryClerk, Examination, ScriptChecker, WorkforceAvailabilityStatus, WorkforceKind
from app.services.exam_official_export import examination_label
from app.services.examiner_invitation import generate_invitation_token
from app.services.workforce_portal_release import release_display_fields_for_person


def generate_portal_token() -> str:
    return generate_invitation_token()


def script_checker_portal_url(token: str) -> str:
    base = settings.examiner_invitation_base_url.rstrip("/")
    return f"{base}/sc/{token}"


def data_entry_clerk_portal_url(token: str) -> str:
    base = settings.examiner_invitation_base_url.rstrip("/")
    return f"{base}/de/{token}"


async def _portal_token_in_use(session: AsyncSession, token: str) -> bool:
    checker_stmt = select(ScriptChecker.id).where(ScriptChecker.portal_token == token).limit(1)
    if (await session.execute(checker_stmt)).first() is not None:
        return True
    clerk_stmt = select(DataEntryClerk.id).where(DataEntryClerk.portal_token == token).limit(1)
    return (await session.execute(clerk_stmt)).first() is not None


async def generate_unique_workforce_portal_token(session: AsyncSession) -> str:
    for _ in range(32):
        token = generate_portal_token()
        if not await _portal_token_in_use(session, token):
            return token
    raise RuntimeError("Could not allocate a unique portal token.")


async def regenerate_script_checker_portal_link(session: AsyncSession, checker: ScriptChecker) -> str:
    """Rotate portal token; refresh availability deadline when still pending."""
    from app.services.workforce_availability import workforce_availability_deadline_from_now

    token = await generate_unique_workforce_portal_token(session)
    checker.portal_token = token
    checker.updated_at = datetime.utcnow()
    status = checker.availability_status
    status_value = status.value if hasattr(status, "value") else str(status)
    if status_value == WorkforceAvailabilityStatus.PENDING.value:
        checker.availability_deadline = workforce_availability_deadline_from_now()
    await session.flush()
    return script_checker_portal_url(token)


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
    release_fields = await release_display_fields_for_person(
        session,
        examination_id=int(checker.examination_id),
        kind=WorkforceKind.SCRIPT_CHECKER,
        person_id=checker.id,
        person_accepted=checker.availability_status == WorkforceAvailabilityStatus.CONFIRMED,
    )
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
        "appointment_letters_available": release_fields["appointment_letters_available"],
        "appointment_letters_pending_message": release_fields["appointment_letters_pending_message"],
        "bank_details_editable": release_fields["bank_details_editable"],
        "bank_details_pending_message": release_fields["bank_details_pending_message"],
        "exercise_start_date": release_fields["exercise_start_date"],
        "work_start_time": release_fields["work_start_time"],
        "work_end_time": release_fields["work_end_time"],
        "venue": release_fields["venue"],
        "cohort_name": release_fields["cohort_name"],
    }


async def public_data_entry_clerk_portal_view(session: AsyncSession, clerk: DataEntryClerk) -> dict:
    from app.services.workforce_assignment_batches import batches_to_public_rows
    from app.services.workforce_availability import can_respond_to_workforce_availability

    exam = clerk.examination
    active, completed = await batches_to_public_rows(session, clerk.assignment_batches)
    status = clerk.availability_status
    release_fields = await release_display_fields_for_person(
        session,
        examination_id=int(clerk.examination_id),
        kind=WorkforceKind.DATA_ENTRY_CLERK,
        person_id=clerk.id,
        person_accepted=clerk.availability_status == WorkforceAvailabilityStatus.CONFIRMED,
    )
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
        "appointment_letters_available": release_fields["appointment_letters_available"],
        "appointment_letters_pending_message": release_fields["appointment_letters_pending_message"],
        "bank_details_editable": release_fields["bank_details_editable"],
        "bank_details_pending_message": release_fields["bank_details_pending_message"],
        "exercise_start_date": release_fields["exercise_start_date"],
        "work_start_time": release_fields["work_start_time"],
        "work_end_time": release_fields["work_end_time"],
        "venue": release_fields["venue"],
        "cohort_name": release_fields["cohort_name"],
    }
