"""Script packing (answer booklets in envelopes): inspector CRUD per school in centre scope; super admin list."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, distinct, func, or_, select, tuple_
from sqlalchemy.orm import contains_eager, selectinload

from app.config import resolved_scripts_per_envelope_paper_1, resolved_scripts_per_envelope_paper_2, script_envelope_cap, settings
from app.dependencies.auth import DepotKeeperDep, InspectorDep, SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import (
    AllocationAssignment,
    ExaminationCandidate,
    ExaminationCandidateSubject,
    Region,
    School,
    ScriptEnvelope,
    ScriptPackingSeries,
    Subject,
    User,
    UserRole,
    Zone,
)
from app.schemas.script_control import (
    ScriptControlEnvelopeVerificationToggleRequest,
    MySchoolScriptControlResponse,
    ScriptControlAdminListResponse,
    ScriptControlAdminRow,
    ScriptControlSubjectSeriesCountRow,
    ScriptEnvelopeItem,
    ScriptPaperSlotResponse,
    ScriptSeriesPackingResponse,
    ScriptSeriesSlotResponse,
    ScriptSeriesUpsertRequest,
    ScriptSubjectRowResponse,
)
from app.services.depot_scope import (
    assert_school_in_depot,
    depot_school_ids,
    require_depot_id_for_depot_keeper,
    script_scope_for_school,
)
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.script_control_export import (
    build_script_control_export_dataframe,
    compute_max_series,
    sanitize_export_filename_part,
    script_control_export_excel_bytes,
)
from app.services.script_control import (
    assert_packing_school_in_scope,
    assert_script_packing_calendar_allowed,
    inspector_center_scope_school_ids,
    load_subject_paper_rows_for_exam_and_school,
    ordered_subjects_on_examination_timetable,
    paper_examination_date_for_triple,
    script_packing_today_in_configured_zone,
    subject_series_count_map,
    valid_script_packing_triples,
)

router = APIRouter(tags=["script-control"])


async def _inspector_scope_and_packing_school(
    session: DBSessionDep,
    user: User,
    school_id: UUID,
) -> tuple[School, set[UUID]]:
    if user.role != UserRole.INSPECTOR:
        raise PermissionError("Inspector access only")
    try:
        scope_ids = await inspector_center_scope_school_ids(session, user)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inspector access only") from None
    except ValueError as e:
        detail = str(e)
        if "examination centre scope" in detail or "Centre host school is missing" in detail:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from None
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail) from None

    packing_school = await session.get(School, school_id)
    if packing_school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")
    try:
        assert_packing_school_in_scope(school_id, scope_ids)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None
    return packing_school, scope_ids


def _packing_to_response(ps: ScriptPackingSeries) -> ScriptSeriesPackingResponse:
    envs_sorted = sorted(ps.envelopes, key=lambda x: x.envelope_number)
    envs = [
        ScriptEnvelopeItem(
            envelope_number=e.envelope_number,
            booklet_count=e.booklet_count,
            verified=e.verified_at is not None,
        )
        for e in envs_sorted
    ]
    all_verified = len(envs_sorted) > 0 and all(e.verified_at is not None for e in envs_sorted)
    return ScriptSeriesPackingResponse(
        id=ps.id,
        envelopes=envs,
        verified=all_verified,
    )


async def _build_my_school_script_grid(
    session: DBSessionDep,
    exam_id: int,
    packing_school: School,
    scope_ids: set[UUID],
) -> MySchoolScriptControlResponse:
    exam = await load_examination_or_raise(session, exam_id)
    rows = await load_subject_paper_rows_for_exam_and_school(
        session, exam_id, scope_ids, packing_school.id
    )
    pack_stmt = (
        select(ScriptPackingSeries)
        .where(
            ScriptPackingSeries.examination_id == exam_id,
            ScriptPackingSeries.school_id == packing_school.id,
        )
        .options(selectinload(ScriptPackingSeries.envelopes))
    )
    pack_result = await session.execute(pack_stmt)
    packings = list(pack_result.scalars().unique().all())
    key_map: dict[tuple[int, int, int], ScriptPackingSeries] = {}
    for ps in packings:
        key_map[(ps.subject_id, ps.paper_number, ps.series_number)] = ps

    counts_map = await subject_series_count_map(session, exam_id)
    subjects_out: list[ScriptSubjectRowResponse] = []
    for sub, paper_dates in rows:
        paper_slots: list[ScriptPaperSlotResponse] = []
        n_series = counts_map.get(sub.id, 1)
        for pn in sorted(paper_dates.keys()):
            series_slots: list[ScriptSeriesSlotResponse] = []
            for sn in range(1, n_series + 1):
                ps = key_map.get((sub.id, pn, sn))
                packing = _packing_to_response(ps) if ps else None
                verified = (
                    ps is not None
                    and len(ps.envelopes) > 0
                    and all(e.verified_at is not None for e in ps.envelopes)
                )
                series_slots.append(
                    ScriptSeriesSlotResponse(series_number=sn, packing=packing, verified=verified)
                )
            paper_slots.append(
                ScriptPaperSlotResponse(
                    paper_number=pn,
                    examination_date=paper_dates[pn],
                    series=series_slots,
                )
            )
        subjects_out.append(
            ScriptSubjectRowResponse(
                subject_id=sub.id,
                subject_code=sub.code,
                subject_name=sub.name,
                papers=paper_slots,
            )
        )

    return MySchoolScriptControlResponse(
        examination_id=exam.id,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        year=exam.year,
        school_id=packing_school.id,
        school_code=packing_school.code,
        scripts_per_envelope=settings.scripts_per_envelope,
        scripts_per_envelope_paper_1=resolved_scripts_per_envelope_paper_1(),
        scripts_per_envelope_paper_2=resolved_scripts_per_envelope_paper_2(),
        subjects=subjects_out,
    )


@router.get(
    "/examinations/{exam_id}/script-control/my-school",
    response_model=MySchoolScriptControlResponse,
)
async def get_my_school_script_control(
    exam_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    school_id: UUID = Query(
        ...,
        description="School whose registered candidates define subjects; read/write packing for this school.",
    ),
) -> MySchoolScriptControlResponse:
    packing_school, scope_ids = await _inspector_scope_and_packing_school(session, user, school_id)

    try:
        return await _build_my_school_script_grid(session, exam_id, packing_school, scope_ids)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None


@router.get(
    "/examinations/{exam_id}/script-control/depot/school",
    response_model=MySchoolScriptControlResponse,
)
async def get_depot_school_script_control(
    exam_id: int,
    session: DBSessionDep,
    user: DepotKeeperDep,
    school_id: UUID = Query(..., description="School in your depot."),
) -> MySchoolScriptControlResponse:
    try:
        depot_id = await require_depot_id_for_depot_keeper(session, user)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Depot keeper access only") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    allowed_schools = await depot_school_ids(session, depot_id)
    try:
        await assert_school_in_depot(school_id, allowed_schools)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    packing_school = await session.get(School, school_id)
    if packing_school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    scope_ids = await script_scope_for_school(session, packing_school)
    try:
        return await _build_my_school_script_grid(session, exam_id, packing_school, scope_ids)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None


@router.post(
    "/examinations/{exam_id}/script-control/depot/school/series/verification",
    response_model=ScriptSeriesPackingResponse,
)
async def set_depot_school_script_series_envelope_verification(
    exam_id: int,
    body: ScriptControlEnvelopeVerificationToggleRequest,
    session: DBSessionDep,
    user: DepotKeeperDep,
    school_id: UUID = Query(..., description="School in your depot."),
) -> ScriptSeriesPackingResponse:
    try:
        depot_id = await require_depot_id_for_depot_keeper(session, user)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Depot keeper access only") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    allowed_schools = await depot_school_ids(session, depot_id)
    try:
        await assert_school_in_depot(school_id, allowed_schools)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    packing_school = await session.get(School, school_id)
    if packing_school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    scope_ids = await script_scope_for_school(session, packing_school)
    allowed = await valid_script_packing_triples(session, exam_id, scope_ids, packing_school.id)
    if (body.subject_id, body.paper_number, body.series_number) not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject, paper, or series is not allowed for script packing for this school",
        )

    stmt = (
        select(ScriptPackingSeries)
        .where(
            ScriptPackingSeries.examination_id == exam_id,
            ScriptPackingSeries.school_id == packing_school.id,
            ScriptPackingSeries.subject_id == body.subject_id,
            ScriptPackingSeries.paper_number == body.paper_number,
            ScriptPackingSeries.series_number == body.series_number,
        )
        .options(selectinload(ScriptPackingSeries.envelopes))
    )
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No script packing record to verify; the inspector must enter data first.",
        )
    if not row.envelopes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This series has no envelopes; the inspector must add envelopes before verification.",
        )
    env_row = next((e for e in row.envelopes if e.envelope_number == body.envelope_number), None)
    if env_row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No envelope with number {body.envelope_number} in this series.",
        )
    if body.verified:
        if env_row.verified_at is None:
            env_row.verified_at = datetime.utcnow()
            env_row.verified_by_id = user.id
    else:
        env_row.verified_at = None
        env_row.verified_by_id = None
    all_verified = all(e.verified_at is not None for e in row.envelopes)
    if all_verified:
        row.verified_at = datetime.utcnow()
        row.verified_by_id = user.id
    else:
        row.verified_at = None
        row.verified_by_id = None
    await session.commit()
    await session.refresh(row, attribute_names=["envelopes"])
    stmt2 = (
        select(ScriptPackingSeries)
        .where(ScriptPackingSeries.id == row.id)
        .options(selectinload(ScriptPackingSeries.envelopes))
    )
    row2 = (await session.execute(stmt2)).scalar_one()
    return _packing_to_response(row2)


@router.put(
    "/examinations/{exam_id}/script-control/my-school/series",
    response_model=ScriptSeriesPackingResponse,
)
async def upsert_my_school_script_series(
    exam_id: int,
    body: ScriptSeriesUpsertRequest,
    session: DBSessionDep,
    user: InspectorDep,
    school_id: UUID = Query(
        ...,
        description="School whose registered candidates define subjects; read/write packing for this school.",
    ),
) -> ScriptSeriesPackingResponse:
    packing_school, scope_ids = await _inspector_scope_and_packing_school(session, user, school_id)

    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    allowed = await valid_script_packing_triples(session, exam_id, scope_ids, packing_school.id)
    if (body.subject_id, body.paper_number, body.series_number) not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject, paper, or series is not allowed for script packing (check timetable, registrations, and admin series configuration)",
        )

    exam_date = await paper_examination_date_for_triple(session, exam_id, body.subject_id, body.paper_number)
    try:
        assert_script_packing_calendar_allowed(exam_date, script_packing_today_in_configured_zone())
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    cap = script_envelope_cap(body.paper_number)
    for env in body.envelopes:
        if env.booklet_count > cap:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Envelope {env.envelope_number}: at most {cap} booklets for paper {body.paper_number}."
                ),
            )

    stmt = (
        select(ScriptPackingSeries)
        .where(
            ScriptPackingSeries.examination_id == exam_id,
            ScriptPackingSeries.school_id == packing_school.id,
            ScriptPackingSeries.subject_id == body.subject_id,
            ScriptPackingSeries.paper_number == body.paper_number,
            ScriptPackingSeries.series_number == body.series_number,
        )
        .options(selectinload(ScriptPackingSeries.envelopes))
    )
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()

    if row is not None:
        if row.verified_at is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This series has been fully verified by the depot keeper and can no longer be edited.",
            )
        for e in row.envelopes:
            if e.verified_at is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="One or more envelopes have been verified by the depot keeper; this series can no longer be edited.",
                )

    if row is None:
        row = ScriptPackingSeries(
            examination_id=exam_id,
            school_id=packing_school.id,
            subject_id=body.subject_id,
            paper_number=body.paper_number,
            series_number=body.series_number,
            updated_by_id=user.id,
        )
        session.add(row)
        await session.flush()
        for item in body.envelopes:
            session.add(
                ScriptEnvelope(
                    packing_series_id=row.id,
                    envelope_number=item.envelope_number,
                    booklet_count=item.booklet_count,
                )
            )
        await session.flush()
    else:
        row.updated_by_id = user.id
        by_number = {e.envelope_number: e for e in row.envelopes}
        wanted_numbers = {item.envelope_number for item in body.envelopes}
        for item in body.envelopes:
            existing = by_number.get(item.envelope_number)
            if existing is not None:
                if existing.booklet_count != item.booklet_count:
                    await session.execute(
                        delete(AllocationAssignment).where(
                            AllocationAssignment.script_envelope_id == existing.id,
                        )
                    )
                    existing.booklet_count = item.booklet_count
            else:
                session.add(
                    ScriptEnvelope(
                        packing_series_id=row.id,
                        envelope_number=item.envelope_number,
                        booklet_count=item.booklet_count,
                    )
                )
        for env in list(row.envelopes):
            if env.envelope_number not in wanted_numbers:
                await session.delete(env)
        await session.flush()

    await session.commit()
    await session.refresh(row, attribute_names=["envelopes"])
    stmt2 = (
        select(ScriptPackingSeries)
        .where(ScriptPackingSeries.id == row.id)
        .options(selectinload(ScriptPackingSeries.envelopes))
    )
    row2 = (await session.execute(stmt2)).scalar_one()
    return _packing_to_response(row2)


@router.delete(
    "/examinations/{exam_id}/script-control/my-school/series",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_my_school_script_series(
    exam_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    school_id: UUID = Query(
        ...,
        description="School whose registered candidates define subjects; read/write packing for this school.",
    ),
    subject_id: int = Query(...),
    paper_number: int = Query(..., ge=1),
    series_number: int = Query(..., ge=1, le=32767),
) -> None:
    packing_school, _scope_ids = await _inspector_scope_and_packing_school(session, user, school_id)

    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    exam_date = await paper_examination_date_for_triple(session, exam_id, subject_id, paper_number)
    try:
        assert_script_packing_calendar_allowed(exam_date, script_packing_today_in_configured_zone())
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    stmt = (
        select(ScriptPackingSeries)
        .where(
            ScriptPackingSeries.examination_id == exam_id,
            ScriptPackingSeries.school_id == packing_school.id,
            ScriptPackingSeries.subject_id == subject_id,
            ScriptPackingSeries.paper_number == paper_number,
            ScriptPackingSeries.series_number == series_number,
        )
        .options(selectinload(ScriptPackingSeries.envelopes))
    )
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Packing record not found")
    if row.verified_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This series has been fully verified by the depot keeper and cannot be deleted.",
        )
    for e in row.envelopes:
        if e.verified_at is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="One or more envelopes have been verified by the depot keeper; this series cannot be deleted.",
            )
    await session.delete(row)
    await session.commit()


def _script_control_admin_filters(
    *,
    examination_id: int | None,
    school_id: UUID | None,
    subject_id: int | None,
    paper_number: int | None,
    region: Region | None,
    zone: Zone | None,
    school_q: str | None,
    subject_q: str | None,
) -> list:
    conditions: list = []
    if examination_id is not None:
        conditions.append(ScriptPackingSeries.examination_id == examination_id)
    if school_id is not None:
        conditions.append(ScriptPackingSeries.school_id == school_id)
    if subject_id is not None:
        conditions.append(ScriptPackingSeries.subject_id == subject_id)
    if paper_number is not None:
        conditions.append(ScriptPackingSeries.paper_number == paper_number)
    if region is not None:
        conditions.append(School.region == region)
    if zone is not None:
        conditions.append(School.zone == zone)
    if school_q and school_q.strip():
        pattern = f"%{school_q.strip()}%"
        conditions.append(or_(School.code.ilike(pattern), School.name.ilike(pattern)))
    if subject_q and subject_q.strip():
        pattern = f"%{subject_q.strip()}%"
        conditions.append(or_(Subject.code.ilike(pattern), Subject.name.ilike(pattern)))
    return conditions


async def _registered_candidates_by_exam_school_subject(
    session: DBSessionDep,
    packings: list[ScriptPackingSeries],
) -> dict[str, int]:
    """Distinct examination candidate counts per (examination, school, subject) for packing rows."""
    if not packings:
        return {}
    triples = list({(ps.examination_id, ps.school_id, ps.subject_id) for ps in packings})
    if not triples:
        return {}
    reg_stmt = (
        select(
            ExaminationCandidate.examination_id,
            ExaminationCandidate.school_id,
            ExaminationCandidateSubject.subject_id,
            func.count(distinct(ExaminationCandidate.id)),
        )
        .select_from(ExaminationCandidate)
        .join(
            ExaminationCandidateSubject,
            ExaminationCandidateSubject.examination_candidate_id == ExaminationCandidate.id,
        )
        .where(
            ExaminationCandidate.school_id.isnot(None),
            ExaminationCandidateSubject.subject_id.isnot(None),
            tuple_(
                ExaminationCandidate.examination_id,
                ExaminationCandidate.school_id,
                ExaminationCandidateSubject.subject_id,
            ).in_(triples),
        )
        .group_by(
            ExaminationCandidate.examination_id,
            ExaminationCandidate.school_id,
            ExaminationCandidateSubject.subject_id,
        )
    )
    reg_result = await session.execute(reg_stmt)
    out: dict[str, int] = {}
    for exam_id, sch_id, sub_id, cnt in reg_result.all():
        key = f"{exam_id}:{sch_id}:{sub_id}"
        out[key] = int(cnt)
    return out


@router.get("/script-control/export")
async def export_script_control_records_excel(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    mode: Literal["summary", "detail"] = Query(
        ...,
        description="summary: numeric booklet totals per series; detail: comma-separated booklet counts per envelope.",
    ),
    examination_id: int = Query(...),
    subject_id: int = Query(...),
    paper_number: int = Query(..., ge=1),
    school_id: UUID | None = Query(default=None),
    region: Region | None = Query(default=None),
    zone: Zone | None = Query(default=None),
    school_q: str | None = Query(default=None, description="Case-insensitive search on school code or name."),
    subject_q: str | None = Query(default=None, description="Case-insensitive search on subject code or name."),
) -> StreamingResponse:
    try:
        exam = await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    sub = await session.get(Subject, subject_id)
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    filters = _script_control_admin_filters(
        examination_id=examination_id,
        school_id=school_id,
        subject_id=subject_id,
        paper_number=paper_number,
        region=region,
        zone=zone,
        school_q=school_q,
        subject_q=subject_q,
    )

    stmt = (
        select(ScriptPackingSeries)
        .join(School, School.id == ScriptPackingSeries.school_id)
        .join(Subject, Subject.id == ScriptPackingSeries.subject_id)
        .options(
            contains_eager(ScriptPackingSeries.school),
            contains_eager(ScriptPackingSeries.subject),
            selectinload(ScriptPackingSeries.envelopes),
        )
        .order_by(
            ScriptPackingSeries.examination_id.desc(),
            ScriptPackingSeries.school_id,
            ScriptPackingSeries.subject_id,
            ScriptPackingSeries.paper_number,
            ScriptPackingSeries.series_number,
        )
    )
    if filters:
        stmt = stmt.where(*filters)
    pack_result = await session.execute(stmt)
    packings = list(pack_result.scalars().unique().all())

    cmap = await subject_series_count_map(session, examination_id)
    max_series = compute_max_series(subject_id, cmap, packings)

    registered = await _registered_candidates_by_exam_school_subject(session, packings)

    df = build_script_control_export_dataframe(
        examination_id=examination_id,
        subject_id=subject_id,
        mode=mode,
        max_series=max_series,
        packings=packings,
        registered_by_key=registered,
    )
    body = script_control_export_excel_bytes(df)

    exam_type = sanitize_export_filename_part(str(exam.exam_type))
    sub_code = sanitize_export_filename_part(sub.code)
    safe = f"worked_scripts_{exam.year}_{exam_type}_{sub_code}_P{paper_number}_{mode}"
    filename = f"{sanitize_export_filename_part(safe)}.xlsx"

    return StreamingResponse(
        iter([body]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/script-control/records", response_model=ScriptControlAdminListResponse)
async def list_script_control_records(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int | None = Query(default=None),
    school_id: UUID | None = Query(default=None),
    subject_id: int | None = Query(default=None),
    paper_number: int | None = Query(default=None),
    region: Region | None = Query(default=None),
    zone: Zone | None = Query(default=None),
    school_q: str | None = Query(default=None, description="Case-insensitive search on school code or name."),
    subject_q: str | None = Query(default=None, description="Case-insensitive search on subject code or name."),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> ScriptControlAdminListResponse:
    subject_series_counts: list[ScriptControlSubjectSeriesCountRow] = []
    if examination_id is not None:
        subjects_ordered = await ordered_subjects_on_examination_timetable(session, examination_id)
        cmap = await subject_series_count_map(session, examination_id)
        subject_series_counts = [
            ScriptControlSubjectSeriesCountRow(
                subject_id=s.id,
                subject_code=s.code,
                subject_name=s.name,
                series_count=cmap.get(s.id, 1),
            )
            for s in subjects_ordered
        ]

    filters = _script_control_admin_filters(
        examination_id=examination_id,
        school_id=school_id,
        subject_id=subject_id,
        paper_number=paper_number,
        region=region,
        zone=zone,
        school_q=school_q,
        subject_q=subject_q,
    )

    count_stmt = (
        select(func.count(ScriptPackingSeries.id))
        .select_from(ScriptPackingSeries)
        .join(School, School.id == ScriptPackingSeries.school_id)
        .join(Subject, Subject.id == ScriptPackingSeries.subject_id)
    )
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = int((await session.execute(count_stmt)).scalar_one())

    stmt = (
        select(ScriptPackingSeries)
        .join(School, School.id == ScriptPackingSeries.school_id)
        .join(Subject, Subject.id == ScriptPackingSeries.subject_id)
        .options(
            contains_eager(ScriptPackingSeries.school),
            contains_eager(ScriptPackingSeries.subject),
            selectinload(ScriptPackingSeries.envelopes),
        )
        .order_by(
            ScriptPackingSeries.examination_id.desc(),
            ScriptPackingSeries.school_id,
            ScriptPackingSeries.subject_id,
            ScriptPackingSeries.paper_number,
            ScriptPackingSeries.series_number,
        )
    )
    if filters:
        stmt = stmt.where(*filters)
    stmt = stmt.offset(skip).limit(limit)

    pack_result = await session.execute(stmt)
    packings = list(pack_result.scalars().unique().all())
    if not packings:
        return ScriptControlAdminListResponse(
            items=[],
            total=total,
            subject_series_counts=subject_series_counts,
            registered_candidates_by_school_subject={},
        )

    registered_candidates_by_school_subject = await _registered_candidates_by_exam_school_subject(session, packings)

    items: list[ScriptControlAdminRow] = []
    for ps in packings:
        sch = ps.school
        sub = ps.subject
        envs = sorted(ps.envelopes, key=lambda x: x.envelope_number)
        envelope_items = [
            ScriptEnvelopeItem(
                envelope_number=e.envelope_number,
                booklet_count=e.booklet_count,
                verified=e.verified_at is not None,
            )
            for e in envs
        ]
        items.append(
            ScriptControlAdminRow(
                packing_series_id=ps.id,
                examination_id=ps.examination_id,
                school_id=ps.school_id,
                school_code=sch.code if sch else "",
                school_name=sch.name if sch else "",
                region=sch.region.value if sch and sch.region is not None else "",
                zone=sch.zone.value if sch and sch.zone is not None else "",
                subject_id=ps.subject_id,
                subject_code=sub.code if sub else "",
                subject_name=sub.name if sub else "",
                paper_number=ps.paper_number,
                series_number=ps.series_number,
                envelope_count=len(envs),
                total_booklets=sum(e.booklet_count for e in envs),
                envelopes=envelope_items,
            )
        )

    return ScriptControlAdminListResponse(
        items=items,
        total=total,
        subject_series_counts=subject_series_counts,
        registered_candidates_by_school_subject=registered_candidates_by_school_subject,
    )
