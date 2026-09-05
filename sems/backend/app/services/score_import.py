"""Subject score Excel import (Paper 1 or Paper 2 per file) — CORE and ELECTIVE."""

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Literal

import pandas as pd
from sqlalchemy import or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.models import (
    Candidate,
    DataExtractionMethod,
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
from app.services.subject_upload import SubjectUploadParseError, parse_upload_file
from app.utils.score_utils import is_absent, parse_score_value, validate_score_range

logger = logging.getLogger(__name__)

LARGE_IMPORT_ROW_THRESHOLD = 5000
MAX_STORED_IMPORT_ERRORS = 500
IMPORT_COMMIT_EVERY = 500
IMPORT_PROGRESS_EVERY = 250
# Only one uvicorn worker should resume interrupted imports on startup.
SCORE_IMPORT_RESUME_LOCK_KEY = 874_291_556_301
# Do not reset IN_PROGRESS jobs claimed moments ago by a sibling worker.
STALE_IMPORT_IN_PROGRESS_SECONDS = 5 * 60
PaperTestType = Literal[1, 2]
SKIP_SCORE_TOKENS = frozenset({"N/A", "NA"})

REQUIRED_COLUMNS = ("index_number", "subject_code", "score")
OPTIONAL_COLUMNS = ("subject_name",)

COLUMN_ALIASES: dict[str, str] = {
    "index_number": "index_number",
    "index": "index_number",
    "indexnumber": "index_number",
    "candidate_index": "index_number",
    "candidate_index_number": "index_number",
    "subject_code": "subject_code",
    "subjectcode": "subject_code",
    "code": "subject_code",
    "original_code": "subject_code",
    "score": "score",
    "raw_score": "score",
    "mark": "score",
    "marks": "score",
    "subject_name": "subject_name",
    "subjectname": "subject_name",
    "name": "subject_name",
}


@dataclass
class ScoreImportRowError:
    row: int
    index_number: str | None = None
    subject_code: str | None = None
    message: str = ""

    def as_dict(self) -> dict[str, str]:
        out: dict[str, str] = {"row": str(self.row), "message": self.message}
        if self.index_number is not None:
            out["index_number"] = self.index_number
        if self.subject_code is not None:
            out["subject_code"] = self.subject_code
        return out


@dataclass
class ScoreImportResult:
    successful: int = 0
    failed: int = 0
    skipped: int = 0
    updated: int = 0
    total_rows: int = 0
    errors: list[ScoreImportRowError] = field(default_factory=list)
    errors_truncated: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "successful": self.successful,
            "failed": self.failed,
            "skipped": self.skipped,
            "updated": self.updated,
            "total_rows": self.total_rows,
            "errors": [e.as_dict() for e in self.errors],
            "errors_truncated": self.errors_truncated,
        }


