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
    InspectorDep,
    InspectorJwtPostingIdDep,
    StaffActiveExaminationDep,
    PortalExaminationListDep,
    SuperAdminDep,
    SuperAdminOrFinanceOfficerDep,
    SuperAdminOrTestAdminOfficerDep,
    TopLevelOfficerDep,
    SupervisorInspectorOrDepotKeeperDep,
    SupervisorOrInspectorDep,
)
from app.dependencies.database import DBSessionDep
from app.models import (
    CentreStructureMode,
    Depot,
    Examination,
    ExaminationCandidate,
    ExaminationCentre,
    ExaminationSchedule,
    ExaminationSubjectScriptSeries,
    ExamInspectorSubjectScope,
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
    CentreScopeProgrammeItem,
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
    FinanceCentreDayInvigilatorRow,
    FinanceCentreOfficialStatisticsExportBody,
    FinanceCentreOfficialStatisticsResponse,
    FinanceCentreOfficialStatisticsRow,
    FinanceCentreOfficialStatisticsShellResponse,
    FinanceCentreInvigilatorSummaryItem,
    FinanceCentreInvigilatorSummaryResponse,
    FinanceCentreInvigilatorSummaryShellResponse,
    FinanceCentreSchoolSummaryResponse,
    FinanceCentreShellCentre,
    InspectorPostedWorkspaceItem,
    MyCenterProgrammesResponse,
    MyCenterSchoolsResponse,
    MyDepotSchoolsResponse,
    StaffCentreDaySummaryResponse,
    StaffCentreDaySummarySlotRow,
    StaffCentreOverviewResponse,
    StaffCentreOverviewUpcomingItem,
    StaffCentreSchoolCandidateItem,
    StaffCandidateWriteDestination,
    ExecutiveCentreDetailResponse,
    NationalExecutiveOverviewResponse,
    StaffDepotOverviewResponse,
    TimetableEntry,
    TimetablePreviewResponse,
)
from app.schemas.inspector_posting import MyInspectorPostingRow, MyInspectorPostingsResponse
from app.schemas.timetable import TimetableDownloadFilter
from app.services.active_examination import (
    require_active_inspector_examination_id,
    resolve_active_examination_id,
)
from app.services.depot_scope import depot_school_ids, require_depot_id_for_depot_keeper
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
from app.services.centre_resolution import (
    centre_has_membership_for_subject_filter,
    centre_scope_school_ids,
    centre_scope_school_ids_for_host_overview,
    get_examination_centre_or_404,
    inspector_scope_for_member_school,
    list_candidate_write_destinations_for_school,
    list_candidate_write_destinations_per_scope_for_school,
    list_centres_for_examination,
    membership_scope_for_timetable_filter,
    resolve_centre_for_user_school,
    school_code_matches_centre_code,
    scope_ids_for_centre_subject_filter,
)
from app.services.timetable_dates import timetable_filter_for_inspector_scope
from app.services.inspector_posting import (
    load_postings_for_inspector_exam,
    representative_school_for_centre,
    resolve_inspector_workspace,
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
from app.services.executive_overview import (
    build_executive_centre_detail,
    build_national_executive_overview,
)
from app.services.timetable_service import (
    center_scope_school_ids,
    get_candidate_schedule_codes_for_centre_scope,
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
    _: PortalExaminationListDep,
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


@router.get("/staff-default-examination", response_model=ExaminationResponse)
async def get_staff_default_examination(
    session: DBSessionDep,
    user: StaffActiveExaminationDep,
) -> ExaminationResponse:
    """Examination id used as default for supervisor, inspector, and depot keeper dashboards."""
    _ = user
    eid = await resolve_active_examination_id(session)
    exam = await session.get(Examination, eid)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return ExaminationResponse.model_validate(exam)


@router.get("/timetable/my-center-schools", response_model=MyCenterSchoolsResponse)
async def list_my_center_schools_for_timetable(
    session: DBSessionDep,
    user: SupervisorOrInspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    examination_id: int | None = Query(
        default=None,
        description="When set, inspector scope is the selected workspace for this examination (see JWT posting_id).",
    ),
    posting_id: UUID | None = Query(
        default=None,
        description="Inspector posting (workspace); overrides JWT when set; required when you have multiple postings.",
    ),
) -> MyCenterSchoolsResponse:
    """Host centre plus schools that write there; for supervisor/inspector timetable school filter."""
    user_school = await _school_from_user(
        session,
        user,
        examination_id=examination_id,
        jwt_inspector_posting_id=jwt_posting_id,
        posting_id=posting_id,
    )
    if examination_id is None:
        examination_id = await resolve_active_examination_id(session)
        if examination_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="examination_id is required",
            )
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None
    scope_ids, center_host = await _staff_scope_and_display_school(
        session,
        user,
        user_school,
        None,
        examination_id,
        jwt_inspector_posting_id=jwt_posting_id,
        posting_id=posting_id,
    )
    candidate_school_ids = await _school_ids_with_candidates_in_scope(
        session,
        examination_id,
        scope_ids,
    )
    ordered = await _schools_with_ids_ordered_by_code(session, candidate_school_ids)
    return MyCenterSchoolsResponse(
        center_school_id=center_host.id,
        schools=[CenterScopeSchoolItem(id=s.id, code=s.code, name=s.name) for s in ordered],
    )


@router.get("/timetable/my-center-programmes", response_model=MyCenterProgrammesResponse)
async def list_my_center_programmes_for_timetable(
    session: DBSessionDep,
    user: SupervisorOrInspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    school_id: UUID | None = Query(
        default=None,
        description="If set, only programmes linked to this school (must be in your centre scope).",
    ),
    examination_id: int | None = Query(
        default=None,
        description="When set, inspector scope is the selected workspace for this examination (see JWT posting_id).",
    ),
    posting_id: UUID | None = Query(
        default=None,
        description="Inspector posting (workspace); overrides JWT when set; required when you have multiple postings.",
    ),
) -> MyCenterProgrammesResponse:
    """Programmes offered at the centre (or one school), with subject counts for timetable filtering."""
    user_school = await _school_from_user(
        session,
        user,
        examination_id=examination_id,
        jwt_inspector_posting_id=jwt_posting_id,
        posting_id=posting_id,
    )
    if examination_id is not None:
        try:
            await load_examination_or_raise(session, examination_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None
    if examination_id is None:
        examination_id = await resolve_active_examination_id(session)
        if examination_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="examination_id is required",
            )
    scope_ids = await _scope_ids_for_centre_timetable(
        session,
        user,
        user_school,
        examination_id,
        jwt_inspector_posting_id=jwt_posting_id,
        posting_id=posting_id,
    )
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
            subject_type=s.subject_type.value,
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
            subject_type=s.subject_type.value,
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


async def _school_from_user(
    session: DBSessionDep,
    user: User,
    *,
    examination_id: int | None = None,
    jwt_inspector_posting_id: UUID | None = None,
    posting_id: UUID | None = None,
) -> School:
    """Anchor school for supervisor/inspector centre-scope endpoints.

    Supervisors use ``user.school_code``. Inspectors may omit ``school_code``; their
    centre host is the selected workspace (JWT ``inspector_posting_id`` or ``posting_id``)
    for the given examination (or the configured active examination when no exam id).
    """
    if user.role not in (UserRole.SUPERVISOR, UserRole.INSPECTOR):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="School-scoped access only")

    if user.role == UserRole.SUPERVISOR:
        if not user.school_code or not str(user.school_code).strip():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is not linked to a school code",
            )
        code = str(user.school_code).strip()
        school_stmt = select(School).where(School.code == code)
        school_result = await session.execute(school_stmt)
        school = school_result.scalar_one_or_none()
        if school is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="School not found for your account",
            )
        return school

    # INSPECTOR
    if user.school_code and str(user.school_code).strip():
        code = str(user.school_code).strip()
        school_stmt = select(School).where(School.code == code)
        school_result = await session.execute(school_stmt)
        school = school_result.scalar_one_or_none()
        if school is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="School not found for your account",
            )
        return school

    eid = examination_id
    if eid is None:
        eid = await require_active_inspector_examination_id(session)

    ctx = await resolve_inspector_workspace(
        session,
        examination_id=eid,
        user=user,
        posting_id=posting_id,
        jwt_posting_id=jwt_inspector_posting_id,
    )
    rep = await representative_school_for_centre(session, ctx.examination_centre)
    if rep is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Centre has no schools")
    return rep


