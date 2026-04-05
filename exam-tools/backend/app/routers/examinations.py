"""Examination and schedule CRUD; timetable download (admin + school-scoped)."""

import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError

from app.dependencies.auth import SuperAdminDep, SupervisorOrInspectorDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, ExaminationSchedule, School, Subject, User, UserRole, school_programmes
from app.schemas.examination import (
    ExaminationCreate,
    ExaminationResponse,
    ExaminationScheduleBulkUploadError,
    ExaminationScheduleBulkUploadResponse,
    ExaminationScheduleCreate,
    ExaminationScheduleResponse,
    ExaminationScheduleUpdate,
    ExaminationUpdate,
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
from app.services.template_generator import generate_schedule_template

router = APIRouter(prefix="/examinations", tags=["examinations"])


def _sanitize_filename_part(s: str) -> str:
    return "".join(c for c in s if c.isalnum() or c in ("_", "-"))


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
    _: SuperAdminDep,
) -> list[ExaminationResponse]:
    stmt = select(Examination).order_by(Examination.year.desc(), Examination.id.desc())
    result = await session.execute(stmt)
    return [ExaminationResponse.model_validate(e) for e in result.scalars().all()]


@router.get("/public-list", response_model=list[ExaminationResponse])
async def list_examinations_for_staff(
    session: DBSessionDep,
    user: SupervisorOrInspectorDep,
) -> list[ExaminationResponse]:
    _ = user
    stmt = select(Examination).order_by(Examination.year.desc(), Examination.id.desc())
    result = await session.execute(stmt)
    return [ExaminationResponse.model_validate(e) for e in result.scalars().all()]


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


@router.get("/{exam_id}/timetable/my-school/pdf")
async def download_my_school_timetable_pdf(
    exam_id: int,
    session: DBSessionDep,
    user: SupervisorOrInspectorDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL),
    programme_id: int | None = Query(default=None),
    merge_by_date: bool = Query(default=False, description="Merge subjects written on the same day"),
    orientation: str = Query(default="portrait", description="Page orientation: portrait or landscape"),
) -> Response:
    school = await _school_from_user(session, user)
    if programme_id is not None:
        assoc_stmt = select(school_programmes).where(
            school_programmes.c.school_id == school.id,
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
            school.id,
            programme_id=programme_id,
            subject_filter=subject_filter,
            merge_by_date=merge_by_date,
            orientation=orientation,
        )
    except ValueError as e:
        detail = str(e) if str(e) else "Not found"
        if "Programme not found" in detail:
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


@router.get("/{exam_id}/timetable/my-school/preview", response_model=TimetablePreviewResponse)
async def preview_my_school_timetable(
    exam_id: int,
    session: DBSessionDep,
    user: SupervisorOrInspectorDep,
    subject_filter: TimetableDownloadFilter = Query(default=TimetableDownloadFilter.ALL),
    programme_id: int | None = Query(default=None),
) -> TimetablePreviewResponse:
    school = await _school_from_user(session, user)
    try:
        exam = await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    schedule_codes = await get_school_subject_schedule_codes(session, school.id)
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
