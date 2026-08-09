"""Optimized bulk candidate upload with prefetch, in-memory validation, and chunked inserts."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models import (
    Candidate,
    Exam,
    ExamRegistration,
    ExamSeries,
    ExamSubject,
    ProcessStatus,
    ProcessTracking,
    Programme,
    programme_subjects,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
    SubjectType,
)
from app.schemas.candidate import CandidateBulkUploadError
from app.services.candidate_upload import (
    CandidateUploadParseError,
    CandidateUploadValidationError,
    find_subjects_column,
    parse_candidate_row,
    parse_upload_file,
    validate_required_columns,
)
from app.services.storage import storage_service

logger = logging.getLogger(__name__)

SubjectRequirementsValidationMode = Literal["auto", "may_june", "nov_dec"]

CHUNK_SIZE = 1000
MAX_ERRORS = 500
# asyncpg caps bind parameters at 32767; keep IN() batches well under that
IN_CHUNK_SIZE = 10000


def _chunked[T](items: list[T], size: int = IN_CHUNK_SIZE):
    """Yield successive slices of a list."""
    for i in range(0, len(items), size):
        yield items[i : i + size]


@dataclass
class ProgrammeRequirements:
    """In-memory programme subject requirements for MAY/JUNE validation."""

    compulsory_core_subject_ids: set[int] = field(default_factory=set)
    optional_core_groups: dict[int, set[int]] = field(default_factory=dict)
    elective_subject_ids: set[int] = field(default_factory=set)
    subject_names: dict[int, str] = field(default_factory=dict)


@dataclass
class ValidatedCandidateRow:
    """A row that passed validation and is ready to insert."""

    row_number: int
    school_id: int
    programme_id: int | None
    name: str
    index_number: str
    exam_subject_ids: list[int]
    existing_candidate_id: int | None = None


@dataclass
class BulkUploadProgress:
    total_rows: int = 0
    processed_rows: int = 0
    successful: int = 0
    failed: int = 0
    errors: list[CandidateBulkUploadError] = field(default_factory=list)

    def add_error(self, row_number: int, error_message: str, field_name: str | None = None) -> None:
        self.failed += 1
        self.processed_rows += 1
        if len(self.errors) < MAX_ERRORS:
            self.errors.append(
                CandidateBulkUploadError(
                    row_number=row_number,
                    error_message=error_message,
                    field=field_name,
                )
            )


def validate_subject_requirements_in_memory(
    exam_series: ExamSeries,
    validation_mode: SubjectRequirementsValidationMode,
    programme_id: int | None,
    registered_subject_ids: set[int],
    programme_requirements_by_id: dict[int, ProgrammeRequirements],
) -> tuple[bool, list[str]]:
    """Validate programme subject requirements without DB access."""
    if validation_mode == "nov_dec":
        return True, []

    if validation_mode == "may_june":
        should_apply = True
    else:
        should_apply = exam_series == ExamSeries.MAY_JUNE

    if not should_apply:
        return True, []

    if not programme_id:
        return True, []

    requirements = programme_requirements_by_id.get(programme_id)
    if not requirements:
        return True, []

    errors: list[str] = []

    missing_compulsory = requirements.compulsory_core_subject_ids - registered_subject_ids
    if missing_compulsory:
        missing_names = [requirements.subject_names.get(sid, str(sid)) for sid in sorted(missing_compulsory)]
        errors.append(f"Missing compulsory core subjects: {', '.join(missing_names)}")

    for group_id, group_subject_ids in requirements.optional_core_groups.items():
        registered_from_group = group_subject_ids & registered_subject_ids
        if len(registered_from_group) == 0:
            group_names = [requirements.subject_names.get(sid, str(sid)) for sid in sorted(group_subject_ids)]
            errors.append(
                f"Must select exactly one from optional core group {group_id}: {', '.join(group_names)}"
            )
        elif len(registered_from_group) > 1:
            registered_names = [
                requirements.subject_names.get(sid, str(sid)) for sid in sorted(registered_from_group)
            ]
            errors.append(
                f"Can only select one from optional core group {group_id}, but selected: {', '.join(registered_names)}"
            )

    missing_electives = requirements.elective_subject_ids - registered_subject_ids
    if missing_electives:
        missing_names = [requirements.subject_names.get(sid, str(sid)) for sid in sorted(missing_electives)]
        errors.append(
            f"Missing elective subjects (all are compulsory for MAY/JUNE): {', '.join(missing_names)}"
        )

    return len(errors) == 0, errors


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).lower().strip() for c in df.columns]
    return df


def _build_metadata(
    *,
    filename: str,
    file_path: str,
    validation_mode: str,
    progress: BulkUploadProgress,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "filename": filename,
        "file_path": file_path,
        "validation_mode": validation_mode,
        "total_rows": progress.total_rows,
        "processed_rows": progress.processed_rows,
        "successful": progress.successful,
        "failed": progress.failed,
        "errors": [e.model_dump() for e in progress.errors],
        "errors_truncated": progress.failed > len(progress.errors),
    }
    if extra:
        metadata.update(extra)
    return metadata


async def _update_tracking(
    session: AsyncSession,
    tracking: ProcessTracking,
    *,
    status: ProcessStatus | None = None,
    progress: BulkUploadProgress | None = None,
    filename: str | None = None,
    file_path: str | None = None,
    validation_mode: str | None = None,
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

    existing = tracking.process_metadata or {}
    if progress is not None:
        tracking.process_metadata = _build_metadata(
            filename=filename or existing.get("filename", ""),
            file_path=file_path or existing.get("file_path", ""),
            validation_mode=validation_mode or existing.get("validation_mode", "auto"),
            progress=progress,
        )
    flag_modified(tracking, "process_metadata")
    await session.commit()


async def _prefetch_lookups(
    session: AsyncSession,
    exam_id: int,
    school_codes: set[str],
    programme_codes: set[str],
    index_numbers: set[str],
) -> tuple[
    dict[str, School],
    dict[str, Programme],
    dict[str, tuple[ExamSubject, Subject]],
    set[str],
    dict[tuple[str, int], Candidate],
    dict[int, ProgrammeRequirements],
]:
    schools_by_code: dict[str, School] = {}
    for codes_chunk in _chunked(list(school_codes)):
        school_result = await session.execute(select(School).where(School.code.in_(codes_chunk)))
        for school in school_result.scalars().all():
            schools_by_code[school.code] = school

    programmes_by_code: dict[str, Programme] = {}
    for codes_chunk in _chunked(list(programme_codes)):
        programme_result = await session.execute(select(Programme).where(Programme.code.in_(codes_chunk)))
        for programme in programme_result.scalars().all():
            programmes_by_code[programme.code] = programme

    exam_subject_result = await session.execute(
        select(ExamSubject, Subject)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(ExamSubject.exam_id == exam_id)
    )
    exam_subjects_by_original_code = {
        subject.original_code: (exam_subject, subject) for exam_subject, subject in exam_subject_result.all()
    }

    # Load existing registrations for this exam only (avoids huge IN lists)
    existing_reg_result = await session.execute(
        select(ExamRegistration.index_number).where(ExamRegistration.exam_id == exam_id)
    )
    existing_reg_index_numbers = set(existing_reg_result.scalars().all()) & index_numbers

    candidates_by_key: dict[tuple[str, int], Candidate] = {}
    if index_numbers and schools_by_code:
        school_id_set = {s.id for s in schools_by_code.values()}
        for indexes_chunk in _chunked(list(index_numbers)):
            candidate_result = await session.execute(
                select(Candidate).where(Candidate.index_number.in_(indexes_chunk))
            )
            for candidate in candidate_result.scalars().all():
                if candidate.school_id in school_id_set:
                    candidates_by_key[(candidate.index_number, candidate.school_id)] = candidate

    programme_ids = {p.id for p in programmes_by_code.values()}
    programme_requirements_by_id: dict[int, ProgrammeRequirements] = {
        pid: ProgrammeRequirements() for pid in programme_ids
    }
    if programme_ids:
        for programme_ids_chunk in _chunked(list(programme_ids)):
            programme_subject_result = await session.execute(
                select(
                    programme_subjects.c.programme_id,
                    Subject,
                    programme_subjects.c.is_compulsory,
                    programme_subjects.c.choice_group_id,
                )
                .join(Subject, Subject.id == programme_subjects.c.subject_id)
                .where(programme_subjects.c.programme_id.in_(programme_ids_chunk))
            )
            for programme_id, subject, is_compulsory, choice_group_id in programme_subject_result.all():
                reqs = programme_requirements_by_id[programme_id]
                reqs.subject_names[subject.id] = subject.name
                if subject.subject_type == SubjectType.CORE:
                    if is_compulsory is True:
                        reqs.compulsory_core_subject_ids.add(subject.id)
                    elif is_compulsory is False and choice_group_id is not None:
                        reqs.optional_core_groups.setdefault(choice_group_id, set()).add(subject.id)
                elif subject.subject_type == SubjectType.ELECTIVE:
                    reqs.elective_subject_ids.add(subject.id)

    return (
        schools_by_code,
        programmes_by_code,
        exam_subjects_by_original_code,
        existing_reg_index_numbers,
        candidates_by_key,
        programme_requirements_by_id,
    )


def _validate_rows(
    df: pd.DataFrame,
    subjects_column: str | None,
    exam: Exam,
    validation_mode: SubjectRequirementsValidationMode,
    schools_by_code: dict[str, School],
    programmes_by_code: dict[str, Programme],
    exam_subjects_by_original_code: dict[str, tuple[ExamSubject, Subject]],
    existing_reg_index_numbers: set[str],
    candidates_by_key: dict[tuple[str, int], Candidate],
    programme_requirements_by_id: dict[int, ProgrammeRequirements],
    progress: BulkUploadProgress,
) -> list[ValidatedCandidateRow]:
    """Validate all rows in memory; collect valid rows and record errors."""
    valid_rows: list[ValidatedCandidateRow] = []
    seen_index_numbers: set[str] = set()

    # Prefer positional iteration over iterrows for speed
    for idx in range(len(df)):
        row = df.iloc[idx]
        row_number = int(idx) + 2  # Excel 1-indexed + header

        candidate_data = parse_candidate_row(row, subjects_column)

        if not candidate_data["school_code"] or candidate_data["school_code"].lower() == "nan":
            progress.add_error(row_number, "School code is required", "school_code")
            continue

        if not candidate_data["name"] or candidate_data["name"].lower() == "nan":
            progress.add_error(row_number, "Name is required", "name")
            continue

        if not candidate_data["index_number"] or candidate_data["index_number"].lower() == "nan":
            progress.add_error(row_number, "Index number is required", "index_number")
            continue

        school = schools_by_code.get(candidate_data["school_code"])
        if not school:
            progress.add_error(
                row_number,
                f"School with code '{candidate_data['school_code']}' not found",
                "school_code",
            )
            continue

        programme = None
        if candidate_data["programme_code"]:
            programme = programmes_by_code.get(candidate_data["programme_code"])
            if not programme:
                progress.add_error(
                    row_number,
                    f"Programme with code '{candidate_data['programme_code']}' not found",
                    "programme_code",
                )
                continue

        exam_subject_ids: list[int] = []
        registered_subject_ids: set[int] = set()
        subject_error = False
        for subject_original_code in candidate_data["subject_original_codes"]:
            if subject_original_code not in exam_subjects_by_original_code:
                progress.add_error(
                    row_number,
                    f"Subject with original_code '{subject_original_code}' not found in exam or not part of this exam",
                    "subject_original_code",
                )
                subject_error = True
                break
            exam_subject, subject = exam_subjects_by_original_code[subject_original_code]
            exam_subject_ids.append(exam_subject.id)
            registered_subject_ids.add(subject.id)

        if subject_error:
            continue

        index_number = candidate_data["index_number"]
        if index_number in existing_reg_index_numbers or index_number in seen_index_numbers:
            progress.add_error(
                row_number,
                f"Candidate with index number '{index_number}' is already registered for this exam",
                "index_number",
            )
            continue

        programme_id = programme.id if programme else None
        is_valid, validation_errors = validate_subject_requirements_in_memory(
            exam.series,
            validation_mode,
            programme_id,
            registered_subject_ids,
            programme_requirements_by_id,
        )
        if not is_valid:
            progress.add_error(
                row_number,
                f"Subject registration does not meet programme requirements: {'; '.join(validation_errors)}",
                "subject_original_code",
            )
            continue

        existing_candidate = candidates_by_key.get((index_number, school.id))
        seen_index_numbers.add(index_number)
        valid_rows.append(
            ValidatedCandidateRow(
                row_number=row_number,
                school_id=school.id,
                programme_id=programme_id,
                name=candidate_data["name"],
                index_number=index_number,
                exam_subject_ids=exam_subject_ids,
                existing_candidate_id=existing_candidate.id if existing_candidate else None,
            )
        )

    return valid_rows


async def _insert_chunk(
    session: AsyncSession,
    exam_id: int,
    chunk: list[ValidatedCandidateRow],
) -> None:
    """Insert one chunk of validated candidates with registrations, subjects, and scores."""
    # 1. Create new candidates (keep ID mapping local so rollbacks don't leave stale IDs)
    candidate_ids: list[int] = []
    new_candidates: list[Candidate] = []
    new_candidate_indexes: list[int] = []

    for i, row in enumerate(chunk):
        if row.existing_candidate_id is not None:
            candidate_ids.append(row.existing_candidate_id)
        else:
            candidate_ids.append(-1)  # placeholder
            new_candidate_indexes.append(i)
            new_candidates.append(
                Candidate(
                    school_id=row.school_id,
                    programme_id=row.programme_id,
                    name=row.name,
                    index_number=row.index_number,
                )
            )

    if new_candidates:
        session.add_all(new_candidates)
        await session.flush()
        for i, candidate in zip(new_candidate_indexes, new_candidates, strict=True):
            candidate_ids[i] = candidate.id

    # 2. Exam registrations
    exam_registrations = [
        ExamRegistration(
            candidate_id=candidate_id,
            exam_id=exam_id,
            index_number=row.index_number,
        )
        for row, candidate_id in zip(chunk, candidate_ids, strict=True)
    ]
    session.add_all(exam_registrations)
    await session.flush()

    # 3. Subject registrations
    subject_registrations: list[SubjectRegistration] = []
    for exam_reg, row in zip(exam_registrations, chunk, strict=True):
        for exam_subject_id in row.exam_subject_ids:
            subject_registrations.append(
                SubjectRegistration(
                    exam_registration_id=exam_reg.id,
                    exam_subject_id=exam_subject_id,
                    series=None,
                )
            )

    if subject_registrations:
        session.add_all(subject_registrations)
        await session.flush()

        # 4. Default subject scores
        subject_scores = [
            SubjectScore(
                subject_registration_id=sr.id,
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
            for sr in subject_registrations
        ]
        session.add_all(subject_scores)

    await session.commit()


async def process_candidate_bulk_upload(tracking_id: int) -> None:
    """Background entry point: process a saved candidate bulk-upload job."""
    from app.dependencies.database import get_sessionmanager

    sessionmanager = get_sessionmanager()
    async with sessionmanager.session() as session:
        tracking_result = await session.execute(
            select(ProcessTracking).where(ProcessTracking.id == tracking_id)
        )
        tracking = tracking_result.scalar_one_or_none()
        if not tracking:
            logger.error("Candidate bulk upload tracking %s not found", tracking_id)
            return

        metadata = tracking.process_metadata or {}
        file_path = metadata.get("file_path")
        filename = metadata.get("filename") or "upload.xlsx"
        validation_mode = metadata.get("validation_mode") or "auto"
        exam_id = tracking.exam_id

        progress = BulkUploadProgress(total_rows=int(metadata.get("total_rows") or 0))

        try:
            await _update_tracking(
                session,
                tracking,
                status=ProcessStatus.IN_PROGRESS,
                progress=progress,
                filename=filename,
                file_path=file_path,
                validation_mode=validation_mode,
            )

            if not file_path:
                raise ValueError("Upload file path missing from job metadata")

            file_content = await storage_service.retrieve(file_path)
            df = parse_upload_file(file_content, filename)
            validate_required_columns(df)
            df = _normalize_columns(df)
            subjects_column = find_subjects_column(df)
            progress.total_rows = len(df)

            exam_result = await session.execute(select(Exam).where(Exam.id == exam_id))
            exam = exam_result.scalar_one_or_none()
            if not exam:
                raise ValueError(f"Exam {exam_id} not found")

            # First pass: collect codes for prefetch (cheap parse)
            school_codes: set[str] = set()
            programme_codes: set[str] = set()
            index_numbers: set[str] = set()
            for idx in range(len(df)):
                row_data = parse_candidate_row(df.iloc[idx], subjects_column)
                if row_data["school_code"] and row_data["school_code"].lower() != "nan":
                    school_codes.add(row_data["school_code"])
                if row_data["programme_code"]:
                    programme_codes.add(row_data["programme_code"])
                if row_data["index_number"] and row_data["index_number"].lower() != "nan":
                    index_numbers.add(row_data["index_number"])

            (
                schools_by_code,
                programmes_by_code,
                exam_subjects_by_original_code,
                existing_reg_index_numbers,
                candidates_by_key,
                programme_requirements_by_id,
            ) = await _prefetch_lookups(
                session, exam_id, school_codes, programme_codes, index_numbers
            )

            mode = validation_mode if validation_mode in ("auto", "may_june", "nov_dec") else "auto"
            valid_rows = _validate_rows(
                df,
                subjects_column,
                exam,
                mode,  # type: ignore[arg-type]
                schools_by_code,
                programmes_by_code,
                exam_subjects_by_original_code,
                existing_reg_index_numbers,
                candidates_by_key,
                programme_requirements_by_id,
                progress,
            )

            # Persist validation progress before inserts
            await _update_tracking(
                session,
                tracking,
                progress=progress,
                filename=filename,
                file_path=file_path,
                validation_mode=validation_mode,
            )

            for start in range(0, len(valid_rows), CHUNK_SIZE):
                chunk = valid_rows[start : start + CHUNK_SIZE]
                try:
                    await _insert_chunk(session, exam_id, chunk)
                    progress.successful += len(chunk)
                    progress.processed_rows += len(chunk)
                except Exception:
                    logger.exception("Chunk insert failed starting at offset %s", start)
                    await session.rollback()
                    # Re-attach tracking after rollback
                    tracking_result = await session.execute(
                        select(ProcessTracking).where(ProcessTracking.id == tracking_id)
                    )
                    tracking = tracking_result.scalar_one()
                    # Fall back to per-row insert for this chunk so one bad row doesn't drop 1000
                    for row in chunk:
                        try:
                            await _insert_chunk(session, exam_id, [row])
                            progress.successful += 1
                            progress.processed_rows += 1
                        except Exception as row_error:
                            await session.rollback()
                            tracking_result = await session.execute(
                                select(ProcessTracking).where(ProcessTracking.id == tracking_id)
                            )
                            tracking = tracking_result.scalar_one()
                            progress.add_error(
                                row.row_number,
                                f"Unexpected error: {row_error}",
                                None,
                            )

                await _update_tracking(
                    session,
                    tracking,
                    progress=progress,
                    filename=filename,
                    file_path=file_path,
                    validation_mode=validation_mode,
                )

            await _update_tracking(
                session,
                tracking,
                status=ProcessStatus.COMPLETED,
                progress=progress,
                filename=filename,
                file_path=file_path,
                validation_mode=validation_mode,
            )

            # Best-effort cleanup of temp upload file
            try:
                await storage_service.delete(file_path)
            except Exception:
                logger.warning("Failed to delete upload file %s", file_path, exc_info=True)

        except (CandidateUploadParseError, CandidateUploadValidationError, ValueError) as e:
            logger.exception("Candidate bulk upload job %s failed", tracking_id)
            progress.failed = max(progress.failed, progress.total_rows - progress.successful)
            await _update_tracking(
                session,
                tracking,
                status=ProcessStatus.FAILED,
                progress=progress,
                filename=filename,
                file_path=file_path,
                validation_mode=validation_mode,
                error_message=str(e),
            )
        except Exception as e:
            logger.exception("Candidate bulk upload job %s failed unexpectedly", tracking_id)
            await _update_tracking(
                session,
                tracking,
                status=ProcessStatus.FAILED,
                progress=progress,
                filename=filename,
                file_path=file_path,
                validation_mode=validation_mode,
                error_message=f"Unexpected error: {e}",
            )


async def prepare_upload_dataframe(
    file_content: bytes, filename: str
) -> tuple[pd.DataFrame, int]:
    """Parse and validate upload file; return dataframe and row count."""
    df = parse_upload_file(file_content, filename)
    validate_required_columns(df)
    return df, len(df)
