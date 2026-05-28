"""CRUD for exam centre officials (inspector; roster per examination centre host and scope)."""

from datetime import datetime
from typing import cast
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import InspectorDep, InspectorJwtPostingIdDep
from app.dependencies.database import DBSessionDep
from app.models import (
    BankBranch,
    ExamCentreOfficial,
    ExamInspectorSubjectScope,
    ExamOfficialDesignation,
    User,
    UserRole,
)
from app.schemas.exam_official import (
    ExamCentreOfficialCreate,
    ExamCentreOfficialListResponse,
    ExamCentreOfficialResponse,
    ExamCentreOfficialUpdate,
)
from app.schemas.inspector_submission_settings import InspectorSubmissionStatusResponse
from app.services.exam_official_account import normalize_account_for_save
from app.services.exam_official_summary_pdf import build_exam_official_summary_pdf
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.inspector_posting import InspectorWorkspaceContext, resolve_inspector_workspace
from app.services.inspector_submission_settings import (
    assert_officials_scope_enabled,
    assert_submission_period_open,
    get_or_create_submission_settings,
    submission_status_dict,
)
from app.services.subject_scope import resolve_working_scope

router = APIRouter(tags=["exam-officials"])


async def _resolve_inspector_ctx(
    session: DBSessionDep,
    user: User,
    exam_id: int,
    posting_id: UUID | None,
    jwt_posting_id: UUID | None,
) -> InspectorWorkspaceContext:
    if user.role != UserRole.INSPECTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inspector access only")
    try:
        return await resolve_inspector_workspace(
            session,
            examination_id=exam_id,
            user=user,
            posting_id=posting_id,
            jwt_posting_id=jwt_posting_id,
        )
    except HTTPException:
        raise


def _scope_str(scope: ExamInspectorSubjectScope | str) -> str:
    if isinstance(scope, ExamInspectorSubjectScope):
        return scope.value
    return str(scope)


