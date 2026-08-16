"""
Service for exporting candidate processed results to Excel.
"""

from __future__ import annotations

import io
import logging
import math
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import xlsxwriter
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.config import settings
from app.models import (
    Candidate,
    Exam,
    ExamRegistration,
    ExamSeries,
    ExamSubject,
    ExamType,
    Grade,
    ProcessStatus,
    ProcessTracking,
    Programme,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
    SubjectType,
    programme_subjects,
)
from app.utils.score_utils import ABSENT_RESULT_SENTINEL, calculate_grade

logger = logging.getLogger(__name__)

LARGE_EXPORT_ROW_THRESHOLD = 5000


def sanitize_filename_part(text: str) -> str:
    """Make a string safe as a filename segment (MAY/JUNE -> MAY_JUNE)."""
    if not text:
        return ""
    text = text.replace(" ", "_").replace("/", "_").replace("\\", "_")
    text = re.sub(r'[<>:"|?*]', "", text)
    text = re.sub(r"_+", "_", text)
    return text.strip("._")


def safe_export_basename(filename: str) -> str:
    """Turn a stored export filename into a single path segment."""
    name = sanitize_filename_part(str(filename))
    if name.lower().endswith(".xlsx"):
        name = name[:-5]
    elif name.lower().endswith("xlsx"):
        name = name[:-4]
    name = name.rstrip("._")
    if not name:
        name = "candidate_results_export"
    return f"{name}.xlsx"


def should_use_export_job(
    *,
    school_id: int | None,
    subject_id: int | None,
    subject_type: SubjectType | None,
    export_format: str,
    estimated_rows: int | None = None,
) -> bool:
    """True for exam-wide CORE/ELECTIVE/multi-subject exports or large row counts."""
    if estimated_rows is not None and estimated_rows > LARGE_EXPORT_ROW_THRESHOLD:
        return True
    if school_id is None and subject_id is None:
        if subject_type is not None or export_format == "multi_subject":
            return True
    return False


async def generate_export_filename(
    session: AsyncSession,
    exam_id: int | None = None,
    exam_type: ExamType | None = None,
    series: ExamSeries | None = None,
    year: int | None = None,
    subject_type: SubjectType | None = None,
    programme_id: int | None = None,
    subject_id: int | None = None,
    export_format: str = "standard",
    test_type: str | None = None,
    subject_ids: list[int] | None = None,
) -> str:
    """
    Generate a descriptive filename for the export based on filters.

    Format: {exam_year}_{exam_series}_{exam_type}_{additional_options}_scores.xlsx
    """
    parts: list[str] = []

    exam_year = None
    exam_series_str = None
    exam_type_str = None

    if exam_id is not None:
        exam_stmt = select(Exam).where(Exam.id == exam_id)
        exam_result = await session.execute(exam_stmt)
        exam = exam_result.scalar_one_or_none()
        if exam:
            exam_year = exam.year
            exam_series_str = exam.series.value if hasattr(exam.series, "value") else str(exam.series)
            exam_type_str = exam.exam_type.value if hasattr(exam.exam_type, "value") else str(exam.exam_type)
    else:
        exam_year = year
        if series:
            exam_series_str = series.value if hasattr(series, "value") else str(series)
        if exam_type:
            exam_type_str = exam_type.value if hasattr(exam_type, "value") else str(exam_type)

    if exam_year:
        parts.append(str(exam_year))
    if exam_series_str:
        parts.append(sanitize_filename_part(exam_series_str))
    if exam_type_str:
        parts.append(sanitize_filename_part(exam_type_str))

    if export_format == "multi_subject":
        parts.append("multi_subject")
        if test_type:
            parts.append(test_type)

    if subject_type == SubjectType.CORE:
        parts.append("CORE")
    elif subject_type == SubjectType.ELECTIVE:
        parts.append("ELECTIVE")
    elif subject_ids:
        parts.append(f"{len(subject_ids)}_subjects")

    if programme_id is not None:
        programme_stmt = select(Programme).where(Programme.id == programme_id)
        programme_result = await session.execute(programme_stmt)
        programme = programme_result.scalar_one_or_none()
        if programme:
            parts.append(sanitize_filename_part(programme.name))
        else:
            parts.append("Unknown_Programme")

    if subject_id is not None:
        subject_stmt = select(Subject).where(Subject.id == subject_id)
        subject_result = await session.execute(subject_stmt)
        subject = subject_result.scalar_one_or_none()
        if subject:
            parts.append(sanitize_filename_part(subject.name))
        else:
            parts.append("Unknown_Subject")

    parts.append("scores")
    filename = sanitize_filename_part("_".join(parts))
    if not filename or filename == "scores":
        filename = "candidate_results_export"
    if len(filename) > 200:
        filename = filename[:200].rstrip("._")
    return f"{filename}.xlsx"