def _dashboard_stats_scope_ids(
    user: User,
    user_school: School,
    centre_scope_ids: set[UUID],
    *,
    is_centre_host: bool,
) -> set[UUID]:
    """Satellite supervisors see their own school's candidates on the dashboard, not the whole centre."""
    if user.role == UserRole.SUPERVISOR and not is_centre_host:
        return {user_school.id}
    return centre_scope_ids


def _effective_timetable_subject_filter(
    *,
    requested: TimetableDownloadFilter | None,
    inspector_scope: ExamInspectorSubjectScope | None,
) -> TimetableDownloadFilter:
    if requested is not None:
        return requested
    if inspector_scope is not None:
        return timetable_filter_for_inspector_scope(inspector_scope)
    return TimetableDownloadFilter.ALL


async def _examination_centre_for_staff_day_summary(
    session: DBSessionDep,
    exam_id: int,
    user: User,
    user_school: School,
    *,
    requested_filter: TimetableDownloadFilter | None,
    jwt_posting_id: UUID | None,
    posting_id: UUID | None,
) -> tuple[ExaminationCentre, ExamInspectorSubjectScope | None]:
    """Resolve the examination centre row for this day-summary request."""
    if user.role == UserRole.INSPECTOR:
        iposts = await load_postings_for_inspector_exam(
            session, examination_id=exam_id, inspector_user_id=user.id
        )
        if iposts:
            ctx = await resolve_inspector_workspace(
                session,
                examination_id=exam_id,
                user=user,
                posting_id=posting_id,
                jwt_posting_id=jwt_posting_id,
            )
            return ctx.examination_centre, ctx.subject_scope

    if requested_filter == TimetableDownloadFilter.CORE_ONLY:
        ins_scope = ExamInspectorSubjectScope.CORE
    elif requested_filter == TimetableDownloadFilter.ELECTIVE_ONLY:
        ins_scope = ExamInspectorSubjectScope.ELECTIVE
    else:
        ins_scope = await inspector_scope_for_member_school(
            session, exam_id, user_school.id
        )
    centre = await resolve_centre_for_user_school(
        session, exam_id, user_school, inspector_scope=ins_scope
    )
    return centre, None


async def _supervisor_is_centre_host_for_exam(
    session: DBSessionDep,
    exam_id: int,
    user_school: School,
) -> bool:
    write_destinations = await list_candidate_write_destinations_for_school(
        session, exam_id, user_school.id
    )
    home_centre = await get_examination_centre_or_404(
        session, exam_id, write_destinations[0].centre_id
    )
    return school_code_matches_centre_code(user_school.code, str(home_centre.code))


async def _day_summary_scope_ids(
    session: DBSessionDep,
    exam: Examination,
    user: User,
    user_school: School,
    centre_scope_ids: set[UUID],
    exam_centre: ExaminationCentre,
    *,
    effective_filter: TimetableDownloadFilter,
    is_account_centre_host: bool,
) -> set[UUID]:
    mode = exam.centre_structure_mode
    if isinstance(mode, str):
        mode = CentreStructureMode(mode)

    if user.role == UserRole.SUPERVISOR and not is_account_centre_host:
        return {user_school.id}

    if mode != CentreStructureMode.SPLIT or effective_filter == TimetableDownloadFilter.ALL:
        return _dashboard_stats_scope_ids(
            user,
            user_school,
            centre_scope_ids,
            is_centre_host=is_account_centre_host,
        )

    if is_account_centre_host:
        mem_scope = membership_scope_for_timetable_filter(effective_filter)
        if mem_scope is None:
            return await centre_scope_school_ids_for_host_overview(session, exam_centre)
        return await centre_scope_school_ids(
            session, exam_centre, membership_scope=mem_scope
        )

    return await scope_ids_for_centre_subject_filter(
        session,
        exam_centre,
        centre_scope_ids,
        subject_filter=effective_filter,
    )


