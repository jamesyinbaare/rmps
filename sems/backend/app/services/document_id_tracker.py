"""Service for tracking and comparing expected vs uploaded sheet IDs."""

import logging
from collections import defaultdict
from typing import Any

from sqlalchemy import select, or_, func, distinct
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


async def get_expected_sheet_ids(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
    subject_id: int | None = None,
    test_type: int | None = None,
) -> dict[str, dict[str, Any]]:
    """
    Get all expected sheet IDs from SubjectScore records for an exam.

    Args:
        session: Database session
        exam_id: ID of the exam
        school_id: Optional school ID to filter by
        subject_id: Optional subject ID to filter by
        test_type: Optional test type to filter by (1=Objectives, 2=Essay, 3=Practicals)

    Returns:
        Dictionary mapping sheet_id to metadata:
        {
            "sheet_id": {
                "sheet_id": str,
                "test_type": int,
                "school_id": int | None,
                "school_name": str | None,
                "school_code": str | None,
                "subject_id": int | None,
                "subject_code": str | None,
                "subject_name": str | None,
                "series": int | None,
                "sheet_number": int | None,
                "candidate_count": int,
            }
        }
    """
    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError(f"Exam with id {exam_id} not found")

    # Build query: SubjectScore → SubjectRegistration → ExamRegistration → Candidate → School
    # Also join with Subject and ExamSubject for metadata
    stmt = (
        select(
            SubjectScore.obj_document_id,
            SubjectScore.essay_document_id,
            SubjectScore.pract_document_id,
            SubjectRegistration.series,
            School.id.label("school_id"),
            School.name.label("school_name"),
            School.code.label("school_code"),
            Subject.id.label("subject_id"),
            Subject.code.label("subject_code"),
            Subject.name.label("subject_name"),
        )
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id, isouter=True)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(ExamRegistration.exam_id == exam_id)
    )

    # Apply filters
    if school_id is not None:
        stmt = stmt.where(Candidate.school_id == school_id)

    if subject_id is not None:
        stmt = stmt.where(Subject.id == subject_id)

    result = await session.execute(stmt)
    rows = result.all()

    # Track sheet IDs and metadata
    sheet_ids_info: dict[str, dict[str, Any]] = {}

    for row in rows:
        school_id_val = row.school_id
        school_name = row.school_name
        school_code = row.school_code
        subject_id_val = row.subject_id
        subject_code = row.subject_code
        subject_name = row.subject_name
        series = row.series

        # Process obj_document_id (test_type=1)
        if test_type is None or test_type == 1:
            if row.obj_document_id is not None:
                sheet_id = row.obj_document_id
                if sheet_id not in sheet_ids_info:
                    # Extract sheet_number from sheet_id (last 2 characters)
                    try:
                        sheet_number = int(sheet_id[-2:])
                    except (ValueError, IndexError):
                        sheet_number = None

                    sheet_ids_info[sheet_id] = {
                        "sheet_id": sheet_id,
                        "test_type": 1,
                        "school_id": school_id_val,
                        "school_name": school_name,
                        "school_code": school_code,
                        "subject_id": subject_id_val,
                        "subject_code": subject_code,
                        "subject_name": subject_name,
                        "series": series,
                        "sheet_number": sheet_number,
                        "candidate_count": 0,
                    }
                sheet_ids_info[sheet_id]["candidate_count"] += 1

        # Process essay_document_id (test_type=2)
        if test_type is None or test_type == 2:
            if row.essay_document_id is not None:
                sheet_id = row.essay_document_id
                if sheet_id not in sheet_ids_info:
                    try:
                        sheet_number = int(sheet_id[-2:])
                    except (ValueError, IndexError):
                        sheet_number = None

                    sheet_ids_info[sheet_id] = {
                        "sheet_id": sheet_id,
                        "test_type": 2,
                        "school_id": school_id_val,
                        "school_name": school_name,
                        "school_code": school_code,
                        "subject_id": subject_id_val,
                        "subject_code": subject_code,
                        "subject_name": subject_name,
                        "series": series,
                        "sheet_number": sheet_number,
                        "candidate_count": 0,
                    }
                sheet_ids_info[sheet_id]["candidate_count"] += 1

        # Process pract_document_id (test_type=3)
        if test_type is None or test_type == 3:
            if row.pract_document_id is not None:
                sheet_id = row.pract_document_id
                if sheet_id not in sheet_ids_info:
                    try:
                        sheet_number = int(sheet_id[-2:])
                    except (ValueError, IndexError):
                        sheet_number = None

                    sheet_ids_info[sheet_id] = {
                        "sheet_id": sheet_id,
                        "test_type": 3,
                        "school_id": school_id_val,
                        "school_name": school_name,
                        "school_code": school_code,
                        "subject_id": subject_id_val,
                        "subject_code": subject_code,
                        "subject_name": subject_name,
                        "series": series,
                        "sheet_number": sheet_number,
                        "candidate_count": 0,
                    }
                sheet_ids_info[sheet_id]["candidate_count"] += 1

    return sheet_ids_info


