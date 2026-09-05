"""High-throughput score import pipeline: parse → lookup maps → classify → bulk apply."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

import pandas as pd
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Candidate,
    DataExtractionMethod,
    Exam,
    ExamRegistration,
    ExamSubject,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
)
from app.services.subject_upload import SubjectUploadParseError
from app.utils.score_utils import (
    calculate_total_score,
    is_absent,
    parse_score_value,
    validate_score_range,
)

logger = logging.getLogger(__name__)

PaperTestType = Literal[1, 2]

LARGE_IMPORT_ROW_THRESHOLD = 5000
MAX_STORED_IMPORT_ERRORS = 500
IMPORT_APPLY_BATCH_SIZE = 2000
IMPORT_PROGRESS_EVERY = 5000  # legacy alias; apply now heartbeats every batch
IN_CHUNK_SIZE = 10_000
# Weighted progress: classify 40%, apply 60%
PROGRESS_CLASSIFY_WEIGHT = 0.4
PROGRESS_APPLY_WEIGHT = 0.6
SKIP_SCORE_TOKENS = frozenset({"N/A", "NA"})
METHOD = DataExtractionMethod.MANUAL_ENTRY_PHYSICAL
ImportPhase = Literal["parsing", "classifying", "applying", "done"]
LOOKUP_CHUNK_SIZE = 5_000

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
    # Full error list for artifact export (not truncated)
    all_errors: list[ScoreImportRowError] = field(default_factory=list)
    dry_run: bool = False
    file_checksum: str | None = None
    phase: ImportPhase = "parsing"
    apply_total: int = 0
    apply_done: int = 0
    classify_frac: float = 0.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "successful": self.successful,
            "failed": self.failed,
            "skipped": self.skipped,
            "updated": self.updated,
            "total_rows": self.total_rows,
            "errors": [e.as_dict() for e in self.errors],
            "errors_truncated": self.errors_truncated,
            "dry_run": self.dry_run,
            "file_checksum": self.file_checksum,
            "phase": self.phase,
            "apply_total": self.apply_total,
            "apply_done": self.apply_done,
            "classify_frac": self.classify_frac,
        }

    def record_error(self, err: ScoreImportRowError) -> None:
        self.failed += 1
        self.all_errors.append(err)
        if len(self.errors) < MAX_STORED_IMPORT_ERRORS:
            self.errors.append(err)
        else:
            self.errors_truncated = True

    def weighted_processed_rows(self) -> int:
        """Map classify+apply progress onto total_rows for the UI bar."""
        total = max(self.total_rows, 1)
        if self.phase in ("parsing", "classifying"):
            # classify_frac (0..1) advances during scoped lookup heartbeats
            frac = min(max(self.classify_frac, 0.0), 1.0)
            return int(total * PROGRESS_CLASSIFY_WEIGHT * max(frac, 0.05))
        if self.phase == "applying":
            apply_frac = (
                self.apply_done / self.apply_total if self.apply_total > 0 else 0.0
            )
            return int(
                total
                * (PROGRESS_CLASSIFY_WEIGHT + PROGRESS_APPLY_WEIGHT * apply_frac)
            )
        return total


@dataclass
class ExamSubjectInfo:
    id: int
    obj_max_score: float | None
    essay_max_score: float | None


@dataclass
class ExistingScoreInfo:
    score_id: int | None
    obj_raw_score: str | None
    essay_raw_score: str | None
    pract_raw_score: str | None


@dataclass
class ImportLookups:
    subject_by_code: dict[str, ExamSubjectInfo]
    reg_by_index: dict[str, int]
    # stripped leading-zero index → unique exam_registration_id (only if unambiguous)
    reg_by_stripped_index: dict[str, int]
    # (exam_registration_id, exam_subject_id) → (subject_registration_id, ExistingScoreInfo)
    sr_lookup: dict[tuple[int, int], tuple[int, ExistingScoreInfo]]


@dataclass
class ReadyApplyRow:
    row_num: int
    subject_registration_id: int
    subject_score_id: int | None
    parsed_score: str
    total_score: float


def file_checksum(file_content: bytes) -> str:
    return hashlib.sha256(file_content).hexdigest()


def new_job_key(*, tracking_id: int | None = None) -> str:
    if tracking_id is not None:
        return f"job-{tracking_id}"
    return f"sync-{uuid.uuid4().hex}"


def _normalize_header(value: Any) -> str:
    import re

    text = str(value or "").strip().lower()
    text = re.sub(r"[\s\-]+", "_", text)
    return text


def normalize_score_import_columns(df: pd.DataFrame) -> pd.DataFrame:
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
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if isinstance(value, str) and not value.strip():
        return None
    if isinstance(value, float) and value == int(value):
        return str(int(value))
    if isinstance(value, int):
        return str(value)
    text = str(value).strip()
    return text or None


def _cell_to_raw_str(value: Any) -> str | None:
    """Preserve leading zeros; treat Excel floats carefully."""
    if value is None:
        return None
    if isinstance(value, float):
        if pd.isna(value):
            return None
        if value == int(value):
            return str(int(value))
        return str(value).strip() or None
    if isinstance(value, int):
        return str(value)
    text = str(value).strip()
    return text or None


def is_skip_score_value(score_text: str | None) -> bool:
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


def paper_max_for_exam_subject(info: ExamSubjectInfo, test_type: PaperTestType) -> float | None:
    if test_type == 1:
        return info.obj_max_score
    return info.essay_max_score


def paper_is_required_for_import(info: ExamSubjectInfo, test_type: PaperTestType) -> bool:
    max_score = paper_max_for_exam_subject(info, test_type)
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


def _chunked[T](items: list[T], size: int = IN_CHUNK_SIZE):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _read_xlsx_as_strings(file_content: bytes) -> pd.DataFrame:
    """Stream xlsx with openpyxl read_only; all cells as strings (preserve index zeros)."""
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(file_content), read_only=True, data_only=True)
    try:
        ws = wb.active
        if ws is None:
            raise SubjectUploadParseError("Excel workbook has no active sheet")
        rows_iter = ws.iter_rows(values_only=True)
        try:
            header_row = next(rows_iter)
        except StopIteration as exc:
            raise SubjectUploadParseError("File is empty or contains no data") from exc

        headers = [str(h).strip() if h is not None else f"col_{i}" for i, h in enumerate(header_row)]
        data: list[list[str | None]] = []
        for row in rows_iter:
            if row is None or all(c is None or (isinstance(c, str) and not c.strip()) for c in row):
                continue
            # Pad/truncate to header length
            cells: list[str | None] = []
            for i in range(len(headers)):
                val = row[i] if i < len(row) else None
                cells.append(_cell_to_raw_str(val))
            if all(c is None for c in cells):
                continue
            data.append(cells)
        if not data:
            raise SubjectUploadParseError("File is empty or contains no data")
        return pd.DataFrame(data, columns=headers)
    finally:
        wb.close()


def parse_score_import_file(file_content: bytes, filename: str) -> pd.DataFrame:
    """
    Parse Excel/CSV for score import with string dtypes.

    Legacy .xls is rejected (openpyxl cannot read it reliably).
    Prefer .csv for very large files; .xlsx uses read-only streaming.
    """
    file_lower = (filename or "").lower()
    try:
        if file_lower.endswith(".xls") and not file_lower.endswith(".xlsx"):
            raise SubjectUploadParseError(
                "Legacy .xls is not supported. Save the file as .xlsx or .csv and try again."
            )
        if file_lower.endswith(".csv"):
            df = pd.read_csv(
                io.BytesIO(file_content),
                dtype=str,
                keep_default_na=False,
            )
        elif file_lower.endswith(".xlsx"):
            df = _read_xlsx_as_strings(file_content)
        else:
            raise SubjectUploadParseError(
                f"Unsupported file type. Expected .xlsx or .csv, got {filename}"
            )

        df = df.dropna(how="all")
        if df.empty:
            raise SubjectUploadParseError("File is empty or contains no data")
        return df
    except SubjectUploadParseError:
        raise
    except pd.errors.EmptyDataError as exc:
        raise SubjectUploadParseError("File is empty or contains no data") from exc
    except Exception as exc:
        raise SubjectUploadParseError(f"Failed to parse file: {exc}") from exc


def extract_import_row_tuples(df: pd.DataFrame) -> list[tuple[int, str | None, str | None, str | None]]:
    """Return (excel_row_number, index_number, subject_code, score_text) without iterrows."""
    index_col = df["index_number"].tolist()
    code_col = df["subject_code"].tolist()
    score_col = df["score"].tolist()
    out: list[tuple[int, str | None, str | None, str | None]] = []
    for i in range(len(df)):
        excel_row = i + 2
        out.append(
            (
                excel_row,
                _cell_str(index_col[i]),
                _cell_str(code_col[i]),
                _cell_str(score_col[i]),
            )
        )
    return out


def collect_file_lookup_keys(
    rows: list[tuple[int, str | None, str | None, str | None]],
) -> tuple[set[str], set[str]]:
    """Distinct non-empty index numbers and subject codes from parsed file rows."""
    indexes: set[str] = set()
    codes: set[str] = set()
    for _row, index_number, subject_code, _score in rows:
        if index_number:
            indexes.add(index_number)
        if subject_code:
            codes.add(subject_code.upper())
    return indexes, codes


async def load_import_lookups(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int | None,
    test_type: PaperTestType,
    index_numbers: set[str] | None = None,
    subject_codes: set[str] | None = None,
    progress_callback: Any | None = None,
    progress_result: ScoreImportResult | None = None,
) -> ImportLookups:
    """
    Load slim ID maps scoped to keys present in the upload file.

    Never loads every registration for the exam — that caused Matching-rows hangs
    on national exams. Falls back to whole-exam only when index_numbers is None
    (tests / legacy callers).
    """
    _ = test_type

    async def _heartbeat(frac: float) -> None:
        if progress_callback and progress_result is not None:
            progress_result.phase = "classifying"
            progress_result.classify_frac = frac
            await progress_callback(progress_result.weighted_processed_rows(), progress_result)

    await _heartbeat(0.05)

    es_stmt = (
        select(
            ExamSubject.id,
            ExamSubject.obj_max_score,
            ExamSubject.essay_max_score,
            Subject.original_code,
            Subject.code,
        )
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(ExamSubject.exam_id == exam_id)
    )
    es_rows = (await session.execute(es_stmt)).all()
    subject_by_code: dict[str, ExamSubjectInfo] = {}
    for es_id, obj_max, essay_max, original_code, code in es_rows:
        info = ExamSubjectInfo(id=es_id, obj_max_score=obj_max, essay_max_score=essay_max)
        for raw in (original_code, code):
            if raw and str(raw).strip():
                subject_by_code[str(raw).strip().upper()] = info

    await _heartbeat(0.15)

    # Restrict to subjects referenced in the file when provided
    if subject_codes is not None:
        needed_es_ids = {
            info.id
            for code, info in subject_by_code.items()
            if code in subject_codes
        }
    else:
        needed_es_ids = {info.id for info in subject_by_code.values()}

    reg_by_index: dict[str, int] = {}
    reg_by_stripped_index: dict[str, int] = {}

    if index_numbers is None:
        # Legacy whole-exam path (avoid for large exams)
        reg_stmt = (
            select(ExamRegistration.id, ExamRegistration.index_number)
            .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
            .where(ExamRegistration.exam_id == exam_id)
        )
        if school_id is not None:
            reg_stmt = reg_stmt.where(Candidate.school_id == school_id)
        reg_rows = (await session.execute(reg_stmt)).all()
        stripped_buckets: dict[str, list[int]] = {}
        for reg_id, index_number in reg_rows:
            if not index_number:
                continue
            key = str(index_number).strip()
            reg_by_index[key] = reg_id
            stripped = key.lstrip("0") or "0"
            stripped_buckets.setdefault(stripped, []).append(reg_id)
        reg_by_stripped_index = {
            stripped: ids[0] for stripped, ids in stripped_buckets.items() if len(ids) == 1
        }
        await _heartbeat(0.55)
    else:
        index_list = sorted(index_numbers)
        total_chunks = max(1, (len(index_list) + LOOKUP_CHUNK_SIZE - 1) // LOOKUP_CHUNK_SIZE)
        for chunk_i, chunk in enumerate(_chunked(index_list, LOOKUP_CHUNK_SIZE)):
            reg_stmt = (
                select(ExamRegistration.id, ExamRegistration.index_number)
                .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
                .where(
                    ExamRegistration.exam_id == exam_id,
                    ExamRegistration.index_number.in_(chunk),
                )
            )
            if school_id is not None:
                reg_stmt = reg_stmt.where(Candidate.school_id == school_id)
            for reg_id, index_number in (await session.execute(reg_stmt)).all():
                if not index_number:
                    continue
                key = str(index_number).strip()
                reg_by_index[key] = reg_id
            await _heartbeat(0.15 + 0.35 * ((chunk_i + 1) / total_chunks))

        # Narrow leading-zero fallback for file indexes that did not exact-match
        unmatched = [idx for idx in index_list if idx not in reg_by_index]
        if unmatched:
            stripped_needed = sorted({(idx.lstrip("0") or "0") for idx in unmatched})
            stripped_buckets: dict[str, list[tuple[int, str]]] = {}
            stripped_expr = func.coalesce(
                func.nullif(
                    func.regexp_replace(ExamRegistration.index_number, r"^0+", ""),
                    "",
                ),
                "0",
            )
            for chunk in _chunked(stripped_needed, LOOKUP_CHUNK_SIZE):
                reg_stmt = (
                    select(ExamRegistration.id, ExamRegistration.index_number)
                    .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
                    .where(
                        ExamRegistration.exam_id == exam_id,
                        stripped_expr.in_(chunk),
                    )
                )
                if school_id is not None:
                    reg_stmt = reg_stmt.where(Candidate.school_id == school_id)
                for reg_id, index_number in (await session.execute(reg_stmt)).all():
                    if not index_number:
                        continue
                    key = str(index_number).strip()
                    stripped = key.lstrip("0") or "0"
                    stripped_buckets.setdefault(stripped, []).append((reg_id, key))

            for stripped, pairs in stripped_buckets.items():
                if len(pairs) != 1:
                    continue
                reg_id, key = pairs[0]
                reg_by_stripped_index[stripped] = reg_id
                reg_by_index.setdefault(key, reg_id)

        await _heartbeat(0.60)

    reg_ids = list(dict.fromkeys(reg_by_index.values()))
    sr_lookup: dict[tuple[int, int], tuple[int, ExistingScoreInfo]] = {}

    if not reg_ids or not needed_es_ids:
        await _heartbeat(1.0)
        return ImportLookups(
            subject_by_code=subject_by_code,
            reg_by_index=reg_by_index,
            reg_by_stripped_index=reg_by_stripped_index,
            sr_lookup=sr_lookup,
        )

    needed_es_list = list(needed_es_ids)
    reg_chunks = list(_chunked(reg_ids, LOOKUP_CHUNK_SIZE))
    total_sr_chunks = max(1, len(reg_chunks))
    for chunk_i, chunk in enumerate(reg_chunks):
        sr_stmt = (
            select(
                SubjectRegistration.id,
                SubjectRegistration.exam_registration_id,
                SubjectRegistration.exam_subject_id,
                SubjectScore.id,
                SubjectScore.obj_raw_score,
                SubjectScore.essay_raw_score,
                SubjectScore.pract_raw_score,
            )
            .outerjoin(SubjectScore, SubjectScore.subject_registration_id == SubjectRegistration.id)
            .where(
                SubjectRegistration.exam_registration_id.in_(chunk),
                SubjectRegistration.exam_subject_id.in_(needed_es_list),
            )
        )
        for sr_id, er_id, es_id, score_id, obj_raw, essay_raw, pract_raw in (
            await session.execute(sr_stmt)
        ).all():
            sr_lookup[(er_id, es_id)] = (
                sr_id,
                ExistingScoreInfo(
                    score_id=score_id,
                    obj_raw_score=obj_raw,
                    essay_raw_score=essay_raw,
                    pract_raw_score=pract_raw,
                ),
            )
        await _heartbeat(0.60 + 0.40 * ((chunk_i + 1) / total_sr_chunks))

    await _heartbeat(1.0)
    return ImportLookups(
        subject_by_code=subject_by_code,
        reg_by_index=reg_by_index,
        reg_by_stripped_index=reg_by_stripped_index,
        sr_lookup=sr_lookup,
    )


def resolve_registration_id(lookups: ImportLookups, index_number: str) -> int | None:
    exact = lookups.reg_by_index.get(index_number)
    if exact is not None:
        return exact
    stripped = index_number.lstrip("0") or "0"
    return lookups.reg_by_stripped_index.get(stripped)


def _compute_total_for_apply(
    *,
    test_type: PaperTestType,
    parsed: str,
    existing: ExistingScoreInfo | None,
) -> float:
    if existing is None:
        obj = parsed if test_type == 1 else None
        essay = parsed if test_type == 2 else None
        pract = None
    else:
        obj = parsed if test_type == 1 else existing.obj_raw_score
        essay = parsed if test_type == 2 else existing.essay_raw_score
        pract = existing.pract_raw_score
    return calculate_total_score(obj, essay, pract)


def classify_import_rows(
    rows: list[tuple[int, str | None, str | None, str | None]],
    lookups: ImportLookups,
    *,
    test_type: PaperTestType,
    school_id: int | None = None,
) -> tuple[ScoreImportResult, list[ReadyApplyRow]]:
    """Validate/match rows in pure Python with O(1) maps. No DB I/O."""
    result = ScoreImportResult(total_rows=len(rows))
    ready: list[ReadyApplyRow] = []

    for excel_row, index_number, subject_code_raw, score_text in rows:
        if is_skip_score_value(score_text):
            result.skipped += 1
            continue
        if not index_number:
            result.record_error(
                ScoreImportRowError(
                    row=excel_row,
                    subject_code=subject_code_raw,
                    message="index_number is required",
                )
            )
            continue
        if not subject_code_raw:
            result.record_error(
                ScoreImportRowError(
                    row=excel_row,
                    index_number=index_number,
                    message="subject_code is required",
                )
            )
            continue

        exam_subject = lookups.subject_by_code.get(subject_code_raw.upper())
        if not exam_subject:
            result.record_error(
                ScoreImportRowError(
                    row=excel_row,
                    index_number=index_number,
                    subject_code=subject_code_raw,
                    message="Subject not found for this examination",
                )
            )
            continue
        if not paper_is_required_for_import(exam_subject, test_type):
            result.record_error(
                ScoreImportRowError(
                    row=excel_row,
                    index_number=index_number,
                    subject_code=subject_code_raw,
                    message=f"Paper {test_type} is not required for this subject",
                )
            )
            continue

        exam_reg_id = resolve_registration_id(lookups, index_number)
        if exam_reg_id is None:
            result.record_error(
                ScoreImportRowError(
                    row=excel_row,
                    index_number=index_number,
                    subject_code=subject_code_raw,
                    message="Candidate index number not found for this examination"
                    + (" / school" if school_id is not None else ""),
                )
            )
            continue

        sr_entry = lookups.sr_lookup.get((exam_reg_id, exam_subject.id))
        if sr_entry is None:
            result.record_error(
                ScoreImportRowError(
                    row=excel_row,
                    index_number=index_number,
                    subject_code=subject_code_raw,
                    message="Candidate is not registered for this subject",
                )
            )
            continue

        subject_reg_id, existing = sr_entry
        try:
            parsed = parse_score_value(score_text)
        except ValueError as exc:
            result.record_error(
                ScoreImportRowError(
                    row=excel_row,
                    index_number=index_number,
                    subject_code=subject_code_raw,
                    message=str(exc),
                )
            )
            continue

        max_score = paper_max_for_exam_subject(exam_subject, test_type)
        if max_score is not None and parsed is not None and not is_absent(parsed):
            ok, err = validate_score_range(parsed, max_score)
            if not ok:
                result.record_error(
                    ScoreImportRowError(
                        row=excel_row,
                        index_number=index_number,
                        subject_code=subject_code_raw,
                        message=err or "Score out of range",
                    )
                )
                continue

        if parsed is None:
            result.skipped += 1
            continue

        total = _compute_total_for_apply(
            test_type=test_type, parsed=parsed, existing=existing
        )
        ready.append(
            ReadyApplyRow(
                row_num=excel_row,
                subject_registration_id=subject_reg_id,
                subject_score_id=existing.score_id,
                parsed_score=parsed,
                total_score=total,
            )
        )
        result.successful += 1
        result.updated += 1

    return result, ready


async def _bulk_update_scores(
    session: AsyncSession,
    *,
    test_type: PaperTestType,
    rows: list[ReadyApplyRow],
    method_value: str,
    now: datetime,
) -> None:
    if not rows:
        return
    payload = json.dumps(
        [
            {
                "id": r.subject_score_id,
                "parsed": r.parsed_score,
                "total_score": r.total_score,
            }
            for r in rows
            if r.subject_score_id is not None
        ]
    )
    if test_type == 1:
        await session.execute(
            text(
                """
                UPDATE subject_scores AS ss
                SET
                    obj_raw_score = data.parsed,
                    obj_extraction_method = CAST(:method AS dataextractionmethod),
                    total_score = data.total_score,
                    updated_at = :now
                FROM jsonb_to_recordset(CAST(:payload AS jsonb)) AS data(
                    id int,
                    parsed text,
                    total_score float8
                )
                WHERE ss.id = data.id
                """
            ),
            {"payload": payload, "method": method_value, "now": now},
        )
    else:
        await session.execute(
            text(
                """
                UPDATE subject_scores AS ss
                SET
                    essay_raw_score = data.parsed,
                    essay_extraction_method = CAST(:method AS dataextractionmethod),
                    total_score = data.total_score,
                    updated_at = :now
                FROM jsonb_to_recordset(CAST(:payload AS jsonb)) AS data(
                    id int,
                    parsed text,
                    total_score float8
                )
                WHERE ss.id = data.id
                """
            ),
            {"payload": payload, "method": method_value, "now": now},
        )


async def _bulk_insert_scores(
    session: AsyncSession,
    *,
    test_type: PaperTestType,
    rows: list[ReadyApplyRow],
    method_value: str,
    now: datetime,
) -> None:
    if not rows:
        return
    payload = json.dumps(
        [
            {
                "sr_id": r.subject_registration_id,
                "parsed": r.parsed_score,
                "total_score": r.total_score,
            }
            for r in rows
            if r.subject_score_id is None
        ]
    )
    if test_type == 1:
        await session.execute(
            text(
                """
                INSERT INTO subject_scores (
                    subject_registration_id,
                    obj_raw_score,
                    essay_raw_score,
                    pract_raw_score,
                    total_score,
                    obj_extraction_method,
                    created_at,
                    updated_at
                )
                SELECT
                    data.sr_id,
                    data.parsed,
                    NULL,
                    NULL,
                    data.total_score,
                    CAST(:method AS dataextractionmethod),
                    :now,
                    :now
                FROM jsonb_to_recordset(CAST(:payload AS jsonb)) AS data(
                    sr_id int,
                    parsed text,
                    total_score float8
                )
                """
            ),
            {"payload": payload, "method": method_value, "now": now},
        )
    else:
        await session.execute(
            text(
                """
                INSERT INTO subject_scores (
                    subject_registration_id,
                    obj_raw_score,
                    essay_raw_score,
                    pract_raw_score,
                    total_score,
                    essay_extraction_method,
                    created_at,
                    updated_at
                )
                SELECT
                    data.sr_id,
                    NULL,
                    data.parsed,
                    NULL,
                    data.total_score,
                    CAST(:method AS dataextractionmethod),
                    :now,
                    :now
                FROM jsonb_to_recordset(CAST(:payload AS jsonb)) AS data(
                    sr_id int,
                    parsed text,
                    total_score float8
                )
                """
            ),
            {"payload": payload, "method": method_value, "now": now},
        )


async def apply_ready_rows(
    session: AsyncSession,
    *,
    ready: list[ReadyApplyRow],
    test_type: PaperTestType,
    progress_callback: Any | None = None,
    result: ScoreImportResult,
) -> None:
    """Set-based UPDATE/INSERT via jsonb_to_recordset — no staging table."""
    result.phase = "applying"
    result.apply_total = len(ready)
    result.apply_done = 0

    if not ready:
        result.phase = "done"
        if progress_callback:
            await progress_callback(result.weighted_processed_rows(), result)
        return

    if progress_callback:
        await progress_callback(result.weighted_processed_rows(), result)

    method_value = METHOD.value

    for batch in _chunked(ready, IMPORT_APPLY_BATCH_SIZE):
        # Heartbeat before SQL so UI leaves Applying 0 / N immediately
        if progress_callback:
            await progress_callback(result.weighted_processed_rows(), result)

        now = datetime.utcnow()
        updates = [r for r in batch if r.subject_score_id is not None]
        inserts = [r for r in batch if r.subject_score_id is None]
        await _bulk_update_scores(
            session,
            test_type=test_type,
            rows=updates,
            method_value=method_value,
            now=now,
        )
        await _bulk_insert_scores(
            session,
            test_type=test_type,
            rows=inserts,
            method_value=method_value,
            now=now,
        )
        await session.commit()

        result.apply_done += len(batch)
        if progress_callback:
            await progress_callback(result.weighted_processed_rows(), result)

    result.phase = "done"
    if progress_callback:
        await progress_callback(result.weighted_processed_rows(), result)


# Backwards-compatible alias
apply_ready_rows_via_staging = apply_ready_rows


def build_errors_csv(errors: list[ScoreImportRowError]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=["row", "index_number", "subject_code", "message"],
        extrasaction="ignore",
    )
    writer.writeheader()
    for err in errors:
        writer.writerow(
            {
                "row": err.row,
                "index_number": err.index_number or "",
                "subject_code": err.subject_code or "",
                "message": err.message,
            }
        )
    return buf.getvalue().encode("utf-8")


async def import_scores_pipeline(
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
    Full import pipeline: parse → file-scoped lookups → classify → bulk apply.

    Large files should set enforce_row_limit=False from the async job worker.
    """
    _ = job_key  # retained for API compatibility with callers
    if test_type not in (1, 2):
        raise ValueError("test_type must be 1 (Paper 1) or 2 (Paper 2)")

    exam = (await session.execute(select(Exam).where(Exam.id == exam_id))).scalar_one_or_none()
    if not exam:
        raise ValueError("Examination not found")

    if school_id is not None:
        school = (
            await session.execute(select(School).where(School.id == school_id))
        ).scalar_one_or_none()
        if not school:
            raise ValueError("School not found")

    checksum = file_checksum(file_content)

    if preparsed_df is not None:
        df = preparsed_df
    else:
        try:
            df = parse_score_import_file(file_content, filename)
        except SubjectUploadParseError as exc:
            raise ValueError(str(exc)) from exc

    df = normalize_score_import_columns(df)
    validate_score_import_columns(df)

    total_rows = len(df)
    if enforce_row_limit and total_rows > LARGE_IMPORT_ROW_THRESHOLD:
        raise ValueError(
            f"File has {total_rows} rows; maximum for synchronous import is "
            f"{LARGE_IMPORT_ROW_THRESHOLD}. Use async import or filter by school."
        )

    progress_result = ScoreImportResult(
        total_rows=total_rows,
        file_checksum=checksum,
        dry_run=dry_run,
        phase="classifying",
        classify_frac=0.0,
    )
    if progress_callback:
        await progress_callback(progress_result.weighted_processed_rows(), progress_result)

    rows = extract_import_row_tuples(df)
    file_indexes, file_codes = collect_file_lookup_keys(rows)

    lookups = await load_import_lookups(
        session,
        exam_id=exam_id,
        school_id=school_id,
        test_type=test_type,
        index_numbers=file_indexes,
        subject_codes=file_codes,
        progress_callback=progress_callback,
        progress_result=progress_result,
    )
    result, ready = classify_import_rows(
        rows, lookups, test_type=test_type, school_id=school_id
    )
    result.file_checksum = checksum
    result.dry_run = dry_run
    result.apply_total = len(ready)
    result.apply_done = 0
    result.classify_frac = 1.0

    if dry_run:
        result.phase = "done"
        if progress_callback:
            await progress_callback(result.weighted_processed_rows(), result)
        return result

    if progress_callback:
        result.phase = "applying"
        await progress_callback(result.weighted_processed_rows(), result)

    await apply_ready_rows(
        session,
        ready=ready,
        test_type=test_type,
        progress_callback=progress_callback,
        result=result,
    )

    return result
