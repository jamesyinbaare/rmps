"""Score validation report: live classify papers, Excel + WeasyPrint PDF."""

from __future__ import annotations

import io
import logging
import re
import zipfile
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

import xlsxwriter
from jinja2 import Environment, FileSystemLoader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from weasyprint import HTML

from app.config import settings
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
    SubjectType,
    ValidationIssueType,
)
from app.services.results_export import sanitize_filename_part
from app.services.subject_score_validation import validate_subject_score
from app.utils.score_utils import is_absent

logger = logging.getLogger(__name__)

LARGE_REPORT_ROW_THRESHOLD = 5000
ReportFormat = Literal["xlsx", "pdf"]
ReportStatus = Literal["entered", "missing", "invalid", "absent"]

PAPER_META: dict[int, dict[str, str]] = {
    1: {"field": "obj_raw_score", "label": "Paper 1 (Objectives)", "short": "P1"},
    2: {"field": "essay_raw_score", "label": "Paper 2 (Essay)", "short": "P2"},
    3: {"field": "pract_raw_score", "label": "Paper 3 (Practical)", "short": "P3"},
}

EXTRACTION_ATTR: dict[int, str] = {
    1: "obj_extraction_method",
    2: "essay_extraction_method",
    3: "pract_extraction_method",
}

DEFAULT_STATUS: ReportStatus = "missing"


@dataclass
class ReportDetailRow:
    school_id: int
    school_code: str
    school_name: str
    subject_id: int
    subject_code: str
    subject_name: str
    subject_type: str
    candidate_id: int
    index_number: str
    candidate_name: str
    test_type: int
    paper_label: str
    paper_short: str
    raw_score: str | None
    max_score: float | None
    status: ReportStatus
    message: str | None
    extraction_method: str | None
    expected: str | None = None
    missing_papers: str | None = None


@dataclass
class DetailColumn:
    key: str
    header: str


def detail_columns_for_status(
    status: ReportStatus,
    *,
    combine_p1_p2: bool = False,
) -> list[DetailColumn]:
    """Adaptive detail columns for a single report status.

    Paper and max score live in section headers (PDF/Excel), not row columns —
    except combined P1/P2 missing mode, which shows Missing papers per row.
    """
    base = [
        DetailColumn("index_number", "Index number"),
        DetailColumn("candidate_name", "Candidate name"),
    ]
    if status == "missing" and combine_p1_p2:
        return [
            *base,
            DetailColumn("missing_papers", "Missing papers"),
        ]
    if status == "missing":
        return base
    if status == "invalid":
        return [
            *base,
            DetailColumn("raw_score", "Value"),
            DetailColumn("expected", "Expected"),
        ]
    if status == "absent":
        return base
    # entered — recorded score only; max is in the section header
    return [
        *base,
        DetailColumn("raw_score", "Score"),
    ]


def row_cell_value(row: ReportDetailRow, key: str) -> str:
    if key == "raw_score":
        return row.raw_score if row.raw_score is not None else ""
    if key == "max_score":
        return _format_max_score(row.max_score)
    if key == "expected":
        return row.expected or ""
    if key == "missing_papers":
        return row.missing_papers or row.paper_short or ""
    return str(getattr(row, key) or "")


def expected_for_invalid(
    *,
    message: str | None,
    max_score: float | None,
) -> str:
    msg = (message or "").lower()
    if "decimal" in msg or "whole number" in msg:
        return "Whole number"
    if max_score is not None:
        return f"0–{_format_max_score(max_score)}"
    return "Valid score"


@dataclass
class ReportSummary:
    total: int = 0
    entered: int = 0
    missing: int = 0
    invalid: int = 0
    absent: int = 0
    by_school: list[dict[str, Any]] = field(default_factory=list)
    by_subject: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ReportMeta:
    exam_id: int
    exam_label: str
    exam_year: int | None
    exam_series: str | None
    exam_type: str | None
    school_id: int | None
    school_label: str | None
    subject_type: str | None
    subject_ids: list[int] | None
    subject_labels: list[str]
    test_types: list[int] | None
    statuses: list[str]
    generated_at: str
    row_count: int
    school_code: str | None = None
    combine_p1_p2: bool = False


@dataclass
class ScoreValidationReportData:
    meta: ReportMeta
    summary: ReportSummary
    rows: list[ReportDetailRow]


def _enum_value(value: Any) -> str | None:
    if value is None:
        return None
    return value.value if hasattr(value, "value") else str(value)


def _format_max_score(value: float | None) -> str:
    if value is None:
        return ""
    if value == int(value):
        return str(int(value))
    return str(value)


def paper_is_required(exam_subject: ExamSubject, test_type: int) -> bool:
    if test_type == 1:
        return exam_subject.obj_max_score is not None and exam_subject.obj_max_score > 0
    if test_type == 2:
        return exam_subject.essay_max_score is not None and exam_subject.essay_max_score > 0
    if test_type == 3:
        return (
            (exam_subject.pract_max_score is not None and exam_subject.pract_max_score > 0)
            or (exam_subject.pract_pct is not None and exam_subject.pract_pct > 0)
        )
    return False


