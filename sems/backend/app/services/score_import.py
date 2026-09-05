"""Subject score Excel import (Paper 1 or Paper 2 per file) — CORE and ELECTIVE."""

from __future__ import annotations

import io
import logging
import re
from datetime import datetime, timedelta
from typing import Any, Literal

import pandas as pd
from sqlalchemy import or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
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
)
from app.services.score_import_pipeline import (
    IMPORT_PROGRESS_EVERY,
    LARGE_IMPORT_ROW_THRESHOLD,
    MAX_STORED_IMPORT_ERRORS,
    ScoreImportResult,
    ScoreImportRowError,
    build_errors_csv,
    file_checksum,
    import_scores_pipeline,
    is_skip_score_value,
    new_job_key,
    normalize_score_import_columns,
    paper_extraction_attr,
    paper_field_name,
    paper_is_required_for_import,
    paper_score_is_missing,
    parse_score_import_file,
    validate_score_import_columns,
)

logger = logging.getLogger(__name__)

# Re-export constants / types used by router + tests
__all__ = [
    "LARGE_IMPORT_ROW_THRESHOLD",
    "MAX_STORED_IMPORT_ERRORS",
    "IMPORT_PROGRESS_EVERY",
    "IMPORT_COMMIT_EVERY",
    "ScoreImportResult",
    "ScoreImportRowError",
    "import_scores",
    "import_core_scores",
    "normalize_score_import_columns",
    "validate_score_import_columns",
    "parse_score_import_file",
    "is_skip_score_value",
    "paper_field_name",
    "paper_extraction_attr",
    "paper_score_is_missing",
    "generate_score_import_template",
    "generate_missing_scores_import_template",
    "start_score_import_job",
    "process_score_import_job",
    "resume_interrupted_score_import_jobs",
    "is_stale_in_progress",
    "find_idempotent_score_import_job",
    "file_checksum",
]

# Back-compat alias (old commit cadence); apply uses IMPORT_APPLY_BATCH_SIZE now.
IMPORT_COMMIT_EVERY = 2000

SCORE_IMPORT_RESUME_LOCK_KEY = 874_291_556_301
STALE_IMPORT_IN_PROGRESS_SECONDS = 5 * 60
PaperTestType = Literal[1, 2]


def _subject_display_code(subject: Subject) -> str:
    return (subject.original_code or subject.code or "").strip()


def _exam_filename_bits(exam: Exam | None) -> tuple[str, str]:
    if exam is None:
        return "score", "import"
    year = str(exam.year)
    series = exam.series.value if hasattr(exam.series, "value") else str(exam.series)
    return year, series


def _write_score_import_xlsx(
    rows: list[dict[str, Any]],
    *,
    sheet_name: str,
    filename: str,
) -> tuple[bytes, str]:
    df = pd.DataFrame(rows, columns=["index_number", "subject_code", "subject_name", "score"])
    output = io.BytesIO()
    safe_sheet = sheet_name[:31]
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=safe_sheet)
        ws = writer.sheets[safe_sheet]
        ws.column_dimensions["A"].width = 16
        ws.column_dimensions["B"].width = 16
        ws.column_dimensions["C"].width = 36
        ws.column_dimensions["D"].width = 12
        for row_idx, row in enumerate(rows, start=2):
            for col_idx, key in enumerate(
                ("index_number", "subject_code", "subject_name", "score"), start=1
            ):
                raw = row.get(key, "")
                text_val = "" if raw is None else str(raw)
                cell = ws.cell(row=row_idx, column=col_idx, value=text_val)
                if col_idx in (1, 2, 4):
                    cell.number_format = "@"

    filename = re.sub(r"[^\w.\-]+", "_", filename)
    output.seek(0)
    return output.getvalue(), filename


async def generate_score_import_template(
    session: AsyncSession,
    *,
    test_type: PaperTestType,
    exam_id: int | None = None,
) -> tuple[bytes, str]:
    """Build a format-only Excel template (example rows, not real candidates)."""
    if test_type not in (1, 2):
        raise ValueError("test_type must be 1 (Paper 1) or 2 (Paper 2)")

    exam: Exam | None = None
    if exam_id is not None:
        exam = (await session.execute(select(Exam).where(Exam.id == exam_id))).scalar_one_or_none()
        if not exam:
            raise ValueError("Examination not found")

    paper_label = "P1" if test_type == 1 else "P2"
    rows = [
        {
            "index_number": "0123456789",
            "subject_code": "C30-1-01",
            "subject_name": "Example CORE subject — enter score or leave blank",
            "score": "",
        },
        {
            "index_number": "0123456789",
            "subject_code": "E40-2-05",
            "subject_name": "Example ELECTIVE — use N/A if not registered",
            "score": "N/A",
        },
    ]

    year, series = _exam_filename_bits(exam)
    filename = f"{year}_{series}_{paper_label}_score_import_format.xlsx"
    return _write_score_import_xlsx(
        rows,
        sheet_name=f"{paper_label}_Scores",
        filename=filename,
    )


