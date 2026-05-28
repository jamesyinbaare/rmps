"""Per-examination centre management (first-class centres, UNIFIED / SPLIT)."""

from typing import cast
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from starlette.responses import Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminOrFinanceOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import (
    CentreStructureMode,
    ExamInspectorSubjectScope,
    Examination,
    ExaminationCentre,
    ExaminationCentreMembership,
    ExaminationCentreMembershipScope,
    InspectorExamPosting,
    School,
    User,
)
from app.schemas.examination_centre import (
    ExaminationCentreBulkUploadResponse,
    ExaminationCentreCreate,
    ExaminationCentreDetailResponse,
    ExaminationCentreListResponse,
    ExaminationCentreMembershipAssign,
    ExaminationCentreMembershipBulkUpdate,
    ExaminationCentreMembershipItem,
    ExaminationCentreResponse,
    ExaminationCentreUpdate,
    UpgradeToSplitResponse,
)
from app.services.examination_centre_bulk_upload import (
    CentreBulkUploadParseError,
    apply_centre_bulk_upload,
    parse_centre_bulk_upload_file,
)
from app.services.template_generator import generate_examination_centres_bulk_template
from app.schemas.school import PostedInspectorAtCentreRow
from app.services.centre_resolution import get_examination_centre_or_404, hosted_school_count
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.examination_centre_service import (
    centre_to_response,
    clone_centres_from_examination,
    parse_region_zone,
    upgrade_examination_to_split,
)

router = APIRouter(prefix="/examinations", tags=["examination-centres"])


def _normalize_mode(mode: CentreStructureMode | str) -> CentreStructureMode:
    if isinstance(mode, CentreStructureMode):
        return mode
    return CentreStructureMode(mode)


@router.get("/{examination_id}/centres", response_model=ExaminationCentreListResponse)
async def list_examination_centres(
    examination_id: int,
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    q: str | None = Query(None, description="Search code or name"),
) -> ExaminationCentreListResponse:
    try:
        exam = await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    stmt = select(ExaminationCentre).where(ExaminationCentre.examination_id == examination_id)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            ExaminationCentre.code.ilike(pattern) | ExaminationCentre.name.ilike(pattern)
        )
    stmt = stmt.order_by(ExaminationCentre.code)
    centres = list((await session.execute(stmt)).scalars().all())
    items: list[ExaminationCentreResponse] = []
    for c in centres:
        data = await centre_to_response(session, c)
        items.append(ExaminationCentreResponse(**data))
    return ExaminationCentreListResponse(
        items=items,
        total=len(items),
        centre_structure_mode=_normalize_mode(exam.centre_structure_mode),
    )


@router.get(
    "/{examination_id}/centres/bulk-upload/template",
    summary="Download Excel template for examination centres bulk upload",
)
async def download_examination_centres_bulk_template(
    examination_id: int,
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    subject_scope: ExaminationCentreMembershipScope = Query(
        ExaminationCentreMembershipScope.CORE,
        description="Scope for this upload (CORE, ELECTIVE, or ALL for UNIFIED exams)",
    ),
) -> Response:
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    scope_val = (
        subject_scope.value
        if isinstance(subject_scope, ExaminationCentreMembershipScope)
        else str(subject_scope)
    )
    body = generate_examination_centres_bulk_template(scope_val)
    return Response(
        content=body,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="examination_centres_bulk_template.xlsx"'
        },
    )


@router.post(
    "/{examination_id}/centres/bulk-upload",
    response_model=ExaminationCentreBulkUploadResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk upload examination centres and memberships (merge per scope)",
)
async def bulk_upload_examination_centres(
    examination_id: int,
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    file: UploadFile = File(...),
    subject_scope: ExaminationCentreMembershipScope = Query(
        ...,
        description="Membership scope for this file: CORE, ELECTIVE, or ALL (UNIFIED only)",
    ),
) -> ExaminationCentreBulkUploadResponse:
    """Columns: ``centre_code``, ``school_code`` only. Centres are created from the school registry."""
    content = await file.read()
    try:
        df = parse_centre_bulk_upload_file(content, file.filename or "")
    except CentreBulkUploadParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        return await apply_centre_bulk_upload(session, examination_id, subject_scope, df)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post(
    "/{examination_id}/centres",
    response_model=ExaminationCentreResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_examination_centre(
    examination_id: int,
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    body: ExaminationCentreCreate,
) -> ExaminationCentreResponse:
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    reg, zn = parse_region_zone(body.region, body.zone)
    centre = ExaminationCentre(
        examination_id=examination_id,
        code=body.code.strip(),
        name=body.name.strip(),
        region=reg,
        zone=zn,
    )
    session.add(centre)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Centre code already exists for this examination",
        ) from None
    await session.refresh(centre)
    data = await centre_to_response(session, centre)
    return ExaminationCentreResponse(**data)


