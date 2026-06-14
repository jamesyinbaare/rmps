"""Assignment batch services for script checkers and data entry clerks."""

from __future__ import annotations

from datetime import datetime
from typing import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    DataEntryClerk,
    DataEntryClerkAssignmentBatch,
    Examination,
    ScriptChecker,
    ScriptCheckerAssignmentBatch,
    Subject,
    WorkforceAssignmentBatchStatus,
    WorkforceAvailabilityStatus,
)
from app.services.workforce_roster import (
    WorkforceRosterNotFoundError,
    get_data_entry_clerk_or_404,
    get_script_checker_or_404,
)


class ActiveBatchConflictError(Exception):
    """Raised when a person already has an active batch for the scope."""


class AssignmentBatchNotFoundError(Exception):
    pass


class AssignmentBatchStateError(Exception):
    pass


def _status_value(status) -> str:
    if isinstance(status, WorkforceAssignmentBatchStatus):
        return status.value
    return str(status)


def batch_to_dict(batch: ScriptCheckerAssignmentBatch | DataEntryClerkAssignmentBatch) -> dict:
    return {
        "id": batch.id,
        "examination_id": int(batch.examination_id),
        "subject_id": int(batch.subject_id),
        "paper_number": int(batch.paper_number),
        "script_count": int(batch.script_count),
        "status": _status_value(batch.status),
        "batch_sequence": int(batch.batch_sequence),
        "assigned_at": batch.assigned_at,
        "assigned_by_user_id": batch.assigned_by_user_id,
        "completed_at": batch.completed_at,
        "completed_by_user_id": batch.completed_by_user_id,
    }


def _assignment_script_totals(
    batches: Sequence[ScriptCheckerAssignmentBatch | DataEntryClerkAssignmentBatch],
) -> tuple[int, int, int]:
    completed = 0
    uncompleted = 0
    for batch in batches:
        count = int(batch.script_count)
        status = _status_value(batch.status)
        if status == WorkforceAssignmentBatchStatus.COMPLETED.value:
            completed += count
        elif status == WorkforceAssignmentBatchStatus.ACTIVE.value:
            uncompleted += count
    return completed + uncompleted, completed, uncompleted


def _active_batch(
    batches: Sequence[ScriptCheckerAssignmentBatch | DataEntryClerkAssignmentBatch],
) -> ScriptCheckerAssignmentBatch | DataEntryClerkAssignmentBatch | None:
    for batch in batches:
        if _status_value(batch.status) == WorkforceAssignmentBatchStatus.ACTIVE.value:
            return batch
    return None


async def _load_subject_or_error(session: AsyncSession, subject_id: int) -> Subject:
    subject = await session.get(Subject, subject_id)
    if subject is None:
        raise ValueError("Subject not found")
    return subject


async def _load_examination_or_error(session: AsyncSession, examination_id: int) -> Examination:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")
    return exam


async def batches_to_public_rows(
    session: AsyncSession,
    batches: Sequence[ScriptCheckerAssignmentBatch | DataEntryClerkAssignmentBatch],
) -> tuple[list[dict], list[dict]]:
    subject_ids = {int(b.subject_id) for b in batches}
    subjects: dict[int, Subject] = {}
    if subject_ids:
        stmt = select(Subject).where(Subject.id.in_(subject_ids))
        for subject in (await session.execute(stmt)).scalars().all():
            subjects[int(subject.id)] = subject

    active_rows: list[dict] = []
    completed_rows: list[dict] = []
    for batch in sorted(batches, key=lambda b: (int(b.subject_id), int(b.paper_number), int(b.batch_sequence))):
        subject = subjects.get(int(batch.subject_id))
        row = {
            "id": batch.id,
            "subject_id": int(batch.subject_id),
            "subject_code": subject.code if subject else None,
            "subject_name": subject.name if subject else None,
            "paper_number": int(batch.paper_number),
            "script_count": int(batch.script_count),
            "status": _status_value(batch.status),
            "batch_sequence": int(batch.batch_sequence),
            "assigned_at": batch.assigned_at,
            "completed_at": batch.completed_at,
        }
        if _status_value(batch.status) == WorkforceAssignmentBatchStatus.ACTIVE.value:
            active_rows.append(row)
        elif _status_value(batch.status) == WorkforceAssignmentBatchStatus.COMPLETED.value:
            completed_rows.append(row)
    return active_rows, completed_rows


