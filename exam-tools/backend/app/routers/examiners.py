from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import (
    CurrentUserDep,
    SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
)
from app.dependencies.database import DBSessionDep
from app.models import Examination, Examiner, ExaminerRosterSource, ExaminerSubject, ExaminerType, User
from app.schemas.examiner_delete import (
    ExaminerBulkDeleteBody,
    ExaminerBulkDeletePreviewResponse,
    ExaminerBulkDeleteRequest,
    ExaminerBulkDeleteResponse,
    ExaminerBulkDeleteRowError,
    ExaminerDeleteImpactResponse,
)
from app.schemas.examiner_portal import (
    ExaminerPortalLinkRegenerateRequest,
    ExaminerPortalLinkRegenerateResponse,
)
from app.schemas.script_allocation import (
    ExaminerBulkImportResponse,
    ExaminerBulkImportRowError,
    ExaminerBulkSmsRequest,
    ExaminerBulkSmsResponse,
    ExaminerBulkSmsRowError,
    ExaminerCreate,
    ExaminerResponse,
    ExaminerRosterSourceSchema,
    ExaminerTypeSchema,
    ExaminerUpdate,
)
from app.services.examiner_delete import (
    aggregate_examiner_delete_impacts,
    build_bulk_examiner_delete_preview,
    build_examiner_delete_impact,
    delete_examiner_with_cleanup,
    load_examiner_for_delete,
)
from app.services.examiner_portal import (
    examiner_portal_url,
    generate_portal_token,
    regenerate_examiner_portal_link,
)
from app.services.examiner_roster import (
    dataframe_row_to_examiner_fields,
    parse_gender_cell,
    read_examiners_spreadsheet,
)
from app.services.examiner_regional_quota import (
    GenderDistribution,
    GroupDistribution,
    assert_examiner_regional_quota_allowed,
)
from app.services.examiner_subject_lock import assert_examiner_subject_allowed
from app.services.script_allocation import parse_region, sync_examiner_subjects
from app.services.sms.phone import normalize_msisdn
from app.services.sms.examiner_roster import maybe_send_custom_examiner_roster_sms
from app.services.examiner_reference_code import assign_reference_code_to_examiner
from app.services.subject_marking_group import sync_subject_cohort_memberships
from app.services.subject_officer_scope import (
    assert_subject_officer_access,
    assert_unrestricted_examiner_manager,
    effective_subject_scope,
)
from app.services.template_generator import generate_examiners_bulk_template

router = APIRouter(tags=["examiners"])

_MAX_EXAMINER_BULK_BYTES = 5 * 1024 * 1024
_MAX_EXAMINER_BULK_ROWS = 2000


def _examiner_type_from_schema(s: ExaminerTypeSchema) -> ExaminerType:
    return {
        ExaminerTypeSchema.chief_examiner: ExaminerType.CHIEF,
        ExaminerTypeSchema.assistant_chief_examiner: ExaminerType.ASSISTANT_CHIEF,
        ExaminerTypeSchema.assistant_examiner: ExaminerType.ASSISTANT,
        ExaminerTypeSchema.team_leader: ExaminerType.TEAM_LEADER,
    }[s]


def _examiner_type_to_schema(t: ExaminerType) -> ExaminerTypeSchema:
    return {
        ExaminerType.CHIEF: ExaminerTypeSchema.chief_examiner,
        ExaminerType.ASSISTANT_CHIEF: ExaminerTypeSchema.assistant_chief_examiner,
        ExaminerType.ASSISTANT: ExaminerTypeSchema.assistant_examiner,
        ExaminerType.TEAM_LEADER: ExaminerTypeSchema.team_leader,
    }[t]


