from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import (
    Allocation,
    AllocationAssignment,
    AllocationExaminer,
    AllocationRun,
    AllocationRunStatus,
    Examiner,
    ExaminerType,
    ScriptsAllocationQuota,
    Subject,
)
from app.schemas.script_allocation import (
    AllocationCreate,
    AllocationExaminerImportRequest,
    AllocationExaminerResponse,
    AllocationResponse,
    AllocationRunAssignmentUpsert,
    AllocationRunListItem,
    AllocationRunResponse,
    AllocationRunStatusSchema,
    AllocationScopeSchema,
    AllocationSolveModeSchema,
    AllocationSolveOptions,
    AllocationUpdate,
    ExaminerTypeSchema,
    ScriptsAllocationQuotaReplace,
    ScriptsAllocationQuotaRow,
)
from app.services.script_allocation import (
    ManualAssignmentError,
    build_run_response,
    delete_manual_assignment,
    load_allocation_or_none,
    load_run_with_assignments,
    run_allocation_solve,
    upsert_manual_assignment,
)
from app.services.script_allocation_form_pdf import MAX_COPIES, build_scripts_allocation_form_pdf

router = APIRouter(tags=["script-allocation"])


def _examiner_type_from_schema(s: ExaminerTypeSchema) -> ExaminerType:
    return {
        ExaminerTypeSchema.chief_examiner: ExaminerType.CHIEF,
        ExaminerTypeSchema.assistant_examiner: ExaminerType.ASSISTANT,
        ExaminerTypeSchema.team_leader: ExaminerType.TEAM_LEADER,
    }[s]


def _examiner_type_to_schema(t: ExaminerType) -> ExaminerTypeSchema:
    return {
        ExaminerType.CHIEF: ExaminerTypeSchema.chief_examiner,
        ExaminerType.ASSISTANT: ExaminerTypeSchema.assistant_examiner,
        ExaminerType.TEAM_LEADER: ExaminerTypeSchema.team_leader,
    }[t]


def _run_status_schema(st: AllocationRunStatus) -> AllocationRunStatusSchema:
    return {
        AllocationRunStatus.DRAFT: AllocationRunStatusSchema.draft,
        AllocationRunStatus.OPTIMAL: AllocationRunStatusSchema.optimal,
        AllocationRunStatus.INFEASIBLE: AllocationRunStatusSchema.infeasible,
        AllocationRunStatus.TIMEOUT: AllocationRunStatusSchema.timeout,
        AllocationRunStatus.ERROR: AllocationRunStatusSchema.error,
    }[st]


def _sanitize_filename_part(s: str) -> str:
    return "".join(c for c in s if c.isalnum() or c in ("_", "-"))


def _run_list_item(r: AllocationRun) -> AllocationRunListItem:
    return AllocationRunListItem(
        id=r.id,
        allocation_id=r.allocation_id,
        status=_run_status_schema(r.status),
        objective_value=float(r.objective_value) if r.objective_value is not None else None,
        solver_message=r.solver_message,
        created_at=r.created_at,
    )


def _scripts_allocation_quota_row(q: ScriptsAllocationQuota) -> ScriptsAllocationQuotaRow:
    return ScriptsAllocationQuotaRow(
        allocation_id=q.allocation_id,
        examiner_type=_examiner_type_to_schema(q.examiner_type),
        subject_id=int(q.subject_id),
        quota_booklets=int(q.quota_booklets),
        created_at=q.created_at,
        updated_at=q.updated_at,
    )


@router.get("/allocations", response_model=list[AllocationResponse])
async def list_allocations(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int | None = Query(default=None),
    subject_id: int | None = Query(default=None),
    paper_number: int | None = Query(default=None, ge=1),
) -> list[Allocation]:
    stmt = select(Allocation).order_by(Allocation.subject_id.asc(), Allocation.paper_number.asc(), Allocation.created_at.desc())
    if examination_id is not None:
        stmt = stmt.where(Allocation.examination_id == examination_id)
    if subject_id is not None:
        stmt = stmt.where(Allocation.subject_id == subject_id)
    if paper_number is not None:
        stmt = stmt.where(Allocation.paper_number == paper_number)
    result = await session.execute(stmt)
    return list(result.scalars().all())