async def _next_batch_sequence(
    session: AsyncSession,
    *,
    model,
    examination_id: int,
    subject_id: int,
    paper_number: int,
    person_id: UUID,
    person_field: str,
) -> int:
    stmt = select(func.max(model.batch_sequence)).where(
        model.examination_id == examination_id,
        model.subject_id == subject_id,
        model.paper_number == paper_number,
        getattr(model, person_field) == person_id,
    )
    current = await session.scalar(stmt)
    return int(current or 0) + 1


async def _has_active_batch(
    session: AsyncSession,
    *,
    model,
    examination_id: int,
    subject_id: int,
    paper_number: int,
    person_id: UUID,
    person_field: str,
) -> bool:
    stmt = select(model.id).where(
        model.examination_id == examination_id,
        model.subject_id == subject_id,
        model.paper_number == paper_number,
        getattr(model, person_field) == person_id,
        model.status == WorkforceAssignmentBatchStatus.ACTIVE,
    )
    return (await session.execute(stmt)).scalar_one_or_none() is not None


def _availability_value(person: ScriptChecker | DataEntryClerk) -> str:
    status = person.availability_status
    return status.value if hasattr(status, "value") else str(status)


def _require_assignable(person: ScriptChecker | DataEntryClerk) -> None:
    if _availability_value(person) != WorkforceAvailabilityStatus.CONFIRMED.value:
        raise ValueError("This person must confirm their availability before scripts can be assigned.")


def _person_row(
    person: ScriptChecker | DataEntryClerk,
    batches: Sequence[ScriptCheckerAssignmentBatch | DataEntryClerkAssignmentBatch],
) -> dict:
    scoped = list(batches)
    active = _active_batch(scoped)
    assigned_total, completed_total, uncompleted_total = _assignment_script_totals(scoped)
    return {
        "id": person.id,
        "name": person.name,
        "reference_code": person.reference_code,
        "phone_number": person.phone_number,
        "availability_status": _availability_value(person),
        "has_bank_account": person.bank_account is not None,
        "active_batch": batch_to_dict(active) if active is not None else None,
        "assigned_total": assigned_total,
        "completed_total": completed_total,
        "uncompleted_total": uncompleted_total,
        "batches": [batch_to_dict(b) for b in sorted(scoped, key=lambda b: int(b.batch_sequence), reverse=True)],
    }


async def list_script_checker_assignment_grid(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    paper_number: int,
) -> dict:
    await _load_examination_or_error(session, examination_id)
    await _load_subject_or_error(session, subject_id)
    stmt = (
        select(ScriptChecker)
        .where(ScriptChecker.examination_id == examination_id)
        .options(
            selectinload(ScriptChecker.bank_account),
            selectinload(ScriptChecker.assignment_batches),
        )
        .order_by(ScriptChecker.name)
    )
    people = list((await session.execute(stmt)).scalars().all())
    items = []
    for person in people:
        scoped = [
            b
            for b in person.assignment_batches
            if int(b.subject_id) == subject_id and int(b.paper_number) == paper_number
        ]
        items.append(_person_row(person, scoped))
    return {
        "examination_id": examination_id,
        "subject_id": subject_id,
        "paper_number": paper_number,
        "items": items,
    }