def _examiner_response(ex: Examiner) -> ExaminerResponse:
    gid = ex.group_membership.group_id if ex.group_membership is not None else None
    inv = ex.invitation
    return ExaminerResponse(
        id=ex.id,
        examination_id=int(ex.examination_id),
        name=ex.name,
        phone_number=ex.phone_number,
        gender=ex.gender,
        examiner_type=_examiner_type_to_schema(ex.examiner_type),
        region=ex.region.value,
        reference_code=ex.reference_code,
        town=ex.town,
        ghanapost_gps_address=ex.ghanapost_gps_address,
        background_occupation_type=ex.background_occupation_type,
        background_institution_name=ex.background_institution_name,
        background_teaching_subject=ex.background_teaching_subject,
        background_industry=ex.background_industry,
        background_specialization=ex.background_specialization,
        subject_ids=[s.subject_id for s in ex.subjects],
        deviation_weight=float(ex.deviation_weight) if ex.deviation_weight is not None else None,
        examiner_group_id=gid,
        portal_url=examiner_portal_url(ex.portal_token),
        roster_source=ExaminerRosterSourceSchema(ex.roster_source.value),
        invitation_id=inv.id if inv is not None else None,
        invitation_status=inv.status.value if inv is not None else None,
        created_at=ex.created_at,
        updated_at=ex.updated_at,
    )


async def _sync_cohort_memberships_for_examiner(session: AsyncSession, ex: Examiner) -> None:
    stmt = select(ExaminerSubject.subject_id).where(ExaminerSubject.examiner_id == ex.id)
    subject_ids = list((await session.execute(stmt)).scalars().all())
    for sid in subject_ids:
        await sync_subject_cohort_memberships(
            session,
            examination_id=int(ex.examination_id),
            subject_id=int(sid),
        )