async def generate_missing_scores_import_template(
    session: AsyncSession,
    *,
    exam_id: int,
    test_type: PaperTestType,
    subject_id: int,
    school_id: int | None = None,
) -> tuple[bytes, str]:
    """Prefill rows for candidates registered for subject_id with a missing score."""
    if test_type not in (1, 2):
        raise ValueError("test_type must be 1 (Paper 1) or 2 (Paper 2)")

    exam = (await session.execute(select(Exam).where(Exam.id == exam_id))).scalar_one_or_none()
    if not exam:
        raise ValueError("Examination not found")

    subject = (await session.execute(select(Subject).where(Subject.id == subject_id))).scalar_one_or_none()
    if not subject:
        raise ValueError("Subject not found")

    exam_subject = (
        await session.execute(
            select(ExamSubject)
            .where(ExamSubject.exam_id == exam_id, ExamSubject.subject_id == subject_id)
            .options(selectinload(ExamSubject.subject))
        )
    ).scalar_one_or_none()
    if not exam_subject:
        raise ValueError("Subject is not offered on this examination")

    from app.services.score_import_pipeline import ExamSubjectInfo

    info = ExamSubjectInfo(
        id=exam_subject.id,
        obj_max_score=exam_subject.obj_max_score,
        essay_max_score=exam_subject.essay_max_score,
    )
    if not paper_is_required_for_import(info, test_type):
        raise ValueError(f"Paper {test_type} is not required for this subject")

    if school_id is not None:
        school = (await session.execute(select(School).where(School.id == school_id))).scalar_one_or_none()
        if not school:
            raise ValueError("School not found")

    stmt = (
        select(SubjectRegistration)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .where(SubjectRegistration.exam_subject_id == exam_subject.id)
        .options(
            selectinload(SubjectRegistration.subject_score),
            selectinload(SubjectRegistration.exam_registration),
        )
        .order_by(ExamRegistration.index_number)
    )
    if school_id is not None:
        stmt = stmt.where(Candidate.school_id == school_id)

    subject_regs = (await session.execute(stmt)).scalars().all()
    subject_code = _subject_display_code(subject)
    subject_name = subject.name or ""
    rows: list[dict[str, Any]] = []
    for sr in subject_regs:
        if not paper_score_is_missing(sr.subject_score, test_type):
            continue
        index_number = (sr.exam_registration.index_number if sr.exam_registration else None) or ""
        if not index_number:
            continue
        rows.append(
            {
                "index_number": index_number,
                "subject_code": subject_code,
                "subject_name": subject_name,
                "score": "",
            }
        )

    if not rows:
        rows = [
            {
                "index_number": "",
                "subject_code": subject_code,
                "subject_name": (
                    f"{subject_name} — no missing "
                    f"{('P1' if test_type == 1 else 'P2')} scores in scope"
                ),
                "score": "",
            }
        ]

    paper_label = "P1" if test_type == 1 else "P2"
    year, series = _exam_filename_bits(exam)
    code_bit = re.sub(r"[^\w.\-]+", "_", subject_code or f"subject_{subject_id}")
    filename = f"{year}_{series}_{code_bit}_{paper_label}_missing_scores.xlsx"
    return _write_score_import_xlsx(
        rows,
        sheet_name=f"{code_bit[:20]}_{paper_label}"[:31],
        filename=filename,
    )


async def import_scores(
    session: AsyncSession,
    *,
    exam_id: int,
    test_type: PaperTestType,
    file_content: bytes,
    filename: str,
    school_id: int | None = None,
    enforce_row_limit: bool = True,
    progress_callback: Any | None = None,
    dry_run: bool = False,
    job_key: str | None = None,
    preparsed_df: pd.DataFrame | None = None,
) -> ScoreImportResult:
    """
    Import CORE and ELECTIVE subject scores for one paper from an Excel/CSV file.

    Blank and N/A score cells are skipped. Non-blank values overwrite the selected paper field.
    When dry_run is True, validation/matching runs but no scores are written.
    """
    return await import_scores_pipeline(
        session,
        exam_id=exam_id,
        test_type=test_type,
        file_content=file_content,
        filename=filename,
        school_id=school_id,
        enforce_row_limit=enforce_row_limit,
        progress_callback=progress_callback,
        dry_run=dry_run,
        job_key=job_key,
        preparsed_df=preparsed_df,
    )