def paper_max_score(exam_subject: ExamSubject, test_type: int) -> float | None:
    if test_type == 1:
        return exam_subject.obj_max_score
    if test_type == 2:
        return exam_subject.essay_max_score
    if test_type == 3:
        if exam_subject.pract_max_score is not None and exam_subject.pract_max_score > 0:
            return exam_subject.pract_max_score
        return None
    return None


def get_raw_score(subject_score: SubjectScore, test_type: int) -> str | None:
    field_name = PAPER_META[test_type]["field"]
    return getattr(subject_score, field_name)


def classify_paper(
    subject_score: SubjectScore,
    exam_subject: ExamSubject,
    test_type: int,
) -> tuple[ReportStatus, str | None, str | None]:
    """Live-classify one required paper. Returns (status, message, expected)."""
    issues = validate_subject_score(subject_score, exam_subject)
    paper_issues = [i for i in issues if i.get("test_type") == test_type]
    max_score = paper_max_score(exam_subject, test_type)
    for issue in paper_issues:
        issue_type = issue.get("issue_type")
        message = issue.get("message")
        if issue_type == ValidationIssueType.MISSING_SCORE or issue_type == "missing_score":
            return "missing", message, None
        if issue_type == ValidationIssueType.INVALID_SCORE or issue_type == "invalid_score":
            return "invalid", message, expected_for_invalid(message=message, max_score=max_score)

    raw = get_raw_score(subject_score, test_type)
    if is_absent(raw):
        return "absent", None, None
    return "entered", None, None


def classify_score_papers(
    subject_score: SubjectScore,
    exam_subject: ExamSubject,
    *,
    test_types: set[int] | None = None,
) -> list[tuple[int, ReportStatus, str | None, float | None, str | None, str | None]]:
    """
    Expand a SubjectScore into classified papers.

    Returns list of (test_type, status, message, max_score, raw_score, expected).
    """
    results: list[tuple[int, ReportStatus, str | None, float | None, str | None, str | None]] = []
    for test_type in (1, 2, 3):
        if test_types is not None and test_type not in test_types:
            continue
        if not paper_is_required(exam_subject, test_type):
            continue
        status, message, expected = classify_paper(subject_score, exam_subject, test_type)
        results.append(
            (
                test_type,
                status,
                message,
                paper_max_score(exam_subject, test_type),
                get_raw_score(subject_score, test_type),
                expected,
            )
        )
    return results


def missing_p1_p2_label(
    subject_score: SubjectScore,
    exam_subject: ExamSubject,
) -> str | None:
    """
    Return P1, P2, or P1/P2 when any required Paper 1/2 score is missing.
    Returns None when neither required paper is missing (or none required).
    """
    missing_shorts: list[str] = []
    for test_type in (1, 2):
        if not paper_is_required(exam_subject, test_type):
            continue
        status, _, _ = classify_paper(subject_score, exam_subject, test_type)
        if status == "missing":
            missing_shorts.append(PAPER_META[test_type]["short"])
    if not missing_shorts:
        return None
    return "/".join(missing_shorts)


def build_summary(rows: list[ReportDetailRow]) -> ReportSummary:
    summary = ReportSummary(total=len(rows))
    school_counts: dict[tuple[str, str], dict[str, int]] = defaultdict(
        lambda: {"total": 0, "entered": 0, "missing": 0, "invalid": 0, "absent": 0}
    )
    subject_counts: dict[tuple[str, str], dict[str, int]] = defaultdict(
        lambda: {"total": 0, "entered": 0, "missing": 0, "invalid": 0, "absent": 0}
    )

    for row in rows:
        setattr(summary, row.status, getattr(summary, row.status) + 1)
        sk = (row.school_code, row.school_name)
        school_counts[sk]["total"] += 1
        school_counts[sk][row.status] += 1
        sj = (row.subject_code, row.subject_name)
        subject_counts[sj]["total"] += 1
        subject_counts[sj][row.status] += 1

    summary.by_school = [
        {
            "school_code": code,
            "school_name": name,
            **counts,
        }
        for (code, name), counts in sorted(school_counts.items(), key=lambda x: x[0][0])
    ]
    summary.by_subject = [
        {
            "subject_code": code,
            "subject_name": name,
            **counts,
        }
        for (code, name), counts in sorted(subject_counts.items(), key=lambda x: x[0][0])
    ]
    return summary


def _section_max_score(rows: list[ReportDetailRow]) -> str | None:
    """Representative max for a paper+subject block (rows share the same paper)."""
    for row in rows:
        if row.max_score is not None:
            return _format_max_score(row.max_score)
    return None


