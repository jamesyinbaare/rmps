from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies.auth import SubjectOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examiner, ExaminerSubject
from app.schemas.examiner_public_profile import ExaminerPublicScriptsAllocationResponse
from app.schemas.subject_officer import (
    MarkedScriptReturnFiltersResponse,
    MarkedScriptReturnGridResponse,
    MarkedScriptReturnRecordResponse,
    MarkedScriptReturnUpsert,
    MarkedScriptReturnVerify,
)
from app.services.examiner_public_profile import get_examiner_scripts_allocation
from app.services.marked_script_return import (
    build_return_filters,
    build_return_grid,
    unverify_return,
    upsert_return,
    verify_return,
)
from app.services.subject_officer_scope import assert_subject_officer_access
from sqlalchemy import select

router = APIRouter(tags=["marked-script-returns"])


async def _assert_examiner_on_subject(
    session: DBSessionDep,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
) -> None:
    stmt = (
        select(Examiner)
        .join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id)
        .where(
            Examiner.id == examiner_id,
            Examiner.examination_id == examination_id,
            ExaminerSubject.subject_id == subject_id,
        )
    )
    if (await session.execute(stmt)).scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner not found for subject")


@router.get(
    "/examinations/{examination_id}/marked-script-returns/filters",
    response_model=MarkedScriptReturnFiltersResponse,
)
async def get_marked_script_return_filters(
    examination_id: int,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
    examiner_id: UUID | None = Query(default=None),
) -> MarkedScriptReturnFiltersResponse:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    if examiner_id is not None:
        await _assert_examiner_on_subject(session, examination_id, subject_id, examiner_id)
    data = await build_return_filters(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )
    return MarkedScriptReturnFiltersResponse(**data)


@router.get(
    "/examinations/{examination_id}/marked-script-returns",
    response_model=MarkedScriptReturnGridResponse,
)
async def get_marked_script_returns(
    examination_id: int,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
    examiner_id: UUID = Query(...),
    paper_number: int = Query(..., ge=1),
) -> MarkedScriptReturnGridResponse:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    await _assert_examiner_on_subject(session, examination_id, subject_id, examiner_id)
    data = await build_return_grid(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
        paper_number=paper_number,
    )
    return MarkedScriptReturnGridResponse(**data)


@router.put(
    "/examinations/{examination_id}/marked-script-returns/assignments/{assignment_id}",
    response_model=MarkedScriptReturnRecordResponse,
)
async def upsert_marked_script_return(
    examination_id: int,
    assignment_id: UUID,
    body: MarkedScriptReturnUpsert,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
) -> MarkedScriptReturnRecordResponse:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    record = await upsert_return(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        assignment_id=assignment_id,
        returned_booklets=body.returned_booklets,
        notes=body.notes,
        user=user,
    )
    return MarkedScriptReturnRecordResponse.model_validate(record)


@router.post(
    "/examinations/{examination_id}/marked-script-returns/assignments/{assignment_id}/verify",
    response_model=MarkedScriptReturnRecordResponse,
)
async def verify_marked_script_return(
    examination_id: int,
    assignment_id: UUID,
    body: MarkedScriptReturnVerify,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
) -> MarkedScriptReturnRecordResponse:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    record = await verify_return(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        assignment_id=assignment_id,
        notes=body.notes,
        allow_mismatch=body.allow_mismatch,
        user=user,
    )
    return MarkedScriptReturnRecordResponse.model_validate(record)


@router.post(
    "/examinations/{examination_id}/marked-script-returns/assignments/{assignment_id}/unverify",
    response_model=MarkedScriptReturnRecordResponse,
)
async def unverify_marked_script_return(
    examination_id: int,
    assignment_id: UUID,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
) -> MarkedScriptReturnRecordResponse:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    record = await unverify_return(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        assignment_id=assignment_id,
        user=user,
    )
    return MarkedScriptReturnRecordResponse.model_validate(record)


@router.get(
    "/examinations/{examination_id}/subject-officer/examiners/{examiner_id}/scripts-allocation",
    response_model=ExaminerPublicScriptsAllocationResponse,
)
async def get_subject_officer_examiner_scripts_allocation(
    examination_id: int,
    examiner_id: UUID,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
) -> ExaminerPublicScriptsAllocationResponse:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    await _assert_examiner_on_subject(session, examination_id, subject_id, examiner_id)
    data = await get_examiner_scripts_allocation(
        session,
        examiner_id=examiner_id,
        examination_id=examination_id,
        subject_id=subject_id,
    )
    return ExaminerPublicScriptsAllocationResponse(**data)