EXPORT_FIELDS = {
    "candidate_name": "Candidate Name",
    "candidate_index_number": "Index Number",
    "school_name": "School Name",
    "school_code": "School Code",
    "exam_name": "Exam Name",
    "exam_type": "Exam Type",
    "exam_year": "Exam Year",
    "exam_series": "Exam Series",
    "programme_name": "Programme Name",
    "programme_code": "Programme Code",
    "subject_name": "Subject Name",
    "subject_code": "Subject Code",
    "subject_series": "Subject Series",
    "obj_raw_score": "Objectives Raw Score",
    "essay_raw_score": "Essay Raw Score",
    "pract_raw_score": "Practical Raw Score",
    "obj_normalized": "Objectives Normalized",
    "essay_normalized": "Essay Normalized",
    "pract_normalized": "Practical Normalized",
    "total_score": "Total Score",
    "grade": "Grade",
    "obj_document_id": "Objectives Document ID",
    "essay_document_id": "Essay Document ID",
    "pract_document_id": "Practical Document ID",
    "created_at": "Created At",
    "updated_at": "Updated At",
}


def _enum_value(value: Any) -> Any:
    if value is None:
        return None
    return value.value if hasattr(value, "value") else value


def _format_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.strftime("%Y-%m-%d %H:%M:%S")


def _grade_cell(persisted: Grade | str | None, total_score: float | None, grade_ranges_json: list | None) -> str | None:
    if persisted is not None:
        return _enum_value(persisted)
    if total_score is None:
        return None
    grade = calculate_grade(total_score, grade_ranges_json)
    return grade.value if grade else None


def _unique_sheet_name(
    base_sheet_name: str,
    used_sheet_names: set[str],
    sheet_counter: dict[str, int],
) -> str:
    sheet_name = base_sheet_name[:31]
    if sheet_name in used_sheet_names:
        counter = sheet_counter.get(base_sheet_name, 1)
        sheet_counter[base_sheet_name] = counter + 1
        sheet_name = f"{base_sheet_name[:27]}_{counter}"[:31]
    used_sheet_names.add(sheet_name)
    return sheet_name


def _subject_sheet_name(subject_code: str, subject_name: str) -> str:
    combined_name = f"{subject_code} - {subject_name}"
    if len(combined_name) <= 29:
        return combined_name
    max_code_len = len(subject_code) + 3
    if max_code_len < 29:
        truncated_name = subject_name[: 29 - max_code_len]
        return f"{subject_code} - {truncated_name}"
    return subject_code[:29]


def _write_workbook(sheets: list[tuple[str, list[dict[str, Any]]]]) -> bytes:
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})
    header_format = workbook.add_format({"bold": True})
    try:
        for sheet_name, rows in sheets:
            worksheet = workbook.add_worksheet(sheet_name[:31])
            if not rows:
                continue
            headers = list(rows[0].keys())
            last_col = max(len(headers) - 1, 0)
            worksheet.set_column(0, last_col, 16)
            for col, header in enumerate(headers):
                worksheet.write(0, col, header, header_format)
            for row_idx, row in enumerate(rows, start=1):
                for col, header in enumerate(headers):
                    value = row.get(header)
                    if value is None:
                        continue
                    worksheet.write(row_idx, col, value)
    finally:
        workbook.close()
    output.seek(0)
    return output.getvalue()