def _default_allocation_name(subject: Subject | None, subject_id: int, paper_number: int) -> str:
    if subject is not None:
        return f"{subject.code} · Paper {paper_number}"
    return f"Subject {subject_id} · Paper {paper_number}"


@router.post("/allocations", response_model=AllocationResponse, status_code=status.HTTP_200_OK)
async def create_allocation(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    body: AllocationCreate,
) -> Allocation:
    stmt_existing = select(Allocation).where(
        Allocation.examination_id == body.examination_id,
        Allocation.subject_id == body.subject_id,
        Allocation.paper_number == body.paper_number,
    )
    existing = (await session.execute(stmt_existing)).scalar_one_or_none()
    if existing is not None:
        if body.notes is not None:
            existing.notes = body.notes
        if body.name is not None and str(body.name).strip():
            existing.name = str(body.name).strip()
        await session.commit()
        await session.refresh(existing)
        return existing

    subject = await session.get(Subject, body.subject_id)
    name = (str(body.name).strip() if body.name is not None and str(body.name).strip() else None) or _default_allocation_name(
        subject, body.subject_id, body.paper_number
    )
    row = Allocation(
        examination_id=body.examination_id,
        name=name,
        subject_id=body.subject_id,
        paper_number=body.paper_number,
        notes=body.notes,
    )
    session.add(row)
    try:
        await session.commit()
        await session.refresh(row)
        return row
    except IntegrityError:
        await session.rollback()
        existing2 = (await session.execute(stmt_existing)).scalar_one_or_none()
        if existing2 is None:
            raise
        if body.notes is not None:
            existing2.notes = body.notes
        if body.name is not None and str(body.name).strip():
            existing2.name = str(body.name).strip()
        await session.commit()
        await session.refresh(existing2)
        return existing2


@router.get("/allocations/{allocation_id}", response_model=AllocationResponse)
async def get_allocation(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    allocation_id: UUID,
) -> Allocation:
    row = await load_allocation_or_none(session, allocation_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation not found")
    return row


@router.patch("/allocations/{allocation_id}", response_model=AllocationResponse)
async def update_allocation(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    allocation_id: UUID,
    body: AllocationUpdate,
) -> Allocation:
    row = await session.get(Allocation, allocation_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation not found")
    patch = body.model_dump(exclude_unset=True)
    next_subject_id = int(patch["subject_id"]) if "subject_id" in patch else int(row.subject_id)
    next_paper = int(patch["paper_number"]) if "paper_number" in patch else int(row.paper_number)
    if next_subject_id != int(row.subject_id) or next_paper != int(row.paper_number):
        clash_stmt = (
            select(Allocation.id)
            .where(
                Allocation.examination_id == row.examination_id,
                Allocation.subject_id == next_subject_id,
                Allocation.paper_number == next_paper,
                Allocation.id != allocation_id,
            )
            .limit(1)
        )
        if (await session.execute(clash_stmt)).scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another allocation already exists for this examination, subject, and paper",
            )
    if "name" in patch and patch["name"] is not None:
        row.name = str(patch["name"]).strip()
    if "subject_id" in patch:
        row.subject_id = patch["subject_id"]
    if "paper_number" in patch:
        row.paper_number = patch["paper_number"]
    if "notes" in patch:
        row.notes = patch["notes"]
    if "allocation_scope" in patch and patch["allocation_scope"] is not None:
        s = patch["allocation_scope"]
        row.allocation_scope = s.value if isinstance(s, AllocationScopeSchema) else str(s)
    if "cross_marking_rules" in patch and patch["cross_marking_rules"] is not None:
        row.cross_marking_rules = dict(patch["cross_marking_rules"])
    if "fairness_weight" in patch and patch["fairness_weight"] is not None:
        row.fairness_weight = float(patch["fairness_weight"])
    if "enforce_single_series_per_examiner" in patch and patch["enforce_single_series_per_examiner"] is not None:
        row.enforce_single_series_per_examiner = bool(patch["enforce_single_series_per_examiner"])
    if "exclude_home_zone_or_region" in patch and patch["exclude_home_zone_or_region"] is not None:
        row.exclude_home_zone_or_region = bool(patch["exclude_home_zone_or_region"])
    if "solve_mode" in patch and patch["solve_mode"] is not None:
        sm = patch["solve_mode"]
        row.solve_mode = sm.value if isinstance(sm, AllocationSolveModeSchema) else str(sm)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another allocation already exists for this examination, subject, and paper",
        ) from None
    await session.refresh(row)
    return row


