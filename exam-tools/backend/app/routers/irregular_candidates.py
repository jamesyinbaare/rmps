"""Inspector and admin APIs for irregular examination candidate registration."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import Select, func, select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import (
    InspectorDep,
    InspectorJwtPostingIdDep,
    SuperAdminOrFinanceOfficerDep,
)
from app.dependencies.database import DBSessionDep
from app.models import (
    ExaminationCentre,
    IrregularExaminationCandidate,
    Programme,
    Region,
    Subject,
    SubjectType,
    Zone,
    programme_subjects,
)
from app.services.irregular_candidate_export import (
    generate_irregular_candidates_export,
    irregular_candidates_export_filename,
)
from app.utils.content_disposition import content_disposition_attachment
from app.schemas.irregular_candidates import (
    IrregularCandidateAdminListResponse,
    IrregularCandidateListResponse,
    IrregularCandidateProgrammeItem,
    IrregularCandidateResponse,
    IrregularCandidateStatusResponse,
)
from app.schemas.programme import (
    ProgrammeSubjectRequirements,
    ProgrammeSubjectResponse,
    SubjectChoiceGroup,
)
from app.services.exam_documents import ensure_storage_dir
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.inspector_posting import (
    representative_school_for_centre,
    resolve_inspector_workspace,
)
from app.services.inspector_submission_settings import (
    assert_irregular_candidates_enabled,
    get_or_create_submission_settings,
)
from app.services.irregular_candidate_files import (
    IrregularCandidateUploadError,
    read_irregular_candidate_file_bytes,
    remove_irregular_candidate_file,
    write_irregular_candidate_upload,
)
from app.services.irregular_candidates import (
    candidate_to_response,
    load_irregular_candidate,
    load_programme_subjects_for_ids,
    normalize_optional_ghanapost_gps,
    normalize_optional_phone,
    normalize_required_gender,
    normalize_required_phone,
    parse_date_of_birth,
    parse_subject_ids_json,
    replace_subject_selections,
    require_non_empty,
    touch_updated,
)

inspector_router = APIRouter(
    prefix="/examinations/{examination_id}/irregular-candidates",
    tags=["irregular-candidates"],
)
admin_router = APIRouter(
    prefix="/admin/examinations/{examination_id}/irregular-candidates",
    tags=["admin-irregular-candidates"],
)


async def _resolve_inspector_ctx(
    session: DBSessionDep,
    examination_id: int,
    user,
    posting_id: UUID | None,
    jwt_posting_id: UUID | None,
):
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return await resolve_inspector_workspace(
        session,
        examination_id=examination_id,
        user=user,
        posting_id=posting_id,
        jwt_posting_id=jwt_posting_id,
    )


def _row_response(row: IrregularExaminationCandidate) -> IrregularCandidateResponse:
    return candidate_to_response(
        row,
        centre=row.examination_centre,
        school=row.school,
        programme=row.programme,
    )


async def _read_image_upload(file: UploadFile, *, kind: str, examination_id: int) -> str:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{kind} file is required")
    try:
        return write_irregular_candidate_upload(
            raw,
            examination_id,
            kind=kind,
            filename=file.filename or f"{kind}.jpg",
        )
    except IrregularCandidateUploadError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


def _content_type_for_path(stored_path: str) -> str:
    lower = stored_path.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    return "image/jpeg"


@inspector_router.get("/status", response_model=IrregularCandidateStatusResponse)
async def irregular_candidates_status(
    examination_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
) -> IrregularCandidateStatusResponse:
    await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    settings = await get_or_create_submission_settings(session, examination_id)
    return IrregularCandidateStatusResponse(enabled=bool(settings.irregular_candidates_enabled))


@inspector_router.get("/programmes", response_model=list[IrregularCandidateProgrammeItem])
async def list_irregular_candidate_programmes(
    examination_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
) -> list[IrregularCandidateProgrammeItem]:
    await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    await assert_irregular_candidates_enabled(session, examination_id)
    result = await session.execute(select(Programme).order_by(Programme.code))
    return [
        IrregularCandidateProgrammeItem(id=p.id, code=p.code, name=p.name)
        for p in result.scalars().all()
    ]


@inspector_router.get(
    "/programmes/{programme_id}/subject-requirements",
    response_model=ProgrammeSubjectRequirements,
)
async def irregular_candidate_programme_subject_requirements(
    examination_id: int,
    programme_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
) -> ProgrammeSubjectRequirements:
    await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    await assert_irregular_candidates_enabled(session, examination_id)
    programme = await session.get(Programme, programme_id)
    if programme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    subject_stmt = (
        select(
            Subject,
            programme_subjects.c.created_at,
            programme_subjects.c.is_compulsory,
            programme_subjects.c.choice_group_id,
        )
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .where(programme_subjects.c.programme_id == programme_id)
        .order_by(Subject.code)
    )
    subjects_data = (await session.execute(subject_stmt)).all()

    compulsory_core: list[ProgrammeSubjectResponse] = []
    optional_core_by_group: dict[int, list[ProgrammeSubjectResponse]] = {}
    electives: list[ProgrammeSubjectResponse] = []

    for subject, created_at, is_compulsory, choice_group_id in subjects_data:
        subject_response = ProgrammeSubjectResponse(
            subject_id=subject.id,
            subject_code=subject.code,
            subject_name=subject.name,
            subject_type=subject.subject_type,
            is_compulsory=is_compulsory,
            choice_group_id=choice_group_id,
            created_at=created_at,
        )
        if subject.subject_type == SubjectType.CORE:
            if is_compulsory is True:
                compulsory_core.append(subject_response)
            elif is_compulsory is False and choice_group_id is not None:
                optional_core_by_group.setdefault(choice_group_id, []).append(subject_response)
        elif subject.subject_type == SubjectType.ELECTIVE:
            electives.append(subject_response)

    return ProgrammeSubjectRequirements(
        compulsory_core=compulsory_core,
        optional_core_groups=[
            SubjectChoiceGroup(choice_group_id=group_id, subjects=subjects)
            for group_id, subjects in sorted(optional_core_by_group.items())
        ],
        electives=electives,
    )


@inspector_router.get("", response_model=IrregularCandidateListResponse)
async def list_inspector_irregular_candidates(
    examination_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
) -> IrregularCandidateListResponse:
    """List all irregular candidates for the inspector's examination centre.

    Shared across every inspector posted to the same centre for this exam
    (not limited to records the current user created).
    """
    ctx = await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    await assert_irregular_candidates_enabled(session, examination_id)
    stmt = (
        select(IrregularExaminationCandidate)
        .options(
            selectinload(IrregularExaminationCandidate.subject_selections),
            selectinload(IrregularExaminationCandidate.examination_centre),
            selectinload(IrregularExaminationCandidate.school),
            selectinload(IrregularExaminationCandidate.programme),
        )
        .where(
            IrregularExaminationCandidate.examination_id == examination_id,
            IrregularExaminationCandidate.examination_centre_id == ctx.examination_centre.id,
        )
        .order_by(
            IrregularExaminationCandidate.last_name,
            IrregularExaminationCandidate.first_name,
            IrregularExaminationCandidate.id,
        )
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return IrregularCandidateListResponse(
        items=[_row_response(r) for r in rows],
        total=len(rows),
    )


@inspector_router.get("/{candidate_id}", response_model=IrregularCandidateResponse)
async def get_inspector_irregular_candidate(
    examination_id: int,
    candidate_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
) -> IrregularCandidateResponse:
    ctx = await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    await assert_irregular_candidates_enabled(session, examination_id)
    row = await load_irregular_candidate(
        session,
        examination_id=examination_id,
        candidate_id=candidate_id,
        centre_id=ctx.examination_centre.id,
    )
    return _row_response(row)


@inspector_router.post("", response_model=IrregularCandidateResponse, status_code=status.HTTP_201_CREATED)
async def create_inspector_irregular_candidate(
    examination_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    first_name: str = Form(...),
    last_name: str = Form(...),
    gender: str = Form(...),
    date_of_birth: str = Form(...),
    phone_number: str = Form(...),
    programme_id: int = Form(...),
    subject_ids: str = Form(..., description="JSON array of subject ids"),
    other_name: str | None = Form(None),
    guardian_name: str | None = Form(None),
    guardian_phone_number: str | None = Form(None),
    ghanapost_gps_address: str | None = Form(None),
    photograph: UploadFile = File(...),
    voucher: UploadFile = File(...),
    posting_id: UUID | None = Query(default=None),
) -> IrregularCandidateResponse:
    ctx = await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    await assert_irregular_candidates_enabled(session, examination_id)

    host_school = await representative_school_for_centre(session, ctx.examination_centre)
    if host_school is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Examination centre has no host school for candidate attribution",
        )

    first = require_non_empty(first_name, field_name="first_name")
    last = require_non_empty(last_name, field_name="last_name")
    gender_value = normalize_required_gender(gender)
    dob = parse_date_of_birth(date_of_birth)
    phone = normalize_required_phone(phone_number, field_name="phone_number")
    other = (other_name or "").strip() or None
    guardian = (guardian_name or "").strip() or None
    guardian_phone = normalize_optional_phone(guardian_phone_number, field_name="guardian_phone_number")
    gps = normalize_optional_ghanapost_gps(ghanapost_gps_address)

    subject_id_list = parse_subject_ids_json(subject_ids)
    subjects = await load_programme_subjects_for_ids(
        session, programme_id=programme_id, subject_ids=subject_id_list
    )
    programme = await session.get(Programme, programme_id)
    assert programme is not None

    ensure_storage_dir()
    photo_path = await _read_image_upload(photograph, kind="photograph", examination_id=examination_id)
    voucher_path: str | None = None
    try:
        voucher_path = await _read_image_upload(voucher, kind="voucher", examination_id=examination_id)
        row = IrregularExaminationCandidate(
            examination_id=examination_id,
            examination_centre_id=ctx.examination_centre.id,
            school_id=host_school.id,
            programme_id=programme_id,
            first_name=first,
            last_name=last,
            other_name=other,
            gender=gender_value,
            date_of_birth=dob,
            phone_number=phone,
            guardian_name=guardian,
            guardian_phone_number=guardian_phone,
            ghanapost_gps_address=gps,
            photograph_stored_path=photo_path,
            voucher_stored_path=voucher_path,
            recorded_by_user_id=user.id,
        )
        replace_subject_selections(row, subjects)
        session.add(row)
        await session.commit()
        row = await load_irregular_candidate(
            session,
            examination_id=examination_id,
            candidate_id=row.id,
            centre_id=ctx.examination_centre.id,
        )
        return _row_response(row)
    except Exception:
        await session.rollback()
        try:
            remove_irregular_candidate_file(photo_path)
        except IrregularCandidateUploadError:
            pass
        if voucher_path:
            try:
                remove_irregular_candidate_file(voucher_path)
            except IrregularCandidateUploadError:
                pass
        raise


@inspector_router.patch("/{candidate_id}", response_model=IrregularCandidateResponse)
async def update_inspector_irregular_candidate(
    examination_id: int,
    candidate_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    first_name: str | None = Form(None),
    last_name: str | None = Form(None),
    gender: str | None = Form(None),
    date_of_birth: str | None = Form(None),
    phone_number: str | None = Form(None),
    programme_id: int | None = Form(None),
    subject_ids: str | None = Form(None, description="JSON array of subject ids"),
    other_name: str | None = Form(None),
    guardian_name: str | None = Form(None),
    guardian_phone_number: str | None = Form(None),
    ghanapost_gps_address: str | None = Form(None),
    clear_other_name: bool = Form(False),
    clear_guardian_name: bool = Form(False),
    clear_guardian_phone_number: bool = Form(False),
    clear_ghanapost_gps_address: bool = Form(False),
    photograph: UploadFile | None = File(None),
    voucher: UploadFile | None = File(None),
    posting_id: UUID | None = Query(default=None),
) -> IrregularCandidateResponse:
    ctx = await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    await assert_irregular_candidates_enabled(session, examination_id)
    row = await load_irregular_candidate(
        session,
        examination_id=examination_id,
        candidate_id=candidate_id,
        centre_id=ctx.examination_centre.id,
    )

    if first_name is not None:
        row.first_name = require_non_empty(first_name, field_name="first_name")
    if last_name is not None:
        row.last_name = require_non_empty(last_name, field_name="last_name")
    if gender is not None:
        row.gender = normalize_required_gender(gender)
    if date_of_birth is not None:
        row.date_of_birth = parse_date_of_birth(date_of_birth)
    if phone_number is not None:
        row.phone_number = normalize_required_phone(phone_number, field_name="phone_number")

    if clear_other_name:
        row.other_name = None
    elif other_name is not None:
        row.other_name = other_name.strip() or None

    if clear_guardian_name:
        row.guardian_name = None
    elif guardian_name is not None:
        row.guardian_name = guardian_name.strip() or None

    if clear_guardian_phone_number:
        row.guardian_phone_number = None
    elif guardian_phone_number is not None:
        row.guardian_phone_number = normalize_optional_phone(
            guardian_phone_number, field_name="guardian_phone_number"
        )

    if clear_ghanapost_gps_address:
        row.ghanapost_gps_address = None
    elif ghanapost_gps_address is not None:
        row.ghanapost_gps_address = normalize_optional_ghanapost_gps(ghanapost_gps_address)

    effective_programme_id = programme_id if programme_id is not None else row.programme_id
    if programme_id is not None:
        programme = await session.get(Programme, programme_id)
        if programme is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Programme not found")
        row.programme_id = programme_id

    if subject_ids is not None:
        subject_id_list = parse_subject_ids_json(subject_ids)
        subjects = await load_programme_subjects_for_ids(
            session, programme_id=effective_programme_id, subject_ids=subject_id_list
        )
        replace_subject_selections(row, subjects)
    elif programme_id is not None:
        # Programme changed without new subject_ids — re-validate existing against new programme
        existing_ids = [s.subject_id for s in row.subject_selections if s.subject_id is not None]
        if not existing_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="subject_ids is required when changing programme",
            )
        subjects = await load_programme_subjects_for_ids(
            session, programme_id=effective_programme_id, subject_ids=existing_ids
        )
        replace_subject_selections(row, subjects)

    old_photo = row.photograph_stored_path
    old_voucher = row.voucher_stored_path
    new_photo: str | None = None
    new_voucher: str | None = None
    ensure_storage_dir()
    try:
        if photograph is not None and photograph.filename:
            new_photo = await _read_image_upload(
                photograph, kind="photograph", examination_id=examination_id
            )
            row.photograph_stored_path = new_photo
        if voucher is not None and voucher.filename:
            new_voucher = await _read_image_upload(
                voucher, kind="voucher", examination_id=examination_id
            )
            row.voucher_stored_path = new_voucher
        touch_updated(row)
        await session.commit()
    except Exception:
        await session.rollback()
        if new_photo:
            try:
                remove_irregular_candidate_file(new_photo)
            except IrregularCandidateUploadError:
                pass
        if new_voucher:
            try:
                remove_irregular_candidate_file(new_voucher)
            except IrregularCandidateUploadError:
                pass
        raise

    if new_photo and new_photo != old_photo:
        try:
            remove_irregular_candidate_file(old_photo)
        except (IrregularCandidateUploadError, FileNotFoundError):
            pass
    if new_voucher and new_voucher != old_voucher:
        try:
            remove_irregular_candidate_file(old_voucher)
        except (IrregularCandidateUploadError, FileNotFoundError):
            pass

    row = await load_irregular_candidate(
        session,
        examination_id=examination_id,
        candidate_id=candidate_id,
        centre_id=ctx.examination_centre.id,
    )
    return _row_response(row)


async def _serve_candidate_image(
    session: DBSessionDep,
    *,
    examination_id: int,
    candidate_id: int,
    kind: Literal["photograph", "voucher"],
    centre_id: UUID | None,
) -> Response:
    row = await load_irregular_candidate(
        session,
        examination_id=examination_id,
        candidate_id=candidate_id,
        centre_id=centre_id,
    )
    stored = row.photograph_stored_path if kind == "photograph" else row.voucher_stored_path
    try:
        data = read_irregular_candidate_file_bytes(stored)
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found") from e
    return Response(
        content=data,
        media_type=_content_type_for_path(stored),
        headers={"Content-Disposition": f'inline; filename="{kind}-{candidate_id}"'},
    )


@inspector_router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inspector_irregular_candidate(
    examination_id: int,
    candidate_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
) -> None:
    """Delete an irregular candidate at the inspector's centre.

    Any inspector posted to the same centre for this exam may delete the record,
    including candidates recorded by another inspector.
    """
    ctx = await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    await assert_irregular_candidates_enabled(session, examination_id)
    row = await load_irregular_candidate(
        session,
        examination_id=examination_id,
        candidate_id=candidate_id,
        centre_id=ctx.examination_centre.id,
    )
    photo_path = row.photograph_stored_path
    voucher_path = row.voucher_stored_path
    await session.delete(row)
    await session.commit()
    for stored in (photo_path, voucher_path):
        try:
            remove_irregular_candidate_file(stored)
        except (IrregularCandidateUploadError, FileNotFoundError, OSError):
            pass


@inspector_router.get("/{candidate_id}/photograph")
async def download_inspector_irregular_photograph(
    examination_id: int,
    candidate_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
) -> Response:
    ctx = await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    await assert_irregular_candidates_enabled(session, examination_id)
    return await _serve_candidate_image(
        session,
        examination_id=examination_id,
        candidate_id=candidate_id,
        kind="photograph",
        centre_id=ctx.examination_centre.id,
    )


@inspector_router.get("/{candidate_id}/voucher")
async def download_inspector_irregular_voucher(
    examination_id: int,
    candidate_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(default=None),
) -> Response:
    ctx = await _resolve_inspector_ctx(session, examination_id, user, posting_id, jwt_posting_id)
    await assert_irregular_candidates_enabled(session, examination_id)
    return await _serve_candidate_image(
        session,
        examination_id=examination_id,
        candidate_id=candidate_id,
        kind="voucher",
        centre_id=ctx.examination_centre.id,
    )


def _admin_irregular_candidates_base_query(
    examination_id: int,
    *,
    centre_id: UUID | None = None,
    region: Region | None = None,
    zone: Zone | None = None,
    q: str | None = None,
) -> Select[tuple[IrregularExaminationCandidate]]:
    base = select(IrregularExaminationCandidate).where(
        IrregularExaminationCandidate.examination_id == examination_id
    )
    if centre_id is not None:
        base = base.where(IrregularExaminationCandidate.examination_centre_id == centre_id)
    if region is not None or zone is not None:
        base = base.join(
            ExaminationCentre,
            IrregularExaminationCandidate.examination_centre_id == ExaminationCentre.id,
        )
        if region is not None:
            base = base.where(ExaminationCentre.region == region)
        if zone is not None:
            base = base.where(ExaminationCentre.zone == zone)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        base = base.where(
            (IrregularExaminationCandidate.first_name.ilike(pattern))
            | (IrregularExaminationCandidate.last_name.ilike(pattern))
            | (IrregularExaminationCandidate.other_name.ilike(pattern))
            | (IrregularExaminationCandidate.phone_number.ilike(pattern))
        )
    return base


@admin_router.get("", response_model=IrregularCandidateAdminListResponse)
async def list_admin_irregular_candidates(
    examination_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    centre_id: UUID | None = Query(default=None),
    region: Region | None = Query(default=None),
    zone: Zone | None = Query(default=None),
    q: str | None = Query(default=None, description="Search name or phone"),
) -> IrregularCandidateAdminListResponse:
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    base = _admin_irregular_candidates_base_query(
        examination_id,
        centre_id=centre_id,
        region=region,
        zone=zone,
        q=q,
    )

    count_stmt = select(func.count()).select_from(base.order_by(None).subquery())
    total = int((await session.execute(count_stmt)).scalar_one())
    stmt = (
        base.options(
            selectinload(IrregularExaminationCandidate.subject_selections),
            selectinload(IrregularExaminationCandidate.examination_centre),
            selectinload(IrregularExaminationCandidate.school),
            selectinload(IrregularExaminationCandidate.programme),
        )
        .order_by(
            IrregularExaminationCandidate.created_at.desc(),
            IrregularExaminationCandidate.id.desc(),
        )
        .offset(skip)
        .limit(limit)
    )
    rows = list((await session.execute(stmt)).scalars().unique().all())
    return IrregularCandidateAdminListResponse(
        items=[_row_response(r) for r in rows],
        total=total,
        skip=skip,
        limit=limit,
    )


@admin_router.get("/export.xlsx")
async def export_admin_irregular_candidates(
    examination_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
    centre_id: UUID | None = Query(default=None),
    region: Region | None = Query(default=None),
    zone: Zone | None = Query(default=None),
    q: str | None = Query(default=None, description="Search name or phone"),
) -> Response:
    """Download irregular candidates for this examination as Excel (respects list filters)."""
    try:
        exam = await load_examination_or_raise(session, examination_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    stmt = (
        _admin_irregular_candidates_base_query(
            examination_id,
            centre_id=centre_id,
            region=region,
            zone=zone,
            q=q,
        )
        .options(
            selectinload(IrregularExaminationCandidate.subject_selections),
            selectinload(IrregularExaminationCandidate.examination_centre),
            selectinload(IrregularExaminationCandidate.school),
            selectinload(IrregularExaminationCandidate.programme),
        )
        .order_by(
            IrregularExaminationCandidate.created_at.desc(),
            IrregularExaminationCandidate.id.desc(),
        )
    )
    rows = list((await session.execute(stmt)).scalars().unique().all())
    payload = generate_irregular_candidates_export(rows)
    filename = irregular_candidates_export_filename(exam)
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": content_disposition_attachment(filename)},
    )


@admin_router.get("/{candidate_id}", response_model=IrregularCandidateResponse)
async def get_admin_irregular_candidate(
    examination_id: int,
    candidate_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> IrregularCandidateResponse:
    await load_examination_or_raise(session, examination_id)
    row = await load_irregular_candidate(
        session, examination_id=examination_id, candidate_id=candidate_id
    )
    return _row_response(row)


@admin_router.get("/{candidate_id}/photograph")
async def download_admin_irregular_photograph(
    examination_id: int,
    candidate_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> Response:
    await load_examination_or_raise(session, examination_id)
    return await _serve_candidate_image(
        session,
        examination_id=examination_id,
        candidate_id=candidate_id,
        kind="photograph",
        centre_id=None,
    )


@admin_router.get("/{candidate_id}/voucher")
async def download_admin_irregular_voucher(
    examination_id: int,
    candidate_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> Response:
    await load_examination_or_raise(session, examination_id)
    return await _serve_candidate_image(
        session,
        examination_id=examination_id,
        candidate_id=candidate_id,
        kind="voucher",
        centre_id=None,
    )
