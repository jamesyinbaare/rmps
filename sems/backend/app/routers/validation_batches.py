"""Batch creation, assignment, and clerk quota endpoints."""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import CurrentUserDep, RegistrarDep
from app.dependencies.database import DBSessionDep
from app.models import (
    ClerkDailyQuotaOverride,
    ClerkQuotaSettings,
    Document,
    Exam,
    ExamSubject,
    IssueBatch,
    Subject,
    SubjectScore,
    SubjectScoreValidationIssue,
    User,
    UserRole,
    ValidationIssueStatus,
)
from app.schemas.validation import (
    AssignBatchesRequest,
    AssignBatchesResponse,
    BatchSummaryClerkItem,
    BatchSummaryResponse,
    BatchSummaryUnbatchedItem,
    ClerkBatchItem,
    ClerkBatchListResponse,
    ClerkBatchProgressStatus,
    ClerkQuotaItem,
    ClerkQuotaListResponse,
    CreateBatchesRequest,
    CreateBatchesResponse,
    IssueBatchListResponse,
    IssueBatchResponse,
    ReleaseBatchesRequest,
    ReleaseBatchesResponse,
    SetBaseQuotaRequest,
    SetQuotaOverrideRequest,
)
from app.services.clerk_quota_service import (
    count_resolved_today,
    get_base_quota,
    get_effective_quota,
    get_today_override,
    utc_today,
)
from app.services.issue_batch_service import create_batches, get_score_document_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/validation", tags=["validation-batches"])


@router.post("/batches", response_model=CreateBatchesResponse)
async def create_issue_batches(
    request: CreateBatchesRequest,
    session: DBSessionDep,
    current_user: RegistrarDep,
) -> CreateBatchesResponse:
    try:
        result = await create_batches(
            session,
            exam_id=request.exam_id,
            subject_id=request.subject_id,
            test_type=request.test_type,
            created_by_user_id=current_user.id,
            target_size=request.target_size,
            tolerance=request.tolerance,
            has_document_filter=request.has_document,
        )
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    return CreateBatchesResponse(**result)


@router.get("/batches/mine", response_model=ClerkBatchListResponse)
async def list_my_batches(
    session: DBSessionDep,
    current_user: CurrentUserDep,
    status_filter: str | None = Query(
        "all",
        alias="status",
        description="in_progress | completed | all",
    ),
    exam_id: int | None = Query(None),
    subject_id: int | None = Query(None),
    test_type: int | None = Query(None),
    has_document: bool | None = Query(None),
) -> ClerkBatchListResponse:
    """List batches assigned to the current user with live progress counts."""
    status_norm = (status_filter or "all").lower()
    if status_norm not in ("all", "in_progress", "completed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="status must be in_progress, completed, or all",
        )

    pending_count_col = func.coalesce(
        func.sum(
            case(
                (SubjectScoreValidationIssue.status == ValidationIssueStatus.PENDING, 1),
                else_=0,
            )
        ),
        0,
    ).label("pending_count")
    done_count_col = func.coalesce(
        func.sum(
            case(
                (
                    SubjectScoreValidationIssue.status.in_(
                        [ValidationIssueStatus.RESOLVED, ValidationIssueStatus.IGNORED]
                    ),
                    1,
                ),
                else_=0,
            )
        ),
        0,
    ).label("done_count")
    total_count_col = func.count(SubjectScoreValidationIssue.id).label("total_count")
    last_resolved_col = func.max(SubjectScoreValidationIssue.resolved_at).label(
        "last_resolved_at"
    )

    stmt = (
        select(
            IssueBatch,
            Subject.code,
            Subject.name,
            Exam.year,
            pending_count_col,
            done_count_col,
            total_count_col,
            last_resolved_col,
        )
        .join(Subject, IssueBatch.subject_id == Subject.id)
        .join(Exam, IssueBatch.exam_id == Exam.id)
        .outerjoin(
            SubjectScoreValidationIssue,
            SubjectScoreValidationIssue.batch_id == IssueBatch.id,
        )
        .where(IssueBatch.assigned_to_user_id == current_user.id)
        .group_by(IssueBatch.id, Subject.code, Subject.name, Exam.year)
    )

    if exam_id is not None:
        stmt = stmt.where(IssueBatch.exam_id == exam_id)
    if subject_id is not None:
        stmt = stmt.where(IssueBatch.subject_id == subject_id)
    if test_type is not None:
        stmt = stmt.where(IssueBatch.test_type == test_type)
    if has_document is not None:
        stmt = stmt.where(IssueBatch.has_document.is_(has_document))

    rows = (await session.execute(stmt)).all()

    in_progress_items: list[tuple[ClerkBatchItem, datetime | None]] = []
    completed_items: list[tuple[ClerkBatchItem, datetime | None]] = []

    for (
        batch,
        subject_code,
        subject_name,
        exam_year,
        pending_c,
        done_c,
        total_c,
        last_resolved,
    ) in rows:
        pending = int(pending_c or 0)
        done = int(done_c or 0)
        total = int(total_c or 0)
        # Completed only when there are issues and none remain pending.
        if total > 0 and pending == 0:
            progress = ClerkBatchProgressStatus.COMPLETED
        else:
            progress = ClerkBatchProgressStatus.IN_PROGRESS

        item = ClerkBatchItem(
            id=batch.id,
            name=batch.name,
            exam_id=batch.exam_id,
            subject_id=batch.subject_id,
            subject_code=subject_code,
            subject_name=subject_name,
            exam_year=exam_year,
            test_type=batch.test_type,
            has_document=batch.has_document,
            issue_count=batch.issue_count,
            pending_count=pending,
            done_count=done,
            total_count=total,
            progress_status=progress,
            assigned_at=batch.assigned_at,
            created_at=batch.created_at,
        )
        if progress == ClerkBatchProgressStatus.IN_PROGRESS:
            in_progress_items.append((item, batch.assigned_at))
        else:
            completed_items.append((item, last_resolved or batch.assigned_at))

    in_progress_items.sort(key=lambda t: t[1] or t[0].created_at, reverse=True)
    completed_items.sort(key=lambda t: t[1] or t[0].created_at, reverse=True)

    if status_norm == "in_progress":
        filtered = [i for i, _ in in_progress_items]
    elif status_norm == "completed":
        filtered = [i for i, _ in completed_items]
    else:
        filtered = [i for i, _ in in_progress_items] + [i for i, _ in completed_items]

    return ClerkBatchListResponse(
        batches=filtered,
        total=len(filtered),
        in_progress_count=len(in_progress_items),
        completed_count=len(completed_items),
    )


