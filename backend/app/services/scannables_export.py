"""Service for generating scannables data exports (core subjects and electives)."""

import io
from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Candidate,
    Exam,
    ExamRegistration,
    ExamSubject,
    Programme,
    School,
    Subject,
    SubjectRegistration,
    SubjectType,
    programme_subjects,
)


async def generate_core_subjects_export(
    session: AsyncSession,
    exam_id: int,
) -> bytes:
    """
    Generate Excel export for core subjects scannables data.

    Structure:
    - One row per candidate
    - Columns: Candidate Name, Index Number, School Code, School Name
    - One column per core subject (header = subject code)
    - Cell value = serialized subject number (format: {subject_code}00{series}) or blank

    Args:
        session: Database session
        exam_id: ID of the exam

    Returns:
        Bytes of Excel file

    Raises:
        ValueError: If exam doesn't exist
    """
    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError(f"Exam with id {exam_id} not found")

    # Get all core subjects for this exam
    core_subjects_stmt = (
        select(ExamSubject, Subject)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(ExamSubject.exam_id == exam_id, Subject.subject_type == SubjectType.CORE)
        .order_by(Subject.code)
    )
    core_subjects_result = await session.execute(core_subjects_stmt)
    core_subjects = core_subjects_result.all()

    if not core_subjects:
        # Return empty file with just headers
        data = {
            "Candidate Name": [],
            "Index Number": [],
            "School Code": [],
            "School Name": [],
            "Gender": [],
            "Exam Year": [],
            "Exam Series": [],
        }
        df = pd.DataFrame(data)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Core Subjects")
        output.seek(0)
        return output.getvalue()

    # Get all candidates registered for this exam with their subject registrations
    candidates_stmt = (
        select(
            Candidate,
            School,
            ExamRegistration,
            SubjectRegistration,
            ExamSubject,
            Subject,
        )
        .join(ExamRegistration, Candidate.id == ExamRegistration.candidate_id)
        .join(School, Candidate.school_id == School.id)
        .join(
            SubjectRegistration,
            ExamRegistration.id == SubjectRegistration.exam_registration_id,
        )
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(
            ExamRegistration.exam_id == exam_id,
            Subject.subject_type == SubjectType.CORE,
        )
    )
    candidates_result = await session.execute(candidates_stmt)
    candidate_rows = candidates_result.all()

    # Build a dictionary: candidate_id -> {candidate info, school info, subject_code -> serialized_number}
    candidates_data: dict[int, dict[str, Any]] = {}

    for candidate, school, exam_reg, subject_reg, exam_subject, subject in candidate_rows:
        if candidate.id not in candidates_data:
            candidates_data[candidate.id] = {
                "candidate_name": candidate.name,
                "index_number": candidate.index_number,
                "school_code": school.code,
                "school_name": school.name,
                "gender": candidate.gender or "",
                "subjects": {},
            }

        # Calculate serialized subject number: {subject_code}00{series}
        series = subject_reg.series if subject_reg.series is not None else 1
        serialized_number = f"{subject.code}00{series}"
        candidates_data[candidate.id]["subjects"][subject.code] = serialized_number

    # Only include candidates who have at least one core subject registered
    # (candidates_data already contains only those candidates from the query)

    # Build DataFrame
    rows = []
    for candidate_id, data in candidates_data.items():
        row = {
            "Candidate Name": data["candidate_name"],
            "Index Number": data["index_number"],
            "School Code": data["school_code"],
            "School Name": data["school_name"],
            "Gender": data["gender"],
            "Exam Year": exam.year,
            "Exam Series": exam.series.value if hasattr(exam.series, "value") else str(exam.series),
        }
        # Add columns for each core subject
        for exam_subject, subject in core_subjects:
            subject_code = subject.code
            row[subject_code] = data["subjects"].get(subject_code, "")
        rows.append(row)

    # Sort by school code first, then by index number (try numeric first, then string)
    def sort_key(r: dict[str, Any]) -> tuple[str, int | str, str]:
        school_code = r["School Code"] or ""
        index_num = r["Index Number"]
        try:
            return (school_code, 0, str(int(index_num)))
        except (ValueError, TypeError):
            return (school_code, 1, index_num)

    rows.sort(key=sort_key)

    # Create DataFrame
    df = pd.DataFrame(rows)

    # Generate Excel file
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Core Subjects")
    output.seek(0)
    return output.getvalue()


