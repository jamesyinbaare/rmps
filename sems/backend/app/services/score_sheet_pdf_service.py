"""Service for generating PDF score sheets and assigning sheet IDs."""

import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from PyPDF2 import PdfReader, PdfWriter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

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
)
from app.services.pdf_annotator import annotate_pdf_with_sheet_ids
from app.services.pdf_generator import generate_score_sheet_pdf
from app.services.score_sheet_generator import generate_sheet_id, sort_key_index_number


def split_into_batches(lst: list, batch_size: int = 25) -> list[list]:
    """
    Group a list into sublists of a specified size.

    Parameters:
    lst (list): The list to be grouped.
    batch_size (int): The size of each group (default is 25).

    Returns:
    list of lists: A list where each element is a sublist of the original list.
    """
    return [lst[i : i + batch_size] for i in range(0, len(lst), batch_size)]


async def generate_pdfs_for_exam(
    session: AsyncSession,
    exam_id: int,
    school_id: int | None = None,
    subject_id: int | None = None,
    test_types: list[int] | None = None,
) -> dict[str, Any]:
    """
    Generate PDF score sheets for an exam and assign sheet IDs to candidates.

    For each (school, subject, series, test_type) combination:
    - Generate ONE multi-page PDF with all candidates (template handles pagination)
    - Count pages in the PDF
    - Split candidates into batches of 25 (matching pages)
    - Generate sheet IDs based on page count
    - Annotate each page with its sheet ID
    - Assign sheet IDs to candidates based on their batch/page

    Args:
        session: Database session
        exam_id: ID of the exam
        school_id: Optional school ID to filter by
        subject_id: Optional subject ID to filter by
        test_types: List of test types to generate (default: [1, 2])

    Returns:
        Dictionary with generation statistics

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
            "total_pdfs_generated": 0,
            "total_sheets_generated": 0,
            "total_candidates_assigned": 0,
            "schools_processed": [],
            "subjects_processed": [],
            "sheets_by_series": {},
            "message": "No candidates found for PDF generation",
        }

    # Group by (school_id, subject_id, series)
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

    # Validate series values and log summary
    series_summary: dict[int | None, int] = {}
    for (school_id, subject_id, series), rows_group in grouped_data.items():
        series_summary[series] = series_summary.get(series, 0) + len(rows_group)

    if series_summary.get(None, 0) > 0:
        logger.warning(
            f"Found {series_summary.get(None, 0)} candidates with NULL series - they will default to series 1. "
            "Consider running serialization before generating PDFs.",
            extra={
                "exam_id": exam_id,
                "candidates_with_null_series": series_summary.get(None, 0),
                "total_candidates": sum(series_summary.values()),
            }
        )

    # Track statistics
    total_pdfs_generated = 0
    total_sheets_generated = 0
    total_candidates_assigned = 0
    schools_processed: dict[int, dict[str, Any]] = {}
    subjects_processed: dict[int, dict[str, Any]] = {}
    sheets_by_series: dict[int, int] = {}
    # Track PDF file paths for ProcessTracking
    pdf_tracking_data: dict[tuple[int, int], dict[str, Any]] = {}

    # Reorganize grouped_data into nested structure: school -> subject -> series
    # This ensures we can process in explicit order: school -> subject -> series -> test_type
    nested_data: dict[int, dict[int, dict[int | None, list[tuple]]]] = {}
    for (school_id_key, subject_id_key, series), rows_group in grouped_data.items():
        if not rows_group:
            continue
        if school_id_key not in nested_data:
            nested_data[school_id_key] = {}
        if subject_id_key not in nested_data[school_id_key]:
            nested_data[school_id_key][subject_id_key] = {}
        nested_data[school_id_key][subject_id_key][series] = rows_group

    # Process in strict hierarchical order: school -> subject -> series -> test_type
    # This ensures we complete all work for one school before moving to the next,
    # complete all work for one subject before moving to the next,
    # and complete all work for one series before moving to the next
    schools_list = sorted(nested_data.keys())
    for school_id_key in schools_list:
        # Get school info from first entry
        first_row = list(nested_data[school_id_key].values())[0][list(list(nested_data[school_id_key].values())[0].keys())[0]][0]
        _, _, candidate, school, exam_subject, subject = first_row

        # Initialize statistics for this school
        schools_processed[school_id_key] = {
            "school_id": school_id_key,
            "school_name": school.name,
            "pdfs_count": 0,
            "sheets_count": 0,
            "candidates_count": 0,
        }

        # Process all subjects for this school
        subjects_list = sorted(nested_data[school_id_key].keys())
        for subject_id_key in subjects_list:
            # Get subject info from first entry
            first_row = list(nested_data[school_id_key][subject_id_key].values())[0][0]
            _, _, candidate, school, exam_subject, subject = first_row

            # Initialize statistics for this subject if not seen before
            if subject_id_key not in subjects_processed:
                subjects_processed[subject_id_key] = {
                    "subject_id": subject_id_key,
                    "subject_code": subject.code,
                    "subject_name": subject.name,
                    "pdfs_count": 0,
                    "sheets_count": 0,
                    "candidates_count": 0,
                }

            # Process all series for this school+subject
            series_list = sorted(
                nested_data[school_id_key][subject_id_key].keys(),
                key=lambda x: x if x is not None else 0
            )
            for series in series_list:
                rows_group = nested_data[school_id_key][subject_id_key][series]

                # Get school and subject info
                _, _, candidate, school, exam_subject, subject = rows_group[0]

                # Initialize series counter if not seen before
                if series is not None:
                    if series not in sheets_by_series:
                        sheets_by_series[series] = 0

                # Use series 1 if None (shouldn't happen after serialization, but handle it)
                effective_series = series if series is not None else 1

                # Log series determination with warning if NULL
                if series is None:
                    logger.warning(
                        "SubjectRegistration.series is NULL in PDF generation, defaulting to 1",
                        extra={
                            "school_id": school_id_key,
                            "school_code": school.code,
                            "school_name": school.name,
                            "subject_id": subject_id_key,
                            "subject_code": subject.code,
                            "subject_name": subject.name,
                            "effective_series": effective_series,
                            "candidates_count": len(rows_group),
                            "sample_candidates": [
                                {"index_number": row[2].index_number, "name": row[2].name}
                                for row in rows_group[:3]  # First 3 candidates as sample
                            ],
                        }
                    )

                # Generate PDFs for each test type
                for test_type in test_types:
                    # Prepare candidate data for template
                    candidates_data = []
                    subject_registrations = []
                    for subject_reg, _exam_reg, candidate, _school, _exam_subject, _subject in rows_group:
                        candidates_data.append({
                            "index": candidate.index_number,  # Template uses "index" not "index_number"
                            "index_number": candidate.index_number,  # Keep both for compatibility
                            "name": candidate.name,
                        })
                        subject_registrations.append(subject_reg)

                    # Generate ONE multi-page PDF with all candidates
                    try:
                        pdf_bytes, page_count = generate_score_sheet_pdf(
                            school_code=school.code,
                            school_name=school.name,
                            subject_code=subject.code,
                            subject_name=subject.name,
                            series=effective_series,
                            test_type=test_type,
                            candidates=candidates_data,
                        )
                    except Exception:
                        # Skip this group if PDF generation fails
                        continue

                    # Split candidates into batches of 25 (matching pages)
                    batches = split_into_batches(subject_registrations, batch_size=25)

                    # Ensure page_count matches number of batches
                    if page_count != len(batches):
                        # Adjust: use the actual page count from PDF
                        # If there are more batches than pages, we have an issue
                        # If there are more pages than batches, we need to handle it
                        pass

                    # Generate sheet IDs for each page
                    sheet_ids = []
                    for page_index in range(page_count):
                        sheet_number = page_index + 1
                        try:
                            sheet_id = generate_sheet_id(
                                school_code=school.code,
                                subject_code=subject.code,
                                series=effective_series,
                                test_type=test_type,
                                sheet_number=sheet_number,
                            )
                            sheet_ids.append(sheet_id)
                        except ValueError as e:
                            # Skip if sheet ID generation fails
                            logger.error(
                                f"Failed to generate sheet ID for PDF: {e}",
                                extra={
                                    "school_code": school.code,
                                    "subject_code": subject.code,
                                    "series": effective_series,
                                    "test_type": test_type,
                                    "sheet_number": sheet_number,
                                }
                            )
                            continue

                    # Annotate PDF with sheet IDs
                    try:
                        annotated_pdf = annotate_pdf_with_sheet_ids(pdf_bytes, sheet_ids)
                    except Exception:
                        # If annotation fails, use original PDF
                        annotated_pdf = pdf_bytes

                    # Save PDF to filesystem
                    pdf_file_path = None
                    try:
                        # Create directory structure: pdf_output_path/{school_name}/
                        school_name_safe = school.name.replace("/", " ").replace("\\", " ")
                        output_dir = Path(settings.pdf_output_path) / school_name_safe
                        output_dir.mkdir(parents=True, exist_ok=True)

                        # Generate filename: {school_code}_{subject_code}_{series}_{test_type}.pdf
                        filename = f"{school.code}_{subject.code}_{effective_series}_{test_type}.pdf"
                        output_path = output_dir / filename

                        # Write PDF to file
                        output_path.write_bytes(annotated_pdf)
                        pdf_file_path = str(output_path)
                    except Exception:
                        # If saving fails, continue (PDF generation and ID assignment still succeeded)
                        pass

                    # Track PDF file path for this (school_id, subject_id) combination
                    tracking_key = (school_id_key, subject_id_key)
                    if tracking_key not in pdf_tracking_data:
                        pdf_tracking_data[tracking_key] = {
                            "school_id": school_id_key,
                            "subject_id": subject_id_key,
                            "test_types": [],
                            "pdf_file_paths": [],
                            "sheets_count": 0,
                            "candidates_count": 0,
                        }
                    if test_type not in pdf_tracking_data[tracking_key]["test_types"]:
                        pdf_tracking_data[tracking_key]["test_types"].append(test_type)
                    if pdf_file_path:
                        pdf_tracking_data[tracking_key]["pdf_file_paths"].append(pdf_file_path)
                    pdf_tracking_data[tracking_key]["sheets_count"] += page_count
                    pdf_tracking_data[tracking_key]["candidates_count"] += len(rows_group)

                    # Assign sheet IDs to candidates based on their batch/page
                    for batch_index in range(min(len(batches), len(sheet_ids))):
                        sheet_id = sheet_ids[batch_index]
                        batch = batches[batch_index]

                        for subject_reg in batch:
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
                            # Note: Multiple candidates in the same batch will get the same sheet_id
                            # because they are on the same physical sheet
                            if test_type == 1:
                                subject_score.obj_document_id = sheet_id
                            elif test_type == 2:
                                subject_score.essay_document_id = sheet_id

                            total_candidates_assigned += 1

                    total_pdfs_generated += 1
                    total_sheets_generated += page_count
                    schools_processed[school_id_key]["pdfs_count"] += 1
                    schools_processed[school_id_key]["sheets_count"] += page_count
                    schools_processed[school_id_key]["candidates_count"] += len(rows_group)
                    subjects_processed[subject_id_key]["pdfs_count"] += 1
                    subjects_processed[subject_id_key]["sheets_count"] += page_count
                    subjects_processed[subject_id_key]["candidates_count"] += len(rows_group)

                    if series is not None:
                        sheets_by_series[series] = sheets_by_series.get(series, 0) + page_count

    # Commit changes
    await session.commit()

    # Create ProcessTracking records for each (school_id, subject_id) combination
    for (school_id_key, subject_id_key), data in pdf_tracking_data.items():
        # Use first PDF path if available, or None
        pdf_file_path = data["pdf_file_paths"][0] if data["pdf_file_paths"] else None

        tracking = ProcessTracking(
            exam_id=exam_id,
            process_type=ProcessType.PDF_GENERATION,
            school_id=school_id_key,
            subject_id=subject_id_key,
            status=ProcessStatus.COMPLETED,
            process_metadata={
                "test_types": data["test_types"],
                "pdf_file_path": pdf_file_path,
                "pdf_file_paths": data["pdf_file_paths"],  # All PDF paths for this combination
                "sheets_count": data["sheets_count"],
                "candidates_count": data["candidates_count"],
            },
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        session.add(tracking)

    await session.commit()

    # Convert statistics to lists
    schools_list = list(schools_processed.values())
    subjects_list = list(subjects_processed.values())

    message = (
        f"Successfully generated {total_pdfs_generated} PDF(s) with {total_sheets_generated} score sheet(s) "
        f"for {total_candidates_assigned} candidate assignment(s) "
        f"across {len(schools_processed)} school(s) and {len(subjects_processed)} subject(s)."
    )

    return {
        "exam_id": exam_id,
        "total_pdfs_generated": total_pdfs_generated,
        "total_sheets_generated": total_sheets_generated,
        "total_candidates_assigned": total_candidates_assigned,
        "schools_processed": schools_list,
        "subjects_processed": subjects_list,
        "sheets_by_series": sheets_by_series,
        "message": message,
    }


def combine_pdfs_for_school(school_dir: Path) -> bytes:
    """
    Combine all PDF files in a school directory into a single PDF.

    PDFs are sorted by: subject_code (asc), series (asc), test_type (asc)
    Filename pattern: {school_code}_{subject_code}_{series}_{test_type}.pdf

    Args:
        school_dir: Path to the school directory containing PDF files

    Returns:
        Combined PDF as bytes

    Raises:
        ValueError: If no PDF files found or if PDF combination fails
    """
    if not school_dir.exists():
        raise ValueError(f"School directory not found: {school_dir}")

    # Find all PDF files matching the pattern
    pdf_files = list(school_dir.glob("*.pdf"))

    if not pdf_files:
        raise ValueError(f"No PDF files found in directory: {school_dir}")

    # Sort PDFs by: subject_code, series, test_type
    # Filename format: {school_code}_{subject_code}_{series}_{test_type}.pdf
    def sort_key(pdf_path: Path) -> tuple[str, int, int]:
        """Extract sort key from filename."""
        parts = pdf_path.stem.split("_")
        if len(parts) >= 4:
            # school_code, subject_code, series, test_type
            subject_code = parts[1]
            try:
                series = int(parts[2])
            except (ValueError, IndexError):
                series = 0
            try:
                test_type = int(parts[3])
            except (ValueError, IndexError):
                test_type = 0
            return (subject_code, series, test_type)
        # Fallback: use filename
        return (pdf_path.stem, 0, 0)

    pdf_files.sort(key=sort_key)

    # Combine PDFs using PyPDF2
    writer = PdfWriter()

    for pdf_path in pdf_files:
        try:
            reader = PdfReader(str(pdf_path))
            for page in reader.pages:
                writer.add_page(page)
        except Exception as e:
            # Skip files that can't be read, but log the error
            continue

    # Write combined PDF to bytes
    from io import BytesIO
    output = BytesIO()
    writer.write(output)
    output.seek(0)

    return output.getvalue()