async def find_idempotent_score_import_job(
    session: AsyncSession,
    *,
    exam_id: int,
    test_type: int,
    school_id: int | None,
    checksum: str,
) -> ProcessTracking | None:
    """
    Return an in-flight SCORE_IMPORT job for the same file fingerprint.

    Matches PENDING / IN_PROGRESS jobs with identical
    (exam_id, test_type, school_id, file_checksum). Completed jobs are not
    reused so operators can re-import the same file intentionally.
    """
    stmt = (
        select(ProcessTracking)
        .where(
            ProcessTracking.exam_id == exam_id,
            ProcessTracking.process_type == ProcessType.SCORE_IMPORT,
            ProcessTracking.status.in_(
                [
                    ProcessStatus.PENDING,
                    ProcessStatus.IN_PROGRESS,
                ]
            ),
        )
        .order_by(ProcessTracking.id.desc())
        .limit(50)
    )
    if school_id is not None:
        stmt = stmt.where(ProcessTracking.school_id == school_id)
    else:
        stmt = stmt.where(ProcessTracking.school_id.is_(None))

    rows = (await session.execute(stmt)).scalars().all()
    for row in rows:
        meta = row.process_metadata or {}
        if (
            int(meta.get("test_type") or 0) == int(test_type)
            and meta.get("file_checksum") == checksum
            and not meta.get("dry_run")
        ):
            return row
    return None


async def process_score_import_job(tracking_id: int) -> None:
    """Background entry point: process a saved score import job."""
    from app.dependencies.database import get_sessionmanager
    from app.services.storage import storage_service

    sessionmanager = get_sessionmanager()

    async with sessionmanager.session() as claim_session:
        claimed = (
            await claim_session.execute(
                update(ProcessTracking)
                .where(
                    ProcessTracking.id == tracking_id,
                    ProcessTracking.process_type == ProcessType.SCORE_IMPORT,
                    ProcessTracking.status == ProcessStatus.PENDING,
                )
                .values(
                    status=ProcessStatus.IN_PROGRESS,
                    started_at=datetime.utcnow(),
                    error_message=None,
                )
                .returning(ProcessTracking.id)
            )
        ).scalar_one_or_none()
        await claim_session.commit()
        if claimed is None:
            logger.info(
                "Score import job %s not claimed (already running or finished)",
                tracking_id,
            )
            return

    async with sessionmanager.session() as session:
        tracking_result = await session.execute(
            select(ProcessTracking).where(ProcessTracking.id == tracking_id)
        )
        tracking = tracking_result.scalar_one_or_none()
        if not tracking:
            logger.error("Score import tracking %s not found", tracking_id)
            return

        metadata = dict(tracking.process_metadata or {})
        file_path = metadata.get("file_path")
        filename = metadata.get("filename") or "scores.xlsx"
        test_type = int(metadata.get("test_type") or 1)
        school_id = metadata.get("school_id")
        dry_run = bool(metadata.get("dry_run"))
        exam_id = tracking.exam_id
        job_key = new_job_key(tracking_id=tracking_id)

        async def _persist_progress(
            *,
            status: ProcessStatus | None = None,
            error_message: str | None = None,
            **extra: Any,
        ) -> None:
            async with sessionmanager.session() as progress_session:
                row = (
                    await progress_session.execute(
                        select(ProcessTracking).where(ProcessTracking.id == tracking_id)
                    )
                ).scalar_one_or_none()
                if not row:
                    return
                meta = dict(row.process_metadata or {})
                meta.update(extra)
                row.process_metadata = meta
                flag_modified(row, "process_metadata")
                if status is not None:
                    row.status = status
                    if status == ProcessStatus.IN_PROGRESS and row.started_at is None:
                        row.started_at = datetime.utcnow()
                    if status in (ProcessStatus.COMPLETED, ProcessStatus.FAILED):
                        row.completed_at = datetime.utcnow()
                if error_message is not None:
                    row.error_message = error_message
                progress_session.add(row)
                await progress_session.commit()

        try:
            await _persist_progress(
                processed_rows=0,
                successful=0,
                failed=0,
                skipped=0,
                updated=0,
                errors=[],
                errors_truncated=False,
                errors_file_path=None,
                phase="parsing",
                apply_total=0,
                apply_done=0,
            )

            if not file_path:
                raise ValueError("Upload file path missing from job metadata")
            if exam_id is None:
                raise ValueError("Exam ID missing from job")

            file_content = await storage_service.retrieve(file_path)

            async def on_progress(processed: int, result: ScoreImportResult) -> None:
                await _persist_progress(
                    processed_rows=processed,
                    total_rows=result.total_rows,
                    successful=result.successful,
                    failed=result.failed,
                    skipped=result.skipped,
                    updated=result.updated,
                    errors=[e.as_dict() for e in result.errors],
                    errors_truncated=result.errors_truncated,
                    dry_run=result.dry_run,
                    file_checksum=result.file_checksum,
                    phase=result.phase,
                    apply_total=result.apply_total,
                    apply_done=result.apply_done,
                )

            result = await import_scores(
                session,
                exam_id=exam_id,
                test_type=test_type,  # type: ignore[arg-type]
                file_content=file_content,
                filename=filename,
                school_id=int(school_id) if school_id is not None else None,
                enforce_row_limit=False,
                progress_callback=on_progress,
                dry_run=dry_run,
                job_key=job_key,
            )

            errors_file_path = None
            if result.all_errors:
                try:
                    csv_bytes = build_errors_csv(result.all_errors)
                    errors_file_path, _ = await storage_service.save(
                        csv_bytes,
                        f"score_import_errors_{tracking_id}.csv",
                    )
                except Exception:
                    logger.exception(
                        "Failed to persist error artifact for score import job %s",
                        tracking_id,
                    )

            await _persist_progress(
                status=ProcessStatus.COMPLETED,
                processed_rows=result.total_rows,
                total_rows=result.total_rows,
                successful=result.successful,
                failed=result.failed,
                skipped=result.skipped,
                updated=result.updated,
                errors=[e.as_dict() for e in result.errors],
                errors_truncated=result.errors_truncated,
                errors_file_path=errors_file_path,
                dry_run=result.dry_run,
                file_checksum=result.file_checksum,
                phase="done",
                apply_total=result.apply_total,
                apply_done=result.apply_done,
            )
        except Exception as exc:
            logger.exception("Score import job %s failed", tracking_id)
            try:
                await _persist_progress(
                    status=ProcessStatus.FAILED,
                    error_message=str(exc),
                )
            except Exception:
                logger.exception(
                    "Failed to mark score import job %s as failed", tracking_id
                )