async def _centre_scope_ids_for_staff_user(
    session: DBSessionDep,
    user: User,
    user_school: School,
    examination_id: int | None,
    *,
    jwt_inspector_posting_id: UUID | None = None,
    posting_id: UUID | None = None,
) -> set[UUID]:
    """Centre school ids for supervisors and inspectors (posting workspace or membership scope)."""
    eid = examination_id
    if user.role == UserRole.INSPECTOR and eid is not None:
        iposts = await load_postings_for_inspector_exam(
            session, examination_id=eid, inspector_user_id=user.id
        )
        if iposts:
            ctx = await resolve_inspector_workspace(
                session,
                examination_id=eid,
                user=user,
                posting_id=posting_id,
                jwt_posting_id=jwt_inspector_posting_id,
            )
            return ctx.scope_ids

    if eid is None:
        eid = await resolve_active_examination_id(session)
        if eid is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="examination_id is required",
            )

    inspector_scope = await inspector_scope_for_member_school(session, eid, user_school.id)
    centre = await resolve_centre_for_user_school(
        session, eid, user_school, inspector_scope=inspector_scope
    )
    if school_code_matches_centre_code(user_school.code, str(centre.code)):
        return await centre_scope_school_ids_for_host_overview(session, centre)
    try:
        center_host = await resolve_center_host_school(
            session, user_school, eid, inspector_scope=inspector_scope
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None
    return await center_scope_school_ids(
        session, center_host, eid, inspector_scope=inspector_scope
    )


async def _staff_scope_and_display_school(
    session: DBSessionDep,
    user: User,
    user_school: School,
    filter_school_id: UUID | None,
    examination_id: int,
    *,
    jwt_inspector_posting_id: UUID | None = None,
    posting_id: UUID | None = None,
) -> tuple[set[UUID], School]:
    scope_ids = await _centre_scope_ids_for_staff_user(
        session,
        user,
        user_school,
        examination_id,
        jwt_inspector_posting_id=jwt_inspector_posting_id,
        posting_id=posting_id,
    )
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

    if user.role == UserRole.INSPECTOR:
        iposts = await load_postings_for_inspector_exam(
            session, examination_id=examination_id, inspector_user_id=user.id
        )
        if iposts:
            ctx = await resolve_inspector_workspace(
                session,
                examination_id=examination_id,
                user=user,
                posting_id=posting_id,
                jwt_posting_id=jwt_inspector_posting_id,
            )
            center_host = await representative_school_for_centre(session, ctx.examination_centre)
            if center_host is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Centre has no schools",
                )
            return scope_ids, center_host

    inspector_scope = await inspector_scope_for_member_school(
        session, examination_id, user_school.id
    )
    try:
        center_host = await resolve_center_host_school(
            session, user_school, examination_id, inspector_scope=inspector_scope
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None
    return scope_ids, center_host


async def _scope_ids_for_centre_timetable(
    session: DBSessionDep,
    user: User,
    user_school: School,
    examination_id: int | None,
    jwt_inspector_posting_id: UUID | None = None,
    posting_id: UUID | None = None,
) -> set[UUID]:
    """Supervisor / home centre scope; inspectors use the selected workspace for this examination."""
    return await _centre_scope_ids_for_staff_user(
        session,
        user,
        user_school,
        examination_id,
        jwt_inspector_posting_id=jwt_inspector_posting_id,
        posting_id=posting_id,
    )


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
    *,
    subject_filter: TimetableDownloadFilter = TimetableDownloadFilter.ALL,
    exam_centre: ExaminationCentre | None = None,
    programme_id: int | None = None,
    filter_school_id: UUID | None = None,
) -> list[TimetableEntry]:
    """Timetable entries for the centre scope (candidate-linked subjects ∩ schedules), same filter as overview PDFs."""
    if exam_centre is not None:
        explicit_codes = await get_candidate_schedule_codes_for_centre_scope(
            session,
            exam_id,
            scope_ids,
            exam_centre,
            subject_filter=subject_filter,
            programme_id=programme_id,
            filter_school_id=filter_school_id,
        )
    else:
        explicit_codes = await get_candidate_schedule_codes_for_exam(
            session,
            exam_id,
            scope_ids,
            programme_id=programme_id,
            filter_school_id=filter_school_id,
        )
        explicit_codes = await filter_schedule_codes_by_subject_type(
            session,
            explicit_codes,
            subject_filter,
        )
    all_schedules = await load_schedules_for_exam(session, exam_id)
    schedule_codes = {s.subject_code for s in all_schedules}
    intersected = explicit_codes & schedule_codes
    filtered = [s for s in all_schedules if s.subject_code in intersected]
    return schedules_to_entries(filtered)


def _timetable_filter_for_destination_scope(subject_scope: str) -> TimetableDownloadFilter:
    scope = subject_scope.strip().upper()
    if scope == "CORE":
        return TimetableDownloadFilter.CORE_ONLY
    if scope == "ELECTIVE":
        return TimetableDownloadFilter.ELECTIVE_ONLY
    return TimetableDownloadFilter.ALL


def _dedupe_timetable_entries(entries: list[TimetableEntry]) -> list[TimetableEntry]:
    seen: set[tuple[date, time, str, int]] = set()
    out: list[TimetableEntry] = []
    for ent in entries:
        key = (ent.examination_date, ent.examination_time, ent.subject_code, ent.paper)
        if key in seen:
            continue
        seen.add(key)
        out.append(ent)
    return out


async def _supervisor_split_write_destinations(
    session: DBSessionDep,
    exam: Examination,
    school_id: UUID,
) -> list[StaffCandidateWriteDestination] | None:
    mode = exam.centre_structure_mode
    if isinstance(mode, str):
        mode = CentreStructureMode(mode)
    if mode != CentreStructureMode.SPLIT:
        return None
    per_scope = await list_candidate_write_destinations_per_scope_for_school(
        session, exam.id, school_id
    )
    if len({d.centre_id for d in per_scope}) <= 1:
        return None
    return per_scope


async def _staff_centre_timetable_entries(
    session: DBSessionDep,
    exam: Examination,
    exam_id: int,
    user: User,
    user_school: School,
    *,
    scope_ids: set[UUID],
    exam_centre: ExaminationCentre,
    workspace_centre: ExaminationCentre | None,
    centre_inspector_scope: ExamInspectorSubjectScope | None,
    is_account_centre_host: bool,
    subject_filter: TimetableDownloadFilter = TimetableDownloadFilter.ALL,
    programme_id: int | None = None,
    filter_school_id: UUID | None = None,
) -> list[TimetableEntry]:
    """Timetable entries for staff overview, preview, and day summary."""
    if user.role == UserRole.INSPECTOR:
        effective_filter = (
            timetable_filter_for_inspector_scope(centre_inspector_scope)
            if centre_inspector_scope is not None
            else TimetableDownloadFilter.ALL
        )
        timetable_centre = workspace_centre if workspace_centre is not None else exam_centre
        timetable_scope_ids = await _day_summary_scope_ids(
            session,
            exam,
            user,
            user_school,
            scope_ids,
            timetable_centre,
            effective_filter=effective_filter,
            is_account_centre_host=False,
        )
        return await _staff_center_filtered_timetable_entries(
            session,
            exam_id,
            timetable_scope_ids,
            subject_filter=effective_filter,
            exam_centre=timetable_centre,
            programme_id=programme_id,
            filter_school_id=filter_school_id,
        )

    split_destinations = await _supervisor_split_write_destinations(
        session, exam, user_school.id
    )
    if split_destinations is not None:
        school_scope = {user_school.id}
        if filter_school_id is not None:
            school_scope = {filter_school_id}
        all_entries: list[TimetableEntry] = []
        for dest in split_destinations:
            dest_filter = _timetable_filter_for_destination_scope(dest.subject_scope)
            if subject_filter == TimetableDownloadFilter.CORE_ONLY and dest_filter != TimetableDownloadFilter.CORE_ONLY:
                continue
            if subject_filter == TimetableDownloadFilter.ELECTIVE_ONLY and dest_filter != TimetableDownloadFilter.ELECTIVE_ONLY:
                continue
            centre = await get_examination_centre_or_404(session, exam_id, dest.centre_id)
            all_entries.extend(
                await _staff_center_filtered_timetable_entries(
                    session,
                    exam_id,
                    school_scope,
                    subject_filter=dest_filter,
                    exam_centre=centre,
                    programme_id=programme_id,
                    filter_school_id=filter_school_id,
                )
            )
        return _dedupe_timetable_entries(all_entries)

    effective_filter = subject_filter
    timetable_centre = exam_centre
    timetable_scope_ids = await _day_summary_scope_ids(
        session,
        exam,
        user,
        user_school,
        scope_ids,
        timetable_centre,
        effective_filter=effective_filter,
        is_account_centre_host=is_account_centre_host,
    )
    return await _staff_center_filtered_timetable_entries(
        session,
        exam_id,
        timetable_scope_ids,
        subject_filter=effective_filter,
        exam_centre=timetable_centre,
        programme_id=programme_id,
        filter_school_id=filter_school_id,
    )