def _normalize_account_or_400(
    account_number: str,
    bb: BankBranch,
    *,
    for_update: bool,
) -> str:
    try:
        return normalize_account_for_save(
            account_number,
            bank_name=cast(str, bb.bank_name),
            bank_code=cast(str, bb.bank_code),
            for_update=for_update,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


def _official_to_response(row: ExamCentreOfficial) -> ExamCentreOfficialResponse:
    bb = row.bank_branch
    des = row.designation
    if isinstance(des, ExamOfficialDesignation):
        des_str = des.value
    else:
        des_str = str(des)
    return ExamCentreOfficialResponse(
        id=row.id,
        examination_id=row.examination_id,
        center_id=row.examination_centre_id,
        full_name=cast(str, row.full_name),
        designation=des_str,
        bank_branch_id=row.bank_branch_id,
        bank_code=cast(str, bb.bank_code),
        bank_name=cast(str, bb.bank_name),
        branch_name=cast(str, bb.branch_name),
        account_number=cast(str, row.account_number),
        num_days=cast(int, row.num_days),
        telephone_number=cast(str, row.telephone_number),
        subject_scope=_scope_str(row.subject_scope),
        created_at=cast(datetime, row.created_at),
        updated_at=cast(datetime, row.updated_at),
    )


@router.get(
    "/examinations/{exam_id}/inspector-submission-status",
    response_model=InspectorSubmissionStatusResponse,
)
async def get_inspector_submission_status(
    exam_id: int,
    session: DBSessionDep,
    user: InspectorDep,
) -> InspectorSubmissionStatusResponse:
    if user.role != UserRole.INSPECTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inspector access only")
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None
    settings = await get_or_create_submission_settings(session, exam_id)
    return InspectorSubmissionStatusResponse(**submission_status_dict(settings))


@router.get(
    "/examinations/{exam_id}/exam-officials/my-centre",
    response_model=ExamCentreOfficialListResponse,
)
async def list_exam_officials(
    exam_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(
        default=None,
        description="Inspector posting (workspace); overrides JWT when set; required when you have multiple postings.",
    ),
    working_scope: str | None = Query(
        default=None,
        description="CORE or ELECTIVE; required when posting scope is ALL.",
    ),
) -> ExamCentreOfficialListResponse:
    ctx = await _resolve_inspector_ctx(session, user, exam_id, posting_id, jwt_posting_id)
    scope = resolve_working_scope(ctx.subject_scope, working_scope)
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    stmt = (
        select(ExamCentreOfficial)
        .where(
            ExamCentreOfficial.examination_id == exam_id,
            ExamCentreOfficial.examination_centre_id == ctx.examination_centre.id,
            ExamCentreOfficial.subject_scope == scope,
        )
        .options(selectinload(ExamCentreOfficial.bank_branch))
        .order_by(ExamCentreOfficial.full_name.asc(), ExamCentreOfficial.id.asc())
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return ExamCentreOfficialListResponse(items=[_official_to_response(r) for r in rows])


@router.get("/examinations/{exam_id}/exam-officials/my-centre/summary.pdf")
async def download_exam_officials_summary_pdf(
    exam_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
    working_scope: str | None = Query(default=None),
) -> Response:
    ctx = await _resolve_inspector_ctx(session, user, exam_id, posting_id, jwt_posting_id)
    scope = resolve_working_scope(ctx.subject_scope, working_scope)
    try:
        examination = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    try:
        pdf_bytes, filename = await build_exam_official_summary_pdf(
            session,
            examination=examination,
            ctx=ctx,
            subject_scope=scope,
            inspector_user=user,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    safe_name = filename.replace('"', "")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.post(
    "/examinations/{exam_id}/exam-officials/my-centre",
    response_model=ExamCentreOfficialResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_exam_official(
    exam_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    body: ExamCentreOfficialCreate,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
    working_scope: str | None = Query(default=None),
) -> ExamCentreOfficialResponse:
    ctx = await _resolve_inspector_ctx(session, user, exam_id, posting_id, jwt_posting_id)
    scope = resolve_working_scope(ctx.subject_scope, working_scope)
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    await assert_submission_period_open(session, exam_id, scope)
    await assert_officials_scope_enabled(session, exam_id, scope)

    bb = await session.get(BankBranch, body.bank_branch_id)
    if bb is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown bank_branch_id")

    des = ExamOfficialDesignation(body.designation.value)
    stored_account = _normalize_account_or_400(body.account_number, bb, for_update=False)
    row = ExamCentreOfficial(
        examination_id=exam_id,
        examination_centre_id=ctx.examination_centre.id,
        full_name=body.full_name,
        designation=des,
        bank_branch_id=body.bank_branch_id,
        account_number=stored_account,
        num_days=body.num_days,
        telephone_number=body.telephone_number,
        subject_scope=scope,
    )
    session.add(row)
    await session.commit()
    stmt = (
        select(ExamCentreOfficial)
        .where(ExamCentreOfficial.id == row.id)
        .options(selectinload(ExamCentreOfficial.bank_branch))
    )
    loaded = (await session.execute(stmt)).scalar_one()
    return _official_to_response(loaded)


@router.patch(
    "/examinations/{exam_id}/exam-officials/my-centre/{official_id}",
    response_model=ExamCentreOfficialResponse,
)
async def update_exam_official(
    exam_id: int,
    official_id: UUID,
    session: DBSessionDep,
    user: InspectorDep,
    body: ExamCentreOfficialUpdate,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
    working_scope: str | None = Query(default=None),
) -> ExamCentreOfficialResponse:
    ctx = await _resolve_inspector_ctx(session, user, exam_id, posting_id, jwt_posting_id)
    scope = resolve_working_scope(ctx.subject_scope, working_scope)
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    stmt = (
        select(ExamCentreOfficial)
        .where(
            ExamCentreOfficial.id == official_id,
            ExamCentreOfficial.examination_id == exam_id,
            ExamCentreOfficial.examination_centre_id == ctx.examination_centre.id,
            ExamCentreOfficial.subject_scope == scope,
        )
        .options(selectinload(ExamCentreOfficial.bank_branch))
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    await assert_submission_period_open(session, exam_id, scope)

    if body.full_name is not None:
        row.full_name = body.full_name
    if body.designation is not None:
        row.designation = ExamOfficialDesignation(body.designation.value)
    bb_for_account: BankBranch | None = None
    if body.bank_branch_id is not None:
        bb_for_account = await session.get(BankBranch, body.bank_branch_id)
        if bb_for_account is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown bank_branch_id")
        row.bank_branch_id = body.bank_branch_id
    if body.account_number is not None:
        bb_acct = bb_for_account if bb_for_account is not None else row.bank_branch
        row.account_number = _normalize_account_or_400(
            body.account_number,
            bb_acct,
            for_update=True,
        )
    if body.num_days is not None:
        row.num_days = body.num_days
    if body.telephone_number is not None:
        row.telephone_number = body.telephone_number

    await session.commit()
    stmt = (
        select(ExamCentreOfficial)
        .where(ExamCentreOfficial.id == row.id)
        .options(selectinload(ExamCentreOfficial.bank_branch))
    )
    loaded = (await session.execute(stmt)).scalar_one()
    return _official_to_response(loaded)


@router.delete(
    "/examinations/{exam_id}/exam-officials/my-centre/{official_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_exam_official(
    exam_id: int,
    official_id: UUID,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
    working_scope: str | None = Query(default=None),
) -> None:
    ctx = await _resolve_inspector_ctx(session, user, exam_id, posting_id, jwt_posting_id)
    scope = resolve_working_scope(ctx.subject_scope, working_scope)
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    stmt = select(ExamCentreOfficial).where(
        ExamCentreOfficial.id == official_id,
        ExamCentreOfficial.examination_id == exam_id,
        ExamCentreOfficial.examination_centre_id == ctx.examination_centre.id,
        ExamCentreOfficial.subject_scope == scope,
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    await assert_submission_period_open(session, exam_id, scope)

    await session.delete(row)
    await session.commit()