async def get_uploaded_sheet_ids(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
    subject_id: int | None = None,
    test_type: int | None = None,
) -> dict[str, dict[str, Any]]:
    """
    Get all uploaded sheet IDs from Document records for an exam.

    Args:
        session: Database session
        exam_id: ID of the exam
        school_id: Optional school ID to filter by
        subject_id: Optional subject ID to filter by
        test_type: Optional test type to filter by (1=Objectives, 2=Essay, 3=Practicals)

    Returns:
        Dictionary mapping sheet_id (extracted_id) to metadata:
        {
            "sheet_id": {
                "sheet_id": str,
                "test_type": int | None,
                "school_id": int | None,
                "school_name": str | None,
                "subject_id": int | None,
                "subject_code": str | None,
                "subject_name": str | None,
                "series": int | None,
                "sheet_number": int | None,
                "document_id": int,
                "file_name": str,
            }
        }
    """
    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError(f"Exam with id {exam_id} not found")

    # Build query for documents
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
        )
        .outerjoin(School, Document.school_id == School.id)
        .outerjoin(Subject, Document.subject_id == Subject.id)
        .where(Document.exam_id == exam_id)
        .where(Document.extracted_id.isnot(None))
    )

    # Apply filters
    if school_id is not None:
        stmt = stmt.where(Document.school_id == school_id)

    if subject_id is not None:
        stmt = stmt.where(Document.subject_id == subject_id)

    if test_type is not None:
        stmt = stmt.where(Document.test_type == str(test_type))

    result = await session.execute(stmt)
    rows = result.all()

    # Track sheet IDs and metadata
    sheet_ids_info: dict[str, dict[str, Any]] = {}

    for row in rows:
        if row.extracted_id is None:
            continue

        sheet_id = row.extracted_id

        # Parse test_type
        test_type_val = None
        if row.test_type is not None:
            try:
                test_type_val = int(row.test_type)
            except (ValueError, TypeError):
                pass

        # Parse series
        series = None
        if row.subject_series is not None:
            try:
                series = int(row.subject_series)
            except (ValueError, TypeError):
                pass

        # Parse sheet_number
        sheet_number = None
        if row.sheet_number is not None:
            try:
                sheet_number = int(row.sheet_number)
            except (ValueError, TypeError):
                # Try extracting from sheet_id (last 2 characters)
                try:
                    sheet_number = int(sheet_id[-2:])
                except (ValueError, IndexError):
                    pass

        sheet_ids_info[sheet_id] = {
            "sheet_id": sheet_id,
            "test_type": test_type_val,
            "school_id": row.school_id,
            "school_name": row.school_name,
            "school_code": row.school_code,
            "subject_id": row.subject_id,
            "subject_code": row.subject_code,
            "subject_name": row.subject_name,
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
    """
    Compare expected sheet IDs with uploaded sheet IDs for an exam.

    Args:
        session: Database session
        exam_id: ID of the exam
        school_id: Optional school ID to filter by
        subject_id: Optional subject ID to filter by
        test_type: Optional test type to filter by (1=Objectives, 2=Essay, 3=Practicals)

    Returns:
        Dictionary with comparison results:
        {
            "exam_id": int,
            "total_expected_sheets": int,
            "total_uploaded_sheets": int,
            "missing_sheet_ids": list[str],
            "uploaded_sheet_ids": list[str],
            "extra_sheet_ids": list[str],
            "expected_by_test_type": dict[int, int],
            "uploaded_by_test_type": dict[int, int],
            "expected_sheet_ids_info": list[dict],
            "missing_sheet_ids_info": list[dict],
            "uploaded_sheet_ids_info": list[dict],
            "extra_sheet_ids_info": list[dict],
        }
    """
    # Get expected and uploaded sheet IDs
    expected_sheet_ids_info = await get_expected_sheet_ids(session, exam_id, school_id, subject_id, test_type)
    uploaded_sheet_ids_info = await get_uploaded_sheet_ids(session, exam_id, school_id, subject_id, test_type)

    # Extract sets of sheet IDs
    expected_sheet_ids = set(expected_sheet_ids_info.keys())
    uploaded_sheet_ids = set(uploaded_sheet_ids_info.keys())

    # Find missing and extra
    missing_sheet_ids = expected_sheet_ids - uploaded_sheet_ids
    extra_sheet_ids = uploaded_sheet_ids - expected_sheet_ids

    # Count by test type
    expected_by_test_type: dict[int, int] = defaultdict(int)
    uploaded_by_test_type: dict[int, int] = defaultdict(int)

    for sheet_id, info in expected_sheet_ids_info.items():
        test_type_val = info.get("test_type")
        if test_type_val is not None:
            expected_by_test_type[test_type_val] += 1

    for sheet_id, info in uploaded_sheet_ids_info.items():
        test_type_val = info.get("test_type")
        if test_type_val is not None:
            uploaded_by_test_type[test_type_val] += 1

    # Build detailed info lists
    expected_sheet_ids_info_list = [
        {**info, "status": "expected"}
        for info in expected_sheet_ids_info.values()
    ]
    missing_sheet_ids_info_list = [
        {**expected_sheet_ids_info[sheet_id], "status": "missing"}
        for sheet_id in missing_sheet_ids
        if sheet_id in expected_sheet_ids_info
    ]
    uploaded_sheet_ids_info_list = [
        {**uploaded_sheet_ids_info[sheet_id], "status": "uploaded"}
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