async def _staff_timetable_scope_context(
    session: DBSessionDep,
    exam_id: int,
    user: User,
    user_school: School,
    filter_school_id: UUID | None,
    subject_filter: TimetableDownloadFilter,
    *,
    jwt_posting_id: UUID | None,
    posting_id: UUID | None,
) -> tuple[
    Examination,
    set[UUID],
    School,
    ExaminationCentre,
    TimetableDownloadFilter,
    ExamInspectorSubjectScope | None,
    ExaminationCentre | None,
]:
    """Resolve examination, school scope, centre, and effective subject filter for staff timetables."""
    try:
        exam = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    centre_scope_ids, display_school = await _staff_scope_and_display_school(
        session,
        user,
        user_school,
        filter_school_id,
        exam_id,
        jwt_inspector_posting_id=jwt_posting_id,
        posting_id=posting_id,
    )
    exam_centre, inspector_scope = await _examination_centre_for_staff_day_summary(
        session,
        exam_id,
        user,
        user_school,
        requested_filter=subject_filter,
        jwt_posting_id=jwt_posting_id,
        posting_id=posting_id,
    )
    workspace_centre: ExaminationCentre | None = None
    if user.role == UserRole.INSPECTOR:
        iposts = await load_postings_for_inspector_exam(
            session, examination_id=exam_id, inspector_user_id=user.id
        )
        if iposts:
            ctx = await resolve_inspector_workspace(
                session,
                examination_id=exam_id,
                user=user,
                posting_id=posting_id,
                jwt_posting_id=jwt_posting_id,
            )
            workspace_centre = ctx.examination_centre
            inspector_scope = ctx.subject_scope
    is_account_centre_host = (
        await _supervisor_is_centre_host_for_exam(session, exam_id, user_school)
        if user.role == UserRole.SUPERVISOR
        else False
    )
    effective_filter = _effective_timetable_subject_filter(
        requested=subject_filter,
        inspector_scope=inspector_scope,
    )
    return (
        exam,
        centre_scope_ids,
        display_school,
        exam_centre,
        effective_filter,
        inspector_scope,
        workspace_centre,
    )


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


async def _school_ids_with_candidates_in_scope(
    session: DBSessionDep,
    exam_id: int,
    scope_ids: set[UUID],
) -> set[UUID]:
    """Schools in scope that have at least one registered candidate for this exam."""
    if not scope_ids:
        return set()
    stmt = (
        select(ExaminationCandidate.school_id)
        .where(
            ExaminationCandidate.examination_id == exam_id,
            ExaminationCandidate.school_id.in_(scope_ids),
        )
        .distinct()
    )
    result = await session.execute(stmt)
    return {row[0] for row in result.all() if row[0] is not None}


