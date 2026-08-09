"""Generate score sheet IDs and assign them to SubjectScore records."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models import (
    Candidate,
    Exam,
    ExamRegistration,
    ExamSubject,
    ProcessStatus,
    ProcessTracking,
    ProcessType,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
)

logger = logging.getLogger(__name__)

BATCH_SIZE = 25
IN_CHUNK_SIZE = 10000


def generate_sheet_id(school_code: str, subject_code: str, series: int, test_type: int, sheet_number: int) -> str:
    """
    Generate a 13-character sheet ID.

    Format: SCHOOL_CODE(6) + SUBJECT_CODE(3) + SERIES(1) + TEST_TYPE(1) + SHEET_NUMBER(2)
    """
    school_code_padded = school_code[-6:].upper().rjust(6, "0")
    subject_code_padded = subject_code[:3].upper().ljust(3, "0")

    if series < 1 or series > 9:
        raise ValueError(f"Series must be between 1 and 9, got {series}")
    series_str = str(series)

    if test_type not in [1, 2]:
        raise ValueError(f"Test type must be 1 or 2, got {test_type}")
    test_type_str = str(test_type)

    if sheet_number < 1 or sheet_number > 99:
        raise ValueError(f"Sheet number must be between 1 and 99, got {sheet_number}")
    sheet_number_padded = f"{sheet_number:02d}"

    return school_code_padded + subject_code_padded + series_str + test_type_str + sheet_number_padded


def sort_key_index_number(candidate: Candidate) -> str:
    """Sort key that uses string comparison for index_number."""
    return candidate.index_number


def _chunked[T](items: list[T], size: int = IN_CHUNK_SIZE):
    for i in range(0, len(items), size):
        yield items[i : i + size]


async def count_schools_for_score_sheets(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
    subject_id: int | None = None,
) -> int:
    """Count distinct schools with subject registrations for the exam."""
    stmt = (
        select(func.count(func.distinct(Candidate.school_id)))
        .select_from(Candidate)
        .join(ExamRegistration, Candidate.id == ExamRegistration.candidate_id)
        .join(SubjectRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .where(ExamRegistration.exam_id == exam_id)
    )
    if school_id is not None:
        stmt = stmt.where(Candidate.school_id == school_id)
    if subject_id is not None:
        stmt = stmt.where(ExamSubject.subject_id == subject_id)
    result = await session.execute(stmt)
    return int(result.scalar() or 0)


async def list_school_ids_for_score_sheets(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
    subject_id: int | None = None,
) -> list[int]:
    """Return ordered school IDs that have subject registrations for the exam."""
    if school_id is not None:
        exists_stmt = (
            select(Candidate.id)
            .join(ExamRegistration, Candidate.id == ExamRegistration.candidate_id)
            .join(SubjectRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
            .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
            .where(ExamRegistration.exam_id == exam_id, Candidate.school_id == school_id)
            .limit(1)
        )
        if subject_id is not None:
            exists_stmt = exists_stmt.where(ExamSubject.subject_id == subject_id)
        exists = (await session.execute(exists_stmt)).scalar_one_or_none()
        return [school_id] if exists is not None else []

    stmt = (
        select(Candidate.school_id)
        .join(ExamRegistration, Candidate.id == ExamRegistration.candidate_id)
        .join(SubjectRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .where(ExamRegistration.exam_id == exam_id)
        .distinct()
        .order_by(Candidate.school_id)
    )
    if subject_id is not None:
        stmt = stmt.where(ExamSubject.subject_id == subject_id)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def _update_job_tracking(
    session: AsyncSession,
    tracking: ProcessTracking,
    *,
    status: ProcessStatus | None = None,
    metadata: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> None:
    if status is not None:
        tracking.status = status
        if status == ProcessStatus.IN_PROGRESS and tracking.started_at is None:
            tracking.started_at = datetime.utcnow()
        if status in (ProcessStatus.COMPLETED, ProcessStatus.FAILED):
            tracking.completed_at = datetime.utcnow()

    if error_message is not None:
        tracking.error_message = error_message

    if metadata is not None:
        tracking.process_metadata = metadata
        flag_modified(tracking, "process_metadata")

    await session.commit()


async def _prefetch_scores(
    session: AsyncSession,
    registration_ids: list[int],
) -> dict[int, SubjectScore]:
    """Load SubjectScore rows for registration IDs in chunks."""
    scores_by_reg: dict[int, SubjectScore] = {}
    for chunk in _chunked(registration_ids):
        result = await session.execute(
            select(SubjectScore).where(SubjectScore.subject_registration_id.in_(chunk))
        )
        for score in result.scalars().all():
            scores_by_reg[score.subject_registration_id] = score
    return scores_by_reg


async def _process_school_score_sheets(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int,
    subject_id: int | None,
    test_types: list[int],
) -> dict[str, Any]:
    """
    Assign sheet IDs for one school.

    Returns school/subject stats and per-(school, subject) tracking payloads.
    """
    base_stmt = (
        select(
            SubjectRegistration,
            ExamRegistration,
            Candidate,
            School,
            ExamSubject,
            Subject,
        )
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(ExamRegistration.exam_id == exam_id, Candidate.school_id == school_id)
    )
    if subject_id is not None:
        base_stmt = base_stmt.where(Subject.id == subject_id)

    result = await session.execute(base_stmt)
    rows = result.all()
    if not rows:
        return {
            "school": None,
            "subjects": {},
            "sheets_by_series": {},
            "total_sheets": 0,
            "total_assignments": 0,
            "tracking": {},
        }

    grouped: dict[tuple[int, int | None], list[tuple]] = {}
    for row in rows:
        subject_reg, exam_reg, candidate, school, exam_subject, subject = row
        key = (subject.id, subject_reg.series)
        grouped.setdefault(key, []).append(
            (subject_reg, exam_reg, candidate, school, exam_subject, subject)
        )

    for key in grouped:
        grouped[key].sort(key=lambda r: sort_key_index_number(r[2]))

    registration_ids = [row[0].id for row in rows]
    scores_by_reg = await _prefetch_scores(session, registration_ids)

    missing_scores: list[SubjectScore] = []
    for reg_id in registration_ids:
        if reg_id not in scores_by_reg:
            score = SubjectScore(
                subject_registration_id=reg_id,
                obj_raw_score=None,
                essay_raw_score=None,
                pract_raw_score=None,
                obj_normalized=None,
                essay_normalized=None,
                pract_normalized=None,
                total_score=0.0,
                obj_document_id=None,
                essay_document_id=None,
                pract_document_id=None,
            )
            missing_scores.append(score)
            scores_by_reg[reg_id] = score

    if missing_scores:
        session.add_all(missing_scores)
        await session.flush()

    school = rows[0][3]
    school_stats = {
        "school_id": school_id,
        "school_name": school.name,
        "sheets_count": 0,
        "candidates_count": 0,
    }
    subjects_stats: dict[int, dict[str, Any]] = {}
    sheets_by_series: dict[int, int] = {}
    tracking_data: dict[tuple[int, int], dict[str, Any]] = {}
    total_sheets = 0
    total_assignments = 0

    # subject -> series -> rows
    nested: dict[int, dict[int | None, list[tuple]]] = {}
    for (subj_id, series), rows_group in grouped.items():
        nested.setdefault(subj_id, {})[series] = rows_group

    for subject_id_key in sorted(nested.keys()):
        first_row = next(iter(nested[subject_id_key].values()))[0]
        subject = first_row[5]
        subjects_stats[subject_id_key] = {
            "subject_id": subject_id_key,
            "subject_code": subject.code,
            "subject_name": subject.name,
            "sheets_count": 0,
            "candidates_count": 0,
        }
        tracking_key = (school_id, subject_id_key)
        tracking_data[tracking_key] = {
            "school_id": school_id,
            "subject_id": subject_id_key,
            "test_types": test_types,
            "sheets_generated": 0,
            "candidates_assigned": 0,
        }

        series_list = sorted(
            nested[subject_id_key].keys(),
            key=lambda x: x if x is not None else 0,
        )
        for series in series_list:
            rows_group = nested[subject_id_key][series]
            subject = rows_group[0][5]
            school_obj = rows_group[0][3]
            effective_series = series if series is not None else 1

            if series is None:
                logger.warning(
                    "SubjectRegistration.series is NULL, defaulting to 1",
                    extra={
                        "school_id": school_id,
                        "subject_id": subject_id_key,
                        "candidates_count": len(rows_group),
                    },
                )

            for test_type in test_types:
                num_candidates = len(rows_group)
                num_batches = (num_candidates + BATCH_SIZE - 1) // BATCH_SIZE

                for batch_index in range(num_batches):
                    start_idx = batch_index * BATCH_SIZE
                    end_idx = min(start_idx + BATCH_SIZE, num_candidates)
                    batch = rows_group[start_idx:end_idx]
                    sheet_number = batch_index + 1

                    try:
                        sheet_id = generate_sheet_id(
                            school_code=school_obj.s_code,
                            subject_code=subject.code,
                            series=effective_series,
                            test_type=test_type,
                            sheet_number=sheet_number,
                        )
                    except ValueError as e:
                        logger.error(
                            "Failed to generate sheet ID: %s",
                            e,
                            extra={
                                "school_code": school_obj.code,
                                "subject_code": subject.code,
                                "series": effective_series,
                                "test_type": test_type,
                                "sheet_number": sheet_number,
                            },
                        )
                        continue

                    for subject_reg, *_rest in batch:
                        subject_score = scores_by_reg[subject_reg.id]
                        if test_type == 1:
                            subject_score.obj_document_id = sheet_id
                        elif test_type == 2:
                            subject_score.essay_document_id = sheet_id
                        total_assignments += 1

                    total_sheets += 1
                    school_stats["sheets_count"] += 1
                    school_stats["candidates_count"] += len(batch)
                    subjects_stats[subject_id_key]["sheets_count"] += 1
                    subjects_stats[subject_id_key]["candidates_count"] += len(batch)
                    tracking_data[tracking_key]["sheets_generated"] += 1
                    tracking_data[tracking_key]["candidates_assigned"] += len(batch)

                    if series is not None:
                        sheets_by_series[series] = sheets_by_series.get(series, 0) + 1

    await session.commit()

    # Per-(school, subject) dashboard tracking: replace prior completed rows for this combo
    for (school_id_key, subject_id_key), data in tracking_data.items():
        await session.execute(
            delete(ProcessTracking).where(
                ProcessTracking.exam_id == exam_id,
                ProcessTracking.process_type == ProcessType.SCORE_SHEET_GENERATION,
                ProcessTracking.school_id == school_id_key,
                ProcessTracking.subject_id == subject_id_key,
                ProcessTracking.status == ProcessStatus.COMPLETED,
            )
        )
        session.add(
            ProcessTracking(
                exam_id=exam_id,
                process_type=ProcessType.SCORE_SHEET_GENERATION,
                school_id=school_id_key,
                subject_id=subject_id_key,
                status=ProcessStatus.COMPLETED,
                process_metadata={
                    "test_types": data["test_types"],
                    "sheets_generated": data["sheets_generated"],
                    "candidates_assigned": data["candidates_assigned"],
                },
                started_at=datetime.utcnow(),
                completed_at=datetime.utcnow(),
            )
        )
    await session.commit()

    return {
        "school": school_stats,
        "subjects": subjects_stats,
        "sheets_by_series": sheets_by_series,
        "total_sheets": total_sheets,
        "total_assignments": total_assignments,
        "tracking": tracking_data,
    }


def _merge_subject_stats(
    target: dict[int, dict[str, Any]],
    incoming: dict[int, dict[str, Any]],
) -> None:
    for subject_id, info in incoming.items():
        if subject_id not in target:
            target[subject_id] = dict(info)
        else:
            target[subject_id]["sheets_count"] += info["sheets_count"]
            target[subject_id]["candidates_count"] += info["candidates_count"]


def _merge_series_counts(target: dict[int, int], incoming: dict[int, int]) -> None:
    for series, count in incoming.items():
        target[series] = target.get(series, 0) + count


async def process_score_sheet_generation_job(tracking_id: int) -> None:
    """Background entry: assign score sheet IDs school-by-school with progress updates."""
    from app.dependencies.database import get_sessionmanager

    sessionmanager = get_sessionmanager()
    async with sessionmanager.session() as session:
        tracking_result = await session.execute(
            select(ProcessTracking).where(ProcessTracking.id == tracking_id)
        )
        tracking = tracking_result.scalar_one_or_none()
        if not tracking:
            logger.error("Score sheet generation tracking %s not found", tracking_id)
            return

        metadata = dict(tracking.process_metadata or {})
        exam_id = tracking.exam_id
        school_id_filter = metadata.get("school_id")
        subject_id_filter = metadata.get("subject_id")
        test_types = metadata.get("test_types") or [1, 2]
        test_types = [int(t) for t in test_types]

        try:
            exam_result = await session.execute(select(Exam).where(Exam.id == exam_id))
            if not exam_result.scalar_one_or_none():
                raise ValueError(f"Exam with id {exam_id} not found")

            if school_id_filter is not None:
                school_result = await session.execute(
                    select(School).where(School.id == school_id_filter)
                )
                if not school_result.scalar_one_or_none():
                    raise ValueError(f"School with id {school_id_filter} not found")

            if subject_id_filter is not None:
                subject_result = await session.execute(
                    select(Subject).where(Subject.id == subject_id_filter)
                )
                if not subject_result.scalar_one_or_none():
                    raise ValueError(f"Subject with id {subject_id_filter} not found")

            for test_type in test_types:
                if test_type not in (1, 2):
                    raise ValueError(f"Test type must be 1 or 2, got {test_type}")

            school_ids = await list_school_ids_for_score_sheets(
                session, exam_id, school_id_filter, subject_id_filter
            )
            total_schools = len(school_ids)

            metadata.update(
                {
                    "total_schools": total_schools,
                    "processed_schools": 0,
                    "total_sheets_generated": 0,
                    "total_candidates_assigned": 0,
                    "schools_processed": [],
                    "subjects_processed": [],
                    "sheets_by_series": {},
                    "message": None,
                }
            )
            await _update_job_tracking(
                session,
                tracking,
                status=ProcessStatus.IN_PROGRESS,
                metadata=metadata,
            )

            if not school_ids:
                message = "No candidates found for score sheet generation"
                metadata.update({"message": message, "processed_schools": 0, "total_schools": 0})
                await _update_job_tracking(
                    session,
                    tracking,
                    status=ProcessStatus.COMPLETED,
                    metadata=metadata,
                )
                return

            schools_processed: list[dict[str, Any]] = []
            subjects_processed: dict[int, dict[str, Any]] = {}
            sheets_by_series: dict[int, int] = {}
            total_sheets = 0
            total_assignments = 0

            for idx, sid in enumerate(school_ids, start=1):
                school_result = await _process_school_score_sheets(
                    session,
                    exam_id=exam_id,
                    school_id=sid,
                    subject_id=subject_id_filter,
                    test_types=test_types,
                )

                if school_result["school"]:
                    schools_processed.append(school_result["school"])
                _merge_subject_stats(subjects_processed, school_result["subjects"])
                _merge_series_counts(sheets_by_series, school_result["sheets_by_series"])
                total_sheets += school_result["total_sheets"]
                total_assignments += school_result["total_assignments"]

                tracking_result = await session.execute(
                    select(ProcessTracking).where(ProcessTracking.id == tracking_id)
                )
                tracking = tracking_result.scalar_one()

                subjects_list = list(subjects_processed.values())
                metadata.update(
                    {
                        "processed_schools": idx,
                        "total_schools": total_schools,
                        "total_sheets_generated": total_sheets,
                        "total_candidates_assigned": total_assignments,
                        "schools_processed": schools_processed,
                        "subjects_processed": subjects_list,
                        "sheets_by_series": {str(k): v for k, v in sheets_by_series.items()},
                    }
                )
                await _update_job_tracking(session, tracking, metadata=metadata)

            subjects_list = list(subjects_processed.values())
            message = (
                f"Successfully generated {total_sheets} score sheet(s) "
                f"for {total_assignments} candidate assignment(s) "
                f"across {len(schools_processed)} school(s) and {len(subjects_list)} subject(s)."
            )
            metadata.update(
                {
                    "processed_schools": total_schools,
                    "total_schools": total_schools,
                    "total_sheets_generated": total_sheets,
                    "total_candidates_assigned": total_assignments,
                    "schools_processed": schools_processed,
                    "subjects_processed": subjects_list,
                    "sheets_by_series": {str(k): v for k, v in sheets_by_series.items()},
                    "message": message,
                }
            )
            await _update_job_tracking(
                session,
                tracking,
                status=ProcessStatus.COMPLETED,
                metadata=metadata,
            )

        except Exception as e:
            logger.exception("Score sheet generation job %s failed", tracking_id)
            try:
                tracking_result = await session.execute(
                    select(ProcessTracking).where(ProcessTracking.id == tracking_id)
                )
                tracking = tracking_result.scalar_one_or_none()
                if tracking:
                    metadata = dict(tracking.process_metadata or {})
                    metadata["message"] = f"Score sheet generation failed: {e}"
                    await _update_job_tracking(
                        session,
                        tracking,
                        status=ProcessStatus.FAILED,
                        metadata=metadata,
                        error_message=str(e),
                    )
            except Exception:
                logger.exception(
                    "Failed to mark score sheet generation job %s as failed", tracking_id
                )


async def generate_score_sheets(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
    subject_id: int | None = None,
    test_types: list[int] | None = None,
) -> dict[str, Any]:
    """
    Synchronous helper kept for compatibility: run generation inline.

    Prefer process_score_sheet_generation_job for the HTTP API.
    """
    if test_types is None:
        test_types = [1, 2]

    exam_result = await session.execute(select(Exam).where(Exam.id == exam_id))
    if not exam_result.scalar_one_or_none():
        raise ValueError(f"Exam with id {exam_id} not found")

    if school_id is not None:
        school_result = await session.execute(select(School).where(School.id == school_id))
        if not school_result.scalar_one_or_none():
            raise ValueError(f"School with id {school_id} not found")

    if subject_id is not None:
        subject_result = await session.execute(select(Subject).where(Subject.id == subject_id))
        if not subject_result.scalar_one_or_none():
            raise ValueError(f"Subject with id {subject_id} not found")

    for test_type in test_types:
        if test_type not in [1, 2]:
            raise ValueError(f"Test type must be 1 or 2, got {test_type}")

    school_ids = await list_school_ids_for_score_sheets(session, exam_id, school_id, subject_id)
    if not school_ids:
        return {
            "exam_id": exam_id,
            "total_sheets_generated": 0,
            "total_candidates_assigned": 0,
            "schools_processed": [],
            "subjects_processed": [],
            "sheets_by_series": {},
            "message": "No candidates found for score sheet generation",
        }

    schools_processed: list[dict[str, Any]] = []
    subjects_processed: dict[int, dict[str, Any]] = {}
    sheets_by_series: dict[int, int] = {}
    total_sheets = 0
    total_assignments = 0

    for sid in school_ids:
        school_result = await _process_school_score_sheets(
            session,
            exam_id=exam_id,
            school_id=sid,
            subject_id=subject_id,
            test_types=test_types,
        )
        if school_result["school"]:
            schools_processed.append(school_result["school"])
        _merge_subject_stats(subjects_processed, school_result["subjects"])
        _merge_series_counts(sheets_by_series, school_result["sheets_by_series"])
        total_sheets += school_result["total_sheets"]
        total_assignments += school_result["total_assignments"]

    subjects_list = list(subjects_processed.values())
    message = (
        f"Successfully generated {total_sheets} score sheet(s) "
        f"for {total_assignments} candidate assignment(s) "
        f"across {len(schools_processed)} school(s) and {len(subjects_list)} subject(s)."
    )

    return {
        "exam_id": exam_id,
        "total_sheets_generated": total_sheets,
        "total_candidates_assigned": total_assignments,
        "schools_processed": schools_processed,
        "subjects_processed": subjects_list,
        "sheets_by_series": sheets_by_series,
        "message": message,
    }
