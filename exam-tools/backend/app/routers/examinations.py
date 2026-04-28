"""Examination and schedule CRUD; timetable download (admin + school-scoped)."""

import logging
import math
from collections import defaultdict
from datetime import date, datetime, time
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import asc, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies.auth import (
    DepotKeeperDep,
    SuperAdminDep,
    SuperAdminOrTestAdminOfficerDep,
    SupervisorInspectorOrDepotKeeperDep,
    SupervisorOrInspectorDep,
)
from app.dependencies.database import DBSessionDep
from app.models import (
    Depot,
    Examination,
    ExaminationCandidate,
    ExaminationSchedule,
    ExaminationSubjectScriptSeries,
    Programme,
    School,
    ScriptPackingSeries,
    Subject,
    User,
    UserRole,
    programme_subjects,
    school_programmes,
)
from app.schemas.examination import (
    CenterScopeSchoolItem,
    ExaminationCreate,
    ExaminationResponse,
    ExaminationScheduleBulkUploadError,
    ExaminationScheduleBulkUploadResponse,
    ExaminationScheduleCreate,
    ExaminationScheduleResponse,
    ExaminationScheduleUpdate,
    ExaminationScriptSeriesConfigPut,
    ExaminationScriptSeriesConfigResponse,
    ExaminationScriptSeriesConfigRow,
    ExaminationUpdate,
    CentreScopeProgrammeItem,
    MyCenterProgrammesResponse,
    MyCenterSchoolsResponse,
    MyDepotSchoolsResponse,
    StaffCentreDaySummaryResponse,
    StaffCentreDaySummarySlotRow,
    StaffCentreOverviewResponse,
    StaffCentreSchoolCandidateItem,
    StaffCentreOverviewUpcomingItem,
    StaffDepotOverviewResponse,
    TimetableEntry,
    TimetablePreviewResponse,
)
from app.schemas.timetable import TimetableDownloadFilter
from app.services.exam_timetable_pdf import (
    build_full_exam_timetable_pdf,
    build_school_timetable_pdf,
    filter_schedule_codes_by_subject_type,
    get_programme_subject_schedule_codes,
    get_school_subject_schedule_codes,
    load_examination_or_raise,
    load_schedules_for_exam,
    schedules_to_entries,
)
from app.services.schedule_upload import (
    ScheduleUploadParseError,
    ScheduleUploadValidationError,
    parse_schedule_row,
)
from app.services.schedule_upload import (
    parse_upload_file as parse_schedule_upload_file,
)
from app.services.schedule_upload import (
    validate_required_columns as validate_schedule_columns,
)
from app.services.script_control import (
    ordered_subjects_on_examination_timetable,
    subject_series_count_map,
)
from app.services.template_generator import generate_schedule_template
from app.services.depot_scope import depot_school_ids, require_depot_id_for_depot_keeper
from app.services.timetable_service import (
    center_scope_school_ids,
    get_candidate_schedule_codes_for_exam,
    resolve_center_host_school,
    schools_in_center_scope_ordered,
)

router = APIRouter(prefix="/examinations", tags=["examinations"])


def _sanitize_filename_part(s: str) -> str:
    return "".join(c for c in s if c.isalnum() or c in ("_", "-"))


async def _depot_keeper_depot_id(session: DBSessionDep, user: User) -> UUID:
    try:
        return await require_depot_id_for_depot_keeper(session, user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from None


async def _depot_ordered_schools(session: DBSessionDep, depot_id: UUID) -> list[School]:
    stmt = select(School).where(School.depot_id == depot_id).order_by(asc(School.code))
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def _depot_scope_and_display_school(
    session: DBSessionDep,
    user: User,
    filter_school_id: UUID | None,
) -> tuple[set[UUID], School]:
    depot_id = await _depot_keeper_depot_id(session, user)
    ordered = await _depot_ordered_schools(session, depot_id)
    if not ordered:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No schools in your depot",
        )
    scope_ids = {s.id for s in ordered}
    if filter_school_id is not None:
        if filter_school_id not in scope_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="School is not in your depot",
            )
        sch = await session.get(School, filter_school_id)
        if sch is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")
        return scope_ids, sch
    return scope_ids, ordered[0]


async def _get_exam_or_404(session: DBSessionDep, exam_id: int) -> Examination:
    stmt = select(Examination).where(Examination.id == exam_id)
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return exam


@router.post("", response_model=ExaminationResponse, status_code=status.HTTP_201_CREATED)
async def create_examination(
    body: ExaminationCreate,
    session: DBSessionDep,
    _: SuperAdminDep,
) -> ExaminationResponse:
    exam = Examination(
        exam_type=body.exam_type.strip(),
        exam_series=body.exam_series.strip() if body.exam_series else None,
        year=body.year,
        description=body.description,
    )
    session.add(exam)
    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not create examination") from e
    await session.refresh(exam)
    return ExaminationResponse.model_validate(exam)


@router.get("", response_model=list[ExaminationResponse])
async def list_examinations(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> list[ExaminationResponse]:
    stmt = select(Examination).order_by(Examination.year.desc(), Examination.id.desc())
    result = await session.execute(stmt)
    return [ExaminationResponse.model_validate(e) for e in result.scalars().all()]


@router.get("/public-list", response_model=list[ExaminationResponse])
async def list_examinations_for_staff(
    session: DBSessionDep,
    user: SupervisorInspectorOrDepotKeeperDep,
) -> list[ExaminationResponse]:
    _ = user
    stmt = select(Examination).order_by(Examination.year.desc(), Examination.id.desc())
    result = await session.execute(stmt)
    return [ExaminationResponse.model_validate(e) for e in result.scalars().all()]


@router.get("/timetable/my-center-schools", response_model=MyCenterSchoolsResponse)
async def list_my_center_schools_for_timetable(
    session: DBSessionDep,
    user: SupervisorOrInspectorDep,
) -> MyCenterSchoolsResponse:
    """Host centre plus schools that write there; for supervisor/inspector timetable school filter."""
    user_school = await _school_from_user(session, user)
    try:
        center_host = await resolve_center_host_school(session, user_school)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None
    ordered = await schools_in_center_scope_ordered(session, center_host)
    return MyCenterSchoolsResponse(
        center_school_id=center_host.id,
        schools=[CenterScopeSchoolItem(id=s.id, code=s.code, name=s.name) for s in ordered],
    )


@router.get("/timetable/my-center-programmes", response_model=MyCenterProgrammesResponse)
async def list_my_center_programmes_for_timetable(
    session: DBSessionDep,
    user: SupervisorOrInspectorDep,
    school_id: UUID | None = Query(
        default=None,
        description="If set, only programmes linked to this school (must be in your centre scope).",
    ),
) -> MyCenterProgrammesResponse:
    """Programmes offered at the centre (or one school), with subject counts for timetable filtering."""
    user_school = await _school_from_user(session, user)
    try:
        center_host = await resolve_center_host_school(session, user_school)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None
    scope_ids = await center_scope_school_ids(session, center_host)
    if school_id is not None:
        if school_id not in scope_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="School is not in your examination centre scope",
            )

    if school_id is not None:
        sp_cond = school_programmes.c.school_id == school_id
    else:
        sp_cond = school_programmes.c.school_id.in_(scope_ids)

    prog_ids_subq = select(school_programmes.c.programme_id).where(sp_cond).distinct().subquery()

    stmt = (
        select(
            Programme.id,
            Programme.code,
            Programme.name,
            func.count(programme_subjects.c.subject_id).label("subject_count"),
        )
        .select_from(Programme)
        .join(prog_ids_subq, prog_ids_subq.c.programme_id == Programme.id)
        .outerjoin(programme_subjects, programme_subjects.c.programme_id == Programme.id)
        .group_by(Programme.id, Programme.code, Programme.name)
        .order_by(Programme.code)
    )
    result = await session.execute(stmt)
    rows = result.all()
    return MyCenterProgrammesResponse(
        programmes=[
            CentreScopeProgrammeItem(
                id=r.id,
                code=r.code,
                name=r.name,
                subject_count=int(r.subject_count or 0),
            )
            for r in rows
        ],
    )


