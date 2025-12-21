"""Service for generating score sheets and assigning sheet IDs to candidates."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Candidate,
    Exam,
    ExamRegistration,
    ExamSubject,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
)


def generate_sheet_id(school_code: str, subject_code: str, series: int, test_type: int, sheet_number: int) -> str:
    """
    Generate a 13-character sheet ID.

    Format: SCHOOL_CODE(6) + SUBJECT_CODE(3) + SERIES(1) + TEST_TYPE(1) + SHEET_NUMBER(2)

    Args:
        school_code: School code (will be padded/truncated to 6 chars)
        subject_code: Subject code (will be padded/truncated to 3 chars)
        series: Series number (1-9)
        test_type: Test type (1 or 2)
        sheet_number: Sheet number (1-99, will be zero-padded)

    Returns:
        13-character sheet ID
    """
    # Pad or truncate school code to 6 characters
    school_code_padded = school_code[:6].upper().ljust(6, "0")

    # Pad or truncate subject code to 3 characters
    subject_code_padded = subject_code[:3].upper().ljust(3, "0")

    # Validate and format series (1-9)
    if series < 1 or series > 9:
        raise ValueError(f"Series must be between 1 and 9, got {series}")
    series_str = str(series)

    # Validate test type (1 or 2)
    if test_type not in [1, 2]:
        raise ValueError(f"Test type must be 1 or 2, got {test_type}")
    test_type_str = str(test_type)

    # Validate and format sheet number (01-99)
    if sheet_number < 1 or sheet_number > 99:
        raise ValueError(f"Sheet number must be between 1 and 99, got {sheet_number}")
    sheet_number_padded = f"{sheet_number:02d}"

    return school_code_padded + subject_code_padded + series_str + test_type_str + sheet_number_padded


def sort_key_index_number(candidate: Candidate) -> tuple[int | str, str]:
    """Sort key that tries numeric comparison first, then string."""
    index_num = candidate.index_number
    try:
        # Try to convert to int for numeric sorting
        return (0, str(int(index_num)))  # Use int for proper numeric ordering
    except (ValueError, TypeError):
        # Fallback to string sorting if not numeric
        return (1, index_num)


async def generate_score_sheets(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
    subject_id: int | None = None,
    test_types: list[int] | None = None,
) -> dict[str, Any]:
    """
    Generate score sheets for an exam and assign sheet IDs to candidates.

    For each (school, subject, series, test_type) combination:
    - Candidates are sorted by index_number
    - Split into batches of 25 candidates per sheet
    - Each sheet gets a unique 13-character ID
    - Sheet IDs are assigned to SubjectScore records (obj_document_id for test_type=1, essay_document_id for test_type=2)

    Args:
        session: Database session
        exam_id: ID of the exam
        school_id: Optional school ID to filter by
        subject_id: Optional subject ID to filter by
        test_types: List of test types to generate (default: [1, 2])

    Returns:
        Dictionary with generation statistics:
        - exam_id: int
        - total_sheets_generated: int
        - total_candidates_assigned: int
        - schools_processed: list[dict] with school_id, school_name, sheets_count, candidates_count
        - subjects_processed: list[dict] with subject_id, subject_code, subject_name, sheets_count, candidates_count
        - sheets_by_series: dict[int, int] - count of sheets per series
        - message: str

    Raises:
        ValueError: If exam, school (if provided), or subject (if provided) doesn't exist
    """
    # Default test types if not provided
    if test_types is None:
        test_types = [1, 2]

    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError(f"Exam with id {exam_id} not found")

    # Validate school exists if provided
    if school_id is not None:
        school_stmt = select(School).where(School.id == school_id)
        school_result = await session.execute(school_stmt)
        school = school_result.scalar_one_or_none()
        if not school:
            raise ValueError(f"School with id {school_id} not found")

    # Validate subject exists if provided
    if subject_id is not None:
        subject_stmt = select(Subject).where(Subject.id == subject_id)
        subject_result = await session.execute(subject_stmt)
        subject = subject_result.scalar_one_or_none()
        if not subject:
            raise ValueError(f"Subject with id {subject_id} not found")

    # Validate test_types
    for test_type in test_types:
        if test_type not in [1, 2]:
            raise ValueError(f"Test type must be 1 or 2, got {test_type}")

    # Build query to get all subject registrations for this exam
    # Join: SubjectRegistration -> ExamRegistration -> Candidate -> School
    # Also join with ExamSubject and Subject to get subject details
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
        .where(ExamRegistration.exam_id == exam_id)
    )

    # Filter by school if provided
    if school_id is not None:
        base_stmt = base_stmt.where(School.id == school_id)

    # Filter by subject if provided
    if subject_id is not None:
        base_stmt = base_stmt.where(Subject.id == subject_id)

    # Execute query
    result = await session.execute(base_stmt)
    rows = result.all()

    if not rows:
        return {
            "exam_id": exam_id,
            "total_sheets_generated": 0,
            "total_candidates_assigned": 0,
            "schools_processed": [],
            "subjects_processed": [],
            "sheets_by_series": {},
            "message": "No candidates found for score sheet generation",
        }

    # Group by (school_id, subject_id, series)
    # Structure: {(school_id, subject_id, series): [(subject_reg, exam_reg, candidate, school, exam_subject, subject), ...]}
    grouped_data: dict[tuple[int, int, int | None], list[tuple]] = {}

    for row in rows:
        subject_reg, exam_reg, candidate, school, exam_subject, subject = row
        series = subject_reg.series
        key = (school.id, subject.id, series)
        if key not in grouped_data:
            grouped_data[key] = []
        grouped_data[key].append((subject_reg, exam_reg, candidate, school, exam_subject, subject))

    # Sort each group by index_number (ascending)
    for key in grouped_data:
        grouped_data[key].sort(key=lambda row: sort_key_index_number(row[2]))  # Candidate is at index 2

    # Track statistics
    total_sheets_generated = 0
    total_candidates_assigned = 0
    schools_processed: dict[int, dict[str, Any]] = {}
    subjects_processed: dict[int, dict[str, Any]] = {}
    sheets_by_series: dict[int, int] = {}

    BATCH_SIZE = 25

    # Process each (school, subject, series) combination
    for (school_id_key, subject_id_key, series), rows_group in grouped_data.items():
        if not rows_group:
            continue

        # Get school and subject info
        _, _, candidate, school, exam_subject, subject = rows_group[0]

        # Initialize statistics for this school if not seen before
        if school_id_key not in schools_processed:
            schools_processed[school_id_key] = {
                "school_id": school_id_key,
                "school_name": school.name,
                "sheets_count": 0,
                "candidates_count": 0,
            }

        # Initialize statistics for this subject if not seen before
        if subject_id_key not in subjects_processed:
            subjects_processed[subject_id_key] = {
                "subject_id": subject_id_key,
                "subject_code": subject.code,
                "subject_name": subject.name,
                "sheets_count": 0,
                "candidates_count": 0,
            }

        # Initialize series counter if not seen before
        if series is not None:
            if series not in sheets_by_series:
                sheets_by_series[series] = 0

        # Use series 1 if None (shouldn't happen after serialization, but handle it)
        effective_series = series if series is not None else 1

        # Generate sheets for each test type
        for test_type in test_types:
            # Split candidates into batches of 25
            num_candidates = len(rows_group)
            num_batches = (num_candidates + BATCH_SIZE - 1) // BATCH_SIZE  # Ceiling division

            for batch_index in range(num_batches):
                start_idx = batch_index * BATCH_SIZE
                end_idx = min(start_idx + BATCH_SIZE, num_candidates)
                batch = rows_group[start_idx:end_idx]

                sheet_number = batch_index + 1

                # Generate sheet ID
                try:
                    sheet_id = generate_sheet_id(
                        school_code=school.code,
                        subject_code=subject.code,
                        series=effective_series,
                        test_type=test_type,
                        sheet_number=sheet_number,
                    )
                except ValueError:
                    # Skip this batch if sheet ID generation fails
                    continue

                # Assign sheet ID to all candidates in this batch
                for subject_reg, _exam_reg, _candidate, _school, _exam_subject, _subject in batch:
                    # Get or create SubjectScore
                    score_stmt = select(SubjectScore).where(
                        SubjectScore.subject_registration_id == subject_reg.id
                    )
                    score_result = await session.execute(score_stmt)
                    subject_score = score_result.scalar_one_or_none()

                    if not subject_score:
                        # Create new SubjectScore if it doesn't exist
                        subject_score = SubjectScore(
                            subject_registration_id=subject_reg.id,
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
                        session.add(subject_score)
                        await session.flush()

                    # Assign sheet ID based on test type
                    if test_type == 1:
                        subject_score.obj_document_id = sheet_id
                    elif test_type == 2:
                        subject_score.essay_document_id = sheet_id

                    total_candidates_assigned += 1

                total_sheets_generated += 1
                schools_processed[school_id_key]["sheets_count"] += 1
                schools_processed[school_id_key]["candidates_count"] += len(batch)
                subjects_processed[subject_id_key]["sheets_count"] += 1
                subjects_processed[subject_id_key]["candidates_count"] += len(batch)

                if series is not None:
                    sheets_by_series[series] = sheets_by_series.get(series, 0) + 1

    # Commit changes
    await session.commit()

    # Convert statistics to lists
    schools_list = list(schools_processed.values())
    subjects_list = list(subjects_processed.values())

    message = (
        f"Successfully generated {total_sheets_generated} score sheet(s) "
        f"for {total_candidates_assigned} candidate assignment(s) "
        f"across {len(schools_processed)} school(s) and {len(subjects_processed)} subject(s)."
    )

    return {
        "exam_id": exam_id,
        "total_sheets_generated": total_sheets_generated,
        "total_candidates_assigned": total_candidates_assigned,
        "schools_processed": schools_list,
        "subjects_processed": subjects_list,
        "sheets_by_series": sheets_by_series,
        "message": message,
    }