@router.get("/batches", response_model=IssueBatchListResponse)
async def list_issue_batches(
    session: DBSessionDep,
    _: RegistrarDep,
    exam_id: int | None = Query(None),
    subject_id: int | None = Query(None),
    test_type: int | None = Query(None),
    has_document: bool | None = Query(None),
    assigned_to: str | None = Query(None, description="User UUID or 'unassigned'"),
    unassigned_only: bool = Query(False),
) -> IssueBatchListResponse:
    stmt = select(IssueBatch).options(selectinload(IssueBatch.assigned_to))
    if exam_id is not None:
        stmt = stmt.where(IssueBatch.exam_id == exam_id)
    if subject_id is not None:
        stmt = stmt.where(IssueBatch.subject_id == subject_id)
    if test_type is not None:
        stmt = stmt.where(IssueBatch.test_type == test_type)
    if has_document is not None:
        stmt = stmt.where(IssueBatch.has_document.is_(has_document))
    if unassigned_only or assigned_to == "unassigned":
        stmt = stmt.where(IssueBatch.assigned_to_user_id.is_(None))
    elif assigned_to:
        from uuid import UUID

        try:
            uid = UUID(assigned_to)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assigned_to UUID"
            ) from e
        stmt = stmt.where(IssueBatch.assigned_to_user_id == uid)

    stmt = stmt.order_by(IssueBatch.created_at.desc(), IssueBatch.name.asc())
    batches = (await session.execute(stmt)).scalars().all()
    items = [
        IssueBatchResponse(
            id=b.id,
            name=b.name,
            exam_id=b.exam_id,
            subject_id=b.subject_id,
            test_type=b.test_type,
            has_document=b.has_document,
            target_size=b.target_size,
            tolerance=b.tolerance,
            issue_count=b.issue_count,
            assigned_to_user_id=b.assigned_to_user_id,
            assigned_by_user_id=b.assigned_by_user_id,
            assigned_at=b.assigned_at,
            created_by_user_id=b.created_by_user_id,
            created_at=b.created_at,
            assigned_to_name=b.assigned_to.full_name if b.assigned_to else None,
        )
        for b in batches
    ]
    return IssueBatchListResponse(batches=items, total=len(items))


@router.post("/batches/assign", response_model=AssignBatchesResponse)
async def assign_batches(
    request: AssignBatchesRequest,
    session: DBSessionDep,
    current_user: RegistrarDep,
) -> AssignBatchesResponse:
    clerk = (
        await session.execute(select(User).where(User.id == request.user_id))
    ).scalar_one_or_none()
    if not clerk or not clerk.is_active or clerk.role != UserRole.DATACLERK:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target user must be an active data clerk",
        )

    stmt = (
        select(IssueBatch)
        .where(IssueBatch.id.in_(request.batch_ids))
        .with_for_update()
    )
    batches = (await session.execute(stmt)).scalars().all()
    found_ids = {b.id for b in batches}
    missing = [i for i in request.batch_ids if i not in found_ids]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batches not found: {missing}",
        )

    now = datetime.utcnow()
    for batch in batches:
        batch.assigned_to_user_id = clerk.id
        batch.assigned_by_user_id = current_user.id
        batch.assigned_at = now

    await session.commit()
    return AssignBatchesResponse(assigned_count=len(batches), batch_ids=list(found_ids))