@router.get("/timetable/my-depot-schools", response_model=MyDepotSchoolsResponse)
async def list_my_depot_schools_for_timetable(
    session: DBSessionDep,
    user: DepotKeeperDep,
) -> MyDepotSchoolsResponse:
    depot_id = await _depot_keeper_depot_id(session, user)
    ordered = await _depot_ordered_schools(session, depot_id)
    return MyDepotSchoolsResponse(
        schools=[CenterScopeSchoolItem(id=s.id, code=s.code, name=s.name) for s in ordered],
    )


@router.get("/timetable/my-depot-programmes", response_model=MyCenterProgrammesResponse)
async def list_my_depot_programmes_for_timetable(
    session: DBSessionDep,
    user: DepotKeeperDep,
    school_id: UUID | None = Query(
        default=None,
        description="If set, only programmes linked to this school (must be in your depot).",
    ),
) -> MyCenterProgrammesResponse:
    depot_id = await _depot_keeper_depot_id(session, user)
    scope_ids = await depot_school_ids(session, depot_id)
    if school_id is not None:
        if school_id not in scope_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="School is not in your depot",
            )

    if school_id is not None:
        sp_cond = school_programmes.c.school_id == school_id
    else:
        sp_cond = school_programmes.c.school_id.in_(scope_ids)

    prog_ids_subq = select(school_programmes.c.programme_id).where(sp_cond).distinct().subquery()

    stmt = (
        select(
            Programme.id,
            Programme.code,
            Programme.name,
            func.count(programme_subjects.c.subject_id).label("subject_count"),
        )
        .select_from(Programme)
        .join(prog_ids_subq, prog_ids_subq.c.programme_id == Programme.id)
        .outerjoin(programme_subjects, programme_subjects.c.programme_id == Programme.id)
        .group_by(Programme.id, Programme.code, Programme.name)
        .order_by(Programme.code)
    )
    result = await session.execute(stmt)
    rows = result.all()
    return MyCenterProgrammesResponse(
        programmes=[
            CentreScopeProgrammeItem(
                id=r.id,
                code=r.code,
                name=r.name,
                subject_count=int(r.subject_count or 0),
            )
            for r in rows
        ],
    )


@router.get("/{exam_id}", response_model=ExaminationResponse)
async def get_examination(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminDep,
) -> ExaminationResponse:
    exam = await _get_exam_or_404(session, exam_id)
    return ExaminationResponse.model_validate(exam)


@router.put("/{exam_id}", response_model=ExaminationResponse)
async def update_examination(
    exam_id: int,
    body: ExaminationUpdate,
    session: DBSessionDep,
    _: SuperAdminDep,
) -> ExaminationResponse:
    exam = await _get_exam_or_404(session, exam_id)
    if body.exam_type is not None:
        exam.exam_type = body.exam_type.strip()
    if body.exam_series is not None:
        exam.exam_series = body.exam_series.strip() if body.exam_series else None
    if body.year is not None:
        exam.year = body.year
    if body.description is not None:
        exam.description = body.description
    await session.commit()
    await session.refresh(exam)
    return ExaminationResponse.model_validate(exam)


@router.get(
    "/{exam_id}/script-series-config",
    response_model=ExaminationScriptSeriesConfigResponse,
)
async def get_examination_script_series_config(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminationScriptSeriesConfigResponse:
    await _get_exam_or_404(session, exam_id)
    subjects = await ordered_subjects_on_examination_timetable(session, exam_id)
    cmap = await subject_series_count_map(session, exam_id)
    items = [
        ExaminationScriptSeriesConfigRow(
            subject_id=s.id,
            subject_code=s.code,
            subject_name=s.name,
            series_count=cmap.get(s.id, 1),
        )
        for s in subjects
    ]
    return ExaminationScriptSeriesConfigResponse(items=items)


@router.put(
    "/{exam_id}/script-series-config",
    response_model=ExaminationScriptSeriesConfigResponse,
)
async def put_examination_script_series_config(
    exam_id: int,
    body: ExaminationScriptSeriesConfigPut,
    session: DBSessionDep,
    _: SuperAdminDep,
) -> ExaminationScriptSeriesConfigResponse:
    await _get_exam_or_404(session, exam_id)
    scheduled = await ordered_subjects_on_examination_timetable(session, exam_id)
    scheduled_ids = {s.id for s in scheduled}
    got_ids = {i.subject_id for i in body.items}
    if scheduled_ids != got_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide exactly one entry per subject on this examination timetable (same subjects, no extras).",
        )
    for item in body.items:
        stmt = select(func.max(ScriptPackingSeries.series_number)).where(
            ScriptPackingSeries.examination_id == exam_id,
            ScriptPackingSeries.subject_id == item.subject_id,
        )
        max_used = (await session.execute(stmt)).scalar_one()
        if max_used is not None and item.series_count < int(max_used):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Subject '{item.subject_code}' has script packing up to series {int(max_used)}; "
                    f"cannot set series_count below {int(max_used)}."
                ),
            )
    await session.execute(
        delete(ExaminationSubjectScriptSeries).where(
            ExaminationSubjectScriptSeries.examination_id == exam_id
        )
    )
    for item in body.items:
        if item.series_count > 1:
            session.add(
                ExaminationSubjectScriptSeries(
                    examination_id=exam_id,
                    subject_id=item.subject_id,
                    series_count=item.series_count,
                )
            )
    await session.commit()
    cmap = await subject_series_count_map(session, exam_id)
    items = [
        ExaminationScriptSeriesConfigRow(
            subject_id=s.id,
            subject_code=s.code,
            subject_name=s.name,
            series_count=cmap.get(s.id, 1),
        )
        for s in scheduled
    ]
    return ExaminationScriptSeriesConfigResponse(items=items)


@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_examination(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminDep,
) -> None:
    exam = await _get_exam_or_404(session, exam_id)
    await session.delete(exam)
    await session.commit()