async def _get_examination_or_404(session: AsyncSession, examination_id: int) -> Examination:
    row = await session.get(Examination, examination_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return row


def _examiner_subject_ids(ex: Examiner) -> list[int]:
    return [int(s.subject_id) for s in ex.subjects]


async def _assert_examiner_accessible(
    session: AsyncSession,
    user: User,
    examination_id: int,
    ex: Examiner,
) -> None:
    scope = await effective_subject_scope(session, user, examination_id)
    if scope is None:
        return
    if not scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    subject_ids = _examiner_subject_ids(ex)
    if not subject_ids or not any(sid in scope for sid in subject_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner not found")


async def _assert_subject_ids_allowed(
    session: AsyncSession,
    user: User,
    examination_id: int,
    subject_ids: list[int],
) -> None:
    for sid in subject_ids:
        await assert_subject_officer_access(session, user, examination_id, sid)


@router.get("/examinations/{examination_id}/examiners", response_model=list[ExaminerResponse])
async def list_examiners(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
) -> list[ExaminerResponse]:
    await _get_examination_or_404(session, examination_id)
    scope = await effective_subject_scope(session, user, examination_id)
    if scope is not None and not scope:
        return []
    stmt = (
        select(Examiner)
        .where(Examiner.examination_id == examination_id)
        .options(
            selectinload(Examiner.subjects),
            selectinload(Examiner.group_membership),
            selectinload(Examiner.invitation),
        )
        .order_by(Examiner.name)
    )
    if scope is not None:
        stmt = stmt.join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id).where(
            ExaminerSubject.subject_id.in_(scope)
        )
    rows = list((await session.execute(stmt)).unique().scalars().all())
    return [_examiner_response(e) for e in rows]


@router.post(
    "/examinations/{examination_id}/examiners",
    response_model=ExaminerResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_examiner(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    body: ExaminerCreate,
) -> ExaminerResponse:
    assert_unrestricted_examiner_manager(user)
    await _get_examination_or_404(session, examination_id)
    await _assert_subject_ids_allowed(session, user, examination_id, body.subject_ids)
    try:
        region = parse_region(body.region)
        msisdn = normalize_msisdn(body.phone_number)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    try:
        gender = parse_gender_cell(body.gender)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    subject_id = body.subject_ids[0]
    try:
        await assert_examiner_subject_allowed(
            session,
            examination_id=examination_id,
            msisdn=msisdn,
            subject_id=subject_id,
        )
        await assert_examiner_regional_quota_allowed(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
            region=region,
            examiner_type=_examiner_type_from_schema(body.examiner_type),
            gender=gender,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    ex = Examiner(
        examination_id=examination_id,
        name=body.name.strip(),
        phone_number=body.phone_number.strip(),
        msisdn=msisdn,
        gender=gender,
        examiner_type=_examiner_type_from_schema(body.examiner_type),
        region=region,
        deviation_weight=body.deviation_weight,
        portal_token=generate_portal_token(),
        roster_source=ExaminerRosterSource.MANUAL,
    )
    session.add(ex)
    await session.flush()
    await sync_examiner_subjects(session, ex, body.subject_ids)
    try:
        await assign_reference_code_to_examiner(session, ex)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    await _sync_cohort_memberships_for_examiner(session, ex)
    await session.commit()
    stmt = (
        select(Examiner)
        .where(Examiner.id == ex.id)
        .options(
            selectinload(Examiner.subjects),
            selectinload(Examiner.group_membership),
            selectinload(Examiner.invitation),
        )
    )
    ex2 = (await session.execute(stmt)).scalar_one()
    return _examiner_response(ex2)


@router.get(
    "/examinations/{examination_id}/examiners/bulk-upload/template",
    summary="Download Excel template for examiner roster bulk upload",
)
async def download_examiners_bulk_template(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
) -> Response:
    await _get_examination_or_404(session, examination_id)
    body = generate_examiners_bulk_template()
    return Response(
        content=body,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="examiners_bulk_template.xlsx"'},
    )


@router.post(
    "/examinations/{examination_id}/examiners/bulk-upload",
    response_model=ExaminerBulkImportResponse,
)
async def bulk_upload_examiners(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    file: UploadFile = File(...),
) -> ExaminerBulkImportResponse:
    assert_unrestricted_examiner_manager(user)
    await _get_examination_or_404(session, examination_id)
    scope = await effective_subject_scope(session, user, examination_id)
    raw = await file.read()
    if len(raw) > _MAX_EXAMINER_BULK_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")
    try:
        df = read_examiners_spreadsheet(raw, file.filename or "upload.csv")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if len(df) > _MAX_EXAMINER_BULK_ROWS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {_MAX_EXAMINER_BULK_ROWS} data rows are allowed",
        )
    errors: list[ExaminerBulkImportRowError] = []
    created_count = 0
    batch_additional: dict[tuple[int, UUID], GroupDistribution] = {}
    batch_gender: dict[int, GenderDistribution] = {}
    for row_number, (_, srow) in enumerate(df.iterrows(), start=2):
        try:
            fields = await dataframe_row_to_examiner_fields(session, srow)
        except ValueError as e:
            errors.append(ExaminerBulkImportRowError(row_number=row_number, message=str(e)))
            continue
        try:
            hr = parse_region(fields["allowed_region"])
            msisdn = normalize_msisdn(fields["phone_number"])
            subject_id = fields["subject_ids"][0]
            if scope is not None and subject_id not in scope:
                raise ValueError("Subject not assigned to this officer")
            await assert_examiner_subject_allowed(
                session,
                examination_id=examination_id,
                msisdn=msisdn,
                subject_id=subject_id,
            )
            from app.services.examiner_regional_quota import resolve_group_for_region

            group_id, _ = await resolve_group_for_region(
                session, examination_id=examination_id, region=hr
            )
            await assert_examiner_regional_quota_allowed(
                session,
                examination_id=examination_id,
                subject_id=subject_id,
                region=hr,
                examiner_type=fields["examiner_type"],
                gender=fields.get("gender"),
                additional=batch_additional,
                additional_gender=batch_gender,
            )
        except ValueError as e:
            errors.append(ExaminerBulkImportRowError(row_number=row_number, message=str(e)))
            continue
        key = (subject_id, group_id)
        if key not in batch_additional:
            batch_additional[key] = GroupDistribution()
        batch_additional[key].total += 1
        batch_additional[key].by_role[fields["examiner_type"]] = (
            batch_additional[key].by_role.get(fields["examiner_type"], 0) + 1
        )
        row_gender = fields.get("gender")
        if row_gender in ("Male", "Female"):
            if subject_id not in batch_gender:
                batch_gender[subject_id] = GenderDistribution()
            if row_gender == "Male":
                batch_gender[subject_id].male += 1
            else:
                batch_gender[subject_id].female += 1
        ex = Examiner(
            examination_id=examination_id,
            name=fields["name"],
            phone_number=fields["phone_number"],
            msisdn=msisdn,
            gender=fields.get("gender"),
            examiner_type=fields["examiner_type"],
            region=hr,
            deviation_weight=None,
            portal_token=generate_portal_token(),
            roster_source=ExaminerRosterSource.MANUAL,
        )
        session.add(ex)
        try:
            await session.flush()
            await sync_examiner_subjects(session, ex, fields["subject_ids"])
            await assign_reference_code_to_examiner(session, ex)
            await _sync_cohort_memberships_for_examiner(session, ex)
            await session.commit()
            created_count += 1
        except Exception as e:  # noqa: BLE001 — row-level import; surface message to admin
            await session.rollback()
            errors.append(ExaminerBulkImportRowError(row_number=row_number, message=str(e)))
    return ExaminerBulkImportResponse(created_count=created_count, errors=errors)


@router.patch("/examinations/{examination_id}/examiners/{examiner_id}", response_model=ExaminerResponse)
async def update_examiner(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    examiner_id: UUID,
    body: ExaminerUpdate,
) -> ExaminerResponse:
    assert_unrestricted_examiner_manager(user)
    stmt = (
        select(Examiner)
        .where(Examiner.id == examiner_id, Examiner.examination_id == examination_id)
        .options(
            selectinload(Examiner.subjects),
            selectinload(Examiner.group_membership),
            selectinload(Examiner.invitation),
        )
    )
    ex = (await session.execute(stmt)).scalar_one_or_none()
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner not found")
    await _assert_examiner_accessible(session, user, examination_id, ex)
    patch = body.model_dump(exclude_unset=True)
    if "name" in patch and patch["name"] is not None:
        ex.name = str(patch["name"]).strip()
    new_region = ex.region
    new_type = ex.examiner_type
    new_gender = ex.gender
    if "region" in patch and patch["region"] is not None:
        try:
            new_region = parse_region(patch["region"])
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if "examiner_type" in patch and patch["examiner_type"] is not None:
        new_type = _examiner_type_from_schema(ExaminerTypeSchema(patch["examiner_type"]))
    if "gender" in patch:
        try:
            new_gender = parse_gender_cell(patch["gender"])
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if (
        ("region" in patch and patch["region"] is not None)
        or ("examiner_type" in patch and patch["examiner_type"] is not None)
        or "gender" in patch
    ):
        subject_ids = _examiner_subject_ids(ex)
        if len(subject_ids) == 1:
            try:
                await assert_examiner_regional_quota_allowed(
                    session,
                    examination_id=examination_id,
                    subject_id=subject_ids[0],
                    region=new_region,
                    examiner_type=new_type,
                    gender=new_gender,
                    exclude_examiner_id=ex.id,
                )
            except ValueError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if "region" in patch and patch["region"] is not None:
        ex.region = new_region
    if "examiner_type" in patch and patch["examiner_type"] is not None:
        ex.examiner_type = new_type
    if "deviation_weight" in patch:
        ex.deviation_weight = patch["deviation_weight"]
    if "gender" in patch:
        ex.gender = new_gender
    if "phone_number" in patch and patch["phone_number"] is not None:
        try:
            ex.phone_number = str(patch["phone_number"]).strip()
            ex.msisdn = normalize_msisdn(ex.phone_number)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
        subject_ids = _examiner_subject_ids(ex)
        if len(subject_ids) == 1:
            try:
                await assert_examiner_subject_allowed(
                    session,
                    examination_id=examination_id,
                    msisdn=ex.msisdn,
                    subject_id=subject_ids[0],
                    exclude_examiner_id=ex.id,
                )
            except ValueError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if "subject_ids" in patch and patch["subject_ids"] is not None:
        subject_ids = list(patch["subject_ids"])
        if len(subject_ids) != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Exactly one subject is allowed per examiner",
            )
        await _assert_subject_ids_allowed(session, user, examination_id, subject_ids)
        previous_subject_ids = _examiner_subject_ids(ex)
        msisdn = ex.msisdn
        if not msisdn and ex.phone_number:
            try:
                msisdn = normalize_msisdn(ex.phone_number)
                ex.msisdn = msisdn
            except ValueError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
        if msisdn:
            try:
                await assert_examiner_subject_allowed(
                    session,
                    examination_id=examination_id,
                    msisdn=msisdn,
                    subject_id=subject_ids[0],
                    exclude_examiner_id=ex.id,
                )
            except ValueError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
        await sync_examiner_subjects(session, ex, subject_ids)
        for sid in set(previous_subject_ids) | set(subject_ids):
            await sync_subject_cohort_memberships(
                session,
                examination_id=examination_id,
                subject_id=sid,
            )
    await session.commit()
    stmt2 = (
        select(Examiner)
        .where(Examiner.id == ex.id)
        .options(
            selectinload(Examiner.subjects),
            selectinload(Examiner.group_membership),
            selectinload(Examiner.invitation),
        )
    )
    ex2 = (await session.execute(stmt2)).scalar_one()
    return _examiner_response(ex2)


@router.post(
    "/examinations/{examination_id}/examiners/{examiner_id}/regenerate-portal-link",
    response_model=ExaminerPortalLinkRegenerateResponse,
)
async def regenerate_examiner_portal_link_endpoint(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    examiner_id: UUID,
    body: ExaminerPortalLinkRegenerateRequest,
) -> ExaminerPortalLinkRegenerateResponse:
    assert_unrestricted_examiner_manager(user)
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set confirm to true to regenerate the portal link.",
        )
    stmt = (
        select(Examiner)
        .where(Examiner.id == examiner_id, Examiner.examination_id == examination_id)
        .options(
            selectinload(Examiner.subjects),
            selectinload(Examiner.invitation),
        )
    )
    ex = (await session.execute(stmt)).scalar_one_or_none()
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner not found")
    await _assert_examiner_accessible(session, user, examination_id, ex)
    try:
        portal_url = await regenerate_examiner_portal_link(session, ex)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await session.commit()
    return ExaminerPortalLinkRegenerateResponse(examiner_id=ex.id, portal_url=portal_url)