def _normalize_header(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[\s\-]+", "_", text)
    return text


def normalize_score_import_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename columns to canonical names using aliases."""
    rename: dict[str, str] = {}
    used_targets: set[str] = set()
    for col in df.columns:
        key = _normalize_header(col)
        target = COLUMN_ALIASES.get(key)
        if target and target not in used_targets:
            rename[col] = target
            used_targets.add(target)
    return df.rename(columns=rename)


def validate_score_import_columns(df: pd.DataFrame) -> None:
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            f"Missing required column(s): {', '.join(missing)}. "
            f"Expected: {', '.join(REQUIRED_COLUMNS)}"
        )


def _cell_str(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, str) and not value.strip():
        return None
    # Avoid "12.0" for integer Excel numbers
    if isinstance(value, float) and value == int(value):
        return str(int(value))
    if isinstance(value, int):
        return str(value)
    text = str(value).strip()
    return text or None


def is_skip_score_value(score_text: str | None) -> bool:
    """Blank or N/A / NA means skip (do not update / not registered)."""
    if score_text is None:
        return True
    normalized = score_text.strip().upper()
    if not normalized:
        return True
    return normalized in SKIP_SCORE_TOKENS


def paper_field_name(test_type: PaperTestType) -> str:
    return "obj_raw_score" if test_type == 1 else "essay_raw_score"


def paper_extraction_attr(test_type: PaperTestType) -> str:
    return "obj_extraction_method" if test_type == 1 else "essay_extraction_method"


def paper_max_for_exam_subject(exam_subject: ExamSubject, test_type: PaperTestType) -> float | None:
    if test_type == 1:
        return exam_subject.obj_max_score
    return exam_subject.essay_max_score


def paper_is_required_for_import(exam_subject: ExamSubject, test_type: PaperTestType) -> bool:
    max_score = paper_max_for_exam_subject(exam_subject, test_type)
    return max_score is not None and max_score > 0


def paper_score_is_missing(subject_score: SubjectScore | None, test_type: PaperTestType) -> bool:
    if subject_score is None:
        return True
    raw = getattr(subject_score, paper_field_name(test_type), None)
    if raw is None:
        return True
    if isinstance(raw, str) and not raw.strip():
        return True
    return False


def subject_lookup_keys(subject: Subject) -> set[str]:
    keys: set[str] = set()
    for raw in (subject.original_code, subject.code):
        if raw and str(raw).strip():
            keys.add(str(raw).strip().upper())
    return keys


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
        # Force text cells — pandas treats "N/A"/"NA" as missing when writing Excel
        for row_idx, row in enumerate(rows, start=2):
            for col_idx, key in enumerate(
                ("index_number", "subject_code", "subject_name", "score"), start=1
            ):
                raw = row.get(key, "")
                text = "" if raw is None else str(raw)
                cell = ws.cell(row=row_idx, column=col_idx, value=text)
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
    """
    Build a format-only Excel template (example rows, not real candidates).

    Optional exam_id only affects the download filename when provided.
    """
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
    """
    Prefill rows for candidates registered for subject_id with a missing score
    on the selected paper.
    """
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

    if not paper_is_required_for_import(exam_subject, test_type):
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
                "subject_name": f"{subject_name} — no missing {('P1' if test_type == 1 else 'P2')} scores in scope",
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
) -> ScoreImportResult:
    """
    Import CORE and ELECTIVE subject scores for one paper from an Excel/CSV file.

    Blank and N/A score cells are skipped. Non-blank values overwrite the selected paper field.

    When enforce_row_limit is True, files above LARGE_IMPORT_ROW_THRESHOLD raise ValueError
    (callers should start an async job instead).
    """
    if test_type not in (1, 2):
        raise ValueError("test_type must be 1 (Paper 1) or 2 (Paper 2)")

    exam = (await session.execute(select(Exam).where(Exam.id == exam_id))).scalar_one_or_none()
    if not exam:
        raise ValueError("Examination not found")

    if school_id is not None:
        school = (await session.execute(select(School).where(School.id == school_id))).scalar_one_or_none()
        if not school:
            raise ValueError("School not found")

    try:
        df = parse_upload_file(file_content, filename)
    except SubjectUploadParseError as exc:
        raise ValueError(str(exc)) from exc

    df = normalize_score_import_columns(df)
    validate_score_import_columns(df)

    total_rows = len(df)
    if enforce_row_limit and total_rows > LARGE_IMPORT_ROW_THRESHOLD:
        raise ValueError(
            f"File has {total_rows} rows; maximum for synchronous import is {LARGE_IMPORT_ROW_THRESHOLD}. "
            "Use async import or filter by school."
        )

    # Load all exam subjects for this exam (CORE + ELECTIVE)
    es_stmt = (
        select(ExamSubject)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(ExamSubject.exam_id == exam_id)
        .options(selectinload(ExamSubject.subject))
    )
    exam_subjects = (await session.execute(es_stmt)).scalars().all()
    subject_by_code: dict[str, ExamSubject] = {}
    for es in exam_subjects:
        for key in subject_lookup_keys(es.subject):
            subject_by_code[key] = es

    # Load exam registrations (+ optional school filter)
    reg_stmt = (
        select(ExamRegistration)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .where(ExamRegistration.exam_id == exam_id)
        .options(
            selectinload(ExamRegistration.subject_registrations)
            .selectinload(SubjectRegistration.subject_score),
            selectinload(ExamRegistration.subject_registrations).selectinload(
                SubjectRegistration.exam_subject
            ),
        )
    )
    if school_id is not None:
        reg_stmt = reg_stmt.where(Candidate.school_id == school_id)
    registrations = (await session.execute(reg_stmt)).scalars().all()
    reg_by_index: dict[str, ExamRegistration] = {
        (r.index_number or "").strip(): r for r in registrations if r.index_number
    }

    def resolve_registration(index_number: str) -> ExamRegistration | None:
        """Match index; tolerate Excel stripping leading zeros from numeric cells."""
        exact = reg_by_index.get(index_number)
        if exact is not None:
            return exact
        stripped = index_number.lstrip("0") or "0"
        matches = [
            reg
            for key, reg in reg_by_index.items()
            if (key.lstrip("0") or "0") == stripped
        ]
        return matches[0] if len(matches) == 1 else None

    def record_error(result: ScoreImportResult, err: ScoreImportRowError) -> None:
        result.failed += 1
        if len(result.errors) < MAX_STORED_IMPORT_ERRORS:
            result.errors.append(err)
        else:
            result.errors_truncated = True

    result = ScoreImportResult(total_rows=total_rows)
    field_name = paper_field_name(test_type)
    extraction_attr = paper_extraction_attr(test_type)
    method = DataExtractionMethod.MANUAL_ENTRY_PHYSICAL
    pending_writes = 0

    for offset, (_, series) in enumerate(df.iterrows()):
        excel_row = offset + 2  # header is row 1
        index_number = _cell_str(series.get("index_number"))
        subject_code_raw = _cell_str(series.get("subject_code"))
        score_raw = series.get("score")

        # Blank or N/A → skip (do not clear; N/A = not registered / ignore)
        score_text = _cell_str(score_raw)
        if is_skip_score_value(score_text):
            result.skipped += 1
        elif not index_number:
            record_error(
                result,
                ScoreImportRowError(
                    row=excel_row,
                    subject_code=subject_code_raw,
                    message="index_number is required",
                ),
            )
        elif not subject_code_raw:
            record_error(
                result,
                ScoreImportRowError(
                    row=excel_row,
                    index_number=index_number,
                    message="subject_code is required",
                ),
            )
        else:
            subject_key = subject_code_raw.upper()
            exam_subject = subject_by_code.get(subject_key)
            if not exam_subject:
                record_error(
                    result,
                    ScoreImportRowError(
                        row=excel_row,
                        index_number=index_number,
                        subject_code=subject_code_raw,
                        message="Subject not found for this examination",
                    ),
                )
            elif not paper_is_required_for_import(exam_subject, test_type):
                record_error(
                    result,
                    ScoreImportRowError(
                        row=excel_row,
                        index_number=index_number,
                        subject_code=subject_code_raw,
                        message=f"Paper {test_type} is not required for this subject",
                    ),
                )
            else:
                exam_reg = resolve_registration(index_number)
                if not exam_reg:
                    record_error(
                        result,
                        ScoreImportRowError(
                            row=excel_row,
                            index_number=index_number,
                            subject_code=subject_code_raw,
                            message="Candidate index number not found for this examination"
                            + (" / school" if school_id is not None else ""),
                        ),
                    )
                else:
                    subject_reg = next(
                        (
                            sr
                            for sr in exam_reg.subject_registrations
                            if sr.exam_subject_id == exam_subject.id
                        ),
                        None,
                    )
                    if not subject_reg:
                        record_error(
                            result,
                            ScoreImportRowError(
                                row=excel_row,
                                index_number=index_number,
                                subject_code=subject_code_raw,
                                message="Candidate is not registered for this subject",
                            ),
                        )
                    else:
                        subject_score = subject_reg.subject_score
                        if not subject_score:
                            subject_score = SubjectScore(
                                subject_registration_id=subject_reg.id,
                                total_score=0.0,
                            )
                            session.add(subject_score)
                            await session.flush()
                            subject_reg.subject_score = subject_score

                        try:
                            parsed = parse_score_value(score_text)
                        except ValueError as exc:
                            record_error(
                                result,
                                ScoreImportRowError(
                                    row=excel_row,
                                    index_number=index_number,
                                    subject_code=subject_code_raw,
                                    message=str(exc),
                                ),
                            )
                        else:
                            max_score = paper_max_for_exam_subject(exam_subject, test_type)
                            out_of_range = False
                            if max_score is not None and parsed is not None and not is_absent(parsed):
                                ok, err = validate_score_range(parsed, max_score)
                                if not ok:
                                    record_error(
                                        result,
                                        ScoreImportRowError(
                                            row=excel_row,
                                            index_number=index_number,
                                            subject_code=subject_code_raw,
                                            message=err or "Score out of range",
                                        ),
                                    )
                                    out_of_range = True
                            if not out_of_range:
                                setattr(subject_score, field_name, parsed)
                                setattr(subject_score, extraction_attr, method)
                                result.successful += 1
                                result.updated += 1
                                pending_writes += 1

        processed = offset + 1
        if pending_writes >= IMPORT_COMMIT_EVERY:
            await session.commit()
            pending_writes = 0
        if progress_callback and (
            processed % IMPORT_PROGRESS_EVERY == 0 or processed == total_rows
        ):
            await progress_callback(processed, result)

    await session.commit()
    if progress_callback:
        await progress_callback(total_rows, result)
    return result


async def process_score_import_job(tracking_id: int) -> None:
    """Background entry point: process a saved score import job.

    Uses an atomic claim so only one worker processes a job when multiple
    uvicorn workers (or startup resume) race to start the same tracking id.
    """
    from app.dependencies.database import get_sessionmanager
    from app.services.storage import storage_service

    sessionmanager = get_sessionmanager()

    # Claim PENDING (or re-claim after restart reset) so dual workers don't double-run.
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
        exam_id = tracking.exam_id

        async def _persist_progress(
            *,
            status: ProcessStatus | None = None,
            error_message: str | None = None,
            **extra: Any,
        ) -> None:
            """Update job progress in a separate session so import ORM state stays intact."""
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
            )
        except Exception as exc:
            logger.exception("Score import job %s failed", tracking_id)
            try:
                await _persist_progress(
                    status=ProcessStatus.FAILED,
                    error_message=str(exc),
                )
            except Exception:
                logger.exception("Failed to mark score import job %s as failed", tracking_id)


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
    """After a process restart, re-queue SCORE_IMPORT jobs that were cut off mid-run.

    Only one worker leads (Postgres advisory lock). Fresh IN_PROGRESS claims from a
    sibling worker are left alone; only stale IN_PROGRESS jobs are reset to PENDING.
    Atomic claim inside process_score_import_job still prevents double-processing.
    """
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