@router.get("/{exam_id}/schedules", response_model=list[ExaminationScheduleResponse])
async def list_schedules(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminDep,
) -> list[ExaminationScheduleResponse]:
    await _get_exam_or_404(session, exam_id)
    schedules = await load_schedules_for_exam(session, exam_id)
    return [ExaminationScheduleResponse.model_validate(s) for s in schedules]


@router.post(
    "/{exam_id}/schedules",
    response_model=ExaminationScheduleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_schedule(
    exam_id: int,
    body: ExaminationScheduleCreate,
    session: DBSessionDep,
    _: SuperAdminDep,
) -> ExaminationScheduleResponse:
    await _get_exam_or_404(session, exam_id)
    oc = body.original_code.strip()
    subject_stmt = select(Subject).where(or_(Subject.original_code == oc, Subject.code == oc))
    subject_result = await session.execute(subject_stmt)
    subject = subject_result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No subject with original_code or code '{oc}'",
        )
    subject_code_to_store = subject.original_code if subject.original_code else subject.code

    existing_stmt = select(ExaminationSchedule).where(
        ExaminationSchedule.examination_id == exam_id,
        ExaminationSchedule.subject_code == subject_code_to_store,
    )
    existing_result = await session.execute(existing_stmt)
    if existing_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Schedule for subject {subject_code_to_store} already exists for this examination",
        )

    sch = ExaminationSchedule(
        examination_id=exam_id,
        subject_code=subject_code_to_store,
        subject_name=subject.name,
        papers=body.papers,
        venue=body.venue,
        duration_minutes=body.duration_minutes,
        instructions=body.instructions,
    )
    session.add(sch)
    await session.commit()
    await session.refresh(sch)
    return ExaminationScheduleResponse.model_validate(sch)


@router.put("/{exam_id}/schedules/{schedule_id}", response_model=ExaminationScheduleResponse)
async def update_schedule(
    exam_id: int,
    schedule_id: int,
    body: ExaminationScheduleUpdate,
    session: DBSessionDep,
    _: SuperAdminDep,
) -> ExaminationScheduleResponse:
    await _get_exam_or_404(session, exam_id)
    schedule_stmt = select(ExaminationSchedule).where(
        ExaminationSchedule.id == schedule_id,
        ExaminationSchedule.examination_id == exam_id,
    )
    schedule_result = await session.execute(schedule_stmt)
    schedule = schedule_result.scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    if body.subject_code is not None and body.subject_code != schedule.subject_code:
        dup_stmt = select(ExaminationSchedule).where(
            ExaminationSchedule.examination_id == exam_id,
            ExaminationSchedule.subject_code == body.subject_code,
            ExaminationSchedule.id != schedule_id,
        )
        dup_result = await session.execute(dup_stmt)
        if dup_result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Schedule for subject {body.subject_code} already exists",
            )
        schedule.subject_code = body.subject_code
    if body.subject_name is not None:
        schedule.subject_name = body.subject_name
    if body.papers is not None:
        schedule.papers = body.papers
    if body.venue is not None:
        schedule.venue = body.venue
    if body.duration_minutes is not None:
        schedule.duration_minutes = body.duration_minutes
    if body.instructions is not None:
        schedule.instructions = body.instructions

    await session.commit()
    await session.refresh(schedule)
    return ExaminationScheduleResponse.model_validate(schedule)


@router.delete("/{exam_id}/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    exam_id: int,
    schedule_id: int,
    session: DBSessionDep,
    _: SuperAdminDep,
) -> None:
    await _get_exam_or_404(session, exam_id)
    schedule_stmt = select(ExaminationSchedule).where(
        ExaminationSchedule.id == schedule_id,
        ExaminationSchedule.examination_id == exam_id,
    )
    schedule_result = await session.execute(schedule_stmt)
    schedule = schedule_result.scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    await session.delete(schedule)
    await session.commit()


