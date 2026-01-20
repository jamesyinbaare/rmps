"""Service for serializing candidates - assigning series numbers in round-robin fashion."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import datetime

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


async def serialize_exam(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
    subject_codes: list[str] | None = None,
) -> dict[str, Any]:
    """
    Serialize candidates for an exam by assigning series numbers in round-robin fashion.

    For subjects specified in subject_codes:
    - Candidates are sorted by index_number
    - Series numbers 1 to number_of_series are assigned in round-robin fashion
    - The assigned series is stored in SubjectRegistration.series

    For subjects NOT in subject_codes:
    - All subject registrations are assigned a default series of 1

    Args:
        session: Database session
        exam_id: ID of the exam to serialize
        school_id: Optional school ID to serialize only that school
        subject_codes: Optional list of subject codes to serialize. If None or empty, no subjects are serialized (all get series 1).

    Returns:
        Dictionary with serialization statistics:
        - exam_id: int
        - school_id: int | None
        - total_candidates_processed: int
        - schools_processed: list[dict] with school_id, school_name, candidates_count
        - subjects_processed: list[dict] with subject_id, subject_code, subject_name, candidates_count
        - subjects_defaulted: list[dict] with subject_id, subject_code, subject_name, candidates_count
        - message: str

    Raises:
        ValueError: If exam or school (if provided) doesn't exist
    """
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

    # Execute query
    result = await session.execute(base_stmt)
    rows = result.all()

    if not rows:
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

    # Group by (school_id, exam_subject_id) and sort by index_number
    # Structure: {(school_id, exam_subject_id): [(subject_reg, exam_reg, candidate, school, exam_subject, subject), ...]}
    grouped_data: dict[tuple[int, int], list[tuple]] = {}

    for row in rows:
        subject_reg, exam_reg, candidate, school, exam_subject, subject = row
        key = (school.id, exam_subject.id)
        if key not in grouped_data:
            grouped_data[key] = []
        grouped_data[key].append((subject_reg, exam_reg, candidate, school, exam_subject, subject))

    # Sort each group by index_number (ascending)
    # Use string sorting to preserve leading zeros and handle non-numeric index numbers
    def sort_key(row: tuple) -> str:
        """Sort key that uses string comparison for index_number."""
        candidate = row[2]  # Candidate is at index 2
        return candidate.index_number

    for key in grouped_data:
        grouped_data[key].sort(key=sort_key)  # Sort by candidate.index_number (string sort)

    # Normalize subject_codes: convert to set for fast lookup, handle None/empty
    subject_codes_set: set[str] = set()
    if subject_codes:
        subject_codes_set = {code.upper().strip() for code in subject_codes if code}

    # Track statistics
    # Use sets to track unique candidates and schools
    # A candidate registered for multiple subjects will only be counted once
    # A school with multiple candidates will only be counted once
    total_candidates_processed = 0
    unique_candidate_ids: set[int] = set()  # Distinct candidate IDs (one per candidate, even if multiple subjects)
    unique_school_ids: set[int] = set()  # Distinct school IDs (schools with at least one candidate)
    schools_processed: dict[int, dict[str, Any]] = {}
    subjects_processed: dict[int, dict[str, Any]] = {}
    subjects_defaulted: dict[int, dict[str, Any]] = {}

    # Assign series numbers in round-robin fashion
    number_of_series = exam.number_of_series

    for (school_id_key, exam_subject_id), rows_group in grouped_data.items():
        # Get school and subject info for statistics
        _, _, candidate, school, exam_subject, subject = rows_group[0]

        # Initialize statistics for this school if not seen before
        if school_id_key not in schools_processed:
            schools_processed[school_id_key] = {
                "school_id": school_id_key,
                "school_name": school.name,
                "candidates_count": 0,
            }

        # Check if this subject should be serialized (round-robin) or defaulted to series 1
        subject_code_upper = subject.code.upper().strip()
        should_serialize = subject_code_upper in subject_codes_set

        if should_serialize:
            # Initialize statistics for this subject if not seen before
            if exam_subject_id not in subjects_processed:
                subjects_processed[exam_subject_id] = {
                    "subject_id": subject.id,
                    "subject_code": subject.code,
                    "subject_name": subject.name,
                    "candidates_count": 0,
                }

            # Assign series numbers in round-robin fashion
            for index, (subject_reg, _exam_reg, candidate, _school, _exam_subject, _subject) in enumerate(rows_group):
                # Round-robin: series = (index % number_of_series) + 1
                # This gives: 0 -> 1, 1 -> 2, ..., (n-1) -> n, n -> 1, etc.
                series = (index % number_of_series) + 1
                subject_reg.series = series
                total_candidates_processed += 1
                # Track unique candidates and schools (sets automatically handle duplicates)
                unique_candidate_ids.add(candidate.id)  # Each candidate counted only once
                unique_school_ids.add(school_id_key)  # Each school counted only once
                schools_processed[school_id_key]["candidates_count"] += 1
                subjects_processed[exam_subject_id]["candidates_count"] += 1
        else:
            # Assign default series of 1 to all registrations for this subject
            if exam_subject_id not in subjects_defaulted:
                subjects_defaulted[exam_subject_id] = {
                    "subject_id": subject.id,
                    "subject_code": subject.code,
                    "subject_name": subject.name,
                    "candidates_count": 0,
                }

            for subject_reg, _exam_reg, candidate, _school, _exam_subject, _subject in rows_group:
                subject_reg.series = 1
                total_candidates_processed += 1
                # Track unique candidates and schools (sets automatically handle duplicates)
                unique_candidate_ids.add(candidate.id)  # Each candidate counted only once
                unique_school_ids.add(school_id_key)  # Each school counted only once
                schools_processed[school_id_key]["candidates_count"] += 1
                subjects_defaulted[exam_subject_id]["candidates_count"] += 1

    # Commit changes
    await session.commit()

    # Convert statistics to lists
    schools_list = list(schools_processed.values())
    subjects_list = list(subjects_processed.values())
    subjects_defaulted_list = list(subjects_defaulted.values())

    # Calculate total counts
    # total_candidates_count: Total number of distinct candidates processed
    # (a candidate registered for multiple subjects is counted only once)
    total_candidates_count = len(unique_candidate_ids)
    # total_schools_count: Total number of schools with at least one candidate
    total_schools_count = len(unique_school_ids)
    subjects_serialized_count = len(subjects_list)
    subjects_defaulted_count = len(subjects_defaulted_list)

    # Create ProcessTracking record
    tracking = ProcessTracking(
        exam_id=exam_id,
        process_type=ProcessType.SERIALIZATION,
        school_id=school_id,
        subject_id=None,  # Serialization is per-school or all schools, not per-subject
        status=ProcessStatus.COMPLETED,
        process_metadata={
            "total_candidates": total_candidates_count,
            "total_schools": total_schools_count,
            "subjects_serialized_count": subjects_serialized_count,
            "subjects_defaulted_count": subjects_defaulted_count,
            "subjects_serialized": [s["subject_code"] for s in subjects_list],
            "schools_processed": schools_list,
            "subjects_processed": subjects_list,
            "subjects_defaulted": subjects_defaulted_list,
        },
        started_at=datetime.utcnow(),  # Could track start time if needed
        completed_at=datetime.utcnow(),
    )
    session.add(tracking)
    await session.commit()

    message_parts = []
    if subjects_serialized_count > 0:
        message_parts.append(f"serialized {subjects_serialized_count} subject(s)")
    if subjects_defaulted_count > 0:
        message_parts.append(f"assigned default series 1 to {subjects_defaulted_count} subject(s)")

    message = f"Successfully processed {total_candidates_count} candidate(s) across {total_schools_count} school(s). " + ". ".join(message_parts) + "."

    return {
        "exam_id": exam_id,
        "school_id": school_id,
        "total_candidates_count": total_candidates_count,
        "total_schools_count": total_schools_count,
        "subjects_serialized_count": subjects_serialized_count,
        "subjects_defaulted_count": subjects_defaulted_count,
        "schools_processed": schools_list,
        "subjects_processed": subjects_list,
        "subjects_defaulted": subjects_defaulted_list,
        "message": message,
    }