def _filter_schools_with_registered_candidates(
    ordered_schools: list[School],
    cand_by_school: dict[UUID, int],
) -> list[School]:
    return [s for s in ordered_schools if cand_by_school.get(s.id, 0) > 0]


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
    *,
    subject_filter: TimetableDownloadFilter = TimetableDownloadFilter.ALL,
    preloaded_entries: list[TimetableEntry] | None = None,
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

    if preloaded_entries is None:
        entries = await _staff_center_filtered_timetable_entries(
            session, exam_id, scope_ids, subject_filter=subject_filter
        )
    else:
        entries = preloaded_entries
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
    jwt_posting_id: InspectorJwtPostingIdDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL),
    programme_id: int | None = Query(default=None),
    filter_school_id: UUID | None = Query(
        default=None,
        description="Limit to candidates from this school (must be in your examination centre scope)",
    ),
    merge_by_date: bool = Query(default=False, description="Merge subjects written on the same day"),
    orientation: str = Query(default="portrait", description="Page orientation: portrait or landscape"),
    posting_id: UUID | None = Query(
        default=None,
        description="Inspector posting (workspace); overrides JWT when set; required when you have multiple postings.",
    ),
) -> Response:
    user_school = await _school_from_user(
        session,
        user,
        examination_id=exam_id,
        jwt_inspector_posting_id=jwt_posting_id,
        posting_id=posting_id,
    )
    exam, centre_scope_ids, display_school, exam_centre, effective_filter, inspector_scope, workspace_centre = (
        await _staff_timetable_scope_context(
            session,
            exam_id,
            user,
            user_school,
            filter_school_id,
            subject_filter,
            jwt_posting_id=jwt_posting_id,
            posting_id=posting_id,
        )
    )
    if programme_id is not None:
        await _validate_programme_in_scope(session, programme_id, centre_scope_ids)
    is_account_centre_host = (
        await _supervisor_is_centre_host_for_exam(session, exam_id, user_school)
        if user.role == UserRole.SUPERVISOR
        else False
    )
    explicit_codes = await get_candidate_schedule_codes_for_centre_scope(
        session,
        exam_id,
        {user_school.id} if filter_school_id is None else {filter_school_id},
        exam_centre,
        subject_filter=effective_filter,
        programme_id=programme_id,
        filter_school_id=filter_school_id,
    )
    split_destinations = await _supervisor_split_write_destinations(session, exam, user_school.id)
    if split_destinations is not None:
        explicit_codes = set()
        school_scope = {user_school.id}
        if filter_school_id is not None:
            school_scope = {filter_school_id}
        for dest in split_destinations:
            dest_filter = _timetable_filter_for_destination_scope(dest.subject_scope)
            if effective_filter == TimetableDownloadFilter.CORE_ONLY and dest_filter != TimetableDownloadFilter.CORE_ONLY:
                continue
            if effective_filter == TimetableDownloadFilter.ELECTIVE_ONLY and dest_filter != TimetableDownloadFilter.ELECTIVE_ONLY:
                continue
            centre = await get_examination_centre_or_404(session, exam_id, dest.centre_id)
            explicit_codes |= await get_candidate_schedule_codes_for_centre_scope(
                session,
                exam_id,
                school_scope,
                centre,
                subject_filter=dest_filter,
                programme_id=programme_id,
                filter_school_id=filter_school_id,
            )
    try:
        pdf = await build_school_timetable_pdf(
            session,
            exam_id,
            display_school.id,
            programme_id=programme_id,
            subject_filter=effective_filter,
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
    jwt_posting_id: InspectorJwtPostingIdDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL),
    programme_id: int | None = Query(default=None),
    filter_school_id: UUID | None = Query(
        default=None,
        description="Limit to candidates from this school (must be in your examination centre scope)",
    ),
    posting_id: UUID | None = Query(
        default=None,
        description="Inspector posting (workspace); overrides JWT when set; required when you have multiple postings.",
    ),
) -> TimetablePreviewResponse:
    user_school = await _school_from_user(
        session,
        user,
        examination_id=exam_id,
        jwt_inspector_posting_id=jwt_posting_id,
        posting_id=posting_id,
    )
    exam, centre_scope_ids, display_school, exam_centre, effective_filter, inspector_scope, workspace_centre = (
        await _staff_timetable_scope_context(
            session,
            exam_id,
            user,
            user_school,
            filter_school_id,
            subject_filter,
            jwt_posting_id=jwt_posting_id,
            posting_id=posting_id,
        )
    )
    if programme_id is not None:
        await _validate_programme_in_scope(session, programme_id, centre_scope_ids)
    is_account_centre_host = (
        await _supervisor_is_centre_host_for_exam(session, exam_id, user_school)
        if user.role == UserRole.SUPERVISOR
        else False
    )

    entries = await _staff_centre_timetable_entries(
        session,
        exam,
        exam_id,
        user,
        user_school,
        scope_ids=centre_scope_ids,
        exam_centre=exam_centre,
        workspace_centre=workspace_centre,
        centre_inspector_scope=inspector_scope,
        is_account_centre_host=is_account_centre_host,
        subject_filter=effective_filter,
        programme_id=programme_id,
        filter_school_id=filter_school_id,
    )
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
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(
        default=None,
        description="Inspector posting (workspace); overrides JWT when set; required when you have multiple postings.",
    ),
) -> StaffCentreOverviewResponse:
    """Centre-wide candidate count, school count, and next timetable slots for supervisors and inspectors."""
    try:
        exam = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    inspector_posted_workspaces: list[InspectorPostedWorkspaceItem] | None = None
    center_host: School
    user_school: School
    scope_ids: set[UUID]
    ordered_scope_schools: list[School]
    centre_inspector_scope: ExamInspectorSubjectScope | None = None
    workspace_centre: ExaminationCentre | None = None

    if user.role == UserRole.INSPECTOR:
        iposts = await load_postings_for_inspector_exam(
            session, examination_id=exam_id, inspector_user_id=user.id
        )
        if iposts:
            ctx = await resolve_inspector_workspace(
                session,
                examination_id=exam_id,
                user=user,
                posting_id=posting_id,
                jwt_posting_id=jwt_posting_id,
            )
            centre = ctx.examination_centre
            workspace_centre = centre
            center_host = await representative_school_for_centre(session, centre)
            if center_host is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Centre has no schools",
                )
            user_school = center_host
            scope_ids = ctx.scope_ids
            centre_inspector_scope = ctx.subject_scope
            ordered_scope_schools = await _schools_with_ids_ordered_by_code(session, scope_ids)
            ws_items: list[InspectorPostedWorkspaceItem] = []
            for p in iposts:
                cen = await session.get(ExaminationCentre, p.examination_centre_id)
                if cen is None:
                    continue
                st_scope = p.subject_scope
                if isinstance(st_scope, ExamInspectorSubjectScope):
                    scope_str = st_scope.value
                else:
                    scope_str = str(st_scope)
                ws_items.append(
                    InspectorPostedWorkspaceItem(
                        posting_id=p.id,
                        center_id=p.examination_centre_id,
                        center_code=cen.code,
                        center_name=cen.name,
                        subject_scope=scope_str,
                    )
                )
            inspector_posted_workspaces = ws_items
        else:
            user_school = await _school_from_user(
                session,
                user,
                examination_id=exam_id,
                jwt_inspector_posting_id=jwt_posting_id,
                posting_id=posting_id,
            )
            scope_ids = await _centre_scope_ids_for_staff_user(
                session,
                user,
                user_school,
                exam_id,
                jwt_inspector_posting_id=jwt_posting_id,
                posting_id=posting_id,
            )
            ordered_scope_schools = await _schools_with_ids_ordered_by_code(session, scope_ids)
    else:
        user_school = await _school_from_user(
            session,
            user,
            examination_id=exam_id,
            jwt_inspector_posting_id=jwt_posting_id,
            posting_id=posting_id,
        )
        scope_ids = await _centre_scope_ids_for_staff_user(
            session,
            user,
            user_school,
            exam_id,
            jwt_inspector_posting_id=jwt_posting_id,
            posting_id=posting_id,
        )
        ordered_scope_schools = await _schools_with_ids_ordered_by_code(session, scope_ids)

    write_destinations = await list_candidate_write_destinations_for_school(
        session, exam_id, user_school.id
    )
    primary_destination = write_destinations[0]
    if centre_inspector_scope is None:
        centre_inspector_scope = await inspector_scope_for_member_school(
            session, exam_id, user_school.id
        )
    exam_centre = await get_examination_centre_or_404(
        session, exam_id, primary_destination.centre_id
    )
    host_school = await representative_school_for_centre(session, exam_centre)
    examination_centre_region = primary_destination.centre_region

    is_centre_host = school_code_matches_centre_code(user_school.code, str(exam_centre.code))
    is_inspector = user.role == UserRole.INSPECTOR
    if is_inspector:
        stats_scope_ids = scope_ids
    else:
        stats_scope_ids = _dashboard_stats_scope_ids(
            user, user_school, scope_ids, is_centre_host=is_centre_host
        )
        if not is_centre_host:
            ordered_scope_schools = await _schools_with_ids_ordered_by_code(session, stats_scope_ids)

    centre_subject_scope_str: str | None = None
    if is_inspector:
        scope_val = centre_inspector_scope
        if isinstance(scope_val, ExamInspectorSubjectScope):
            centre_subject_scope_str = scope_val.value
        elif scope_val is not None:
            centre_subject_scope_str = str(scope_val)

    cand_stmt = select(func.count()).select_from(ExaminationCandidate).where(
        ExaminationCandidate.examination_id == exam_id,
        ExaminationCandidate.school_id.in_(stats_scope_ids),
    )
    candidate_count = int((await session.execute(cand_stmt)).scalar_one())
    cand_by_school_stmt = (
        select(ExaminationCandidate.school_id, func.count().label("candidate_count"))
        .where(
            ExaminationCandidate.examination_id == exam_id,
            ExaminationCandidate.school_id.in_(stats_scope_ids),
        )
        .group_by(ExaminationCandidate.school_id)
    )
    cand_by_school_rows = await session.execute(cand_by_school_stmt)
    cand_by_school = {row[0]: int(row[1]) for row in cand_by_school_rows.all()}
    schools_with_candidates = _filter_schools_with_registered_candidates(
        ordered_scope_schools,
        cand_by_school,
    )
    school_count = len(schools_with_candidates)

    timetable_filter = TimetableDownloadFilter.ALL
    if centre_inspector_scope is not None:
        timetable_filter = timetable_filter_for_inspector_scope(centre_inspector_scope)
    is_account_centre_host = (
        await _supervisor_is_centre_host_for_exam(session, exam_id, user_school)
        if user.role == UserRole.SUPERVISOR
        else False
    )

    entries = await _staff_centre_timetable_entries(
        session,
        exam,
        exam_id,
        user,
        user_school,
        scope_ids=scope_ids,
        exam_centre=exam_centre,
        workspace_centre=workspace_centre,
        centre_inspector_scope=centre_inspector_scope,
        is_account_centre_host=is_account_centre_host,
        subject_filter=timetable_filter,
    )
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
        examination_centre_host_school_id=host_school.id if host_school is not None else exam_centre.id,
        examination_centre_host_code=(
            host_school.code if host_school is not None else primary_destination.centre_code
        ),
        examination_centre_host_name=(
            host_school.name if host_school is not None else primary_destination.centre_name
        ),
        supervisor_school_is_centre_host=is_centre_host,
        centre_structure_mode=(
            exam.centre_structure_mode.value
            if hasattr(exam.centre_structure_mode, "value")
            else str(exam.centre_structure_mode)
        ),
        candidate_write_destinations=write_destinations,
        dashboard_viewer="inspector" if is_inspector else "supervisor",
        centre_subject_scope=centre_subject_scope_str,
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
            for s in schools_with_candidates
        ],
        inspector_posted_workspaces=inspector_posted_workspaces,
    )