@router.get("/{exam_id}/schedules/template")
async def download_schedule_template(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminDep,
) -> StreamingResponse:
    """Download Excel timetable template (all subjects + Sample Data sheet), same layout as registration-portal."""
    exam = await _get_exam_or_404(session, exam_id)
    try:
        template_bytes = await generate_schedule_template(
            session,
            exam_year=exam.year,
            exam_series=exam.exam_series,
            exam_type=exam.exam_type,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {e!s}",
        ) from e

    base = f"{exam.year}_{exam.exam_series or 'exam'}_{exam.exam_type}_timetable_template"
    filename = _sanitize_filename_part(base) + ".xlsx"

    return StreamingResponse(
        iter([template_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/{exam_id}/schedules/bulk-upload",
    response_model=ExaminationScheduleBulkUploadResponse,
    status_code=status.HTTP_200_OK,
)
async def bulk_upload_schedules(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminDep,
    file: UploadFile = File(...),
    override_existing: bool = Query(
        default=False,
        description="If true, update existing schedules; if false, skip duplicates",
    ),
) -> ExaminationScheduleBulkUploadResponse:
    """Bulk-upload schedules from Excel or CSV (same columns as registration-portal)."""
    log = logging.getLogger(__name__)
    log.info("Bulk upload schedules examination_id=%s override_existing=%s", exam_id, override_existing)

    await _get_exam_or_404(session, exam_id)
    file_content = await file.read()

    try:
        df = parse_schedule_upload_file(file_content, file.filename or "unknown")
        validate_schedule_columns(df)
    except (ScheduleUploadParseError, ScheduleUploadValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[ExaminationScheduleBulkUploadError] = []

    for idx, row in df.iterrows():
        row_number = int(idx) + 2
        try:
            schedule_data = parse_schedule_row(row)

            if not schedule_data["original_code"]:
                errors.append(
                    ExaminationScheduleBulkUploadError(
                        row_number=row_number,
                        error_message="original_code is required",
                        field="original_code",
                    )
                )
                failed += 1
                continue

            if not schedule_data["subject_name"]:
                errors.append(
                    ExaminationScheduleBulkUploadError(
                        row_number=row_number,
                        error_message="subject_name is required",
                        field="subject_name",
                    )
                )
                failed += 1
                continue

            if not schedule_data.get("papers"):
                errors.append(
                    ExaminationScheduleBulkUploadError(
                        row_number=row_number,
                        error_message="At least one paper with date and start_time is required",
                        field="papers",
                    )
                )
                failed += 1
                continue

            oc = schedule_data["original_code"].strip()
            subject_stmt = select(Subject).where(or_(Subject.original_code == oc, Subject.code == oc))
            subject_result = await session.execute(subject_stmt)
            subject = subject_result.scalar_one_or_none()

            if not subject:
                errors.append(
                    ExaminationScheduleBulkUploadError(
                        row_number=row_number,
                        error_message=f"Subject not found for code '{oc}'",
                        field="original_code",
                    )
                )
                failed += 1
                continue

            subject_code_to_store = subject.original_code if subject.original_code else subject.code

            existing_stmt = select(ExaminationSchedule).where(
                ExaminationSchedule.examination_id == exam_id,
                ExaminationSchedule.subject_code == subject_code_to_store,
            )
            existing_result = await session.execute(existing_stmt)
            existing = existing_result.scalar_one_or_none()

            papers = schedule_data["papers"]

            if existing:
                if override_existing:
                    existing.papers = papers
                    existing.venue = schedule_data.get("venue")
                    existing.duration_minutes = schedule_data.get("duration_minutes")
                    existing.instructions = schedule_data.get("instructions")
                    existing.subject_name = subject.name
                    existing.updated_at = datetime.utcnow()
                    await session.flush()
                    successful += 1
                else:
                    errors.append(
                        ExaminationScheduleBulkUploadError(
                            row_number=row_number,
                            error_message=f"Schedule for subject {subject_code_to_store} already exists",
                            field="original_code",
                        )
                    )
                    failed += 1
                continue

            new_schedule = ExaminationSchedule(
                examination_id=exam_id,
                subject_code=subject_code_to_store,
                subject_name=subject.name,
                papers=papers,
                venue=schedule_data.get("venue"),
                duration_minutes=schedule_data.get("duration_minutes"),
                instructions=schedule_data.get("instructions"),
            )
            session.add(new_schedule)
            await session.flush()
            successful += 1

        except Exception as e:
            errors.append(
                ExaminationScheduleBulkUploadError(
                    row_number=row_number,
                    error_message=f"Error processing row: {e!s}",
                    field=None,
                )
            )
            failed += 1
            continue

    if successful > 0:
        await session.commit()
    else:
        await session.rollback()

    return ExaminationScheduleBulkUploadResponse(
        total_rows=total_rows,
        successful=successful,
        failed=failed,
        errors=errors,
    )


@router.get("/{exam_id}/timetable/pdf")
async def download_full_timetable_pdf(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL),
    merge_by_date: bool = Query(default=False, description="Merge subjects written on the same day"),
    orientation: str = Query(default="portrait", description="Page orientation: portrait or landscape"),
) -> Response:
    try:
        pdf, exam = await build_full_exam_timetable_pdf(
            session,
            exam_id,
            subject_filter=subject_filter,
            merge_by_date=merge_by_date,
            orientation=orientation,
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None
    base = _sanitize_filename_part(f"{exam.year}_{exam.exam_series or 'exam'}_{exam.exam_type}")
    filename = f"timetable_{base}_all.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{exam_id}/timetable/schools/{school_id}/pdf")
async def download_school_timetable_pdf(
    exam_id: int,
    school_id: UUID,
    session: DBSessionDep,
    _: SuperAdminDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL),
    programme_id: int | None = Query(default=None),
    merge_by_date: bool = Query(default=False, description="Merge subjects written on the same day"),
    orientation: str = Query(default="portrait", description="Page orientation: portrait or landscape"),
) -> Response:
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")
    if programme_id is not None:
        assoc_stmt = select(school_programmes).where(
            school_programmes.c.school_id == school_id,
            school_programmes.c.programme_id == programme_id,
        )
        assoc_result = await session.execute(assoc_stmt)
        if assoc_result.first() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Programme is not associated with the school",
            )
    try:
        pdf = await build_school_timetable_pdf(
            session,
            exam_id,
            school_id,
            programme_id=programme_id,
            subject_filter=subject_filter,
            merge_by_date=merge_by_date,
            orientation=orientation,
        )
    except ValueError as e:
        detail = str(e) if str(e) else "Not found"
        if "Programme not found" in detail or "School not found" in detail:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from None
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None
    exam = await load_examination_or_raise(session, exam_id)
    base = _sanitize_filename_part(f"{exam.year}_{exam.exam_series or 'exam'}_{school.code}")
    filename = f"timetable_{base}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{exam_id}/timetable/schools/{school_id}/preview", response_model=TimetablePreviewResponse)
async def preview_school_timetable(
    exam_id: int,
    school_id: UUID,
    session: DBSessionDep,
    _: SuperAdminDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL),
    programme_id: int | None = Query(default=None),
) -> TimetablePreviewResponse:
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")
    try:
        exam = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    schedule_codes = await get_school_subject_schedule_codes(session, school_id)
    if programme_id is not None:
        schedule_codes = schedule_codes & await get_programme_subject_schedule_codes(session, programme_id)
    schedule_codes = await filter_schedule_codes_by_subject_type(session, schedule_codes, subject_filter)
    all_schedules = await load_schedules_for_exam(session, exam_id)
    filtered = [s for s in all_schedules if s.subject_code in schedule_codes]
    entries = schedules_to_entries(filtered)
    return TimetablePreviewResponse(
        examination_id=exam.id,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        year=exam.year,
        school_id=school.id,
        school_code=school.code,
        entries=entries,
    )


async def _school_from_user(session: DBSessionDep, user: User) -> School:
    if user.role not in (UserRole.SUPERVISOR, UserRole.INSPECTOR):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="School-scoped access only")
    if not user.school_code or not user.school_code.strip():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is not linked to a school code",
        )
    code = user.school_code.strip()
    school_stmt = select(School).where(School.code == code)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if school is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="School not found for your account",
        )
    return school


async def _staff_scope_and_display_school(
    session: DBSessionDep,
    user_school: School,
    filter_school_id: UUID | None,
) -> tuple[set[UUID], School]:
    try:
        center_host = await resolve_center_host_school(session, user_school)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None
    scope_ids = await center_scope_school_ids(session, center_host)
    if filter_school_id is not None:
        if filter_school_id not in scope_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="School is not in your examination centre scope",
            )
        display = await session.get(School, filter_school_id)
        if display is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")
        return scope_ids, display
    return scope_ids, center_host


async def _validate_programme_in_scope(
    session: DBSessionDep,
    programme_id: int,
    scope_ids: set[UUID],
) -> None:
    programme = await session.get(Programme, programme_id)
    if programme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")
    assoc_stmt = select(school_programmes.c.school_id).where(
        school_programmes.c.programme_id == programme_id,
        school_programmes.c.school_id.in_(scope_ids),
    ).limit(1)
    assoc_result = await session.execute(assoc_stmt)
    if assoc_result.first() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Programme is not offered by any school in your examination centre",
        )


async def _staff_center_filtered_timetable_entries(
    session: DBSessionDep,
    exam_id: int,
    scope_ids: set[UUID],
) -> list[TimetableEntry]:
    """Timetable entries for the centre scope (candidate-linked subjects ∩ schedules), same filter as overview PDFs."""
    explicit_codes = await get_candidate_schedule_codes_for_exam(
        session,
        exam_id,
        scope_ids,
        programme_id=None,
        filter_school_id=None,
    )
    all_schedules = await load_schedules_for_exam(session, exam_id)
    schedule_codes = {s.subject_code for s in all_schedules}
    intersected = explicit_codes & schedule_codes
    filtered_codes = await filter_schedule_codes_by_subject_type(
        session,
        intersected,
        TimetableDownloadFilter.ALL,
    )
    filtered = [s for s in all_schedules if s.subject_code in filtered_codes]
    return schedules_to_entries(filtered)