@router.get(
    "/examinations/{examination_id}/examiners/{examiner_id}/delete-preview",
    response_model=ExaminerDeleteImpactResponse,
)
async def get_examiner_delete_preview(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    examiner_id: UUID,
) -> ExaminerDeleteImpactResponse:
    assert_unrestricted_examiner_manager(user)
    ex = await load_examiner_for_delete(session, examination_id, examiner_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner not found")
    await _assert_examiner_accessible(session, user, examination_id, ex)
    return await build_examiner_delete_impact(session, examination_id, ex)


@router.delete(
    "/examinations/{examination_id}/examiners/{examiner_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_examiner(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    examiner_id: UUID,
    confirm_remove_allocations: bool = Query(False),
) -> None:
    assert_unrestricted_examiner_manager(user)
    ex = await load_examiner_for_delete(session, examination_id, examiner_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner not found")
    await _assert_examiner_accessible(session, user, examination_id, ex)

    impact = await build_examiner_delete_impact(session, examination_id, ex)
    if impact.requires_confirmation and not confirm_remove_allocations:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=impact.model_dump(mode="json"),
        )

    await delete_examiner_with_cleanup(session, examination_id, ex)
    await session.commit()


@router.post(
    "/examinations/{examination_id}/examiners/bulk-delete-preview",
    response_model=ExaminerBulkDeletePreviewResponse,
    summary="Preview impact of deleting selected roster examiners",
)
async def bulk_examiner_delete_preview(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    body: ExaminerBulkDeleteRequest,
) -> ExaminerBulkDeletePreviewResponse:
    assert_unrestricted_examiner_manager(user)
    await _get_examination_or_404(session, examination_id)
    unique_ids = list(dict.fromkeys(body.examiner_ids))
    items, not_found_count = await build_bulk_examiner_delete_preview(
        session,
        examination_id,
        unique_ids,
    )
    scoped_items: list[ExaminerDeleteImpactResponse] = []
    for item in items:
        ex = await load_examiner_for_delete(session, examination_id, item.examiner_id)
        if ex is None:
            continue
        await _assert_examiner_accessible(session, user, examination_id, ex)
        scoped_items.append(item)
    return aggregate_examiner_delete_impacts(scoped_items, not_found_count=not_found_count)


@router.post(
    "/examinations/{examination_id}/examiners/bulk-delete",
    response_model=ExaminerBulkDeleteResponse,
    summary="Delete selected roster examiners",
)
async def bulk_delete_examiners(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    body: ExaminerBulkDeleteBody,
) -> ExaminerBulkDeleteResponse:
    assert_unrestricted_examiner_manager(user)
    await _get_examination_or_404(session, examination_id)
    unique_ids = list(dict.fromkeys(body.examiner_ids))
    items, not_found_count = await build_bulk_examiner_delete_preview(
        session,
        examination_id,
        unique_ids,
    )
    preview = aggregate_examiner_delete_impacts(items, not_found_count=not_found_count)
    if preview.requires_confirmation and not body.confirm_remove_allocations:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=preview.model_dump(mode="json"),
        )

    errors: list[ExaminerBulkDeleteRowError] = []
    deleted_count = 0
    rows = {
        ex.id: ex
        for ex in (
            await session.execute(
                select(Examiner).where(
                    Examiner.examination_id == examination_id,
                    Examiner.id.in_(unique_ids),
                )
            )
        ).scalars().all()
    }

    for examiner_id in unique_ids:
        ex = rows.get(examiner_id)
        if ex is None:
            errors.append(
                ExaminerBulkDeleteRowError(
                    examiner_id=examiner_id,
                    message="Examiner not found for this examination",
                )
            )
            continue
        try:
            await _assert_examiner_accessible(session, user, examination_id, ex)
            impact = await build_examiner_delete_impact(session, examination_id, ex)
            if impact.requires_confirmation and not body.confirm_remove_allocations:
                errors.append(
                    ExaminerBulkDeleteRowError(
                        examiner_id=examiner_id,
                        message="Allocation impact requires confirmation",
                    )
                )
                continue
            await delete_examiner_with_cleanup(session, examination_id, ex)
            deleted_count += 1
        except HTTPException as exc:
            errors.append(
                ExaminerBulkDeleteRowError(
                    examiner_id=examiner_id,
                    message=str(exc.detail),
                )
            )
        except Exception as exc:
            errors.append(
                ExaminerBulkDeleteRowError(
                    examiner_id=examiner_id,
                    message=str(exc),
                )
            )

    await session.commit()
    return ExaminerBulkDeleteResponse(deleted_count=deleted_count, errors=errors)


