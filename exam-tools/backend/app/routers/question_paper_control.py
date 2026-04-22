"""Question paper stock counts per examination centre (host school); inspector CRUD; super admin list."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.dependencies.auth import DepotKeeperDep, InspectorDep, SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import QuestionPaperControl, School, Subject
from app.schemas.question_paper_control import (
    MyCenterQuestionPaperControlResponse,
    QuestionPaperControlAdminListResponse,
    QuestionPaperControlAdminRow,
    QuestionPaperPaperSlotResponse,
    QuestionPaperSeriesSlotResponse,
    QuestionPaperSlotKeyRequest,
    QuestionPaperSlotUpsertRequest,
    QuestionPaperSlotUpsertResponse,
    QuestionPaperSubjectRowResponse,
)
from app.services.depot_scope import (
    assert_center_in_depot,
    depot_center_host_ids,
    require_depot_id_for_depot_keeper,
)
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.question_paper_control import (
    load_subject_paper_rows_for_exam_and_center,
    valid_question_paper_triples,
)
from app.services.script_control import (
    assert_script_packing_calendar_allowed,
    inspector_center_scope_school_ids,
    paper_examination_date_for_triple,
    school_from_inspector_user,
    script_packing_today_in_configured_zone,
    subject_series_count_map,
)
from app.services.timetable_service import center_scope_school_ids, resolve_center_host_school

router = APIRouter(tags=["question-paper-control"])


async def _inspector_center_host_and_scope(
    session: DBSessionDep,
    user: InspectorDep,
) -> tuple[School, set[UUID]]:
    try:
        scope_ids = await inspector_center_scope_school_ids(session, user)
        user_school = await school_from_inspector_user(session, user)
        center_host = await resolve_center_host_school(session, user_school)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inspector access only") from None
    except ValueError as e:
        detail = str(e)
        if "examination centre scope" in detail or "Centre host school is missing" in detail:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from None
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail) from None
    return center_host, scope_ids


async def _build_center_question_paper_grid(
    session: DBSessionDep,
    exam_id: int,
    center_host: School,
    scope_ids: set[UUID],
) -> MyCenterQuestionPaperControlResponse:
    exam = await load_examination_or_raise(session, exam_id)
    rows = await load_subject_paper_rows_for_exam_and_center(session, exam_id, scope_ids)
    q_stmt = select(QuestionPaperControl).where(
        QuestionPaperControl.examination_id == exam_id,
        QuestionPaperControl.center_id == center_host.id,
    )
    q_result = await session.execute(q_stmt)
    stored = list(q_result.scalars().all())
    key_map: dict[tuple[int, int, int], QuestionPaperControl] = {}
    for r in stored:
        key_map[(r.subject_id, r.paper_number, r.series_number)] = r

    counts_map = await subject_series_count_map(session, exam_id)

    subjects_out: list[QuestionPaperSubjectRowResponse] = []
    for sub, paper_dates in rows:
        paper_slots: list[QuestionPaperPaperSlotResponse] = []
        n_series = counts_map.get(sub.id, 1)
        for pn in sorted(paper_dates.keys()):
            series_slots: list[QuestionPaperSeriesSlotResponse] = []
            for sn in range(1, n_series + 1):
                rec = key_map.get((sub.id, pn, sn))
                verified = rec.verified_at is not None if rec else False
                series_slots.append(
                    QuestionPaperSeriesSlotResponse(
                        series_number=sn,
                        copies_received=int(rec.copies_received) if rec else 0,
                        copies_used=int(rec.copies_used) if rec else 0,
                        copies_to_library=int(rec.copies_to_library) if rec else 0,
                        copies_remaining=int(rec.copies_remaining) if rec else 0,
                        verified=verified,
                    )
                )
            paper_slots.append(
                QuestionPaperPaperSlotResponse(
                    paper_number=pn,
                    examination_date=paper_dates[pn],
                    series=series_slots,
                )
            )
        subjects_out.append(
            QuestionPaperSubjectRowResponse(
                subject_id=sub.id,
                subject_code=sub.code,
                subject_original_code=sub.original_code,
                subject_name=sub.name,
                papers=paper_slots,
            )
        )

    return MyCenterQuestionPaperControlResponse(
        examination_id=exam.id,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        year=exam.year,
        center_id=center_host.id,
        center_code=center_host.code,
        center_name=center_host.name,
        subjects=subjects_out,
    )


@router.get(
    "/examinations/{exam_id}/question-paper-control/my-center",
    response_model=MyCenterQuestionPaperControlResponse,
)
async def get_my_center_question_paper_control(
    exam_id: int,
    session: DBSessionDep,
    user: InspectorDep,
) -> MyCenterQuestionPaperControlResponse:
    center_host, scope_ids = await _inspector_center_host_and_scope(session, user)

    try:
        return await _build_center_question_paper_grid(session, exam_id, center_host, scope_ids)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None


@router.get(
    "/examinations/{exam_id}/question-paper-control/depot/center",
    response_model=MyCenterQuestionPaperControlResponse,
)
async def get_depot_center_question_paper_control(
    exam_id: int,
    session: DBSessionDep,
    user: DepotKeeperDep,
    center_id: UUID = Query(..., description="Examination centre host school id in your depot."),
) -> MyCenterQuestionPaperControlResponse:
    try:
        depot_id = await require_depot_id_for_depot_keeper(session, user)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Depot keeper access only") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    allowed_centers = await depot_center_host_ids(session, depot_id)
    try:
        await assert_center_in_depot(center_id, allowed_centers)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    center_host = await session.get(School, center_id)
    if center_host is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Centre school not found")

    scope_ids = await center_scope_school_ids(session, center_host)
    try:
        return await _build_center_question_paper_grid(session, exam_id, center_host, scope_ids)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None


@router.post(
    "/examinations/{exam_id}/question-paper-control/depot/center/slot/verify",
    response_model=QuestionPaperSlotUpsertResponse,
)
async def verify_depot_center_question_paper_slot(
    exam_id: int,
    body: QuestionPaperSlotKeyRequest,
    session: DBSessionDep,
    user: DepotKeeperDep,
    center_id: UUID = Query(..., description="Examination centre host school id in your depot."),
) -> QuestionPaperSlotUpsertResponse:
    try:
        depot_id = await require_depot_id_for_depot_keeper(session, user)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Depot keeper access only") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    allowed_centers = await depot_center_host_ids(session, depot_id)
    try:
        await assert_center_in_depot(center_id, allowed_centers)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    center_host = await session.get(School, center_id)
    if center_host is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Centre school not found")

    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    scope_ids = await center_scope_school_ids(session, center_host)
    allowed = await valid_question_paper_triples(session, exam_id, scope_ids)
    if (body.subject_id, body.paper_number, body.series_number) not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject, paper, or series is not allowed for question paper control for this centre",
        )

    stmt = select(QuestionPaperControl).where(
        QuestionPaperControl.examination_id == exam_id,
        QuestionPaperControl.center_id == center_host.id,
        QuestionPaperControl.subject_id == body.subject_id,
        QuestionPaperControl.paper_number == body.paper_number,
        QuestionPaperControl.series_number == body.series_number,
    )
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No question paper control record to confirm; the inspector must enter data first.",
        )
    if row.verified_at is None:
        row.verified_at = datetime.utcnow()
        row.verified_by_id = user.id
        await session.commit()
        await session.refresh(row)

    return QuestionPaperSlotUpsertResponse(
        id=row.id,
        subject_id=row.subject_id,
        paper_number=row.paper_number,
        series_number=row.series_number,
        copies_received=row.copies_received,
        copies_used=row.copies_used,
        copies_to_library=row.copies_to_library,
        copies_remaining=row.copies_remaining,
        verified=True,
    )


@router.put(
    "/examinations/{exam_id}/question-paper-control/my-center/slot",
    response_model=QuestionPaperSlotUpsertResponse,
)
async def upsert_my_center_question_paper_slot(
    exam_id: int,
    body: QuestionPaperSlotUpsertRequest,
    session: DBSessionDep,
    user: InspectorDep,
) -> QuestionPaperSlotUpsertResponse:
    center_host, scope_ids = await _inspector_center_host_and_scope(session, user)

    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    allowed = await valid_question_paper_triples(session, exam_id, scope_ids)
    if (body.subject_id, body.paper_number, body.series_number) not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject, paper, or series is not allowed for question paper control (check timetable, registrations, and admin series configuration)",
        )

    exam_date = await paper_examination_date_for_triple(session, exam_id, body.subject_id, body.paper_number)
    try:
        assert_script_packing_calendar_allowed(exam_date, script_packing_today_in_configured_zone())
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    stmt = select(QuestionPaperControl).where(
        QuestionPaperControl.examination_id == exam_id,
        QuestionPaperControl.center_id == center_host.id,
        QuestionPaperControl.subject_id == body.subject_id,
        QuestionPaperControl.paper_number == body.paper_number,
        QuestionPaperControl.series_number == body.series_number,
    )
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()

    if row is not None and row.verified_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This entry has been confirmed by the depot keeper and can no longer be edited.",
        )

    if row is None:
        row = QuestionPaperControl(
            examination_id=exam_id,
            center_id=center_host.id,
            subject_id=body.subject_id,
            paper_number=body.paper_number,
            series_number=body.series_number,
            updated_by_id=user.id,
        )
        session.add(row)
        await session.flush()
    else:
        row.updated_by_id = user.id

    row.copies_received = body.copies_received
    row.copies_used = body.copies_used
    row.copies_to_library = body.copies_to_library
    row.copies_remaining = body.copies_remaining

    await session.commit()
    await session.refresh(row)

    return QuestionPaperSlotUpsertResponse(
        id=row.id,
        subject_id=row.subject_id,
        paper_number=row.paper_number,
        series_number=row.series_number,
        copies_received=row.copies_received,
        copies_used=row.copies_used,
        copies_to_library=row.copies_to_library,
        copies_remaining=row.copies_remaining,
        verified=row.verified_at is not None,
    )


@router.get(
    "/question-paper-control/records",
    response_model=QuestionPaperControlAdminListResponse,
)
async def list_question_paper_control_records(
    session: DBSessionDep,
    _: SuperAdminDep,
    examination_id: int | None = Query(default=None),
    center_id: UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> QuestionPaperControlAdminListResponse:
    stmt = select(QuestionPaperControl).order_by(
        QuestionPaperControl.examination_id.desc(),
        QuestionPaperControl.center_id,
        QuestionPaperControl.subject_id,
        QuestionPaperControl.paper_number,
        QuestionPaperControl.series_number,
    )
    if examination_id is not None:
        stmt = stmt.where(QuestionPaperControl.examination_id == examination_id)
    if center_id is not None:
        stmt = stmt.where(QuestionPaperControl.center_id == center_id)

    count_stmt = select(func.count()).select_from(QuestionPaperControl)
    if examination_id is not None:
        count_stmt = count_stmt.where(QuestionPaperControl.examination_id == examination_id)
    if center_id is not None:
        count_stmt = count_stmt.where(QuestionPaperControl.center_id == center_id)
    total = int((await session.execute(count_stmt)).scalar_one())

    stmt = stmt.offset(skip).limit(limit)
    q_result = await session.execute(stmt)
    rows = list(q_result.scalars().all())
    if not rows:
        return QuestionPaperControlAdminListResponse(items=[], total=total)

    center_ids = {r.center_id for r in rows}
    subject_ids = {r.subject_id for r in rows}
    sch_stmt = select(School).where(School.id.in_(center_ids))
    sub_stmt = select(Subject).where(Subject.id.in_(subject_ids))
    schools = {s.id: s for s in (await session.execute(sch_stmt)).scalars().all()}
    subjects = {s.id: s for s in (await session.execute(sub_stmt)).scalars().all()}

    items: list[QuestionPaperControlAdminRow] = []
    for r in rows:
        sch = schools.get(r.center_id)
        sub = subjects.get(r.subject_id)
        items.append(
            QuestionPaperControlAdminRow(
                question_paper_control_id=r.id,
                examination_id=r.examination_id,
                center_id=r.center_id,
                center_code=sch.code if sch else "",
                subject_id=r.subject_id,
                subject_code=sub.code if sub else "",
                subject_name=sub.name if sub else "",
                paper_number=r.paper_number,
                series_number=r.series_number,
                copies_received=r.copies_received,
                copies_used=r.copies_used,
                copies_to_library=r.copies_to_library,
                copies_remaining=r.copies_remaining,
            )
        )

    return QuestionPaperControlAdminListResponse(items=items, total=total)