async def list_data_entry_clerk_assignment_grid(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    paper_number: int,
) -> dict:
    await _load_examination_or_error(session, examination_id)
    await _load_subject_or_error(session, subject_id)
    stmt = (
        select(DataEntryClerk)
        .where(DataEntryClerk.examination_id == examination_id)
        .options(
            selectinload(DataEntryClerk.bank_account),
            selectinload(DataEntryClerk.assignment_batches),
        )
        .order_by(DataEntryClerk.name)
    )
    people = list((await session.execute(stmt)).scalars().all())
    items = []
    for person in people:
        scoped = [
            b
            for b in person.assignment_batches
            if int(b.subject_id) == subject_id and int(b.paper_number) == paper_number
        ]
        items.append(_person_row(person, scoped))
    return {
        "examination_id": examination_id,
        "subject_id": subject_id,
        "paper_number": paper_number,
        "items": items,
    }


async def list_script_checker_assignment_roster(
    session: AsyncSession,
    *,
    examination_id: int,
) -> dict:
    await _load_examination_or_error(session, examination_id)
    stmt = (
        select(ScriptChecker)
        .where(ScriptChecker.examination_id == examination_id)
        .options(
            selectinload(ScriptChecker.bank_account),
            selectinload(ScriptChecker.assignment_batches),
        )
        .order_by(ScriptChecker.name)
    )
    people = list((await session.execute(stmt)).scalars().all())
    items = [_person_row(person, person.assignment_batches) for person in people]
    return {
        "examination_id": examination_id,
        "items": items,
    }


async def list_data_entry_clerk_assignment_roster(
    session: AsyncSession,
    *,
    examination_id: int,
) -> dict:
    await _load_examination_or_error(session, examination_id)
    stmt = (
        select(DataEntryClerk)
        .where(DataEntryClerk.examination_id == examination_id)
        .options(
            selectinload(DataEntryClerk.bank_account),
            selectinload(DataEntryClerk.assignment_batches),
        )
        .order_by(DataEntryClerk.name)
    )
    people = list((await session.execute(stmt)).scalars().all())
    items = [_person_row(person, person.assignment_batches) for person in people]
    return {
        "examination_id": examination_id,
        "items": items,
    }


async def create_script_checker_assignment_batch(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    paper_number: int,
    checker_id: UUID,
    script_count: int,
    assigned_by_user_id: UUID | None,
) -> dict:
    await _load_examination_or_error(session, examination_id)
    await _load_subject_or_error(session, subject_id)
    checker = await get_script_checker_or_404(session, examination_id=examination_id, checker_id=checker_id)
    _require_assignable(checker)
    if await _has_active_batch(
        session,
        model=ScriptCheckerAssignmentBatch,
        examination_id=examination_id,
        subject_id=subject_id,
        paper_number=paper_number,
        person_id=checker_id,
        person_field="checker_id",
    ):
        raise ActiveBatchConflictError("An active batch already exists for this checker.")

    sequence = await _next_batch_sequence(
        session,
        model=ScriptCheckerAssignmentBatch,
        examination_id=examination_id,
        subject_id=subject_id,
        paper_number=paper_number,
        person_id=checker_id,
        person_field="checker_id",
    )
    batch = ScriptCheckerAssignmentBatch(
        examination_id=examination_id,
        subject_id=subject_id,
        paper_number=paper_number,
        checker_id=checker_id,
        script_count=script_count,
        status=WorkforceAssignmentBatchStatus.ACTIVE,
        batch_sequence=sequence,
        assigned_by_user_id=assigned_by_user_id,
    )
    session.add(batch)
    await session.flush()
    return batch_to_dict(batch)


