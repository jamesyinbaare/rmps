"""Script packing (answer booklets in envelopes): inspector CRUD for own school; super admin list."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import InspectorDep, SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import School, ScriptEnvelope, ScriptPackingSeries, Subject
from app.schemas.script_control import (
    MySchoolScriptControlResponse,
    ScriptControlAdminListResponse,
    ScriptControlAdminRow,
    ScriptEnvelopeItem,
    ScriptPaperSlotResponse,
    ScriptSeriesPackingResponse,
    ScriptSeriesSlotResponse,
    ScriptSeriesUpsertRequest,
    ScriptSubjectRowResponse,
)
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.script_control import (
    load_subject_paper_rows_for_school_exam,
    school_from_inspector_user,
    valid_subject_paper_set,
)

router = APIRouter(tags=["script-control"])


def _packing_to_response(ps: ScriptPackingSeries) -> ScriptSeriesPackingResponse:
    envs = [
        ScriptEnvelopeItem(envelope_number=e.envelope_number, booklet_count=e.booklet_count)
        for e in sorted(ps.envelopes, key=lambda x: x.envelope_number)
    ]
    return ScriptSeriesPackingResponse(
        id=ps.id,
        scripts_per_envelope=ps.scripts_per_envelope,
        candidate_count=ps.candidate_count,
        envelopes=envs,
    )


@router.get(
    "/examinations/{exam_id}/script-control/my-school",
    response_model=MySchoolScriptControlResponse,
)
async def get_my_school_script_control(
    exam_id: int,
    session: DBSessionDep,
    user: InspectorDep,
) -> MySchoolScriptControlResponse:
    try:
        school = await school_from_inspector_user(session, user)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inspector access only") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from None

    try:
        exam = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    rows = await load_subject_paper_rows_for_school_exam(session, exam_id, school.id)
    pack_stmt = (
        select(ScriptPackingSeries)
        .where(
            ScriptPackingSeries.examination_id == exam_id,
            ScriptPackingSeries.school_id == school.id,
        )
        .options(selectinload(ScriptPackingSeries.envelopes))
    )
    pack_result = await session.execute(pack_stmt)
    packings = list(pack_result.scalars().unique().all())
    key_map: dict[tuple[int, int, int], ScriptPackingSeries] = {}
    for ps in packings:
        key_map[(ps.subject_id, ps.paper_number, ps.series_number)] = ps

    subjects_out: list[ScriptSubjectRowResponse] = []
    for sub, papers in rows:
        paper_slots: list[ScriptPaperSlotResponse] = []
        for pn in papers:
            series_slots: list[ScriptSeriesSlotResponse] = []
            for sn in range(1, 7):
                ps = key_map.get((sub.id, pn, sn))
                packing = _packing_to_response(ps) if ps else None
                series_slots.append(ScriptSeriesSlotResponse(series_number=sn, packing=packing))
            paper_slots.append(ScriptPaperSlotResponse(paper_number=pn, series=series_slots))
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
        school_id=school.id,
        school_code=school.code,
        subjects=subjects_out,
    )


@router.put(
    "/examinations/{exam_id}/script-control/my-school/series",
    response_model=ScriptSeriesPackingResponse,
)
async def upsert_my_school_script_series(
    exam_id: int,
    body: ScriptSeriesUpsertRequest,
    session: DBSessionDep,
    user: InspectorDep,
) -> ScriptSeriesPackingResponse:
    try:
        school = await school_from_inspector_user(session, user)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inspector access only") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from None

    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    allowed = await valid_subject_paper_set(session, exam_id, school.id)
    if (body.subject_id, body.paper_number) not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject or paper is not on this examination for your school",
        )

    for env in body.envelopes:
        if env.booklet_count > body.scripts_per_envelope:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Envelope {env.envelope_number}: booklet_count cannot exceed scripts_per_envelope",
            )

    stmt = (
        select(ScriptPackingSeries)
        .where(
            ScriptPackingSeries.examination_id == exam_id,
            ScriptPackingSeries.school_id == school.id,
            ScriptPackingSeries.subject_id == body.subject_id,
            ScriptPackingSeries.paper_number == body.paper_number,
            ScriptPackingSeries.series_number == body.series_number,
        )
        .options(selectinload(ScriptPackingSeries.envelopes))
    )
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()

    if row is None:
        row = ScriptPackingSeries(
            examination_id=exam_id,
            school_id=school.id,
            subject_id=body.subject_id,
            paper_number=body.paper_number,
            series_number=body.series_number,
            scripts_per_envelope=body.scripts_per_envelope,
            candidate_count=body.candidate_count,
            updated_by_id=user.id,
        )
        session.add(row)
        await session.flush()
    else:
        row.scripts_per_envelope = body.scripts_per_envelope
        row.candidate_count = body.candidate_count
        row.updated_by_id = user.id
        for env in list(row.envelopes):
            await session.delete(env)
        await session.flush()

    for item in body.envelopes:
        session.add(
            ScriptEnvelope(
                packing_series_id=row.id,
                envelope_number=item.envelope_number,
                booklet_count=item.booklet_count,
            )
        )
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
    subject_id: int = Query(...),
    paper_number: int = Query(..., ge=1),
    series_number: int = Query(..., ge=1, le=6),
) -> None:
    try:
        school = await school_from_inspector_user(session, user)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inspector access only") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from None

    stmt = select(ScriptPackingSeries).where(
        ScriptPackingSeries.examination_id == exam_id,
        ScriptPackingSeries.school_id == school.id,
        ScriptPackingSeries.subject_id == subject_id,
        ScriptPackingSeries.paper_number == paper_number,
        ScriptPackingSeries.series_number == series_number,
    )
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Packing record not found")
    await session.delete(row)
    await session.commit()


@router.get("/script-control/records", response_model=ScriptControlAdminListResponse)
async def list_script_control_records(
    session: DBSessionDep,
    _: SuperAdminDep,
    examination_id: int | None = Query(default=None),
    school_id: UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> ScriptControlAdminListResponse:
    stmt = (
        select(ScriptPackingSeries)
        .options(selectinload(ScriptPackingSeries.envelopes))
        .order_by(
            ScriptPackingSeries.examination_id.desc(),
            ScriptPackingSeries.school_id,
            ScriptPackingSeries.subject_id,
            ScriptPackingSeries.paper_number,
            ScriptPackingSeries.series_number,
        )
    )
    if examination_id is not None:
        stmt = stmt.where(ScriptPackingSeries.examination_id == examination_id)
    if school_id is not None:
        stmt = stmt.where(ScriptPackingSeries.school_id == school_id)

    count_stmt = select(func.count()).select_from(ScriptPackingSeries)
    if examination_id is not None:
        count_stmt = count_stmt.where(ScriptPackingSeries.examination_id == examination_id)
    if school_id is not None:
        count_stmt = count_stmt.where(ScriptPackingSeries.school_id == school_id)
    total = int((await session.execute(count_stmt)).scalar_one())

    stmt = stmt.offset(skip).limit(limit)
    pack_result = await session.execute(stmt)
    packings = list(pack_result.scalars().unique().all())
    if not packings:
        return ScriptControlAdminListResponse(items=[], total=total)

    school_ids = {p.school_id for p in packings}
    subject_ids = {p.subject_id for p in packings}
    sch_stmt = select(School).where(School.id.in_(school_ids))
    sub_stmt = select(Subject).where(Subject.id.in_(subject_ids))
    schools = {s.id: s for s in (await session.execute(sch_stmt)).scalars().all()}
    subjects = {s.id: s for s in (await session.execute(sub_stmt)).scalars().all()}

    items: list[ScriptControlAdminRow] = []
    for ps in packings:
        sch = schools.get(ps.school_id)
        sub = subjects.get(ps.subject_id)
        envs = ps.envelopes
        items.append(
            ScriptControlAdminRow(
                packing_series_id=ps.id,
                examination_id=ps.examination_id,
                school_id=ps.school_id,
                school_code=sch.code if sch else "",
                subject_id=ps.subject_id,
                subject_code=sub.code if sub else "",
                subject_name=sub.name if sub else "",
                paper_number=ps.paper_number,
                series_number=ps.series_number,
                scripts_per_envelope=ps.scripts_per_envelope,
                candidate_count=ps.candidate_count,
                envelope_count=len(envs),
                total_booklets=sum(e.booklet_count for e in envs),
            )
        )

    return ScriptControlAdminListResponse(items=items, total=total)