def group_rows_for_pdf(rows: list[ReportDetailRow]) -> list[dict[str, Any]]:
    """Group sorted rows into school → paper → subject (papers never mixed)."""
    sections: list[dict[str, Any]] = []
    current_school: str | None = None
    current_paper: int | None = None
    current_subject: str | None = None
    school_section: dict[str, Any] | None = None
    paper_section: dict[str, Any] | None = None
    subject_section: dict[str, Any] | None = None

    for row in rows:
        school_key = f"{row.school_code}|{row.school_id}"
        if school_key != current_school:
            school_section = {
                "school_code": row.school_code,
                "school_name": row.school_name,
                "papers": [],
                "subtotals": {"total": 0, "entered": 0, "missing": 0, "invalid": 0, "absent": 0},
            }
            sections.append(school_section)
            current_school = school_key
            current_paper = None
            current_subject = None
            paper_section = None
            subject_section = None
        assert school_section is not None

        if row.test_type != current_paper:
            paper_section = {
                "test_type": row.test_type,
                "paper_label": row.paper_label,
                "paper_short": row.paper_short,
                "subjects": [],
                "subtotals": {"total": 0, "entered": 0, "missing": 0, "invalid": 0, "absent": 0},
            }
            school_section["papers"].append(paper_section)
            current_paper = row.test_type
            current_subject = None
            subject_section = None
        assert paper_section is not None

        subject_key = f"{row.subject_code}|{row.subject_id}"
        if subject_key != current_subject:
            subject_section = {
                "subject_code": row.subject_code,
                "subject_name": row.subject_name,
                "subject_type": row.subject_type,
                "max_score": None,
                "rows": [],
                "subtotals": {"total": 0, "entered": 0, "missing": 0, "invalid": 0, "absent": 0},
            }
            paper_section["subjects"].append(subject_section)
            current_subject = subject_key
        assert subject_section is not None

        subject_section["rows"].append(row)
        subject_section["subtotals"]["total"] += 1
        subject_section["subtotals"][row.status] += 1
        paper_section["subtotals"]["total"] += 1
        paper_section["subtotals"][row.status] += 1
        school_section["subtotals"]["total"] += 1
        school_section["subtotals"][row.status] += 1

    for school in sections:
        for paper in school["papers"]:
            for subject in paper["subjects"]:
                subject["max_score"] = _section_max_score(subject["rows"])

    return sections


def parse_statuses(raw: str | list[str] | None) -> list[ReportStatus]:
    """Require exactly one status. Default: missing."""
    if raw is None or raw == "" or raw == []:
        return [DEFAULT_STATUS]
    if isinstance(raw, list):
        values = [str(v).strip().lower() for v in raw if str(v).strip()]
    else:
        values = [p.strip().lower() for p in raw.split(",") if p.strip()]
    if not values:
        return [DEFAULT_STATUS]
    if "all" in values:
        raise ValueError("Select exactly one status (entered, missing, invalid, or absent)")
    allowed = {"entered", "missing", "invalid", "absent"}
    invalid = [v for v in values if v not in allowed]
    if invalid:
        raise ValueError(f"Invalid status filter(s): {', '.join(invalid)}")
    if len(values) != 1:
        raise ValueError("Select exactly one status at a time")
    return values  # type: ignore[return-value]


def primary_report_status(statuses: list[str] | list[ReportStatus] | None) -> ReportStatus:
    if not statuses:
        return DEFAULT_STATUS
    first = str(statuses[0]).lower()
    if first in ("entered", "missing", "invalid", "absent"):
        return first  # type: ignore[return-value]
    return DEFAULT_STATUS


def parse_test_types(raw: str | list[int] | None) -> list[int] | None:
    if raw is None or raw == "" or raw == []:
        return None
    if isinstance(raw, list):
        values = [int(v) for v in raw]
    else:
        values = [int(p.strip()) for p in raw.split(",") if p.strip()]
    invalid = [v for v in values if v not in (1, 2, 3)]
    if invalid:
        raise ValueError(f"Invalid test_type(s): {', '.join(str(v) for v in invalid)}")
    return values


def parse_subject_ids(raw: str | list[int] | None) -> list[int] | None:
    if raw is None or raw == "" or raw == []:
        return None
    if isinstance(raw, list):
        return [int(v) for v in raw]
    return [int(p.strip()) for p in raw.split(",") if p.strip()]


def should_use_report_job(
    *,
    school_id: int | None,
    report_format: ReportFormat,
    estimated_rows: int | None = None,
    school_count: int | None = None,
) -> bool:
    # Multi-school always goes through jobs (zip packaging).
    if school_id is None:
        return True
    if school_count is not None and school_count > 1:
        return True
    if estimated_rows is not None and estimated_rows > LARGE_REPORT_ROW_THRESHOLD:
        return True
    if estimated_rows is not None and report_format == "pdf" and estimated_rows > 1500:
        return True
    return False