async def _national_candidate_school_ids(session: DBSessionDep, exam_id: int) -> set[UUID]:
    stmt = (
        select(ExaminationCandidate.school_id)
        .where(
            ExaminationCandidate.examination_id == exam_id,
            ExaminationCandidate.school_id.isnot(None),
        )
        .distinct()
    )
    result = await session.execute(stmt)
    return {row[0] for row in result.all() if row[0] is not None}


async def _schools_with_ids_ordered_by_code(session: DBSessionDep, school_ids: set[UUID]) -> list[School]:
    if not school_ids:
        return []
    stmt = select(School).where(School.id.in_(school_ids)).order_by(asc(School.code))
    sch_result = await session.execute(stmt)
    return list(sch_result.scalars().all())


async def _build_staff_day_summary_for_scope(
    session: DBSessionDep,
    exam_id: int,
    examination_date: date,
    scope_ids: set[UUID],
    ordered_schools: list[School],
) -> StaffCentreDaySummaryResponse:
    """Shared day-summary builder for centre scope or national (all candidate schools)."""
    if not scope_ids:
        return StaffCentreDaySummaryResponse(
            examination_date=examination_date,
            schools=[],
            slots=[],
            unique_candidates=0,
            invigilators_required=0,
        )

    school_index = {s.id: i for i, s in enumerate(ordered_schools)}

    entries = await _staff_center_filtered_timetable_entries(session, exam_id, scope_ids)
    day_entries = [e for e in entries if e.examination_date == examination_date]
    day_entries.sort(key=lambda x: (x.examination_time, x.subject_code, x.paper))

    by_subject: dict[str, list[TimetableEntry]] = defaultdict(list)
    for ent in day_entries:
        by_subject[_subject_day_group_key(ent.subject_code)].append(ent)
    merged_groups: list[list[TimetableEntry]] = []
    for _key, group in by_subject.items():
        group.sort(key=lambda x: (x.examination_time, x.paper))
        merged_groups.append(group)
    merged_groups.sort(
        key=lambda g: (min(e.examination_time for e in g), g[0].subject_code),
    )

    cand_stmt = (
        select(ExaminationCandidate)
        .where(
            ExaminationCandidate.examination_id == exam_id,
            ExaminationCandidate.school_id.in_(scope_ids),
            ExaminationCandidate.school_id.isnot(None),
        )
        .options(selectinload(ExaminationCandidate.subject_selections))
    )
    cand_result = await session.execute(cand_stmt)
    candidates = list(cand_result.scalars().unique().all())

    slot_rows: list[StaffCentreDaySummarySlotRow] = []
    unique_ids: set[int] = set()
    n_sch = len(ordered_schools)

    for group in merged_groups:
        first = group[0]
        papers_sorted = sorted({e.paper for e in group})
        papers_label = " & ".join(str(p) for p in papers_sorted)
        times_sorted = sorted({e.examination_time for e in group})
        times_label = " · ".join(_format_time_hhmm(t) for t in times_sorted)

        counts_by_school = [0] * n_sch
        row_total = 0

        for cand in candidates:
            subj_rows = [
                (s.subject_code, s.series) for s in (cand.subject_selections or []) if s.subject_code
            ]
            if not _candidate_matches_any_entry_in_group(subj_rows, group):
                continue
            unique_ids.add(cand.id)
            row_total += 1
            if cand.school_id is not None:
                idx = school_index.get(cand.school_id)
                if idx is not None:
                    counts_by_school[idx] += 1

        slot_rows.append(
            StaffCentreDaySummarySlotRow(
                subject_code=first.subject_code,
                subject_name=first.subject_name,
                papers_label=papers_label,
                times_label=times_label,
                counts_by_school=counts_by_school,
                row_total=row_total,
            )
        )

    schools_for_response: list[CenterScopeSchoolItem] = []
    if n_sch and slot_rows:
        school_day_totals = [0] * n_sch
        for slot in slot_rows:
            for i, c in enumerate(slot.counts_by_school):
                school_day_totals[i] += c
        keep_idx = [i for i, t in enumerate(school_day_totals) if t > 0]
        filtered_ordered = [ordered_schools[i] for i in keep_idx]
        schools_for_response = [
            CenterScopeSchoolItem(id=s.id, code=s.code, name=s.name) for s in filtered_ordered
        ]
        slot_rows = [
            StaffCentreDaySummarySlotRow(
                subject_code=s.subject_code,
                subject_name=s.subject_name,
                papers_label=s.papers_label,
                times_label=s.times_label,
                counts_by_school=[s.counts_by_school[i] for i in keep_idx],
                row_total=s.row_total,
            )
            for s in slot_rows
        ]

    unique_n = len(unique_ids)
    invigilators = math.ceil(unique_n / 30) if unique_n else 0

    return StaffCentreDaySummaryResponse(
        examination_date=examination_date,
        schools=schools_for_response,
        slots=slot_rows,
        unique_candidates=unique_n,
        invigilators_required=invigilators,
    )


def _candidate_subject_matches_slot(
    subject_code: str,
    paper: int,
    cand_subject_rows: list[tuple[str, int | None]],
) -> bool:
    code_norm = str(subject_code).strip()
    for scode, series in cand_subject_rows:
        if str(scode).strip() != code_norm:
            continue
        if series is None or series == paper:
            return True
    return False


def _subject_day_group_key(subject_code: str) -> str:
    return str(subject_code).strip()


def _format_time_hhmm(t: time) -> str:
    return f"{t.hour:02d}:{t.minute:02d}"


def _candidate_matches_any_entry_in_group(
    cand_subject_rows: list[tuple[str, int | None]],
    group_entries: list[TimetableEntry],
) -> bool:
    for ent in group_entries:
        if _candidate_subject_matches_slot(ent.subject_code, ent.paper, cand_subject_rows):
            return True
    return False


@router.get("/{exam_id}/timetable/my-school/pdf")
async def download_my_school_timetable_pdf(
    exam_id: int,
    session: DBSessionDep,
    user: SupervisorOrInspectorDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL),
    programme_id: int | None = Query(default=None),
    filter_school_id: UUID | None = Query(
        default=None,
        description="Limit to candidates from this school (must be in your examination centre scope)",
    ),
    merge_by_date: bool = Query(default=False, description="Merge subjects written on the same day"),
    orientation: str = Query(default="portrait", description="Page orientation: portrait or landscape"),
) -> Response:
    user_school = await _school_from_user(session, user)
    scope_ids, display_school = await _staff_scope_and_display_school(session, user_school, filter_school_id)
    if programme_id is not None:
        await _validate_programme_in_scope(session, programme_id, scope_ids)
    explicit_codes = await get_candidate_schedule_codes_for_exam(
        session,
        exam_id,
        scope_ids,
        programme_id=programme_id,
        filter_school_id=filter_school_id,
    )
    try:
        pdf = await build_school_timetable_pdf(
            session,
            exam_id,
            display_school.id,
            programme_id=programme_id,
            subject_filter=subject_filter,
            merge_by_date=merge_by_date,
            orientation=orientation,
            explicit_schedule_codes=explicit_codes,
        )
    except ValueError as e:
        detail = str(e) if str(e) else "Not found"
        if "Programme not found" in detail:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from None
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None
    exam = await load_examination_or_raise(session, exam_id)
    base = _sanitize_filename_part(f"{exam.year}_{exam.exam_series or 'exam'}_{display_school.code}")
    filename = f"timetable_{base}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{exam_id}/timetable/my-school/preview", response_model=TimetablePreviewResponse)