def start_score_import_job(tracking_id: int) -> None:
    """Fire-and-forget score import on the running event loop."""
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.error("No event loop to start score import job %s", tracking_id)
        return
    loop.create_task(process_score_import_job(tracking_id))
    logger.info("Started score import job %s", tracking_id)


def is_stale_in_progress(
    started_at: datetime | None,
    *,
    now: datetime | None = None,
    stale_after_seconds: int = STALE_IMPORT_IN_PROGRESS_SECONDS,
) -> bool:
    """True if an IN_PROGRESS job looks abandoned (null start or older than threshold)."""
    if started_at is None:
        return True
    current = now or datetime.utcnow()
    age = (current - started_at).total_seconds()
    return age >= stale_after_seconds


async def resume_interrupted_score_import_jobs() -> int:
    """After a process restart, re-queue SCORE_IMPORT jobs that were cut off mid-run."""
    from app.dependencies.database import get_sessionmanager

    sessionmanager = get_sessionmanager()
    async with sessionmanager.session() as session:
        locked = (
            await session.execute(
                text("SELECT pg_try_advisory_lock(:key)"),
                {"key": SCORE_IMPORT_RESUME_LOCK_KEY},
            )
        ).scalar()
        if not locked:
            logger.info("Skipping score import resume (another worker holds the lock)")
            return 0

        reset_ids: list[int] = []
        pending_ids: list[int] = []
        try:
            stale_before = datetime.utcnow() - timedelta(seconds=STALE_IMPORT_IN_PROGRESS_SECONDS)
            reset_result = await session.execute(
                update(ProcessTracking)
                .where(
                    ProcessTracking.process_type == ProcessType.SCORE_IMPORT,
                    ProcessTracking.status == ProcessStatus.IN_PROGRESS,
                    or_(
                        ProcessTracking.started_at.is_(None),
                        ProcessTracking.started_at < stale_before,
                    ),
                )
                .values(status=ProcessStatus.PENDING)
                .returning(ProcessTracking.id)
            )
            reset_ids = list(reset_result.scalars().all())
            await session.commit()

            pending_result = await session.execute(
                select(ProcessTracking.id).where(
                    ProcessTracking.process_type == ProcessType.SCORE_IMPORT,
                    ProcessTracking.status == ProcessStatus.PENDING,
                )
            )
            pending_ids = list(pending_result.scalars().all())
        finally:
            await session.execute(
                text("SELECT pg_advisory_unlock(:key)"),
                {"key": SCORE_IMPORT_RESUME_LOCK_KEY},
            )
            await session.commit()

    if reset_ids:
        logger.warning(
            "Reset %s stale interrupted score import job(s) to pending: %s",
            len(reset_ids),
            reset_ids,
        )
    for job_id in pending_ids:
        start_score_import_job(job_id)
    if pending_ids:
        logger.info("Resumed %s pending score import job(s)", len(pending_ids))
    return len(pending_ids)


# Backwards-compatible alias
import_core_scores = import_scores