async def build_score_validation_report(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int | None = None,
    subject_type: SubjectType | str | None = None,
    subject_ids: list[int] | None = None,
    test_types: list[int] | None = None,
    statuses: list[ReportStatus] | None = None,
    combine_p1_p2: bool = False,
) -> ScoreValidationReportData:
    exam = (await session.execute(select(Exam).where(Exam.id == exam_id))).scalar_one_or_none()
    if not exam:
        raise ValueError("Examination not found")

    subject_type_enum: SubjectType | None = None
    if subject_type is not None:
        if isinstance(subject_type, SubjectType):
            subject_type_enum = subject_type
        else:
            try:
                subject_type_enum = SubjectType(subject_type)
            except ValueError as exc:
                raise ValueError(f"Invalid subject_type: {subject_type}") from exc

    if statuses is None:
        statuses = [DEFAULT_STATUS]
    status_set = set(statuses)

    # Combined P1/P2 layout only applies when filtering to Missing.
    use_combine = bool(combine_p1_p2) and status_set == {"missing"}
    if combine_p1_p2:
        test_types = [1, 2]
    test_type_set = set(test_types) if test_types else None

    stmt = (
        select(
            SubjectScore,
            ExamSubject,
            Subject,
            Candidate,
            School,
            ExamRegistration,
        )
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id)
        .where(ExamSubject.exam_id == exam_id)
    )
    if school_id is not None:
        stmt = stmt.where(Candidate.school_id == school_id)
    if subject_type_enum is not None:
        stmt = stmt.where(Subject.subject_type == subject_type_enum)
    if subject_ids:
        stmt = stmt.where(ExamSubject.subject_id.in_(subject_ids))

    result = await session.execute(stmt)
    db_rows = result.all()

    detail_rows: list[ReportDetailRow] = []
    for subject_score, exam_subject, subject, candidate, school, exam_reg in db_rows:
        subject_type_value = _enum_value(subject.subject_type) or ""
        common = dict(
            school_id=school.id,
            school_code=school.code or "",
            school_name=school.name or "",
            subject_id=subject.id,
            subject_code=subject.original_code or subject.code or "",
            subject_name=subject.name or "",
            subject_type=subject_type_value,
            candidate_id=candidate.id,
            index_number=exam_reg.index_number or candidate.index_number or "",
            candidate_name=candidate.name or "",
        )

        if use_combine:
            label = missing_p1_p2_label(subject_score, exam_subject)
            if not label:
                continue
            detail_rows.append(
                ReportDetailRow(
                    **common,
                    test_type=0,
                    paper_label="Paper 1 or 2 (combined)",
                    paper_short=label,
                    raw_score=None,
                    max_score=None,
                    status="missing",
                    message=f"Missing score(s): {label}",
                    extraction_method=None,
                    expected=None,
                    missing_papers=label,
                )
            )
            continue

        classified = classify_score_papers(
            subject_score,
            exam_subject,
            test_types=test_type_set,
        )
        for test_type, status, message, max_score, raw_score, expected in classified:
            if status not in status_set:
                continue
            extraction_attr = EXTRACTION_ATTR[test_type]
            extraction = getattr(subject_score, extraction_attr, None)
            detail_rows.append(
                ReportDetailRow(
                    **common,
                    test_type=test_type,
                    paper_label=PAPER_META[test_type]["label"],
                    paper_short=PAPER_META[test_type]["short"],
                    raw_score=raw_score,
                    max_score=max_score,
                    status=status,
                    message=message,
                    extraction_method=_enum_value(extraction),
                    expected=expected,
                    missing_papers=None,
                )
            )

    detail_rows.sort(
        key=lambda r: (
            r.school_code,
            r.test_type,
            r.subject_code,
            r.index_number,
            r.missing_papers or "",
        )
    )

    school_label = None
    school_code_meta: str | None = None
    if school_id is not None:
        school_obj = (await session.execute(select(School).where(School.id == school_id))).scalar_one_or_none()
        if school_obj:
            school_code_meta = school_obj.code
            school_label = f"{school_obj.code} — {school_obj.name}"

    subject_labels: list[str] = []
    if subject_ids:
        subjects = (
            await session.execute(select(Subject).where(Subject.id.in_(subject_ids)))
        ).scalars().all()
        subject_labels = [
            f"{(s.original_code or s.code)} — {s.name}" for s in sorted(subjects, key=lambda x: x.code or "")
        ]

    exam_type = _enum_value(exam.exam_type)
    exam_series = _enum_value(exam.series)
    exam_label = f"{exam.year} {exam_series or ''} {exam_type or ''}".strip()

    statuses_for_meta: list[str] = list(statuses)

    meta = ReportMeta(
        exam_id=exam_id,
        exam_label=exam_label,
        exam_year=exam.year,
        exam_series=exam_series,
        exam_type=exam_type,
        school_id=school_id,
        school_label=school_label,
        school_code=school_code_meta,
        subject_type=_enum_value(subject_type_enum) if subject_type_enum else None,
        subject_ids=subject_ids,
        subject_labels=subject_labels,
        test_types=test_types,
        statuses=statuses_for_meta,
        generated_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        row_count=len(detail_rows),
        combine_p1_p2=use_combine,
    )
    return ScoreValidationReportData(
        meta=meta,
        summary=build_summary(detail_rows),
        rows=detail_rows,
    )