async def generate_electives_export(
    session: AsyncSession,
    exam_id: int,
) -> bytes:
    """
    Generate Excel export for electives scannables data.

    Structure:
    - Multiple sheets, one per programme
    - Each sheet: one row per candidate registered for that programme
    - Columns: Candidate Name, Index Number, School Code, School Name
    - One column per elective subject in that programme (header = subject code)
    - Cell value = serialized subject number (format: {subject_code}00{series}) or blank

    Args:
        session: Database session
        exam_id: ID of the exam

    Returns:
        Bytes of Excel file with multiple sheets

    Raises:
        ValueError: If exam doesn't exist
    """
    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError(f"Exam with id {exam_id} not found")

    # Get all programmes that have candidates registered for this exam
    programmes_stmt = (
        select(Programme)
        .join(Candidate, Programme.id == Candidate.programme_id)
        .join(ExamRegistration, Candidate.id == ExamRegistration.candidate_id)
        .where(ExamRegistration.exam_id == exam_id)
        .distinct()
        .order_by(Programme.code)
    )
    programmes_result = await session.execute(programmes_stmt)
    programmes = programmes_result.scalars().all()

    if not programmes:
        # Return empty file with just headers
        data = {
            "Candidate Name": [],
            "Index Number": [],
            "School Code": [],
            "School Name": [],
            "Gender": [],
            "Exam Year": [],
            "Exam Series": [],
        }
        df = pd.DataFrame(data)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="No Programmes")
        output.seek(0)
        return output.getvalue()

    # For each programme, get elective subjects and candidates
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        for programme in programmes:
            # Get elective subjects for this programme in this exam
            # Use the programme_subjects association table
            programme_electives_stmt = (
                select(ExamSubject, Subject)
                .join(Subject, ExamSubject.subject_id == Subject.id)
                .join(
                    programme_subjects,
                    Subject.id == programme_subjects.c.subject_id,
                )
                .where(
                    ExamSubject.exam_id == exam_id,
                    Subject.subject_type == SubjectType.ELECTIVE,
                    programme_subjects.c.programme_id == programme.id,
                )
                .order_by(Subject.code)
            )
            programme_electives_result = await session.execute(programme_electives_stmt)
            programme_electives = programme_electives_result.all()

            if not programme_electives:
                # Skip programmes with no elective subjects
                continue

            # Get candidates registered for this exam and programme with their elective subject registrations
            candidates_stmt = (
                select(
                    Candidate,
                    School,
                    ExamRegistration,
                    SubjectRegistration,
                    ExamSubject,
                    Subject,
                )
                .join(ExamRegistration, Candidate.id == ExamRegistration.candidate_id)
                .join(School, Candidate.school_id == School.id)
                .join(
                    SubjectRegistration,
                    ExamRegistration.id == SubjectRegistration.exam_registration_id,
                )
                .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
                .join(Subject, ExamSubject.subject_id == Subject.id)
                .where(
                    ExamRegistration.exam_id == exam_id,
                    Candidate.programme_id == programme.id,
                    Subject.subject_type == SubjectType.ELECTIVE,
                )
            )
            candidates_result = await session.execute(candidates_stmt)
            candidate_rows = candidates_result.all()

            # Build a dictionary: candidate_id -> {candidate info, school info, subject_code -> serialized_number}
            candidates_data: dict[int, dict[str, Any]] = {}

            for candidate, school, exam_reg, subject_reg, exam_subject, subject in candidate_rows:
                if candidate.id not in candidates_data:
                    candidates_data[candidate.id] = {
                        "candidate_name": candidate.name,
                        "index_number": candidate.index_number,
                        "school_code": school.code,
                        "school_name": school.name,
                        "gender": candidate.gender or "",
                        "subjects": {},
                    }

                # Calculate serialized subject number: {subject_code}00{series}
                series = subject_reg.series if subject_reg.series is not None else 1
                serialized_number = f"{subject.code}00{series}"
                candidates_data[candidate.id]["subjects"][subject.code] = serialized_number

            # Only include candidates who have at least one elective subject registered
            # (candidates_data already contains only those candidates from the query)

            # Build DataFrame for this programme
            rows = []
            for candidate_id, data in candidates_data.items():
                row = {
                    "Candidate Name": data["candidate_name"],
                    "Index Number": data["index_number"],
                    "School Code": data["school_code"],
                    "School Name": data["school_name"],
                    "Gender": data["gender"],
                    "Exam Year": exam.year,
                    "Exam Series": exam.series.value if hasattr(exam.series, "value") else str(exam.series),
                }
                # Add columns for each elective subject in this programme
                for exam_subject, subject in programme_electives:
                    subject_code = subject.code
                    row[subject_code] = data["subjects"].get(subject_code, "")
                rows.append(row)

            # Sort by school code first, then by index number (try numeric first, then string)
            def sort_key(r: dict[str, Any]) -> tuple[str, int | str, str]:
                school_code = r["School Code"] or ""
                index_num = r["Index Number"]
                try:
                    return (school_code, 0, str(int(index_num)))
                except (ValueError, TypeError):
                    return (school_code, 1, index_num)

            rows.sort(key=sort_key)

            # Create DataFrame for this programme
            df = pd.DataFrame(rows)

            # Sheet name: programme name (max 31 chars for Excel)
            sheet_name = programme.name[:31] if programme.name else f"Programme_{programme.id}"
            df.to_excel(writer, index=False, sheet_name=sheet_name)

    output.seek(0)
    return output.getvalue()