async def preview_my_school_timetable(
    exam_id: int,
    session: DBSessionDep,
    user: SupervisorOrInspectorDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL),
    programme_id: int | None = Query(default=None),
    filter_school_id: UUID | None = Query(
        default=None,
        description="Limit to candidates from this school (must be in your examination centre scope)",
    ),
) -> TimetablePreviewResponse:
    user_school = await _school_from_user(session, user)
    try:
        exam = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    scope_ids, display_school = await _staff_scope_and_display_school(session, user_school, filter_school_id)
    if programme_id is not None:
        await _validate_programme_in_scope(session, programme_id, scope_ids)

    explicit_codes = await get_candidate_schedule_codes_for_exam(
        session,
        exam_id,
        scope_ids,
        programme_id=programme_id,
        filter_school_id=filter_school_id,
    )
    all_schedules = await load_schedules_for_exam(session, exam_id)
    schedule_codes = {s.subject_code for s in all_schedules}
    intersected = explicit_codes & schedule_codes
    filtered_codes = await filter_schedule_codes_by_subject_type(session, intersected, subject_filter)
    filtered = [s for s in all_schedules if s.subject_code in filtered_codes]
    entries = schedules_to_entries(filtered)
    return TimetablePreviewResponse(
        examination_id=exam.id,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        year=exam.year,
        school_id=display_school.id,
        school_code=display_school.code,
        entries=entries,
    )


@router.get("/{exam_id}/timetable/my-depot/pdf")
async def download_my_depot_timetable_pdf(
    exam_id: int,
    session: DBSessionDep,
    user: DepotKeeperDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL),
    programme_id: int | None = Query(default=None),
    filter_school_id: UUID | None = Query(
        default=None,
        description="Limit to candidates from this school (must be in your depot)",
    ),
    merge_by_date: bool = Query(default=False, description="Merge subjects written on the same day"),
    orientation: str = Query(default="portrait", description="Page orientation: portrait or landscape"),
) -> Response:
    scope_ids, display_school = await _depot_scope_and_display_school(session, user, filter_school_id)
    if programme_id is not None:
        await _validate_programme_in_scope(session, programme_id, scope_ids)
    explicit_codes = await get_candidate_schedule_codes_for_exam(
        session,
        exam_id,
        scope_ids,
        programme_id=programme_id,
        filter_school_id=filter_school_id,
    )
    try:
        pdf = await build_school_timetable_pdf(
            session,
            exam_id,
            display_school.id,
            programme_id=programme_id,
            subject_filter=subject_filter,
            merge_by_date=merge_by_date,
            orientation=orientation,
            explicit_schedule_codes=explicit_codes,
        )
    except ValueError as e:
        detail = str(e) if str(e) else "Not found"
        if "Programme not found" in detail:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from None
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None
    exam = await load_examination_or_raise(session, exam_id)
    base = _sanitize_filename_part(f"{exam.year}_{exam.exam_series or 'exam'}_{display_school.code}")
    filename = f"timetable_{base}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{exam_id}/timetable/my-depot/preview", response_model=TimetablePreviewResponse)
async def preview_my_depot_timetable(
    exam_id: int,
    session: DBSessionDep,
    user: DepotKeeperDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL),
    programme_id: int | None = Query(default=None),
    filter_school_id: UUID | None = Query(
        default=None,
        description="Limit to candidates from this school (must be in your depot)",
    ),
) -> TimetablePreviewResponse:
    try:
        exam = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    scope_ids, display_school = await _depot_scope_and_display_school(session, user, filter_school_id)
    if programme_id is not None:
        await _validate_programme_in_scope(session, programme_id, scope_ids)

    explicit_codes = await get_candidate_schedule_codes_for_exam(
        session,
        exam_id,
        scope_ids,
        programme_id=programme_id,
        filter_school_id=filter_school_id,
    )
    all_schedules = await load_schedules_for_exam(session, exam_id)
    schedule_codes = {s.subject_code for s in all_schedules}
    intersected = explicit_codes & schedule_codes
    filtered_codes = await filter_schedule_codes_by_subject_type(session, intersected, subject_filter)
    filtered = [s for s in all_schedules if s.subject_code in filtered_codes]
    entries = schedules_to_entries(filtered)
    return TimetablePreviewResponse(
        examination_id=exam.id,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        year=exam.year,
        school_id=display_school.id,
        school_code=display_school.code,
        entries=entries,
    )


@router.get("/{exam_id}/my-center-overview", response_model=StaffCentreOverviewResponse)
async def get_my_center_overview(
    exam_id: int,
    session: DBSessionDep,
    user: SupervisorOrInspectorDep,
) -> StaffCentreOverviewResponse:
    """Centre-wide candidate count, school count, and next timetable slots for supervisors and inspectors."""
    user_school = await _school_from_user(session, user)
    try:
        exam = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    try:
        center_host = await resolve_center_host_school(session, user_school)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None
    scope_ids = await center_scope_school_ids(session, center_host)
    school_count = len(scope_ids)
    ordered_scope_schools = await schools_in_center_scope_ordered(session, center_host)

    cand_stmt = select(func.count()).select_from(ExaminationCandidate).where(
        ExaminationCandidate.examination_id == exam_id,
        ExaminationCandidate.school_id.in_(scope_ids),
    )
    candidate_count = int((await session.execute(cand_stmt)).scalar_one())
    cand_by_school_stmt = (
        select(ExaminationCandidate.school_id, func.count().label("candidate_count"))
        .where(
            ExaminationCandidate.examination_id == exam_id,
            ExaminationCandidate.school_id.in_(scope_ids),
        )
        .group_by(ExaminationCandidate.school_id)
    )
    cand_by_school_rows = await session.execute(cand_by_school_stmt)
    cand_by_school = {row[0]: int(row[1]) for row in cand_by_school_rows.all()}

    entries = await _staff_center_filtered_timetable_entries(session, exam_id, scope_ids)

    examination_centre_region = center_host.region.value
    if entries:
        entry_dates = [e.examination_date for e in entries]
        examination_window_start = min(entry_dates)
        examination_window_end = max(entry_dates)
    else:
        examination_window_start = None
        examination_window_end = None

    try:
        tz = ZoneInfo(settings.script_packing_timezone)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")
    now = datetime.now(tz)

    upcoming_rows: list[TimetableEntry] = []
    for ent in entries:
        start = datetime.combine(ent.examination_date, ent.examination_time).replace(tzinfo=tz)
        if start >= now:
            upcoming_rows.append(ent)
    upcoming_rows.sort(
        key=lambda x: (x.examination_date, x.examination_time, x.subject_code, x.paper),
    )

    today_date = now.date()
    today_rows = [ent for ent in entries if ent.examination_date == today_date]
    today_rows.sort(
        key=lambda x: (x.examination_time, x.subject_code, x.paper),
    )

    return StaffCentreOverviewResponse(
        examination_id=exam.id,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        year=exam.year,
        supervisor_school_code=user_school.code,
        supervisor_school_name=user_school.name,
        examination_centre_host_school_id=center_host.id,
        examination_centre_host_code=center_host.code,
        examination_centre_host_name=center_host.name,
        supervisor_school_is_centre_host=user_school.writes_at_center_id is None,
        candidate_count=candidate_count,
        school_count=school_count,
        upcoming=[
            StaffCentreOverviewUpcomingItem(
                subject_code=x.subject_code,
                subject_name=x.subject_name,
                paper=x.paper,
                examination_date=x.examination_date,
                examination_time=x.examination_time,
            )
            for x in upcoming_rows
        ],
        sessions_today=[
            StaffCentreOverviewUpcomingItem(
                subject_code=x.subject_code,
                subject_name=x.subject_name,
                paper=x.paper,
                examination_date=x.examination_date,
                examination_time=x.examination_time,
            )
            for x in today_rows
        ],
        examination_centre_region=examination_centre_region,
        examination_window_start=examination_window_start,
        examination_window_end=examination_window_end,
        schools_with_candidate_counts=[
            StaffCentreSchoolCandidateItem(
                school_id=s.id,
                school_code=s.code,
                school_name=s.name,
                candidate_count=cand_by_school.get(s.id, 0),
            )
            for s in ordered_scope_schools
        ],
    )