@router.get(
    "/{examination_id}/centres/{centre_id}",
    response_model=ExaminationCentreDetailResponse,
)
async def get_examination_centre_detail(
    examination_id: int,
    centre_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
) -> ExaminationCentreDetailResponse:
    centre = await get_examination_centre_or_404(session, examination_id, centre_id)
    data = await centre_to_response(session, centre)
    mem_stmt = (
        select(ExaminationCentreMembership, School)
        .join(School, ExaminationCentreMembership.school_id == School.id)
        .where(ExaminationCentreMembership.examination_centre_id == centre_id)
        .order_by(School.code, ExaminationCentreMembership.subject_scope)
    )
    mem_rows = (await session.execute(mem_stmt)).all()
    memberships = [
        ExaminationCentreMembershipItem(
            school_id=m.school_id,
            school_code=cast(str, sch.code),
            school_name=cast(str, sch.name),
            subject_scope=m.subject_scope,
        )
        for m, sch in mem_rows
    ]
    pst_stmt = (
        select(InspectorExamPosting, User)
        .join(User, User.id == InspectorExamPosting.inspector_user_id)
        .where(
            InspectorExamPosting.examination_id == examination_id,
            InspectorExamPosting.examination_centre_id == centre_id,
        )
        .order_by(User.full_name.asc(), InspectorExamPosting.id.asc())
    )
    posted_inspectors: list[PostedInspectorAtCentreRow] = []
    for posting, insp_user in (await session.execute(pst_stmt)).all():
        st_scope = posting.subject_scope
        if isinstance(st_scope, ExamInspectorSubjectScope):
            scope_str = st_scope.value
        else:
            scope_str = str(st_scope)
        posted_inspectors.append(
            PostedInspectorAtCentreRow(
                posting_id=posting.id,
                examination_id=posting.examination_id,
                inspector_user_id=posting.inspector_user_id,
                inspector_full_name=cast(str, insp_user.full_name),
                inspector_phone=cast(str | None, insp_user.phone_number),
                subject_scope=scope_str,
            )
        )
    return ExaminationCentreDetailResponse(
        centre=ExaminationCentreResponse(**data),
        memberships=memberships,
        posted_inspectors=posted_inspectors,
    )


@router.patch(
    "/{examination_id}/centres/{centre_id}",
    response_model=ExaminationCentreResponse,
)
async def update_examination_centre(
    examination_id: int,
    centre_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    body: ExaminationCentreUpdate,
) -> ExaminationCentreResponse:
    centre = await get_examination_centre_or_404(session, examination_id, centre_id)
    if body.code is not None:
        centre.code = body.code.strip()
    if body.name is not None:
        centre.name = body.name.strip()
    if body.region is not None or body.zone is not None:
        reg, zn = parse_region_zone(
            body.region if body.region is not None else (centre.region.value if centre.region else None),
            body.zone if body.zone is not None else (centre.zone.value if centre.zone else None),
        )
        centre.region = reg
        centre.zone = zn
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Centre code already exists for this examination",
        ) from None
    await session.refresh(centre)
    data = await centre_to_response(session, centre)
    return ExaminationCentreResponse(**data)


@router.delete(
    "/{examination_id}/centres/{centre_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_examination_centre(
    examination_id: int,
    centre_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
) -> None:
    centre = await get_examination_centre_or_404(session, examination_id, centre_id)
    await session.delete(centre)
    await session.commit()


@router.put(
    "/{examination_id}/centres/{centre_id}/memberships",
    response_model=ExaminationCentreDetailResponse,
)
async def set_centre_memberships(
    examination_id: int,
    centre_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    body: ExaminationCentreMembershipBulkUpdate,
) -> ExaminationCentreDetailResponse:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    centre = await get_examination_centre_or_404(session, examination_id, centre_id)
    mode = _normalize_mode(exam.centre_structure_mode)

    for item in body.assignments:
        scope = item.subject_scope
        if isinstance(scope, str):
            scope = ExaminationCentreMembershipScope(scope)
        if mode == CentreStructureMode.UNIFIED and scope != ExaminationCentreMembershipScope.ALL:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="UNIFIED mode only allows ALL memberships",
            )
        if mode == CentreStructureMode.SPLIT and scope == ExaminationCentreMembershipScope.ALL:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="SPLIT mode does not allow ALL memberships",
            )

    school_codes = {a.school_code.strip() for a in body.assignments}
    sch_stmt = select(School).where(School.code.in_(school_codes))
    schools = {s.code: s for s in (await session.execute(sch_stmt)).scalars().all()}
    missing = school_codes - set(schools.keys())
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown school codes: {', '.join(sorted(missing))}",
        )

    from sqlalchemy import delete as sa_delete

    await session.execute(
        sa_delete(ExaminationCentreMembership).where(
            ExaminationCentreMembership.examination_centre_id == centre_id
        )
    )

    for item in body.assignments:
        sch = schools[item.school_code.strip()]
        scope = item.subject_scope
        if isinstance(scope, str):
            scope = ExaminationCentreMembershipScope(scope)
        session.add(
            ExaminationCentreMembership(
                examination_id=examination_id,
                examination_centre_id=centre_id,
                school_id=sch.id,
                subject_scope=scope,
            )
        )

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Membership conflict (school may already belong to another centre for this scope)",
        ) from None

    return await get_examination_centre_detail(examination_id, centre_id, session, _admin)


@router.post(
    "/{examination_id}/centres/upgrade-to-split",
    response_model=UpgradeToSplitResponse,
)
async def upgrade_centres_to_split(
    examination_id: int,
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
) -> UpgradeToSplitResponse:
    created, removed = await upgrade_examination_to_split(session, examination_id)
    await session.commit()
    return UpgradeToSplitResponse(
        examination_id=examination_id,
        centre_structure_mode=CentreStructureMode.SPLIT,
        memberships_created=created,
        memberships_removed=removed,
    )


@router.post(
    "/{examination_id}/centres/clone-from/{source_examination_id}",
    response_model=ExaminationCentreListResponse,
)
async def clone_centres(
    examination_id: int,
    source_examination_id: int,
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
) -> ExaminationCentreListResponse:
    count = await clone_centres_from_examination(
        session,
        target_examination_id=examination_id,
        source_examination_id=source_examination_id,
    )
    await session.commit()
    if count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source examination has no centres to clone",
        )
    return await list_examination_centres(examination_id, session, _admin)
