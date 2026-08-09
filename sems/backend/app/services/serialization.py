"""Serialize candidates by assigning series numbers via SQL bulk updates."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import bindparam, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models import (
    Candidate,
    Exam,
    ExamRegistration,
    ProcessStatus,
    ProcessTracking,
    ProcessType,
    School,
)

logger = logging.getLogger(__name__)


async def count_schools_for_serialization(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
) -> int:
    """Count distinct schools that have candidates registered for the exam."""
    stmt = (
        select(func.count(func.distinct(Candidate.school_id)))
        .select_from(Candidate)
        .join(ExamRegistration, Candidate.id == ExamRegistration.candidate_id)
        .where(ExamRegistration.exam_id == exam_id)
    )
    if school_id is not None:
        stmt = stmt.where(Candidate.school_id == school_id)
    result = await session.execute(stmt)
    return int(result.scalar() or 0)


async def list_school_ids_for_serialization(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
) -> list[int]:
    """Return ordered school IDs that have candidates for the exam."""
    if school_id is not None:
        exists_stmt = (
            select(Candidate.id)
            .join(ExamRegistration, Candidate.id == ExamRegistration.candidate_id)
            .where(ExamRegistration.exam_id == exam_id, Candidate.school_id == school_id)
            .limit(1)
        )
        exists = (await session.execute(exists_stmt)).scalar_one_or_none()
        return [school_id] if exists is not None else []

    stmt = (
        select(Candidate.school_id)
        .join(ExamRegistration, Candidate.id == ExamRegistration.candidate_id)
        .where(ExamRegistration.exam_id == exam_id)
        .distinct()
        .order_by(Candidate.school_id)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def _update_tracking(
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


async def _serialize_school_sql(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int,
    number_of_series: int,
    subject_codes: list[str],
) -> None:
    """Assign series for one school using set-based SQL updates."""
    if subject_codes:
        # Round-robin within (school, exam_subject) ordered by index_number (string sort)
        serialize_sql = text(
            """
            UPDATE subject_registrations AS sr
            SET series = ((ranked.rn - 1) % :num_series) + 1,
                updated_at = NOW()
            FROM (
                SELECT sr2.id,
                       ROW_NUMBER() OVER (
                           PARTITION BY c.school_id, sr2.exam_subject_id
                           ORDER BY c.index_number
                       ) AS rn
                FROM subject_registrations sr2
                JOIN exam_registrations er ON sr2.exam_registration_id = er.id
                JOIN candidates c ON er.candidate_id = c.id
                JOIN exam_subjects es ON sr2.exam_subject_id = es.id
                JOIN subjects s ON es.subject_id = s.id
                WHERE er.exam_id = :exam_id
                  AND c.school_id = :school_id
                  AND UPPER(TRIM(s.code)) IN :subject_codes
            ) AS ranked
            WHERE sr.id = ranked.id
            """
        ).bindparams(bindparam("subject_codes", expanding=True))

        await session.execute(
            serialize_sql,
            {
                "exam_id": exam_id,
                "school_id": school_id,
                "num_series": number_of_series,
                "subject_codes": subject_codes,
            },
        )

        default_sql = text(
            """
            UPDATE subject_registrations AS sr
            SET series = 1,
                updated_at = NOW()
            FROM subject_registrations sr2
            JOIN exam_registrations er ON sr2.exam_registration_id = er.id
            JOIN candidates c ON er.candidate_id = c.id
            JOIN exam_subjects es ON sr2.exam_subject_id = es.id
            JOIN subjects s ON es.subject_id = s.id
            WHERE sr.id = sr2.id
              AND er.exam_id = :exam_id
              AND c.school_id = :school_id
              AND UPPER(TRIM(s.code)) NOT IN :subject_codes
            """
        ).bindparams(bindparam("subject_codes", expanding=True))

        await session.execute(
            default_sql,
            {
                "exam_id": exam_id,
                "school_id": school_id,
                "subject_codes": subject_codes,
            },
        )
    else:
        # No codes selected → default all registrations at this school to series 1
        default_all_sql = text(
            """
            UPDATE subject_registrations AS sr
            SET series = 1,
                updated_at = NOW()
            FROM subject_registrations sr2
            JOIN exam_registrations er ON sr2.exam_registration_id = er.id
            JOIN candidates c ON er.candidate_id = c.id
            WHERE sr.id = sr2.id
              AND er.exam_id = :exam_id
              AND c.school_id = :school_id
            """
        )
        await session.execute(
            default_all_sql,
            {"exam_id": exam_id, "school_id": school_id},
        )


async def _school_stats(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int,
    subject_codes_set: set[str],
) -> tuple[dict[str, Any], dict[int, dict[str, Any]], dict[int, dict[str, Any]], set[int]]:
    """Collect per-school stats matching legacy response shape."""
    stats_sql = text(
        """
        SELECT
            sch.id AS school_id,
            sch.name AS school_name,
            s.id AS subject_id,
            s.code AS subject_code,
            s.name AS subject_name,
            COUNT(sr.id) AS reg_count,
            ARRAY_AGG(DISTINCT c.id) AS candidate_ids
        FROM subject_registrations sr
        JOIN exam_registrations er ON sr.exam_registration_id = er.id
        JOIN candidates c ON er.candidate_id = c.id
        JOIN schools sch ON c.school_id = sch.id
        JOIN exam_subjects es ON sr.exam_subject_id = es.id
        JOIN subjects s ON es.subject_id = s.id
        WHERE er.exam_id = :exam_id
          AND c.school_id = :school_id
        GROUP BY sch.id, sch.name, s.id, s.code, s.name
        ORDER BY s.code
        """
    )
    result = await session.execute(stats_sql, {"exam_id": exam_id, "school_id": school_id})
    rows = result.all()

    school_info: dict[str, Any] = {
        "school_id": school_id,
        "school_name": "",
        "candidates_count": 0,
    }
    subjects_processed: dict[int, dict[str, Any]] = {}
    subjects_defaulted: dict[int, dict[str, Any]] = {}
    candidate_ids: set[int] = set()

    for row in rows:
        school_info["school_name"] = row.school_name
        school_info["candidates_count"] += int(row.reg_count)
        for cid in row.candidate_ids or []:
            candidate_ids.add(int(cid))

        code_upper = str(row.subject_code).upper().strip()
        entry = {
            "subject_id": int(row.subject_id),
            "subject_code": row.subject_code,
            "subject_name": row.subject_name,
            "candidates_count": int(row.reg_count),
        }
        if subject_codes_set and code_upper in subject_codes_set:
            subjects_processed[int(row.subject_id)] = entry
        else:
            subjects_defaulted[int(row.subject_id)] = entry

    return school_info, subjects_processed, subjects_defaulted, candidate_ids


def _merge_subject_stats(
    target: dict[int, dict[str, Any]],
    incoming: dict[int, dict[str, Any]],
) -> None:
    for subject_id, info in incoming.items():
        if subject_id not in target:
            target[subject_id] = {
                "subject_id": info["subject_id"],
                "subject_code": info["subject_code"],
                "subject_name": info["subject_name"],
                "candidates_count": info["candidates_count"],
            }
        else:
            target[subject_id]["candidates_count"] += info["candidates_count"]


def _build_result_message(
    total_candidates_count: int,
    total_schools_count: int,
    subjects_serialized_count: int,
    subjects_defaulted_count: int,
) -> str:
    message_parts: list[str] = []
    if subjects_serialized_count > 0:
        message_parts.append(f"serialized {subjects_serialized_count} subject(s)")
    if subjects_defaulted_count > 0:
        message_parts.append(f"assigned default series 1 to {subjects_defaulted_count} subject(s)")
    suffix = ". ".join(message_parts) + "." if message_parts else ""
    return (
        f"Successfully processed {total_candidates_count} candidate(s) "
        f"across {total_schools_count} school(s). {suffix}"
    ).strip()


async def process_serialization_job(tracking_id: int) -> None:
    """Background entry point: serialize an exam school-by-school with progress updates."""
    from app.dependencies.database import get_sessionmanager

    sessionmanager = get_sessionmanager()
    async with sessionmanager.session() as session:
        tracking_result = await session.execute(
            select(ProcessTracking).where(ProcessTracking.id == tracking_id)
        )
        tracking = tracking_result.scalar_one_or_none()
        if not tracking:
            logger.error("Serialization tracking %s not found", tracking_id)
            return

        metadata = dict(tracking.process_metadata or {})
        exam_id = tracking.exam_id
        school_id_filter = metadata.get("school_id")
        raw_codes = metadata.get("subject_codes") or []
        subject_codes = [str(c).upper().strip() for c in raw_codes if c]
        subject_codes_set = set(subject_codes)

        try:
            exam_result = await session.execute(select(Exam).where(Exam.id == exam_id))
            exam = exam_result.scalar_one_or_none()
            if not exam:
                raise ValueError(f"Exam with id {exam_id} not found")

            if school_id_filter is not None:
                school_result = await session.execute(
                    select(School).where(School.id == school_id_filter)
                )
                if not school_result.scalar_one_or_none():
                    raise ValueError(f"School with id {school_id_filter} not found")

            school_ids = await list_school_ids_for_serialization(
                session, exam_id, school_id_filter
            )
            total_schools = len(school_ids)

            metadata.update(
                {
                    "total_schools": total_schools,
                    "processed_schools": 0,
                    "total_candidates_count": 0,
                    "total_schools_count": 0,
                    "subjects_serialized_count": 0,
                    "subjects_defaulted_count": 0,
                    "schools_processed": [],
                    "subjects_processed": [],
                    "subjects_defaulted": [],
                    "message": None,
                }
            )
            await _update_tracking(
                session,
                tracking,
                status=ProcessStatus.IN_PROGRESS,
                metadata=metadata,
            )

            if not school_ids:
                message = "No candidates found for serialization"
                metadata.update(
                    {
                        "message": message,
                        "processed_schools": 0,
                        "total_schools": 0,
                    }
                )
                await _update_tracking(
                    session,
                    tracking,
                    status=ProcessStatus.COMPLETED,
                    metadata=metadata,
                )
                return

            schools_processed: list[dict[str, Any]] = []
            subjects_processed: dict[int, dict[str, Any]] = {}
            subjects_defaulted: dict[int, dict[str, Any]] = {}
            unique_candidate_ids: set[int] = set()

            for idx, school_id in enumerate(school_ids, start=1):
                await _serialize_school_sql(
                    session,
                    exam_id=exam_id,
                    school_id=school_id,
                    number_of_series=exam.number_of_series,
                    subject_codes=subject_codes,
                )
                await session.commit()

                school_info, school_subj, school_def, cand_ids = await _school_stats(
                    session,
                    exam_id=exam_id,
                    school_id=school_id,
                    subject_codes_set=subject_codes_set,
                )
                schools_processed.append(school_info)
                _merge_subject_stats(subjects_processed, school_subj)
                _merge_subject_stats(subjects_defaulted, school_def)
                unique_candidate_ids.update(cand_ids)

                # Re-load tracking after commits
                tracking_result = await session.execute(
                    select(ProcessTracking).where(ProcessTracking.id == tracking_id)
                )
                tracking = tracking_result.scalar_one()

                subjects_list = list(subjects_processed.values())
                defaulted_list = list(subjects_defaulted.values())
                metadata.update(
                    {
                        "processed_schools": idx,
                        "total_schools": total_schools,
                        "total_candidates_count": len(unique_candidate_ids),
                        "total_schools_count": len(schools_processed),
                        "subjects_serialized_count": len(subjects_list),
                        "subjects_defaulted_count": len(defaulted_list),
                        "schools_processed": schools_processed,
                        "subjects_processed": subjects_list,
                        "subjects_defaulted": defaulted_list,
                    }
                )
                await _update_tracking(session, tracking, metadata=metadata)

            subjects_list = list(subjects_processed.values())
            defaulted_list = list(subjects_defaulted.values())
            total_candidates_count = len(unique_candidate_ids)
            total_schools_count = len(schools_processed)
            message = _build_result_message(
                total_candidates_count,
                total_schools_count,
                len(subjects_list),
                len(defaulted_list),
            )
            metadata.update(
                {
                    "processed_schools": total_schools,
                    "total_schools": total_schools,
                    "total_candidates_count": total_candidates_count,
                    "total_schools_count": total_schools_count,
                    "subjects_serialized_count": len(subjects_list),
                    "subjects_defaulted_count": len(defaulted_list),
                    "schools_processed": schools_processed,
                    "subjects_processed": subjects_list,
                    "subjects_defaulted": defaulted_list,
                    "message": message,
                }
            )
            await _update_tracking(
                session,
                tracking,
                status=ProcessStatus.COMPLETED,
                metadata=metadata,
            )

        except Exception as e:
            logger.exception("Serialization job %s failed", tracking_id)
            try:
                tracking_result = await session.execute(
                    select(ProcessTracking).where(ProcessTracking.id == tracking_id)
                )
                tracking = tracking_result.scalar_one_or_none()
                if tracking:
                    metadata = dict(tracking.process_metadata or {})
                    metadata["message"] = f"Serialization failed: {e}"
                    await _update_tracking(
                        session,
                        tracking,
                        status=ProcessStatus.FAILED,
                        metadata=metadata,
                        error_message=str(e),
                    )
            except Exception:
                logger.exception("Failed to mark serialization job %s as failed", tracking_id)


async def serialize_exam(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
    subject_codes: list[str] | None = None,
) -> dict[str, Any]:
    """
    Synchronous helper kept for compatibility/tests: run serialization inline.

    Prefer process_serialization_job for the HTTP API.
    """
    exam_result = await session.execute(select(Exam).where(Exam.id == exam_id))
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError(f"Exam with id {exam_id} not found")

    if school_id is not None:
        school_result = await session.execute(select(School).where(School.id == school_id))
        if not school_result.scalar_one_or_none():
            raise ValueError(f"School with id {school_id} not found")

    codes = [c.upper().strip() for c in (subject_codes or []) if c]
    codes_set = set(codes)
    school_ids = await list_school_ids_for_serialization(session, exam_id, school_id)

    if not school_ids:
        return {
            "exam_id": exam_id,
            "school_id": school_id,
            "total_candidates_count": 0,
            "total_schools_count": 0,
            "subjects_serialized_count": 0,
            "subjects_defaulted_count": 0,
            "schools_processed": [],
            "subjects_processed": [],
            "subjects_defaulted": [],
            "message": "No candidates found for serialization",
        }

    schools_processed: list[dict[str, Any]] = []
    subjects_processed: dict[int, dict[str, Any]] = {}
    subjects_defaulted: dict[int, dict[str, Any]] = {}
    unique_candidate_ids: set[int] = set()

    for sid in school_ids:
        await _serialize_school_sql(
            session,
            exam_id=exam_id,
            school_id=sid,
            number_of_series=exam.number_of_series,
            subject_codes=codes,
        )
        await session.commit()
        school_info, school_subj, school_def, cand_ids = await _school_stats(
            session,
            exam_id=exam_id,
            school_id=sid,
            subject_codes_set=codes_set,
        )
        schools_processed.append(school_info)
        _merge_subject_stats(subjects_processed, school_subj)
        _merge_subject_stats(subjects_defaulted, school_def)
        unique_candidate_ids.update(cand_ids)

    subjects_list = list(subjects_processed.values())
    defaulted_list = list(subjects_defaulted.values())
    total_candidates_count = len(unique_candidate_ids)
    total_schools_count = len(schools_processed)
    message = _build_result_message(
        total_candidates_count,
        total_schools_count,
        len(subjects_list),
        len(defaulted_list),
    )

    tracking = ProcessTracking(
        exam_id=exam_id,
        process_type=ProcessType.SERIALIZATION,
        school_id=school_id,
        subject_id=None,
        status=ProcessStatus.COMPLETED,
        process_metadata={
            "total_candidates": total_candidates_count,
            "total_schools": total_schools_count,
            "subjects_serialized_count": len(subjects_list),
            "subjects_defaulted_count": len(defaulted_list),
            "subjects_serialized": [s["subject_code"] for s in subjects_list],
            "schools_processed": schools_processed,
            "subjects_processed": subjects_list,
            "subjects_defaulted": defaulted_list,
            "total_candidates_count": total_candidates_count,
            "total_schools_count": total_schools_count,
            "message": message,
        },
        started_at=datetime.utcnow(),
        completed_at=datetime.utcnow(),
    )
    session.add(tracking)
    await session.commit()

    return {
        "exam_id": exam_id,
        "school_id": school_id,
        "total_candidates_count": total_candidates_count,
        "total_schools_count": total_schools_count,
        "subjects_serialized_count": len(subjects_list),
        "subjects_defaulted_count": len(defaulted_list),
        "schools_processed": schools_processed,
        "subjects_processed": subjects_list,
        "subjects_defaulted": defaulted_list,
        "message": message,
    }