@router.get("/{exam_id}/my-center-day-summary", response_model=StaffCentreDaySummaryResponse)
async def get_my_center_day_summary(
    exam_id: int,
    examination_date: date,
    session: DBSessionDep,
    user: SupervisorOrInspectorDep,
) -> StaffCentreDaySummaryResponse:
    """Per-day candidate counts by slot and school; invigilators from unique candidates."""
    user_school = await _school_from_user(session, user)
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    scope_ids, _ = await _staff_scope_and_display_school(session, user_school, None)

    center_host = await resolve_center_host_school(session, user_school)
    ordered_schools = await schools_in_center_scope_ordered(session, center_host)

    return await _build_staff_day_summary_for_scope(
        session, exam_id, examination_date, scope_ids, ordered_schools
    )


_NATIONAL_PLACEHOLDER_CENTRE_ID = UUID("00000000-0000-0000-0000-000000000000")


@router.get("/{exam_id}/national-overview", response_model=StaffCentreOverviewResponse)
async def get_national_overview(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> StaffCentreOverviewResponse:
    """All schools with registered candidates: today's papers and upcoming sessions (monitoring)."""
    try:
        exam = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    scope_ids = await _national_candidate_school_ids(session, exam_id)
    ordered_schools = await _schools_with_ids_ordered_by_code(session, scope_ids)
    school_count = len(scope_ids)

    if not scope_ids:
        return StaffCentreOverviewResponse(
            examination_id=exam.id,
            exam_type=exam.exam_type,
            exam_series=exam.exam_series,
            year=exam.year,
            supervisor_school_code="—",
            supervisor_school_name="National monitoring",
            examination_centre_host_school_id=_NATIONAL_PLACEHOLDER_CENTRE_ID,
            examination_centre_host_code="—",
            examination_centre_host_name="All schools",
            supervisor_school_is_centre_host=True,
            candidate_count=0,
            school_count=0,
            upcoming=[],
            sessions_today=[],
            examination_centre_region="—",
            examination_window_start=None,
            examination_window_end=None,
        )

    cand_stmt = select(func.count()).select_from(ExaminationCandidate).where(
        ExaminationCandidate.examination_id == exam_id,
        ExaminationCandidate.school_id.in_(scope_ids),
    )
    candidate_count = int((await session.execute(cand_stmt)).scalar_one())

    entries = await _staff_center_filtered_timetable_entries(session, exam_id, scope_ids)

    region_vals = {s.region.value for s in ordered_schools if s.region is not None}
    if len(region_vals) == 1:
        examination_centre_region = next(iter(region_vals))
    elif len(region_vals) > 1:
        examination_centre_region = "Multiple regions"
    else:
        examination_centre_region = "—"

    if entries:
        entry_dates = [e.examination_date for e in entries]
        examination_window_start = min(entry_dates)
        examination_window_end = max(entry_dates)
    else:
        examination_window_start = None
        examination_window_end = None

    try:
        tz = ZoneInfo(settings.script_packing_timezone)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")
    now = datetime.now(tz)

    upcoming_rows: list[TimetableEntry] = []
    for ent in entries:
        start = datetime.combine(ent.examination_date, ent.examination_time).replace(tzinfo=tz)
        if start >= now:
            upcoming_rows.append(ent)
    upcoming_rows.sort(
        key=lambda x: (x.examination_date, x.examination_time, x.subject_code, x.paper),
    )

    today_date = now.date()
    today_rows = [ent for ent in entries if ent.examination_date == today_date]
    today_rows.sort(
        key=lambda x: (x.examination_time, x.subject_code, x.paper),
    )

    first_school = ordered_schools[0]
    return StaffCentreOverviewResponse(
        examination_id=exam.id,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        year=exam.year,
        supervisor_school_code="—",
        supervisor_school_name="National monitoring",
        examination_centre_host_school_id=first_school.id,
        examination_centre_host_code=str(first_school.code),
        examination_centre_host_name="All schools (national)",
        supervisor_school_is_centre_host=True,
        candidate_count=candidate_count,
        school_count=school_count,
        upcoming=[
            StaffCentreOverviewUpcomingItem(
                subject_code=x.subject_code,
                subject_name=x.subject_name,
                paper=x.paper,
                examination_date=x.examination_date,
                examination_time=x.examination_time,
            )
            for x in upcoming_rows
        ],
        sessions_today=[
            StaffCentreOverviewUpcomingItem(
                subject_code=x.subject_code,
                subject_name=x.subject_name,
                paper=x.paper,
                examination_date=x.examination_date,
                examination_time=x.examination_time,
            )
            for x in today_rows
        ],
        examination_centre_region=examination_centre_region,
        examination_window_start=examination_window_start,
        examination_window_end=examination_window_end,
    )


@router.get("/{exam_id}/national-day-summary", response_model=StaffCentreDaySummaryResponse)
async def get_national_day_summary(
    exam_id: int,
    examination_date: date,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> StaffCentreDaySummaryResponse:
    """Per-day slot table across all schools that have candidates for this examination."""
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    scope_ids = await _national_candidate_school_ids(session, exam_id)
    ordered_schools = await _schools_with_ids_ordered_by_code(session, scope_ids)
    return await _build_staff_day_summary_for_scope(
        session, exam_id, examination_date, scope_ids, ordered_schools
    )


@router.get("/{exam_id}/my-depot-overview", response_model=StaffDepotOverviewResponse)
async def get_my_depot_overview(
    exam_id: int,
    session: DBSessionDep,
    user: DepotKeeperDep,
) -> StaffDepotOverviewResponse:
    depot_id = await _depot_keeper_depot_id(session, user)
    depot = await session.get(Depot, depot_id)
    if depot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Depot not found")
    try:
        exam = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    ordered_schools = await _depot_ordered_schools(session, depot_id)
    scope_ids = {s.id for s in ordered_schools}
    school_count = len(scope_ids)

    region_summary: str | None = None
    if ordered_schools:
        regions = {s.region for s in ordered_schools}
        if len(regions) == 1:
            region_summary = next(iter(regions)).value
        else:
            region_summary = "Multiple regions"

    if not scope_ids:
        candidate_count = 0
        entries: list[TimetableEntry] = []
    else:
        cand_stmt = select(func.count()).select_from(ExaminationCandidate).where(
            ExaminationCandidate.examination_id == exam_id,
            ExaminationCandidate.school_id.in_(scope_ids),
        )
        candidate_count = int((await session.execute(cand_stmt)).scalar_one())
        entries = await _staff_center_filtered_timetable_entries(session, exam_id, scope_ids)

    timetable_distinct_subject_count = len({e.subject_code for e in entries})

    try:
        tz = ZoneInfo(settings.script_packing_timezone)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")
    now = datetime.now(tz)

    upcoming_rows: list[TimetableEntry] = []
    for ent in entries:
        start = datetime.combine(ent.examination_date, ent.examination_time).replace(tzinfo=tz)
        if start >= now:
            upcoming_rows.append(ent)
    upcoming_rows.sort(
        key=lambda x: (x.examination_date, x.examination_time, x.subject_code, x.paper),
    )

    today_date = now.date()
    today_rows = [ent for ent in entries if ent.examination_date == today_date]
    today_rows.sort(
        key=lambda x: (x.examination_time, x.subject_code, x.paper),
    )

    return StaffDepotOverviewResponse(
        examination_id=exam.id,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        year=exam.year,
        depot_code=depot.code,
        depot_name=depot.name,
        candidate_count=candidate_count,
        school_count=school_count,
        upcoming=[
            StaffCentreOverviewUpcomingItem(
                subject_code=x.subject_code,
                subject_name=x.subject_name,
                paper=x.paper,
                examination_date=x.examination_date,
                examination_time=x.examination_time,
            )
            for x in upcoming_rows
        ],
        sessions_today=[
            StaffCentreOverviewUpcomingItem(
                subject_code=x.subject_code,
                subject_name=x.subject_name,
                paper=x.paper,
                examination_date=x.examination_date,
                examination_time=x.examination_time,
            )
            for x in today_rows
        ],
        timetable_distinct_subject_count=timetable_distinct_subject_count,
        region_summary=region_summary,
    )


@router.get("/{exam_id}/my-depot-day-summary", response_model=StaffCentreDaySummaryResponse)
async def get_my_depot_day_summary(
    exam_id: int,
    examination_date: date,
    session: DBSessionDep,
    user: DepotKeeperDep,
) -> StaffCentreDaySummaryResponse:
    depot_id = await _depot_keeper_depot_id(session, user)
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    ordered_schools = await _depot_ordered_schools(session, depot_id)
    scope_ids = {s.id for s in ordered_schools}
    school_index = {s.id: i for i, s in enumerate(ordered_schools)}

    if not scope_ids:
        return StaffCentreDaySummaryResponse(
            examination_date=examination_date,
            schools=[],
            slots=[],
            unique_candidates=0,
            invigilators_required=0,
        )

    entries = await _staff_center_filtered_timetable_entries(session, exam_id, scope_ids)
    day_entries = [e for e in entries if e.examination_date == examination_date]
    day_entries.sort(key=lambda x: (x.examination_time, x.subject_code, x.paper))

    by_subject: dict[str, list[TimetableEntry]] = defaultdict(list)
    for ent in day_entries:
        by_subject[_subject_day_group_key(ent.subject_code)].append(ent)
    merged_groups: list[list[TimetableEntry]] = []
    for _key, group in by_subject.items():
        group.sort(key=lambda x: (x.examination_time, x.paper))
        merged_groups.append(group)
    merged_groups.sort(
        key=lambda g: (min(e.examination_time for e in g), g[0].subject_code),
    )

    cand_stmt = (
        select(ExaminationCandidate)
        .where(
            ExaminationCandidate.examination_id == exam_id,
            ExaminationCandidate.school_id.in_(scope_ids),
            ExaminationCandidate.school_id.isnot(None),
        )
        .options(selectinload(ExaminationCandidate.subject_selections))
    )
    cand_result = await session.execute(cand_stmt)
    candidates = list(cand_result.scalars().unique().all())

    slot_rows: list[StaffCentreDaySummarySlotRow] = []
    unique_ids: set[int] = set()
    n_sch = len(ordered_schools)

    for group in merged_groups:
        first = group[0]
        papers_sorted = sorted({e.paper for e in group})
        papers_label = " & ".join(str(p) for p in papers_sorted)
        times_sorted = sorted({e.examination_time for e in group})
        times_label = " · ".join(_format_time_hhmm(t) for t in times_sorted)

        counts_by_school = [0] * n_sch
        row_total = 0

        for cand in candidates:
            subj_rows = [
                (s.subject_code, s.series) for s in (cand.subject_selections or []) if s.subject_code
            ]
            if not _candidate_matches_any_entry_in_group(subj_rows, group):
                continue
            unique_ids.add(cand.id)
            row_total += 1
            if cand.school_id is not None:
                idx = school_index.get(cand.school_id)
                if idx is not None:
                    counts_by_school[idx] += 1

        slot_rows.append(
            StaffCentreDaySummarySlotRow(
                subject_code=first.subject_code,
                subject_name=first.subject_name,
                papers_label=papers_label,
                times_label=times_label,
                counts_by_school=counts_by_school,
                row_total=row_total,
            )
        )

    schools_for_response: list[CenterScopeSchoolItem] = []
    if n_sch and slot_rows:
        school_day_totals = [0] * n_sch
        for slot in slot_rows:
            for i, c in enumerate(slot.counts_by_school):
                school_day_totals[i] += c
        keep_idx = [i for i, t in enumerate(school_day_totals) if t > 0]
        filtered_ordered = [ordered_schools[i] for i in keep_idx]
        schools_for_response = [
            CenterScopeSchoolItem(id=s.id, code=s.code, name=s.name) for s in filtered_ordered
        ]
        slot_rows = [
            StaffCentreDaySummarySlotRow(
                subject_code=s.subject_code,
                subject_name=s.subject_name,
                papers_label=s.papers_label,
                times_label=s.times_label,
                counts_by_school=[s.counts_by_school[i] for i in keep_idx],
                row_total=s.row_total,
            )
            for s in slot_rows
        ]

    unique_n = len(unique_ids)
    invigilators = math.ceil(unique_n / 30) if unique_n else 0

    return StaffCentreDaySummaryResponse(
        examination_date=examination_date,
        schools=schools_for_response,
        slots=slot_rows,
        unique_candidates=unique_n,
        invigilators_required=invigilators,
    )