@router.post(
    "/examinations/{examination_id}/examiners/bulk-sms",
    response_model=ExaminerBulkSmsResponse,
    summary="Send custom SMS to selected roster examiners",
)
async def bulk_send_examiner_roster_custom_sms(
    session: DBSessionDep,
    user: CurrentUserDep,
    auth_user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    body: ExaminerBulkSmsRequest,
) -> ExaminerBulkSmsResponse:
    await _get_examination_or_404(session, examination_id)
    scope = await effective_subject_scope(session, auth_user, examination_id)

    unique_ids = list(dict.fromkeys(body.examiner_ids))
    stmt = (
        select(Examiner)
        .where(
            Examiner.examination_id == examination_id,
            Examiner.id.in_(unique_ids),
        )
        .options(
            selectinload(Examiner.examination),
            selectinload(Examiner.subjects).selectinload(ExaminerSubject.subject),
            selectinload(Examiner.invitation),
        )
    )
    rows = {ex.id: ex for ex in (await session.execute(stmt)).scalars().all()}

    errors: list[ExaminerBulkSmsRowError] = []
    sent_count = 0
    failed_count = 0

    for ex_id in unique_ids:
        ex = rows.get(ex_id)
        if ex is None:
            errors.append(
                ExaminerBulkSmsRowError(
                    examiner_id=ex_id,
                    message="Examiner not found for this examination",
                )
            )
            failed_count += 1
            continue
        if scope is not None:
            subject_ids = _examiner_subject_ids(ex)
            if not any(sid in scope for sid in subject_ids):
                errors.append(
                    ExaminerBulkSmsRowError(
                        examiner_id=ex_id,
                        message="Examiner not in assigned subject scope",
                    )
                )
                failed_count += 1
                continue
        try:
            sms_sent, sms_error, _delivery_id = await maybe_send_custom_examiner_roster_sms(
                ex,
                body.message,
                session=session,
                triggered_by_user_id=user.id,
                trigger="bulk_custom",
            )
            if sms_sent:
                sent_count += 1
            else:
                failed_count += 1
                errors.append(
                    ExaminerBulkSmsRowError(
                        examiner_id=ex_id,
                        message=sms_error or "SMS failed",
                    )
                )
        except Exception as e:  # noqa: BLE001 — per-recipient; continue batch
            await session.rollback()
            failed_count += 1
            errors.append(ExaminerBulkSmsRowError(examiner_id=ex_id, message=str(e)))

    return ExaminerBulkSmsResponse(
        sent_count=sent_count,
        failed_count=failed_count,
        errors=errors,
    )