def report_to_preview_dict(
    data: ScoreValidationReportData,
    *,
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = min(max(1, page_size), 200)
    start = (page - 1) * page_size
    end = start + page_size
    page_rows = data.rows[start:end]
    return {
        "meta": asdict(data.meta),
        "summary": asdict(data.summary),
        "page": page,
        "page_size": page_size,
        "total_rows": len(data.rows),
        "rows": [asdict(r) for r in page_rows],
    }


async def generate_report_filename(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int | None,
    subject_type: SubjectType | str | None,
    test_types: list[int] | None,
    statuses: list[ReportStatus] | None,
    report_format: ReportFormat,
    combine_p1_p2: bool = False,
) -> str:
    exam = (await session.execute(select(Exam).where(Exam.id == exam_id))).scalar_one_or_none()
    status_list = statuses or [DEFAULT_STATUS]
    status_part = str(status_list[0]).upper()
    ext = "pdf" if report_format == "pdf" else "xlsx"
    paper_part = "P1_or_P2" if combine_p1_p2 else None

    # Per-school files: school_code_school_name first
    if school_id is not None:
        school = (await session.execute(select(School).where(School.id == school_id))).scalar_one_or_none()
        parts: list[str] = [
            sanitize_filename_part(school.code if school else str(school_id)),
            sanitize_filename_part(school.name if school else "school"),
            "score_validation",
            status_part,
        ]
        if paper_part:
            parts.append(paper_part)
        if exam:
            parts.append(str(exam.year))
            series = _enum_value(exam.series)
            if series:
                parts.append(sanitize_filename_part(series))
        name = "_".join(p for p in parts if p)
        name = re.sub(r"_+", "_", name).strip("._")
        return f"{name}.{ext}"

    # Multi-school zip / all-schools aggregate name
    parts = []
    if exam:
        parts.append(str(exam.year))
        series = _enum_value(exam.series)
        exam_type = _enum_value(exam.exam_type)
        if series:
            parts.append(sanitize_filename_part(series))
        if exam_type:
            parts.append(sanitize_filename_part(exam_type))
    parts.append("score_validation")
    parts.append("ALL")
    if subject_type:
        st = _enum_value(subject_type) if not isinstance(subject_type, str) else subject_type
        parts.append(sanitize_filename_part(str(st)))
    if paper_part:
        parts.append(paper_part)
    elif test_types:
        parts.append("_".join(PAPER_META[t]["short"] for t in sorted(test_types) if t in PAPER_META))
    else:
        parts.append("ALL_PAPERS")
    parts.append(status_part)
    name = "_".join(p for p in parts if p)
    name = re.sub(r"_+", "_", name).strip("._")
    return f"{name}.{ext}"


def _slice_report_for_school(
    data: ScoreValidationReportData,
    school_id: int,
) -> ScoreValidationReportData:
    rows = [r for r in data.rows if r.school_id == school_id]
    if not rows:
        raise ValueError(f"No rows for school_id={school_id}")
    sample = rows[0]
    meta = ReportMeta(
        exam_id=data.meta.exam_id,
        exam_label=data.meta.exam_label,
        exam_year=data.meta.exam_year,
        exam_series=data.meta.exam_series,
        exam_type=data.meta.exam_type,
        school_id=school_id,
        school_label=f"{sample.school_code} — {sample.school_name}",
        school_code=sample.school_code,
        subject_type=data.meta.subject_type,
        subject_ids=data.meta.subject_ids,
        subject_labels=data.meta.subject_labels,
        test_types=data.meta.test_types,
        statuses=list(data.meta.statuses),
        generated_at=data.meta.generated_at,
        row_count=len(rows),
        combine_p1_p2=data.meta.combine_p1_p2,
    )
    return ScoreValidationReportData(meta=meta, summary=build_summary(rows), rows=rows)


def _school_file_basename(data: ScoreValidationReportData, report_format: ReportFormat) -> str:
    """Per-school entry name: {school_code}_{school_name}_score_validation_{STATUS}…"""
    status = primary_report_status(data.meta.statuses)
    label = data.meta.school_label or ""
    code_from_label = label.split("—")[0].strip() if "—" in label else ""
    name_from_label = label.split("—")[-1].strip() if "—" in label else label
    school_part = sanitize_filename_part(data.meta.school_code or code_from_label or "school")
    name_part = sanitize_filename_part(name_from_label or "school")
    year = data.meta.exam_year or ""
    series = sanitize_filename_part(data.meta.exam_series or "")
    ext = "pdf" if report_format == "pdf" else "xlsx"
    parts = [school_part, name_part, "score_validation", status.upper(), str(year) if year else "", series]
    name = "_".join(p for p in parts if p)
    name = re.sub(r"_+", "_", name).strip("._")
    return f"{name}.{ext}"


def generate_validation_report_excel(data: ScoreValidationReportData) -> bytes:
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})

    title_fmt = workbook.add_format({"bold": True, "font_size": 14})
    header_fmt = workbook.add_format(
        {"bold": True, "bg_color": "#1F4E5F", "font_color": "#FFFFFF", "border": 1}
    )
    label_fmt = workbook.add_format({"bold": True})
    muted_fmt = workbook.add_format({"font_color": "#666666"})
    thin = workbook.add_format({"border": 1})

    status_formats = {
        "entered": workbook.add_format({"bg_color": "#E8F5E9", "border": 1}),
        "missing": workbook.add_format({"bg_color": "#FFF8E1", "border": 1}),
        "invalid": workbook.add_format({"bg_color": "#FFEBEE", "border": 1}),
        "absent": workbook.add_format({"bg_color": "#ECEFF1", "border": 1}),
    }

    meta = data.meta
    summary = data.summary
    report_status = primary_report_status(meta.statuses)
    columns = detail_columns_for_status(
        report_status,
        combine_p1_p2=meta.combine_p1_p2,
    )

    # --- Summary sheet ---
    summary_ws = workbook.add_worksheet("Summary")
    summary_ws.set_column(0, 0, 28)
    summary_ws.set_column(1, 6, 14)
    r = 0
    summary_ws.write(r, 0, "Score Validation Report", title_fmt)
    r += 1
    summary_ws.write(r, 0, "Examination", label_fmt)
    summary_ws.write(r, 1, meta.exam_label)
    r += 1
    summary_ws.write(r, 0, "Generated", label_fmt)
    summary_ws.write(r, 1, meta.generated_at, muted_fmt)
    r += 1
    summary_ws.write(r, 0, "School", label_fmt)
    summary_ws.write(r, 1, meta.school_label or "All schools")
    r += 1
    summary_ws.write(r, 0, "Status", label_fmt)
    summary_ws.write(r, 1, report_status)
    r += 1
    summary_ws.write(r, 0, "Subject type", label_fmt)
    summary_ws.write(r, 1, meta.subject_type or "All")
    r += 1
    summary_ws.write(r, 0, "Subjects", label_fmt)
    summary_ws.write(r, 1, ", ".join(meta.subject_labels) if meta.subject_labels else "All")
    r += 1
    papers = (
        "Paper 1 or 2 (combined)"
        if meta.combine_p1_p2
        else (
            ", ".join(PAPER_META[t]["short"] for t in meta.test_types if t in PAPER_META)
            if meta.test_types
            else "All required papers"
        )
    )
    summary_ws.write(r, 0, "Papers", label_fmt)
    summary_ws.write(r, 1, papers)
    r += 2

    summary_ws.write(r, 0, "Totals", label_fmt)
    r += 1
    for col, label in enumerate(["Metric", "Count"]):
        summary_ws.write(r, col, label, header_fmt)
    r += 1
    summary_ws.write(r, 0, "Total rows", thin)
    summary_ws.write(r, 1, summary.total, thin)
    r += 1
    summary_ws.write(r, 0, report_status.capitalize(), thin)
    summary_ws.write(r, 1, getattr(summary, report_status), status_formats[report_status])
    r += 2

    summary_ws.write(r, 0, "By subject", label_fmt)
    r += 1
    subject_headers = ["Subject code", "Subject name", "Total"]
    for col, h in enumerate(subject_headers):
        summary_ws.write(r, col, h, header_fmt)
    r += 1
    for item in summary.by_subject:
        summary_ws.write(r, 0, item["subject_code"], thin)
        summary_ws.write(r, 1, item["subject_name"], thin)
        summary_ws.write(r, 2, item["total"], thin)
        r += 1

    # --- One detail sheet per paper + subject (papers never mixed) ---
    by_block: dict[tuple[int, str, str, str], list[ReportDetailRow]] = defaultdict(list)
    for row in data.rows:
        key = (row.test_type, row.subject_code, row.subject_name, row.subject_type)
        by_block[key].append(row)

    used_sheet_names: set[str] = set()
    for (test_type, subject_code, subject_name, subject_type), block_rows in sorted(
        by_block.items(), key=lambda x: (x[0][0], x[0][1])
    ):
        paper_short = block_rows[0].paper_short
        paper_label = block_rows[0].paper_label
        max_label = _section_max_score(block_rows) or "—"
        if meta.combine_p1_p2:
            sheet_title_extra = (
                f"{paper_label} · Missing papers per candidate · {len(block_rows)} {report_status} row(s)"
            )
        else:
            sheet_title_extra = (
                f"{paper_label} · Maximum mark: {max_label} · {len(block_rows)} {report_status} row(s)"
            )
        base_name = sanitize_filename_part(
            f"{'P1P2' if meta.combine_p1_p2 else paper_short}_{subject_code or subject_name or 'Subject'}"
        )[:28] or "Sheet"
        sheet_name = base_name
        n = 2
        while sheet_name in used_sheet_names or sheet_name.lower() == "summary":
            sheet_name = f"{base_name[:25]}_{n}"
            n += 1
        used_sheet_names.add(sheet_name)

        detail_ws = workbook.add_worksheet(sheet_name)
        detail_ws.write(
            0, 0, f"{subject_code} — {subject_name} ({subject_type})", title_fmt
        )
        detail_ws.write(1, 0, sheet_title_extra, muted_fmt)

        # Column 0 = row number; remaining columns follow adaptive headers
        num_fmt = workbook.add_format({"border": 1, "align": "right", "font_color": "#546E7A"})
        detail_ws.set_column(0, 0, 6)
        detail_ws.write(3, 0, "#", header_fmt)
        for col, column in enumerate(columns, start=1):
            detail_ws.set_column(col, col, 18 if column.key != "candidate_name" else 28)
            detail_ws.write(3, col, column.header, header_fmt)

        row_fmt = status_formats[report_status]
        for n_row, row in enumerate(block_rows, start=1):
            row_idx = 3 + n_row
            detail_ws.write(row_idx, 0, n_row, num_fmt)
            for col, column in enumerate(columns, start=1):
                detail_ws.write(row_idx, col, row_cell_value(row, column.key), row_fmt)

        last_col = len(columns)  # includes # at col 0
        if block_rows:
            detail_ws.autofilter(3, 0, 3 + len(block_rows), last_col)
        detail_ws.freeze_panes(4, 0)
        detail_ws.set_portrait()
        detail_ws.fit_to_pages(1, 0)
        detail_ws.repeat_rows(3)

    workbook.close()
    output.seek(0)
    return output.getvalue()