@router.get("/{exam_id}/my-inspector-postings", response_model=MyInspectorPostingsResponse)
async def get_my_inspector_postings(
    exam_id: int,
    session: DBSessionDep,
    user: InspectorDep,
) -> MyInspectorPostingsResponse:
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None
    postings = await load_postings_for_inspector_exam(
        session, examination_id=exam_id, inspector_user_id=user.id
    )
    rows: list[MyInspectorPostingRow] = []
    for p in postings:
        cen = await session.get(ExaminationCentre, p.examination_centre_id)
        if cen is None:
            continue
        st_scope = p.subject_scope
        if isinstance(st_scope, ExamInspectorSubjectScope):
            scope_str = st_scope.value
        else:
            scope_str = str(st_scope)
        rows.append(
            MyInspectorPostingRow(
                id=p.id,
                center_id=p.examination_centre_id,
                center_code=cen.code,
                center_name=cen.name,
                subject_scope=scope_str,
            )
        )
    return MyInspectorPostingsResponse(items=rows)


@router.get("/{exam_id}/my-center-day-summary", response_model=StaffCentreDaySummaryResponse)
async def get_my_center_day_summary(
    exam_id: int,
    examination_date: date,
    session: DBSessionDep,
    user: SupervisorOrInspectorDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
    posting_id: UUID | None = Query(
        default=None,
        description="Inspector posting (workspace); overrides JWT when set; required when you have multiple postings.",
    ),
    subject_filter: TimetableDownloadFilter | None = Query(
        default=None,
        description="On SPLIT examinations: CORE_ONLY or ELECTIVE_ONLY limits schools and papers to that scope.",
    ),
) -> StaffCentreDaySummaryResponse:
    """Per-day candidate counts by slot and school; invigilators from unique candidates."""
    try:
        exam = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    user_school = await _school_from_user(
        session,
        user,
        examination_id=exam_id,
        jwt_inspector_posting_id=jwt_posting_id,
        posting_id=posting_id,
    )
    centre_scope_ids, _center_host = await _staff_scope_and_display_school(
        session,
        user,
        user_school,
        None,
        exam_id,
        jwt_inspector_posting_id=jwt_posting_id,
        posting_id=posting_id,
    )
    exam_centre, inspector_scope = await _examination_centre_for_staff_day_summary(
        session,
        exam_id,
        user,
        user_school,
        requested_filter=subject_filter,
        jwt_posting_id=jwt_posting_id,
        posting_id=posting_id,
    )
    workspace_centre: ExaminationCentre | None = None
    if user.role == UserRole.INSPECTOR:
        iposts = await load_postings_for_inspector_exam(
            session, examination_id=exam_id, inspector_user_id=user.id
        )
        if iposts:
            ctx = await resolve_inspector_workspace(
                session,
                examination_id=exam_id,
                user=user,
                posting_id=posting_id,
                jwt_posting_id=jwt_posting_id,
            )
            workspace_centre = ctx.examination_centre
            inspector_scope = ctx.subject_scope
    is_account_centre_host = (
        await _supervisor_is_centre_host_for_exam(session, exam_id, user_school)
        if user.role == UserRole.SUPERVISOR
        else False
    )
    effective_filter = _effective_timetable_subject_filter(
        requested=subject_filter,
        inspector_scope=inspector_scope,
    )
    split_destinations = await _supervisor_split_write_destinations(
        session, exam, user_school.id
    )
    if split_destinations is not None and user.role == UserRole.SUPERVISOR:
        summary_scope_ids = {user_school.id}
    else:
        summary_scope_ids = await _day_summary_scope_ids(
            session,
            exam,
            user,
            user_school,
            centre_scope_ids,
            exam_centre,
            effective_filter=effective_filter,
            is_account_centre_host=is_account_centre_host,
        )
    ordered_schools = await _schools_with_ids_ordered_by_code(session, summary_scope_ids)

    entries = await _staff_centre_timetable_entries(
        session,
        exam,
        exam_id,
        user,
        user_school,
        scope_ids=centre_scope_ids,
        exam_centre=exam_centre,
        workspace_centre=workspace_centre,
        centre_inspector_scope=inspector_scope,
        is_account_centre_host=is_account_centre_host,
        subject_filter=effective_filter,
    )

    return await _build_staff_day_summary_for_scope(
        session,
        exam_id,
        examination_date,
        summary_scope_ids,
        ordered_schools,
        subject_filter=effective_filter,
        preloaded_entries=entries,
    )


_NATIONAL_PLACEHOLDER_CENTRE_ID = UUID("00000000-0000-0000-0000-000000000000")


