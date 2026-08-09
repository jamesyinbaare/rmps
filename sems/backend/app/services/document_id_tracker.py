"""Service for tracking and comparing expected vs uploaded sheet IDs."""

import logging
from collections import defaultdict
from typing import Any

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.models import (
    Candidate,
    Document,
    Exam,
    ExamRegistration,
    ExamSubject,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
)


def _enum_value(value: Any) -> str | None:
    if value is None:
        return None
    return value.value if hasattr(value, "value") else str(value)


def _sheet_number_from_id(sheet_id: str) -> int | None:
    try:
        return int(sheet_id[-2:])
    except (ValueError, IndexError):
        return None


def _accumulate_sheet(
    sheet_ids_info: dict[str, dict[str, Any]],
    *,
    sheet_id: str,
    test_type: int,
    school_id_val: int | None,
    school_name: str | None,
    school_code: str | None,
    subject_id_val: int | None,
    subject_code: str | None,
    subject_name: str | None,
    subject_type: str | None,
    series: int | None,
) -> None:
    if sheet_id not in sheet_ids_info:
        sheet_ids_info[sheet_id] = {
            "sheet_id": sheet_id,
            "test_type": test_type,
            "school_id": school_id_val,
            "school_name": school_name,
            "school_code": school_code,
            "subject_id": subject_id_val,
            "subject_code": subject_code,
            "subject_name": subject_name,
            "subject_type": subject_type,
            "series": series,
            "sheet_number": _sheet_number_from_id(sheet_id),
            "candidate_count": 0,
        }
    sheet_ids_info[sheet_id]["candidate_count"] += 1


async def get_expected_sheet_ids(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
    subject_id: int | None = None,
    test_type: int | None = None,
) -> dict[str, dict[str, Any]]:
    """
    Get all expected sheet IDs from SubjectScore records for an exam.

    Only rows with at least one non-null sheet document ID are loaded.
    When test_type is set, only that column is selected/filtered.
    """
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError(f"Exam with id {exam_id} not found")

    columns = [
        SubjectRegistration.series,
        School.id.label("school_id"),
        School.name.label("school_name"),
        School.code.label("school_code"),
        Subject.id.label("subject_id"),
        Subject.code.label("subject_code"),
        Subject.name.label("subject_name"),
        Subject.subject_type.label("subject_type"),
    ]

    if test_type == 1:
        columns.insert(0, SubjectScore.obj_document_id)
        non_null_filter = SubjectScore.obj_document_id.isnot(None)
    elif test_type == 2:
        columns.insert(0, SubjectScore.essay_document_id)
        non_null_filter = SubjectScore.essay_document_id.isnot(None)
    elif test_type == 3:
        columns.insert(0, SubjectScore.pract_document_id)
        non_null_filter = SubjectScore.pract_document_id.isnot(None)
    else:
        columns[0:0] = [
            SubjectScore.obj_document_id,
            SubjectScore.essay_document_id,
            SubjectScore.pract_document_id,
        ]
        non_null_filter = or_(
            SubjectScore.obj_document_id.isnot(None),
            SubjectScore.essay_document_id.isnot(None),
            SubjectScore.pract_document_id.isnot(None),
        )

    stmt = (
        select(*columns)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id, isouter=True)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(ExamRegistration.exam_id == exam_id)
        .where(non_null_filter)
    )

    if school_id is not None:
        stmt = stmt.where(Candidate.school_id == school_id)

    if subject_id is not None:
        stmt = stmt.where(Subject.id == subject_id)

    result = await session.execute(stmt)
    rows = result.all()

    sheet_ids_info: dict[str, dict[str, Any]] = {}

    for row in rows:
        subject_type = _enum_value(row.subject_type)
        common = dict(
            school_id_val=row.school_id,
            school_name=row.school_name,
            school_code=row.school_code,
            subject_id_val=row.subject_id,
            subject_code=row.subject_code,
            subject_name=row.subject_name,
            subject_type=subject_type,
            series=row.series,
        )

        if test_type == 1:
            if row.obj_document_id is not None:
                _accumulate_sheet(sheet_ids_info, sheet_id=row.obj_document_id, test_type=1, **common)
        elif test_type == 2:
            if row.essay_document_id is not None:
                _accumulate_sheet(sheet_ids_info, sheet_id=row.essay_document_id, test_type=2, **common)
        elif test_type == 3:
            if row.pract_document_id is not None:
                _accumulate_sheet(sheet_ids_info, sheet_id=row.pract_document_id, test_type=3, **common)
        else:
            if row.obj_document_id is not None:
                _accumulate_sheet(sheet_ids_info, sheet_id=row.obj_document_id, test_type=1, **common)
            if row.essay_document_id is not None:
                _accumulate_sheet(sheet_ids_info, sheet_id=row.essay_document_id, test_type=2, **common)
            if row.pract_document_id is not None:
                _accumulate_sheet(sheet_ids_info, sheet_id=row.pract_document_id, test_type=3, **common)

    return sheet_ids_info