def generate_validation_report_pdf(data: ScoreValidationReportData) -> bytes:
    templates_dir = Path(settings.templates_path).resolve()
    env = Environment(loader=FileSystemLoader(str(templates_dir)))
    template = env.get_template("score_validation_report/main.html")

    report_status = primary_report_status(data.meta.statuses)
    columns = detail_columns_for_status(
        report_status,
        combine_p1_p2=data.meta.combine_p1_p2,
    )
    sections = group_rows_for_pdf(data.rows)
    context = {
        "meta": data.meta,
        "summary": data.summary,
        "sections": sections,
        "report_status": report_status,
        "status_count": getattr(data.summary, report_status),
        "columns": columns,
        "combine_p1_p2": data.meta.combine_p1_p2,
        "logo_src": "score_sheets/logo-crest-only.png",
        "status_labels": {
            "entered": "Entered",
            "missing": "Missing",
            "invalid": "Invalid",
            "absent": "Absent",
        },
    }
    html = template.render(context)
    base_url = templates_dir.as_uri() + "/"
    return HTML(string=html, base_url=base_url).write_pdf()


def _render_report_file(data: ScoreValidationReportData, report_format: ReportFormat) -> bytes:
    if report_format == "pdf":
        return generate_validation_report_pdf(data)
    return generate_validation_report_excel(data)