@router.post("/batches/release", response_model=ReleaseBatchesResponse)
async def release_batches(
    request: ReleaseBatchesRequest,
    session: DBSessionDep,
    _: RegistrarDep,
) -> ReleaseBatchesResponse:
    if not request.batch_ids and not request.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide batch_ids and/or user_id",
        )

    stmt = select(IssueBatch).with_for_update()
    if request.batch_ids:
        stmt = stmt.where(IssueBatch.id.in_(request.batch_ids))
    if request.user_id:
        stmt = stmt.where(IssueBatch.assigned_to_user_id == request.user_id)

    batches = (await session.execute(stmt)).scalars().all()
    for batch in batches:
        batch.assigned_to_user_id = None
        batch.assigned_by_user_id = None
        batch.assigned_at = None
    await session.commit()
    return ReleaseBatchesResponse(released_count=len(batches))


@router.get("/batches/summary", response_model=BatchSummaryResponse)
async def batches_summary(
    session: DBSessionDep,
    _: RegistrarDep,
    exam_id: int | None = Query(None),
) -> BatchSummaryResponse:
    # Unbatched pending: classify DOC/NOD in Python for accuracy
    stmt = (
        select(SubjectScoreValidationIssue, SubjectScore, ExamSubject, Subject)
        .join(SubjectScore, SubjectScoreValidationIssue.subject_score_id == SubjectScore.id)
        .join(ExamSubject, SubjectScoreValidationIssue.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(
            SubjectScoreValidationIssue.status == ValidationIssueStatus.PENDING,
            SubjectScoreValidationIssue.batch_id.is_(None),
        )
    )
    if exam_id is not None:
        stmt = stmt.where(ExamSubject.exam_id == exam_id)

    rows = (await session.execute(stmt)).all()
    exam_ids = {es.exam_id for _, _, es, _ in rows}
    success_by_exam: dict[int, set[str]] = {}
    for eid in exam_ids:
        docs = (
            await session.execute(
                select(Document.extracted_id).where(
                    Document.exam_id == eid,
                    Document.id_extraction_status == "success",
                    Document.extracted_id.is_not(None),
                )
            )
        ).scalars().all()
        success_by_exam[eid] = {d for d in docs if d}

    counts: dict[tuple[int, int, str, int, bool], int] = {}
    code_map: dict[int, str] = {}
    for issue, score, es, subject in rows:
        doc_id = get_score_document_id(score, issue.test_type)
        has_doc = bool(doc_id and doc_id in success_by_exam.get(es.exam_id, set()))
        key = (es.exam_id, subject.id, subject.code, issue.test_type, has_doc)
        counts[key] = counts.get(key, 0) + 1
        code_map[subject.id] = subject.code

    unbatched = [
        BatchSummaryUnbatchedItem(
            exam_id=k[0],
            subject_id=k[1],
            subject_code=k[2],
            test_type=k[3],
            has_document=k[4],
            pending_count=v,
        )
        for k, v in sorted(counts.items(), key=lambda x: (x[0][0], x[0][2], x[0][3], not x[0][4]))
    ]

    # Per-clerk assigned pending
    pending_per_batch = (
        select(
            SubjectScoreValidationIssue.batch_id.label("batch_id"),
            func.count().label("pending_count"),
        )
        .where(
            SubjectScoreValidationIssue.status == ValidationIssueStatus.PENDING,
            SubjectScoreValidationIssue.batch_id.is_not(None),
        )
        .group_by(SubjectScoreValidationIssue.batch_id)
        .subquery()
    )

    clerk_stmt = (
        select(
            User.id,
            User.full_name,
            func.count(IssueBatch.id).label("assigned_batches"),
            func.coalesce(func.sum(pending_per_batch.c.pending_count), 0).label(
                "assigned_pending_issues"
            ),
        )
        .outerjoin(IssueBatch, IssueBatch.assigned_to_user_id == User.id)
        .outerjoin(pending_per_batch, pending_per_batch.c.batch_id == IssueBatch.id)
        .where(User.role == UserRole.DATACLERK, User.is_active.is_(True))
        .group_by(User.id, User.full_name)
        .order_by(User.full_name.asc())
    )
    clerk_rows = (await session.execute(clerk_stmt)).all()
    clerks = [
        BatchSummaryClerkItem(
            user_id=r.id,
            full_name=r.full_name,
            assigned_batches=int(r.assigned_batches or 0),
            assigned_pending_issues=int(r.assigned_pending_issues or 0),
        )
        for r in clerk_rows
    ]
    return BatchSummaryResponse(unbatched=unbatched, clerks=clerks)


@router.get("/quotas", response_model=ClerkQuotaListResponse)
async def list_quotas(
    session: DBSessionDep,
    _: RegistrarDep,
) -> ClerkQuotaListResponse:
    clerks = (
        await session.execute(
            select(User)
            .where(User.role == UserRole.DATACLERK, User.is_active.is_(True))
            .order_by(User.full_name.asc())
        )
    ).scalars().all()

    items: list[ClerkQuotaItem] = []
    for clerk in clerks:
        base = await get_base_quota(session, clerk.id)
        override = await get_today_override(session, clerk.id)
        limit, overridden = await get_effective_quota(session, clerk.id)
        resolved = await count_resolved_today(session, clerk.id)
        items.append(
            ClerkQuotaItem(
                user_id=clerk.id,
                full_name=clerk.full_name,
                base_quota=base,
                override_quota=override.override_quota if override else None,
                quota_limit=limit,
                resolved_today=resolved,
                remaining=max(0, limit - resolved),
                quota_overridden=overridden,
            )
        )
    return ClerkQuotaListResponse(clerks=items)


@router.put("/quotas/{user_id}", response_model=ClerkQuotaItem)
async def set_base_quota(
    user_id: str,
    request: SetBaseQuotaRequest,
    session: DBSessionDep,
    current_user: RegistrarDep,
) -> ClerkQuotaItem:
    from uuid import UUID

    try:
        uid = UUID(user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid user_id") from e

    clerk = (await session.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not clerk or clerk.role != UserRole.DATACLERK:
        raise HTTPException(status_code=404, detail="Data clerk not found")

    row = (
        await session.execute(select(ClerkQuotaSettings).where(ClerkQuotaSettings.user_id == uid))
    ).scalar_one_or_none()
    now = datetime.utcnow()
    if row is None:
        row = ClerkQuotaSettings(
            user_id=uid,
            daily_resolve_quota=request.daily_resolve_quota,
            updated_at=now,
            updated_by_user_id=current_user.id,
        )
        session.add(row)
    else:
        row.daily_resolve_quota = request.daily_resolve_quota
        row.updated_at = now
        row.updated_by_user_id = current_user.id
    await session.commit()

    limit, overridden = await get_effective_quota(session, uid)
    override = await get_today_override(session, uid)
    resolved = await count_resolved_today(session, uid)
    return ClerkQuotaItem(
        user_id=uid,
        full_name=clerk.full_name,
        base_quota=request.daily_resolve_quota,
        override_quota=override.override_quota if override else None,
        quota_limit=limit,
        resolved_today=resolved,
        remaining=max(0, limit - resolved),
        quota_overridden=overridden,
    )


@router.put("/quotas/{user_id}/override", response_model=ClerkQuotaItem)
async def set_quota_override(
    user_id: str,
    request: SetQuotaOverrideRequest,
    session: DBSessionDep,
    current_user: RegistrarDep,
) -> ClerkQuotaItem:
    from uuid import UUID

    try:
        uid = UUID(user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid user_id") from e

    clerk = (await session.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not clerk or clerk.role != UserRole.DATACLERK:
        raise HTTPException(status_code=404, detail="Data clerk not found")

    today = utc_today()
    existing = await get_today_override(session, uid, today)

    if request.override_quota is None:
        if existing:
            await session.delete(existing)
            await session.commit()
    else:
        if request.override_quota < 1:
            raise HTTPException(status_code=400, detail="override_quota must be >= 1")
        if existing:
            existing.override_quota = request.override_quota
            existing.reason = request.reason
            existing.created_by_user_id = current_user.id
        else:
            session.add(
                ClerkDailyQuotaOverride(
                    user_id=uid,
                    quota_date=today,
                    override_quota=request.override_quota,
                    reason=request.reason,
                    created_by_user_id=current_user.id,
                    created_at=datetime.utcnow(),
                )
            )
        await session.commit()

    base = await get_base_quota(session, uid)
    limit, overridden = await get_effective_quota(session, uid)
    override = await get_today_override(session, uid)
    resolved = await count_resolved_today(session, uid)
    return ClerkQuotaItem(
        user_id=uid,
        full_name=clerk.full_name,
        base_quota=base,
        override_quota=override.override_quota if override else None,
        quota_limit=limit,
        resolved_today=resolved,
        remaining=max(0, limit - resolved),
        quota_overridden=overridden,
    )