async def get_uploaded_sheet_ids(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
    subject_id: int | None = None,
    test_type: int | None = None,
) -> dict[str, dict[str, Any]]:
    """Get all uploaded sheet IDs from Document records for an exam."""
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError(f"Exam with id {exam_id} not found")

    stmt = (
        select(
            Document.extracted_id,
            Document.test_type,
            Document.school_id,
            Document.subject_id,
            Document.subject_series,
            Document.sheet_number,
            Document.id.label("document_id"),
            Document.file_name,
            School.name.label("school_name"),
            School.code.label("school_code"),
            Subject.code.label("subject_code"),
            Subject.name.label("subject_name"),
            Subject.subject_type.label("subject_type"),
        )
        .outerjoin(School, Document.school_id == School.id)
        .outerjoin(Subject, Document.subject_id == Subject.id)
        .where(Document.exam_id == exam_id)
        .where(Document.extracted_id.isnot(None))
    )

    if school_id is not None:
        stmt = stmt.where(Document.school_id == school_id)

    if subject_id is not None:
        stmt = stmt.where(Document.subject_id == subject_id)

    if test_type is not None:
        stmt = stmt.where(Document.test_type == str(test_type))

    result = await session.execute(stmt)
    rows = result.all()

    sheet_ids_info: dict[str, dict[str, Any]] = {}

    for row in rows:
        if row.extracted_id is None:
            continue

        sheet_id = row.extracted_id

        test_type_val = None
        if row.test_type is not None:
            try:
                test_type_val = int(row.test_type)
            except (ValueError, TypeError):
                pass

        series = None
        if row.subject_series is not None:
            try:
                series = int(row.subject_series)
            except (ValueError, TypeError):
                pass

        sheet_number = None
        if row.sheet_number is not None:
            try:
                sheet_number = int(row.sheet_number)
            except (ValueError, TypeError):
                sheet_number = _sheet_number_from_id(sheet_id)

        sheet_ids_info[sheet_id] = {
            "sheet_id": sheet_id,
            "test_type": test_type_val,
            "school_id": row.school_id,
            "school_name": row.school_name,
            "school_code": row.school_code,
            "subject_id": row.subject_id,
            "subject_code": row.subject_code,
            "subject_name": row.subject_name,
            "subject_type": _enum_value(row.subject_type),
            "series": series,
            "sheet_number": sheet_number,
            "document_id": row.document_id,
            "file_name": row.file_name,
        }

    return sheet_ids_info


async def compare_sheet_ids(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
    subject_id: int | None = None,
    test_type: int | None = None,
) -> dict[str, Any]:
    """Compare expected sheet IDs with uploaded sheet IDs for an exam."""
    expected_sheet_ids_info = await get_expected_sheet_ids(
        session, exam_id, school_id, subject_id, test_type
    )
    uploaded_sheet_ids_info = await get_uploaded_sheet_ids(
        session, exam_id, school_id, subject_id, test_type
    )

    expected_sheet_ids = set(expected_sheet_ids_info.keys())
    uploaded_sheet_ids = set(uploaded_sheet_ids_info.keys())

    missing_sheet_ids = expected_sheet_ids - uploaded_sheet_ids
    extra_sheet_ids = uploaded_sheet_ids - expected_sheet_ids

    expected_by_test_type: dict[int, int] = defaultdict(int)
    uploaded_by_test_type: dict[int, int] = defaultdict(int)

    for info in expected_sheet_ids_info.values():
        test_type_val = info.get("test_type")
        if test_type_val is not None:
            expected_by_test_type[test_type_val] += 1

    for info in uploaded_sheet_ids_info.values():
        test_type_val = info.get("test_type")
        if test_type_val is not None:
            uploaded_by_test_type[test_type_val] += 1

    expected_sheet_ids_info_list = [
        {**info, "status": "expected"} for info in expected_sheet_ids_info.values()
    ]
    missing_sheet_ids_info_list = [
        {**expected_sheet_ids_info[sheet_id], "status": "missing"}
        for sheet_id in missing_sheet_ids
        if sheet_id in expected_sheet_ids_info
    ]
    uploaded_sheet_ids_info_list = [
        {
            **uploaded_sheet_ids_info[sheet_id],
            # Prefer expected metadata subject_type when available
            "subject_type": uploaded_sheet_ids_info[sheet_id].get("subject_type")
            or expected_sheet_ids_info.get(sheet_id, {}).get("subject_type"),
            "status": "uploaded",
        }
        for sheet_id in uploaded_sheet_ids
        if sheet_id in expected_sheet_ids
    ]
    extra_sheet_ids_info_list = [
        {**uploaded_sheet_ids_info[sheet_id], "status": "extra"}
        for sheet_id in extra_sheet_ids
        if sheet_id in uploaded_sheet_ids_info
    ]

    return {
        "exam_id": exam_id,
        "total_expected_sheets": len(expected_sheet_ids),
        "total_uploaded_sheets": len(uploaded_sheet_ids),
        "missing_sheet_ids": sorted(list(missing_sheet_ids)),
        "uploaded_sheet_ids": sorted(list(uploaded_sheet_ids & expected_sheet_ids)),
        "extra_sheet_ids": sorted(list(extra_sheet_ids)),
        "expected_by_test_type": dict(expected_by_test_type),
        "uploaded_by_test_type": dict(uploaded_by_test_type),
        "expected_sheet_ids_info": expected_sheet_ids_info_list,
        "missing_sheet_ids_info": missing_sheet_ids_info_list,
        "uploaded_sheet_ids_info": uploaded_sheet_ids_info_list,
        "extra_sheet_ids_info": extra_sheet_ids_info_list,
    }