async def generate_score_validation_report_bytes(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int | None = None,
    subject_type: SubjectType | str | None = None,
    subject_ids: list[int] | None = None,
    test_types: list[int] | None = None,
    statuses: list[ReportStatus] | None = None,
    report_format: ReportFormat = "xlsx",
    progress: dict[str, Any] | None = None,
    combine_p1_p2: bool = False,
) -> tuple[bytes, str, ScoreValidationReportData]:
    if progress is not None:
        progress.update({"stage": "building", "message": "Building report rows…"})

    data = await build_score_validation_report(
        session,
        exam_id=exam_id,
        school_id=school_id,
        subject_type=subject_type,
        subject_ids=subject_ids,
        test_types=test_types,
        statuses=statuses,
        combine_p1_p2=combine_p1_p2,
    )
    if not data.rows:
        raise ValueError("No score rows match the selected filters")

    # Unique schools in row order
    school_ids: list[int] = []
    seen: set[int] = set()
    for row in data.rows:
        if row.school_id not in seen:
            seen.add(row.school_id)
            school_ids.append(row.school_id)

    if progress is not None:
        progress.update(
            {
                "stage": "per_school",
                "schools_total": len(school_ids),
                "schools_done": 0,
                "message": f"Generating files for {len(school_ids)} school(s)…",
            }
        )

    if len(school_ids) == 1:
        school_data = _slice_report_for_school(data, school_ids[0])
        filename = await generate_report_filename(
            session,
            exam_id=exam_id,
            school_id=school_ids[0],
            subject_type=subject_type,
            test_types=test_types,
            statuses=statuses or list(data.meta.statuses),  # type: ignore[arg-type]
            report_format=report_format,
            combine_p1_p2=data.meta.combine_p1_p2,
        )
        file_bytes = _render_report_file(school_data, report_format)
        if progress is not None:
            progress.update(
                {
                    "stage": "ready",
                    "schools_done": 1,
                    "message": "Report ready",
                }
            )
        return file_bytes, filename, data

    # Multi-school → zip of per-school files
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for idx, sid in enumerate(school_ids, start=1):
            school_data = _slice_report_for_school(data, sid)
            entry_name = _school_file_basename(school_data, report_format)
            zf.writestr(entry_name, _render_report_file(school_data, report_format))
            if progress is not None:
                progress.update(
                    {
                        "stage": "per_school",
                        "schools_done": idx,
                        "schools_total": len(school_ids),
                        "message": f"Generated {idx} of {len(school_ids)} schools…",
                    }
                )

    if progress is not None:
        progress.update({"stage": "zipping", "message": "Packaging zip…"})

    zip_name = await generate_report_filename(
        session,
        exam_id=exam_id,
        school_id=None,
        subject_type=subject_type,
        test_types=test_types,
        statuses=statuses or list(data.meta.statuses),  # type: ignore[arg-type]
        report_format=report_format,
        combine_p1_p2=data.meta.combine_p1_p2,
    )
    zip_name = zip_name.rsplit(".", 1)[0] + ".zip"
    if progress is not None:
        progress.update({"stage": "ready", "message": "Report ready"})
    zip_buf.seek(0)
    return zip_buf.getvalue(), zip_name, data