async def create_data_entry_clerk_assignment_batch(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    paper_number: int,
    clerk_id: UUID,
    script_count: int,
    assigned_by_user_id: UUID | None,
) -> dict:
    await _load_examination_or_error(session, examination_id)
    await _load_subject_or_error(session, subject_id)
    clerk = await get_data_entry_clerk_or_404(session, examination_id=examination_id, clerk_id=clerk_id)
    _require_assignable(clerk)
    if await _has_active_batch(
        session,
        model=DataEntryClerkAssignmentBatch,
        examination_id=examination_id,
        subject_id=subject_id,
        paper_number=paper_number,
        person_id=clerk_id,
        person_field="clerk_id",
    ):
        raise ActiveBatchConflictError("An active batch already exists for this clerk.")

    sequence = await _next_batch_sequence(
        session,
        model=DataEntryClerkAssignmentBatch,
        examination_id=examination_id,
        subject_id=subject_id,
        paper_number=paper_number,
        person_id=clerk_id,
        person_field="clerk_id",
    )
    batch = DataEntryClerkAssignmentBatch(
        examination_id=examination_id,
        subject_id=subject_id,
        paper_number=paper_number,
        clerk_id=clerk_id,
        script_count=script_count,
        status=WorkforceAssignmentBatchStatus.ACTIVE,
        batch_sequence=sequence,
        assigned_by_user_id=assigned_by_user_id,
    )
    session.add(batch)
    await session.flush()
    return batch_to_dict(batch)


async def _complete_batch(
    session: AsyncSession,
    *,
    batch,
    examination_id: int,
    subject_id: int,
    completed_by_user_id: UUID | None,
) -> dict:
    if batch is None:
        raise AssignmentBatchNotFoundError("Assignment batch not found")
    if int(batch.examination_id) != examination_id or int(batch.subject_id) != subject_id:
        raise AssignmentBatchNotFoundError("Assignment batch not found")
    if _status_value(batch.status) != WorkforceAssignmentBatchStatus.ACTIVE.value:
        raise AssignmentBatchStateError("Only active batches can be completed.")
    batch.status = WorkforceAssignmentBatchStatus.COMPLETED
    batch.completed_at = datetime.utcnow()
    batch.completed_by_user_id = completed_by_user_id
    await session.flush()
    return batch_to_dict(batch)


async def _cancel_batch(
    session: AsyncSession,
    *,
    batch,
    examination_id: int,
    subject_id: int,
) -> dict:
    if batch is None:
        raise AssignmentBatchNotFoundError("Assignment batch not found")
    if int(batch.examination_id) != examination_id or int(batch.subject_id) != subject_id:
        raise AssignmentBatchNotFoundError("Assignment batch not found")
    if _status_value(batch.status) != WorkforceAssignmentBatchStatus.ACTIVE.value:
        raise AssignmentBatchStateError("Only active batches can be cancelled.")
    batch.status = WorkforceAssignmentBatchStatus.CANCELLED
    await session.flush()
    return batch_to_dict(batch)


async def complete_script_checker_assignment_batch(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    batch_id: UUID,
    completed_by_user_id: UUID | None,
) -> dict:
    batch = await session.get(ScriptCheckerAssignmentBatch, batch_id)
    return await _complete_batch(
        session,
        batch=batch,
        examination_id=examination_id,
        subject_id=subject_id,
        completed_by_user_id=completed_by_user_id,
    )


async def complete_data_entry_clerk_assignment_batch(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    batch_id: UUID,
    completed_by_user_id: UUID | None,
) -> dict:
    batch = await session.get(DataEntryClerkAssignmentBatch, batch_id)
    return await _complete_batch(
        session,
        batch=batch,
        examination_id=examination_id,
        subject_id=subject_id,
        completed_by_user_id=completed_by_user_id,
    )


async def cancel_script_checker_assignment_batch(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    batch_id: UUID,
) -> dict:
    batch = await session.get(ScriptCheckerAssignmentBatch, batch_id)
    return await _cancel_batch(
        session,
        batch=batch,
        examination_id=examination_id,
        subject_id=subject_id,
    )


async def cancel_data_entry_clerk_assignment_batch(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    batch_id: UUID,
) -> dict:
    batch = await session.get(DataEntryClerkAssignmentBatch, batch_id)
    return await _cancel_batch(
        session,
        batch=batch,
        examination_id=examination_id,
        subject_id=subject_id,
    )