def _build_standard_row(row: Any, fields_to_export: list[str]) -> dict[str, Any]:
    row_data: dict[str, Any] = {}
    exam_type_value = _enum_value(row.exam_type)

    if "candidate_name" in fields_to_export:
        row_data["Candidate Name"] = row.candidate_name
    if "candidate_index_number" in fields_to_export:
        row_data["Index Number"] = row.candidate_index_number
    if "school_name" in fields_to_export:
        row_data["School Name"] = row.school_name
    if "school_code" in fields_to_export:
        row_data["School Code"] = row.school_code
    if "exam_name" in fields_to_export:
        row_data["Exam Name"] = exam_type_value
    if "exam_type" in fields_to_export:
        row_data["Exam Type"] = exam_type_value
    if "exam_year" in fields_to_export:
        row_data["Exam Year"] = row.exam_year
    if "exam_series" in fields_to_export:
        row_data["Exam Series"] = _enum_value(row.exam_series)
    if "programme_name" in fields_to_export:
        row_data["Programme Name"] = row.programme_name
    if "programme_code" in fields_to_export:
        row_data["Programme Code"] = row.programme_code
    if "subject_name" in fields_to_export:
        row_data["Subject Name"] = row.subject_name
    if "subject_code" in fields_to_export:
        row_data["Subject Code"] = row.subject_original_code
    if "subject_series" in fields_to_export:
        row_data["Subject Series"] = row.subject_series
    if "obj_raw_score" in fields_to_export:
        row_data["Objectives Raw Score"] = row.obj_raw_score
    if "essay_raw_score" in fields_to_export:
        row_data["Essay Raw Score"] = row.essay_raw_score
    if "pract_raw_score" in fields_to_export:
        row_data["Practical Raw Score"] = row.pract_raw_score
    if "obj_normalized" in fields_to_export:
        row_data["Objectives Normalized"] = row.obj_normalized
    if "essay_normalized" in fields_to_export:
        row_data["Essay Normalized"] = row.essay_normalized
    if "pract_normalized" in fields_to_export:
        row_data["Practical Normalized"] = row.pract_normalized
    if "total_score" in fields_to_export:
        ts = row.total_score
        row_data["Total Score"] = math.ceil(ts) if ts is not None and ts != ABSENT_RESULT_SENTINEL else ts
    if "grade" in fields_to_export:
        row_data["Grade"] = _grade_cell(row.grade, row.total_score, row.grade_ranges_json)
    if "obj_document_id" in fields_to_export:
        row_data["Objectives Document ID"] = row.obj_document_id
    if "essay_document_id" in fields_to_export:
        row_data["Essay Document ID"] = row.essay_document_id
    if "pract_document_id" in fields_to_export:
        row_data["Practical Document ID"] = row.pract_document_id
    if "created_at" in fields_to_export:
        row_data["Created At"] = _format_datetime(row.created_at)
    if "updated_at" in fields_to_export:
        row_data["Updated At"] = _format_datetime(row.updated_at)
    return row_data


def _apply_exam_filters(stmt: Any, exam_id: int | None, exam_type: ExamType | None, series: ExamSeries | None, year: int | None):
    if exam_id is not None:
        return stmt.where(Exam.id == exam_id)
    if exam_type is not None:
        stmt = stmt.where(Exam.exam_type == exam_type)
    if series is not None:
        stmt = stmt.where(Exam.series == series)
    if year is not None:
        stmt = stmt.where(Exam.year == year)
    return stmt