@router.delete("/allocations/{allocation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_allocation(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    allocation_id: UUID,
) -> None:
    row = await session.get(Allocation, allocation_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation not found")
    await session.delete(row)
    await session.commit()


@router.get(
    "/allocations/{allocation_id}/scripts-allocation-quotas",
    response_model=list[ScriptsAllocationQuotaRow],
)
async def list_scripts_allocation_quotas(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    allocation_id: UUID,
) -> list[ScriptsAllocationQuotaRow]:
    allocation = await session.get(Allocation, allocation_id)
    if allocation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation not found")
    stmt = (
        select(ScriptsAllocationQuota)
        .where(ScriptsAllocationQuota.allocation_id == allocation_id)
        .order_by(
            ScriptsAllocationQuota.examiner_type,
            ScriptsAllocationQuota.subject_id,
        )
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return [_scripts_allocation_quota_row(r) for r in rows]


@router.put(
    "/allocations/{allocation_id}/scripts-allocation-quotas",
    response_model=list[ScriptsAllocationQuotaRow],
)
async def replace_scripts_allocation_quotas(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    allocation_id: UUID,
    body: ScriptsAllocationQuotaReplace,
) -> list[ScriptsAllocationQuotaRow]:
    allocation = await session.get(Allocation, allocation_id)
    if allocation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation not found")
    seen: set[tuple[str, int]] = set()
    for it in body.items:
        key = (it.examiner_type.value, it.subject_id)
        if key in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate examiner_type and subject_id: {it.examiner_type.value}, {it.subject_id}",
            )
        seen.add(key)
    await session.execute(
        delete(ScriptsAllocationQuota).where(ScriptsAllocationQuota.allocation_id == allocation_id)
    )
    for it in body.items:
        session.add(
            ScriptsAllocationQuota(
                allocation_id=allocation_id,
                examiner_type=_examiner_type_from_schema(it.examiner_type),
                subject_id=it.subject_id,
                quota_booklets=it.quota_booklets,
            )
        )
    await session.commit()
    stmt = (
        select(ScriptsAllocationQuota)
        .where(ScriptsAllocationQuota.allocation_id == allocation_id)
        .order_by(
            ScriptsAllocationQuota.examiner_type,
            ScriptsAllocationQuota.subject_id,
        )
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return [_scripts_allocation_quota_row(r) for r in rows]


@router.get("/allocations/{allocation_id}/runs", response_model=list[AllocationRunListItem])
async def list_allocation_runs(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    allocation_id: UUID,
) -> list[AllocationRunListItem]:
    allocation = await session.get(Allocation, allocation_id)
    if allocation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation not found")
    stmt = (
        select(AllocationRun)
        .where(AllocationRun.allocation_id == allocation_id)
        .order_by(AllocationRun.created_at.desc())
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return [_run_list_item(r) for r in rows]


@router.post("/allocations/{allocation_id}/solve", response_model=AllocationRunResponse)
async def solve_allocation(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
    allocation_id: UUID,
    body: AllocationSolveOptions | None = None,
) -> dict:
    opts = body or AllocationSolveOptions()
    allocation = await load_allocation_or_none(session, allocation_id)
    if allocation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation not found")
    solve_mode_val = (
        opts.solve_mode.value if isinstance(opts.solve_mode, AllocationSolveModeSchema) else str(opts.solve_mode)
    )
    run = await run_allocation_solve(
        session,
        allocation,
        created_by_id=user.id,
        unassigned_penalty=opts.unassigned_penalty,
        time_limit_sec=opts.time_limit_sec,
        allocation_scope=opts.allocation_scope.value if isinstance(opts.allocation_scope, AllocationScopeSchema) else "zone",
        fairness_weight=opts.fairness_weight,
        enforce_single_series_per_examiner=opts.enforce_single_series_per_examiner,
        cross_marking_rules=opts.cross_marking_rules,
        exclude_home_zone_or_region=opts.exclude_home_zone_or_region,
        solve_mode=solve_mode_val,
        marking_group_solve_order=opts.marking_group_solve_order,
    )
    await session.commit()
    run2 = await load_run_with_assignments(session, run.id)
    if run2 is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Run not persisted")
    return await build_run_response(session, run2)


def _allocation_examiner_row(member: AllocationExaminer, examiner: Examiner) -> AllocationExaminerResponse:
    gid = examiner.group_membership.group_id if examiner.group_membership is not None else None
    return AllocationExaminerResponse(
        allocation_id=member.allocation_id,
        examiner_id=member.examiner_id,
        examiner_name=examiner.name,
        examiner_type=_examiner_type_to_schema(examiner.examiner_type),
        subject_ids=[s.subject_id for s in examiner.subjects],
        region=examiner.region.value if examiner.region is not None else None,
        zone=None,
        allowed_zones=[],
        examiner_group_id=gid,
        created_at=member.created_at,
    )


@router.get("/allocations/{allocation_id}/examiners", response_model=list[AllocationExaminerResponse])
async def list_allocation_examiners(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    allocation_id: UUID,
) -> list[AllocationExaminerResponse]:
    allocation = await load_allocation_or_none(session, allocation_id)
    if allocation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation not found")
    stmt = (
        select(AllocationExaminer, Examiner)
        .join(Examiner, Examiner.id == AllocationExaminer.examiner_id)
        .where(AllocationExaminer.allocation_id == allocation_id)
        .options(selectinload(Examiner.subjects), selectinload(Examiner.group_membership))
        .order_by(Examiner.name)
    )
    rows = (await session.execute(stmt)).all()
    return [_allocation_examiner_row(member, examiner) for member, examiner in rows]


@router.get("/allocations/{allocation_id}/examiner-import-candidates", response_model=list[AllocationExaminerResponse])
async def list_allocation_examiner_import_candidates(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    allocation_id: UUID,
) -> list[AllocationExaminerResponse]:
    allocation = await load_allocation_or_none(session, allocation_id)
    if allocation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation not found")
    member_ids_stmt = select(AllocationExaminer.examiner_id).where(AllocationExaminer.allocation_id == allocation_id)
    member_ids = set((await session.execute(member_ids_stmt)).scalars().all())
    stmt = (
        select(Examiner)
        .where(Examiner.examination_id == allocation.examination_id)
        .options(selectinload(Examiner.subjects), selectinload(Examiner.group_membership))
        .order_by(Examiner.name)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    out: list[AllocationExaminerResponse] = []
    for examiner in rows:
        subject_ids = {s.subject_id for s in examiner.subjects}
        if allocation.subject_id not in subject_ids or examiner.id in member_ids:
            continue
        gid = examiner.group_membership.group_id if examiner.group_membership is not None else None
        out.append(
            AllocationExaminerResponse(
                allocation_id=allocation_id,
                examiner_id=examiner.id,
                examiner_name=examiner.name,
                examiner_type=_examiner_type_to_schema(examiner.examiner_type),
                subject_ids=sorted(subject_ids),
                region=examiner.region.value if examiner.region is not None else None,
                zone=None,
                allowed_zones=[],
                examiner_group_id=gid,
                created_at=allocation.created_at,
            )
        )
    return out


@router.post("/allocations/{allocation_id}/examiners/import", response_model=list[AllocationExaminerResponse])
async def import_allocation_examiners(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    allocation_id: UUID,
    body: AllocationExaminerImportRequest,
) -> list[AllocationExaminerResponse]:
    allocation = await load_allocation_or_none(session, allocation_id)
    if allocation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation not found")
    if not body.examiner_ids:
        return []
    stmt = (
        select(Examiner)
        .where(Examiner.id.in_(body.examiner_ids))
        .options(selectinload(Examiner.subjects), selectinload(Examiner.group_membership))
    )
    examiners = list((await session.execute(stmt)).scalars().all())
    examiners_by_id = {e.id: e for e in examiners}
    missing = [str(eid) for eid in body.examiner_ids if eid not in examiners_by_id]
    if missing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown examiner IDs: {', '.join(missing)}")
    for examiner in examiners:
        if examiner.examination_id != allocation.examination_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Examiner does not belong to allocation examination")
        subject_ids = {s.subject_id for s in examiner.subjects}
        if allocation.subject_id not in subject_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Examiner {examiner.name} is not eligible for this allocation subject")
    existing_ids_stmt = select(AllocationExaminer.examiner_id).where(AllocationExaminer.allocation_id == allocation_id)
    existing_ids = set((await session.execute(existing_ids_stmt)).scalars().all())
    for examiner_id in body.examiner_ids:
        if examiner_id in existing_ids:
            continue
        session.add(AllocationExaminer(allocation_id=allocation_id, examiner_id=examiner_id))
    await session.commit()
    return await list_allocation_examiners(session, _, allocation_id)


@router.delete("/allocations/{allocation_id}/examiners/{examiner_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_allocation_examiner(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    allocation_id: UUID,
    examiner_id: UUID,
) -> None:
    member = await session.get(AllocationExaminer, (allocation_id, examiner_id))
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation examiner not found")
    run_ids = select(AllocationRun.id).where(AllocationRun.allocation_id == allocation_id)
    await session.execute(
        delete(AllocationAssignment).where(
            AllocationAssignment.examiner_id == examiner_id,
            AllocationAssignment.allocation_run_id.in_(run_ids),
        )
    )
    await session.delete(member)
    await session.commit()


@router.get("/allocation-runs/{run_id}", response_model=AllocationRunResponse)
async def get_allocation_run(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    run_id: UUID,
) -> dict:
    run = await load_run_with_assignments(session, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return await build_run_response(session, run)


@router.get("/allocation-runs/{run_id}/scripts-allocation-form.pdf")
async def download_scripts_allocation_form_pdf(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    run_id: UUID,
    examiner_id: UUID | None = Query(default=None),
    copies: int = Query(default=1, ge=1, le=MAX_COPIES),
) -> Response:
    try:
        pdf, filename = await build_scripts_allocation_form_pdf(session, run_id, examiner_id, copies)
    except ValueError as e:
        msg = str(e)
        if msg == "Run not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from None
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from None
    safe = _sanitize_filename_part(filename.replace(".pdf", "")) + ".pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe}"'},
    )


@router.put("/allocation-runs/{run_id}/assignments", response_model=AllocationRunResponse)
async def upsert_allocation_run_assignment(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    run_id: UUID,
    body: AllocationRunAssignmentUpsert,
) -> dict:
    try:
        await upsert_manual_assignment(session, run_id, body.script_envelope_id, body.examiner_id)
    except ManualAssignmentError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
    await session.commit()
    run2 = await load_run_with_assignments(session, run_id)
    if run2 is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Run not found after update")
    return await build_run_response(session, run2)


@router.delete("/allocation-runs/{run_id}/assignments/{script_envelope_id}", response_model=AllocationRunResponse)
async def delete_allocation_run_assignment(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    run_id: UUID,
    script_envelope_id: UUID,
) -> dict:
    try:
        await delete_manual_assignment(session, run_id, script_envelope_id)
    except ManualAssignmentError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
    await session.commit()
    run2 = await load_run_with_assignments(session, run_id)
    if run2 is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Run not found after update")
    return await build_run_response(session, run2)
