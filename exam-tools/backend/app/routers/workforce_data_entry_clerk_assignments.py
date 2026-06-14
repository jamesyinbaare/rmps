"""Data entry clerk assignment batches."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies.auth import (
    SuperAdminOrTestAdminOfficerDep,
    SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
)
from app.dependencies.database import DBSessionDep
from app.schemas.workforce import (
    WorkforceAssignmentBatchCreate,
    WorkforceAssignmentBatchRow,
    WorkforceAssignmentGridResponse,
    WorkforceAssignmentRosterResponse,
)
from app.services.subject_officer_scope import assert_subject_officer_access
from app.services.workforce_assignment_batches import (
    ActiveBatchConflictError,
    AssignmentBatchNotFoundError,
    AssignmentBatchStateError,
    cancel_data_entry_clerk_assignment_batch,
    complete_data_entry_clerk_assignment_batch,
    create_data_entry_clerk_assignment_batch,
    list_data_entry_clerk_assignment_grid,
    list_data_entry_clerk_assignment_roster,
)
from app.services.workforce_roster import WorkforceRosterNotFoundError

router = APIRouter(tags=["workforce-data-entry-clerk-assignments"])


@router.get(
    "/examinations/{examination_id}/data-entry-clerk-assignments/roster",
    response_model=WorkforceAssignmentRosterResponse,
)
async def get_data_entry_clerk_assignment_roster(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
) -> WorkforceAssignmentRosterResponse:
    try:
        data = await list_data_entry_clerk_assignment_roster(session, examination_id=examination_id)
    except ValueError as exc:
        if str(exc) == "Examination not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceAssignmentRosterResponse(**data)


@router.get(
    "/examinations/{examination_id}/subjects/{subject_id}/data-entry-clerk-assignments",
    response_model=WorkforceAssignmentGridResponse,
)
async def get_data_entry_clerk_assignments(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    subject_id: int,
    paper_number: int = Query(..., ge=1, le=2),
) -> WorkforceAssignmentGridResponse:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    try:
        data = await list_data_entry_clerk_assignment_grid(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
            paper_number=paper_number,
        )
    except ValueError as exc:
        if str(exc) == "Examination not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceAssignmentGridResponse(**data)


@router.post(
    "/examinations/{examination_id}/subjects/{subject_id}/data-entry-clerk-assignments",
    response_model=WorkforceAssignmentBatchRow,
    status_code=status.HTTP_201_CREATED,
)
async def create_data_entry_clerk_assignment(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    subject_id: int,
    body: WorkforceAssignmentBatchCreate,
    paper_number: int = Query(..., ge=1, le=2),
) -> WorkforceAssignmentBatchRow:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    try:
        row = await create_data_entry_clerk_assignment_batch(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
            paper_number=paper_number,
            clerk_id=body.person_id,
            script_count=body.script_count,
            assigned_by_user_id=user.id,
        )
        await session.commit()
    except ActiveBatchConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        await session.rollback()
        if str(exc) == "Examination not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except WorkforceRosterNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return WorkforceAssignmentBatchRow(**row)


@router.post(
    "/examinations/{examination_id}/subjects/{subject_id}/data-entry-clerk-assignments/{batch_id}/complete",
    response_model=WorkforceAssignmentBatchRow,
)
async def complete_data_entry_clerk_assignment(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    subject_id: int,
    batch_id: UUID,
) -> WorkforceAssignmentBatchRow:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    try:
        row = await complete_data_entry_clerk_assignment_batch(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
            batch_id=batch_id,
            completed_by_user_id=user.id,
        )
        await session.commit()
    except AssignmentBatchNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except AssignmentBatchStateError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceAssignmentBatchRow(**row)


@router.post(
    "/examinations/{examination_id}/subjects/{subject_id}/data-entry-clerk-assignments/{batch_id}/cancel",
    response_model=WorkforceAssignmentBatchRow,
)
async def cancel_data_entry_clerk_assignment(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    subject_id: int,
    batch_id: UUID,
) -> WorkforceAssignmentBatchRow:
    try:
        row = await cancel_data_entry_clerk_assignment_batch(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
            batch_id=batch_id,
        )
        await session.commit()
    except AssignmentBatchNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except AssignmentBatchStateError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceAssignmentBatchRow(**row)