async def generate_results_export(
    session: AsyncSession,
    exam_id: int | None = None,
    exam_type: ExamType | None = None,
    series: ExamSeries | None = None,
    year: int | None = None,
    school_id: int | None = None,
    programme_id: int | None = None,
    subject_id: int | None = None,
    document_id: str | None = None,
    fields: list[str] | None = None,
    subject_type: SubjectType | None = None,
    export_format: str = "standard",
    test_type: str | None = None,
    subject_ids: list[int] | None = None,
) -> bytes:
    """Generate Excel export for candidate processed results."""
    if export_format == "multi_subject":
        return await generate_multi_subject_export(
            session=session,
            exam_id=exam_id,
            exam_type=exam_type,
            series=series,
            year=year,
            school_id=school_id,
            programme_id=programme_id,
            test_type=test_type or "obj",
            subject_ids=subject_ids,
            subject_type=subject_type,
            fields=fields,
        )

    if fields is not None:
        invalid_fields = [f for f in fields if f not in EXPORT_FIELDS]
        if invalid_fields:
            raise ValueError(f"Invalid fields: {', '.join(invalid_fields)}")

    if subject_type is not None and subject_id is not None:
        raise ValueError("subject_type and subject_id cannot both be specified")

    if subject_type == SubjectType.ELECTIVE and programme_id is None:
        raise ValueError("programme_id is required when subject_type is ELECTIVE")

    fields_to_export = fields if fields is not None else list(EXPORT_FIELDS.keys())

    base_stmt = (
        select(
            Candidate.name.label("candidate_name"),
            Candidate.index_number.label("candidate_index_number"),
            School.name.label("school_name"),
            School.code.label("school_code"),
            Exam.exam_type.label("exam_type"),
            Exam.year.label("exam_year"),
            Exam.series.label("exam_series"),
            Programme.name.label("programme_name"),
            Programme.code.label("programme_code"),
            Programme.id.label("programme_id"),
            Subject.id.label("subject_id"),
            Subject.original_code.label("subject_original_code"),
            Subject.name.label("subject_name"),
            Subject.subject_type.label("subject_type"),
            SubjectRegistration.series.label("subject_series"),
            SubjectScore.obj_raw_score.label("obj_raw_score"),
            SubjectScore.essay_raw_score.label("essay_raw_score"),
            SubjectScore.pract_raw_score.label("pract_raw_score"),
            SubjectScore.obj_normalized.label("obj_normalized"),
            SubjectScore.essay_normalized.label("essay_normalized"),
            SubjectScore.pract_normalized.label("pract_normalized"),
            SubjectScore.total_score.label("total_score"),
            SubjectScore.grade.label("grade"),
            SubjectScore.obj_document_id.label("obj_document_id"),
            SubjectScore.essay_document_id.label("essay_document_id"),
            SubjectScore.pract_document_id.label("pract_document_id"),
            SubjectScore.created_at.label("created_at"),
            SubjectScore.updated_at.label("updated_at"),
            ExamSubject.grade_ranges_json.label("grade_ranges_json"),
        )
        .select_from(SubjectRegistration)
        .join(SubjectScore, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id)
        .join(Exam, ExamRegistration.exam_id == Exam.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .outerjoin(Programme, Candidate.programme_id == Programme.id)
    )

    base_stmt = _apply_exam_filters(base_stmt, exam_id, exam_type, series, year)
    if school_id is not None:
        base_stmt = base_stmt.where(Candidate.school_id == school_id)
    if programme_id is not None:
        base_stmt = base_stmt.where(Candidate.programme_id == programme_id)
    if subject_id is not None:
        base_stmt = base_stmt.where(Subject.id == subject_id)
    if subject_type is not None:
        base_stmt = base_stmt.where(Subject.subject_type == subject_type)
    if subject_type == SubjectType.ELECTIVE and programme_id is not None:
        base_stmt = base_stmt.join(
            programme_subjects,
            and_(
                programme_subjects.c.subject_id == Subject.id,
                programme_subjects.c.programme_id == programme_id,
            ),
        )
    if document_id is not None:
        base_stmt = base_stmt.where(
            or_(
                SubjectScore.obj_document_id == document_id,
                SubjectScore.essay_document_id == document_id,
                SubjectScore.pract_document_id == document_id,
            )
        )

    stmt = base_stmt.order_by(Candidate.index_number, Subject.original_code)
    result = await session.execute(stmt)
    rows = result.all()

    if not rows:
        raise ValueError("No results found matching the specified filters")

    grouped_data: dict[tuple[int, str, str], list] = {}
    group_by_subject = (
        subject_type == SubjectType.CORE
        or subject_type == SubjectType.ELECTIVE
        or subject_id is not None
    )
    if group_by_subject:
        for row in rows:
            key = (row.subject_id, row.subject_original_code, row.subject_name)
            grouped_data.setdefault(key, []).append(row)
    else:
        grouped_data = {(0, "Candidate Results", "Candidate Results"): rows}

    used_sheet_names: set[str] = set()
    sheet_counter: dict[str, int] = {}
    sheets: list[tuple[str, list[dict[str, Any]]]] = []

    for (group_subject_id, subject_code, subject_name), group_rows in sorted(grouped_data.items()):
        export_rows = [_build_standard_row(row, fields_to_export) for row in group_rows]
        if group_by_subject and group_subject_id != 0:
            base_sheet_name = _subject_sheet_name(subject_code, subject_name)
        else:
            base_sheet_name = "Candidate Results"
        sheet_name = _unique_sheet_name(base_sheet_name, used_sheet_names, sheet_counter)
        sheets.append((sheet_name, export_rows))

    return _write_workbook(sheets)


async def generate_multi_subject_export(
    session: AsyncSession,
    exam_id: int | None = None,
    exam_type: ExamType | None = None,
    series: ExamSeries | None = None,
    year: int | None = None,
    school_id: int | None = None,
    programme_id: int | None = None,
    test_type: str = "obj",
    subject_ids: list[int] | None = None,
    subject_type: SubjectType | None = None,
    fields: list[str] | None = None,
) -> bytes:
    """Generate Excel export with multiple subjects on the same sheet."""
    if fields is not None:
        allowed_fields = [
            "candidate_name",
            "candidate_index_number",
            "school_name",
            "school_code",
            "exam_name",
            "exam_type",
            "exam_year",
            "exam_series",
            "programme_name",
            "programme_code",
        ]
        invalid_fields = [f for f in fields if f not in allowed_fields]
        if invalid_fields:
            raise ValueError(f"Invalid fields for multi-subject format: {', '.join(invalid_fields)}")

    fields_to_export = fields if fields is not None else ["candidate_name", "candidate_index_number"]

    candidate_stmt = (
        select(
            Candidate.id.label("candidate_id"),
            Candidate.name.label("candidate_name"),
            Candidate.index_number.label("candidate_index_number"),
            School.name.label("school_name"),
            School.code.label("school_code"),
            Exam.exam_type.label("exam_type"),
            Exam.year.label("exam_year"),
            Exam.series.label("exam_series"),
            Programme.name.label("programme_name"),
            Programme.code.label("programme_code"),
        )
        .join(ExamRegistration, ExamRegistration.candidate_id == Candidate.id)
        .join(Exam, ExamRegistration.exam_id == Exam.id)
        .join(School, Candidate.school_id == School.id)
        .outerjoin(Programme, Candidate.programme_id == Programme.id)
    )
    candidate_stmt = _apply_exam_filters(candidate_stmt, exam_id, exam_type, series, year)
    if school_id is not None:
        candidate_stmt = candidate_stmt.where(Candidate.school_id == school_id)
    if programme_id is not None:
        candidate_stmt = candidate_stmt.where(Candidate.programme_id == programme_id)
    candidate_stmt = candidate_stmt.order_by(Candidate.index_number)
    candidate_rows = (await session.execute(candidate_stmt)).all()

    if not candidate_rows:
        raise ValueError("No candidates found matching the specified filters")

    selected_subject_ids: set[int] = set()
    if subject_ids is not None:
        selected_subject_ids = set(subject_ids)
        exam_subject_stmt = select(ExamSubject.subject_id).join(Exam, ExamSubject.exam_id == Exam.id)
        exam_subject_stmt = _apply_exam_filters(exam_subject_stmt, exam_id, exam_type, series, year)
        exam_subject_ids = {row[0] for row in (await session.execute(exam_subject_stmt)).all()}
        selected_subject_ids = selected_subject_ids & exam_subject_ids
        if not selected_subject_ids:
            raise ValueError("None of the specified subject IDs exist in the exam")
    elif subject_type is not None:
        subject_stmt = (
            select(Subject.id)
            .join(ExamSubject, Subject.id == ExamSubject.subject_id)
            .join(Exam, ExamSubject.exam_id == Exam.id)
            .where(Subject.subject_type == subject_type)
        )
        subject_stmt = _apply_exam_filters(subject_stmt, exam_id, exam_type, series, year)
        if subject_type == SubjectType.ELECTIVE and programme_id is not None:
            subject_stmt = subject_stmt.join(
                programme_subjects, Subject.id == programme_subjects.c.subject_id
            ).where(programme_subjects.c.programme_id == programme_id)
        selected_subject_ids = {row[0] for row in (await session.execute(subject_stmt)).all()}
        if not selected_subject_ids:
            raise ValueError(f"No {subject_type.value} subjects found for the specified exam")
    else:
        raise ValueError("Either subject_ids or subject_type must be provided")

    subject_code_stmt = (
        select(Subject.id, Subject.original_code)
        .where(Subject.id.in_(selected_subject_ids))
        .order_by(Subject.original_code)
    )
    subject_codes_map = {row[0]: row[1] for row in (await session.execute(subject_code_stmt)).all()}
    subject_codes_sorted = sorted(subject_codes_map.values())

    score_col = SubjectScore.obj_raw_score if test_type == "obj" else SubjectScore.essay_raw_score
    subject_reg_stmt = (
        select(
            ExamRegistration.candidate_id,
            Subject.original_code,
            score_col.label("raw_score"),
        )
        .select_from(SubjectRegistration)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(Exam, ExamRegistration.exam_id == Exam.id)
        .outerjoin(SubjectScore, SubjectRegistration.id == SubjectScore.subject_registration_id)
        .where(Subject.id.in_(selected_subject_ids))
    )
    subject_reg_stmt = _apply_exam_filters(subject_reg_stmt, exam_id, exam_type, series, year)
    if school_id is not None:
        subject_reg_stmt = subject_reg_stmt.where(Candidate.school_id == school_id)
    if programme_id is not None:
        subject_reg_stmt = subject_reg_stmt.where(Candidate.programme_id == programme_id)

    candidate_scores: dict[int, dict[str, str]] = {
        row.candidate_id: {code: "N/A" for code in subject_codes_sorted} for row in candidate_rows
    }
    for score_row in (await session.execute(subject_reg_stmt)).all():
        scores = candidate_scores.get(score_row.candidate_id)
        if scores is None or score_row.original_code not in scores:
            continue
        scores[score_row.original_code] = score_row.raw_score if score_row.raw_score is not None else ""

    export_rows: list[dict[str, Any]] = []
    for row in candidate_rows:
        row_data: dict[str, Any] = {}
        exam_type_value = _enum_value(row.exam_type)
        if "candidate_name" in fields_to_export:
            row_data["Candidate Name"] = row.candidate_name
        if "candidate_index_number" in fields_to_export:
            row_data["Index Number"] = row.candidate_index_number
        if "school_name" in fields_to_export:
            row_data["School Name"] = row.school_name
        if "school_code" in fields_to_export:
            row_data["School Code"] = row.school_code
        if "exam_name" in fields_to_export:
            row_data["Exam Name"] = exam_type_value
        if "exam_type" in fields_to_export:
            row_data["Exam Type"] = exam_type_value
        if "exam_year" in fields_to_export:
            row_data["Exam Year"] = row.exam_year
        if "exam_series" in fields_to_export:
            row_data["Exam Series"] = _enum_value(row.exam_series)
        if "programme_name" in fields_to_export:
            row_data["Programme Name"] = row.programme_name
        if "programme_code" in fields_to_export:
            row_data["Programme Code"] = row.programme_code
        scores = candidate_scores.get(row.candidate_id, {})
        for subject_code in subject_codes_sorted:
            row_data[subject_code] = scores.get(subject_code, "N/A")
        export_rows.append(row_data)

    return _write_workbook([("Multi_Subject_Scores", export_rows)])


async def process_results_export_job(tracking_id: int) -> None:
    """Background entry point: generate a results Excel file and store it on disk."""
    from app.dependencies.database import get_sessionmanager

    sessionmanager = get_sessionmanager()
    async with sessionmanager.session() as session:
        tracking_result = await session.execute(
            select(ProcessTracking).where(ProcessTracking.id == tracking_id)
        )
        tracking = tracking_result.scalar_one_or_none()
        if not tracking:
            logger.error("Results export tracking %s not found", tracking_id)
            return

        metadata = dict(tracking.process_metadata or {})
        try:
            tracking.status = ProcessStatus.IN_PROGRESS
            tracking.started_at = datetime.utcnow()
            metadata["message"] = "Preparing file…"
            tracking.process_metadata = metadata
            flag_modified(tracking, "process_metadata")
            await session.commit()

            subject_type_raw = metadata.get("subject_type")
            exam_type_raw = metadata.get("exam_type")
            series_raw = metadata.get("series")
            excel_bytes = await generate_results_export(
                session=session,
                exam_id=metadata.get("exam_id") or tracking.exam_id,
                exam_type=ExamType(exam_type_raw) if exam_type_raw else None,
                series=ExamSeries(series_raw) if series_raw else None,
                year=metadata.get("year"),
                school_id=metadata.get("school_id"),
                programme_id=metadata.get("programme_id"),
                subject_id=metadata.get("subject_id"),
                document_id=metadata.get("document_id"),
                fields=metadata.get("fields"),
                subject_type=SubjectType(subject_type_raw) if subject_type_raw else None,
                export_format=metadata.get("export_format") or "standard",
                test_type=metadata.get("test_type"),
                subject_ids=metadata.get("subject_ids"),
            )

            filename = safe_export_basename(metadata.get("filename") or "candidate_results_export.xlsx")
            excel_export_dir = Path(settings.storage_path) / "excel_exports"
            excel_export_dir.mkdir(parents=True, exist_ok=True)
            file_path = excel_export_dir / f"{tracking_id}_{filename}"
            file_path.write_bytes(excel_bytes)
            metadata["filename"] = filename

            metadata.update(
                {
                    "file_path": str(file_path),
                    "file_size": len(excel_bytes),
                    "message": "Export ready",
                }
            )
            tracking.process_metadata = metadata
            flag_modified(tracking, "process_metadata")
            tracking.status = ProcessStatus.COMPLETED
            tracking.completed_at = datetime.utcnow()
            await session.commit()
        except Exception as exc:
            logger.error("Results export job %s failed: %s", tracking_id, exc, exc_info=True)
            try:
                await session.rollback()
                tracking_result = await session.execute(
                    select(ProcessTracking).where(ProcessTracking.id == tracking_id)
                )
                tracking = tracking_result.scalar_one_or_none()
                if tracking:
                    metadata = dict(tracking.process_metadata or {})
                    metadata["message"] = "Export failed"
                    tracking.process_metadata = metadata
                    flag_modified(tracking, "process_metadata")
                    tracking.status = ProcessStatus.FAILED
                    tracking.error_message = str(exc)
                    tracking.completed_at = datetime.utcnow()
                    await session.commit()
            except Exception:
                logger.exception("Failed to mark results export job %s as failed", tracking_id)