async def process_score_validation_report_job(tracking_id: int) -> None:
    """Background entry: generate PDF/Excel validation report and store on disk."""
    from app.dependencies.database import get_sessionmanager

    sessionmanager = get_sessionmanager()
    async with sessionmanager.session() as session:
        tracking_result = await session.execute(
            select(ProcessTracking).where(ProcessTracking.id == tracking_id)
        )
        tracking = tracking_result.scalar_one_or_none()
        if not tracking:
            logger.error("Score validation report tracking %s not found", tracking_id)
            return

        metadata = dict(tracking.process_metadata or {})
        progress: dict[str, Any] = {
            "stage": "queued",
            "schools_done": 0,
            "schools_total": 0,
            "message": "Queued…",
        }

        async def flush_progress() -> None:
            nonlocal tracking, metadata
            metadata.update(progress)
            tracking.process_metadata = metadata
            flag_modified(tracking, "process_metadata")
            await session.commit()

        try:
            tracking.status = ProcessStatus.IN_PROGRESS
            tracking.started_at = datetime.utcnow()
            progress.update({"stage": "building", "message": "Preparing report…"})
            await flush_progress()

            subject_type_raw = metadata.get("subject_type")
            report_format: ReportFormat = metadata.get("format") or "xlsx"

            # Re-bind progress dict so generate updates it; flush after return
            file_bytes, filename, data = await generate_score_validation_report_bytes(
                session,
                exam_id=metadata.get("exam_id") or tracking.exam_id,
                school_id=metadata.get("school_id"),
                subject_type=SubjectType(subject_type_raw) if subject_type_raw else None,
                subject_ids=metadata.get("subject_ids"),
                test_types=metadata.get("test_types"),
                statuses=metadata.get("statuses"),
                report_format=report_format,
                progress=progress,
                combine_p1_p2=bool(metadata.get("combine_p1_p2")),
            )
            await flush_progress()

            export_dir = Path(settings.storage_path) / "validation_reports"
            export_dir.mkdir(parents=True, exist_ok=True)
            ext = Path(filename).suffix.lstrip(".") or ("pdf" if report_format == "pdf" else "xlsx")
            safe_stem = sanitize_filename_part(Path(filename).stem)
            safe_name = f"{safe_stem}.{ext}"
            file_path = export_dir / f"{tracking_id}_{safe_name}"
            file_path.write_bytes(file_bytes)

            school_count = len({r.school_id for r in data.rows})
            progress.update(
                {
                    "stage": "ready",
                    "filename": safe_name,
                    "file_path": str(file_path),
                    "file_size": len(file_bytes),
                    "row_count": data.meta.row_count,
                    "school_count": school_count,
                    "schools_done": school_count,
                    "schools_total": school_count,
                    "message": "Report ready",
                    "is_zip": safe_name.endswith(".zip"),
                }
            )
            metadata.update(progress)
            tracking.process_metadata = metadata
            flag_modified(tracking, "process_metadata")
            tracking.status = ProcessStatus.COMPLETED
            tracking.completed_at = datetime.utcnow()
            await session.commit()
        except Exception as exc:
            logger.error("Score validation report job %s failed: %s", tracking_id, exc, exc_info=True)
            try:
                await session.rollback()
                tracking_result = await session.execute(
                    select(ProcessTracking).where(ProcessTracking.id == tracking_id)
                )
                tracking = tracking_result.scalar_one_or_none()
                if tracking:
                    metadata = dict(tracking.process_metadata or {})
                    metadata.update(
                        {
                            "stage": "failed",
                            "message": "Report failed",
                        }
                    )
                    tracking.process_metadata = metadata
                    flag_modified(tracking, "process_metadata")
                    tracking.status = ProcessStatus.FAILED
                    tracking.error_message = str(exc)
                    tracking.completed_at = datetime.utcnow()
                    await session.commit()
            except Exception:
                logger.error("Failed to mark validation report job %s as failed", tracking_id, exc_info=True)