@router.get("/{exam_id}/national-overview", response_model=NationalExecutiveOverviewResponse)
async def get_national_overview(
    exam_id: int,
    session: DBSessionDep,
    _: TopLevelOfficerDep,
    include_centres: bool = Query(
        default=True,
        description="When false, omit per-centre rows and return centre_count only (faster monitoring home).",
    ),
) -> NationalExecutiveOverviewResponse:
    """All schools with registered candidates: today's papers and upcoming sessions (monitoring)."""
    try:
        exam = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    scope_ids = await _national_candidate_school_ids(session, exam_id)
    ordered_schools = await _schools_with_ids_ordered_by_code(session, scope_ids)
    school_count = len(scope_ids)

    if not scope_ids:
        empty = StaffCentreOverviewResponse(
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
        return NationalExecutiveOverviewResponse(**empty.model_dump(), centres=[], centre_count=0)

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
    base = StaffCentreOverviewResponse(
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
    return await build_national_executive_overview(
        session,
        exam_id,
        base,
        scope_ids,
        include_centres=include_centres,
    )


@router.get(
    "/{exam_id}/centres/{center_id}/executive-detail",
    response_model=ExecutiveCentreDetailResponse,
)
async def get_executive_centre_detail(
    exam_id: int,
    center_id: UUID,
    session: DBSessionDep,
    _: TopLevelOfficerDep,
) -> ExecutiveCentreDetailResponse:
    """Centre summary and posted inspectors for senior management drill-down."""
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None
    try:
        return await build_executive_centre_detail(session, exam_id, center_id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.get("/{exam_id}/national-day-summary", response_model=StaffCentreDaySummaryResponse)
async def get_national_day_summary(
    exam_id: int,
    examination_date: date,
    session: DBSessionDep,
    _: TopLevelOfficerDep,
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


async def _finance_centre_hosts(
    session: DBSessionDep,
    exam_id: int,
    centre_id: UUID | None,
) -> list[ExaminationCentre]:
    if centre_id is not None:
        return [await get_examination_centre_or_404(session, exam_id, centre_id)]
    return await list_centres_for_examination(session, exam_id)


async def _build_finance_centre_invigilator_item(
    session: DBSessionDep,
    exam_id: int,
    centre: ExaminationCentre,
    subject_filter: TimetableDownloadFilter,
) -> FinanceCentreInvigilatorSummaryItem:
    empty = FinanceCentreInvigilatorSummaryItem(
        center_id=centre.id,
        center_code=str(centre.code),
        center_name=str(centre.name),
        days=[],
    )

    exam = await load_examination_or_raise(session, exam_id)
    mode = exam.centre_structure_mode
    if isinstance(mode, str):
        mode = CentreStructureMode(mode)

    all_scope_ids = await centre_scope_school_ids_for_host_overview(session, centre)
    scope_ids = await scope_ids_for_centre_subject_filter(
        session,
        centre,
        all_scope_ids,
        subject_filter=subject_filter,
    )
    if not scope_ids:
        return empty

    ordered_schools = await _schools_with_ids_ordered_by_code(session, scope_ids)
    exam_centre = centre if mode == CentreStructureMode.SPLIT else None
    entries = await _staff_center_filtered_timetable_entries(
        session,
        exam_id,
        scope_ids,
        subject_filter=subject_filter,
        exam_centre=exam_centre,
    )
    dates_sorted = sorted({e.examination_date for e in entries})
    day_rows: list[FinanceCentreDayInvigilatorRow] = []
    for d in dates_sorted:
        summary = await _build_staff_day_summary_for_scope(
            session,
            exam_id,
            d,
            scope_ids,
            ordered_schools,
            subject_filter=subject_filter,
            preloaded_entries=entries,
        )
        day_rows.append(
            FinanceCentreDayInvigilatorRow(
                examination_date=d,
                unique_candidates=summary.unique_candidates,
                invigilators_required=summary.invigilators_required,
            ),
        )
    return FinanceCentreInvigilatorSummaryItem(
        center_id=centre.id,
        center_code=str(centre.code),
        center_name=str(centre.name),
        days=day_rows,
    )


async def _finance_examination_dates_for_filter(
    session: DBSessionDep,
    exam_id: int,
    subject_filter: TimetableDownloadFilter,
) -> list[date]:
    scope_ids = await _national_candidate_school_ids(session, exam_id)
    if not scope_ids:
        return []
    entries = await _staff_center_filtered_timetable_entries(
        session, exam_id, scope_ids, subject_filter=subject_filter
    )
    return sorted({e.examination_date for e in entries})


@router.get(
    "/{exam_id}/finance/centre-invigilator-summary/shell",
    response_model=FinanceCentreInvigilatorSummaryShellResponse,
)
async def get_finance_centre_invigilator_summary_shell(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
    subject_filter: TimetableDownloadFilter = Query(
        TimetableDownloadFilter.ALL,
        description="Subject scope used to determine which examination dates appear as columns.",
    ),
) -> FinanceCentreInvigilatorSummaryShellResponse:
    """Centre names and column dates only; load per-centre invigilator counts separately."""
    from app.services.finance_official_statistics import list_centres_for_official_statistics

    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    centres = await list_centres_for_official_statistics(session, exam_id, subject_filter)
    examination_dates = await _finance_examination_dates_for_filter(session, exam_id, subject_filter)
    return FinanceCentreInvigilatorSummaryShellResponse(
        examination_id=exam_id,
        examination_dates=examination_dates,
        centres=[
            FinanceCentreShellCentre(
                center_id=c.id,
                center_code=str(c.code),
                center_name=str(c.name),
            )
            for c in centres
        ],
    )


@router.get(
    "/{exam_id}/finance/centre-invigilator-summary/centres/{center_host_id}",
    response_model=FinanceCentreInvigilatorSummaryItem,
)
async def get_finance_centre_invigilator_summary_for_centre(
    exam_id: int,
    center_host_id: UUID,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
    subject_filter: TimetableDownloadFilter = Query(
        TimetableDownloadFilter.ALL,
        description="Subject scope for invigilator counts at this centre.",
    ),
) -> FinanceCentreInvigilatorSummaryItem:
    """Invigilator counts per day for one examination centre host."""
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    hosts = await _finance_centre_hosts(session, exam_id, center_host_id)
    return await _build_finance_centre_invigilator_item(session, exam_id, hosts[0], subject_filter)


@router.get(
    "/{exam_id}/finance/centre-invigilator-summary",
    response_model=FinanceCentreInvigilatorSummaryResponse,
)
async def get_finance_centre_invigilator_summary(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
    center_host_id: UUID | None = Query(
        None,
        description="Optional examination centre host school id; when set, only that centre is included.",
    ),
    subject_filter: TimetableDownloadFilter = Query(
        TimetableDownloadFilter.ALL,
        description="Which subject types determine schedule dates and per-day invigilator counts: all, core only, or electives only.",
    ),
) -> FinanceCentreInvigilatorSummaryResponse:
    """Per-centre, per-day unique candidates and invigilators (ceil(candidates/30)) for finance reporting."""
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    centre_list = await _finance_centre_hosts(session, exam_id, center_host_id)
    centres_out: list[FinanceCentreInvigilatorSummaryItem] = []
    for centre in centre_list:
        centres_out.append(
            await _build_finance_centre_invigilator_item(
                session, exam_id, centre, subject_filter
            ),
        )

    return FinanceCentreInvigilatorSummaryResponse(examination_id=exam_id, centres=centres_out)


@router.get(
    "/{exam_id}/finance/centre-school-summary",
    response_model=FinanceCentreSchoolSummaryResponse,
)
async def get_finance_centre_school_summary(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
    center_id: UUID = Query(..., description="Examination centre host school id"),
    subject_filter: TimetableDownloadFilter = Query(
        TimetableDownloadFilter.ALL,
        description="Subject scope for expected invigilation totals.",
    ),
) -> FinanceCentreSchoolSummaryResponse:
    """Per-centre allowance summary: expected invigilations, role counts, and official roster."""
    from app.services.finance_school_summary import build_finance_centre_school_summary

    try:
        ex = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    hosts = await _finance_centre_hosts(session, exam_id, center_id)
    centre = hosts[0]
    if not await centre_has_membership_for_subject_filter(
        session, centre, subject_filter=subject_filter
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examination centre has no schools for this subject scope",
        )
    return await build_finance_centre_school_summary(
        session,
        ex,
        centre,
        subject_filter,
        build_invigilator_item=_build_finance_centre_invigilator_item,
    )


@router.get("/{exam_id}/finance/centre-school-summary/export")
async def export_finance_centre_school_summary(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
    center_id: UUID = Query(..., description="Examination centre host school id"),
    subject_filter: TimetableDownloadFilter = Query(
        TimetableDownloadFilter.ALL,
        description="Subject scope suffix for export filename and expected invigilation summary rows.",
    ),
) -> Response:
    """Export centre official account details to Excel."""
    from app.services.exam_official_export import (
        examination_label,
        workbook_bytes,
        workbook_for_centre,
    )
    from app.services.finance_school_summary import (
        build_finance_centre_school_summary,
        load_officials_for_centre,
        school_summary_export_filename,
        subject_filter_filename_suffix,
    )

    try:
        ex = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    hosts = await _finance_centre_hosts(session, exam_id, center_id)
    centre = hosts[0]
    if not await centre_has_membership_for_subject_filter(
        session, centre, subject_filter=subject_filter
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examination centre has no schools for this subject scope",
        )
    summary = await build_finance_centre_school_summary(
        session,
        ex,
        centre,
        subject_filter,
        build_invigilator_item=_build_finance_centre_invigilator_item,
    )

    pairs = await load_officials_for_centre(
        session, exam_id, center_id, subject_filter=subject_filter
    )
    scope_label = subject_filter_filename_suffix(subject_filter)
    preamble = [
        ("Expected invigilations", summary.expected_invigilations_total),
        ("Invigilator days declared", summary.invigilator_days_declared),
        ("Variance (declared − expected)", summary.variance),
        ("Subject scope", scope_label),
    ]
    from app.services.exam_official_compensation import load_designation_rates_map

    exam_label = examination_label(ex)
    rates_map = await load_designation_rates_map(session, exam_id)
    wb = workbook_for_centre(centre, exam_label, pairs, preamble_rows=preamble, rates_by_designation=rates_map)
    payload = workbook_bytes(wb)
    filename = school_summary_export_filename(
        summary.center_code,
        summary.center_name,
        subject_filter,
    )
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/{exam_id}/finance/centre-official-statistics/shell",
    response_model=FinanceCentreOfficialStatisticsShellResponse,
)
async def get_finance_centre_official_statistics_shell(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminDep,
    subject_filter: TimetableDownloadFilter = Query(
        ...,
        description="Subject scope for centre list and official counts.",
    ),
) -> FinanceCentreOfficialStatisticsShellResponse:
    """Centre list only; load per-centre statistics separately."""
    from app.services.finance_official_statistics import build_official_statistics_shell

    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    return await build_official_statistics_shell(session, exam_id, subject_filter)


@router.get(
    "/{exam_id}/finance/centre-official-statistics/centres/{center_host_id}",
    response_model=FinanceCentreOfficialStatisticsRow,
)
async def get_finance_centre_official_statistics_for_centre(
    exam_id: int,
    center_host_id: UUID,
    session: DBSessionDep,
    _: SuperAdminDep,
    subject_filter: TimetableDownloadFilter = Query(
        ...,
        description="Subject scope for official counts at this centre.",
    ),
) -> FinanceCentreOfficialStatisticsRow:
    """Official statistics for one examination centre."""
    from app.services.finance_official_statistics import build_statistics_row_for_centre

    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    hosts = await _finance_centre_hosts(session, exam_id, center_host_id)
    return await build_statistics_row_for_centre(
        session,
        exam_id,
        hosts[0],
        subject_filter,
        build_invigilator_item=_build_finance_centre_invigilator_item,
    )


@router.get(
    "/{exam_id}/finance/centre-official-statistics",
    response_model=FinanceCentreOfficialStatisticsResponse,
)
async def get_finance_centre_official_statistics(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminDep,
    subject_filter: TimetableDownloadFilter = Query(
        TimetableDownloadFilter.ALL,
        description="Subject scope for official counts: all, core only, or electives only.",
    ),
) -> FinanceCentreOfficialStatisticsResponse:
    """Per-centre headcounts for all examination official roles (super admin only)."""
    from app.services.finance_official_statistics import build_finance_centre_official_statistics

    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    return await build_finance_centre_official_statistics(
        session,
        exam_id,
        subject_filter,
        build_invigilator_item=_build_finance_centre_invigilator_item,
    )


@router.post("/{exam_id}/finance/centre-official-statistics/export")
async def export_finance_centre_official_statistics(
    exam_id: int,
    body: FinanceCentreOfficialStatisticsExportBody,
    session: DBSessionDep,
    _: SuperAdminDep,
) -> StreamingResponse:
    """Export pre-loaded official statistics to Excel without recalculating."""
    from app.schemas.timetable import TimetableDownloadFilter
    from app.services.finance_official_statistics_export import (
        official_statistics_export_filename,
        official_statistics_workbook_bytes,
    )

    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    if body.summary.examination_id != exam_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Summary examination_id does not match path",
        )

    try:
        subject_filter = TimetableDownloadFilter(body.summary.subject_filter)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid subject_filter in summary",
        ) from None

    payload = official_statistics_workbook_bytes(
        body.summary.centres,
        totals=body.summary.totals,
        exam_label=body.exam_label,
        subject_filter=subject_filter,
    )
    filename = official_statistics_export_filename(body.exam_label, subject_filter)
    from app.utils.content_disposition import content_disposition_attachment

    return StreamingResponse(
        iter([payload]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": content_disposition_attachment(filename)},
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
