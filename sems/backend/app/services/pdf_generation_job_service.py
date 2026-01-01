"""Service for processing PDF generation jobs in the background."""

from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    Exam,
    PdfGenerationJob,
    PdfGenerationJobStatus,
    School,
    Subject,
)
from app.services.score_sheet_pdf_service import combine_pdfs_for_school, generate_pdfs_for_exam


async def process_pdf_generation_job(job_id: int, session: AsyncSession) -> None:
    """
    Process a PDF generation job in the background.

    Updates job status, processes schools sequentially, and stores results.
    """
    # Get the job
    job_stmt = select(PdfGenerationJob).where(PdfGenerationJob.id == job_id)
    job_result = await session.execute(job_stmt)
    job = job_result.scalar_one_or_none()

    if not job:
        return

    # Check if job was cancelled
    if job.status == PdfGenerationJobStatus.CANCELLED:
        return

    try:
        # Update status to processing
        job.status = PdfGenerationJobStatus.PROCESSING
        await session.commit()
        await session.refresh(job)

        # Get exam
        exam_stmt = select(Exam).where(Exam.id == job.exam_id)
        exam_result = await session.execute(exam_stmt)
        exam = exam_result.scalar_one_or_none()

        if not exam:
            job.status = PdfGenerationJobStatus.FAILED
            job.error_message = f"Exam with id {job.exam_id} not found"
            job.completed_at = datetime.utcnow()
            await session.commit()
            return

        # Get list of schools to process
        from app.models import Candidate, ExamRegistration
        if job.school_ids is None:
            # All schools - get schools with candidates for this exam
            schools_stmt = (
                select(School)
                .join(Candidate, Candidate.school_id == School.id)
                .join(ExamRegistration, ExamRegistration.candidate_id == Candidate.id)
                .where(ExamRegistration.exam_id == job.exam_id)
                .distinct()
                .order_by(School.name)
            )
            schools_result = await session.execute(schools_stmt)
            schools = schools_result.scalars().all()
        else:
            # Specific schools
            schools_stmt = select(School).where(School.id.in_(job.school_ids)).order_by(School.name)
            schools_result = await session.execute(schools_stmt)
            schools = schools_result.scalars().all()

        if not schools:
            job.status = PdfGenerationJobStatus.FAILED
            job.error_message = "No schools found for processing"
            job.completed_at = datetime.utcnow()
            await session.commit()
            return

        # Initialize results list
        results = []
        job.progress_total = len(schools)
        job.progress_current = 0
        await session.commit()
        await session.refresh(job)

        # Process each school
        for school in schools:
            # Check if job was cancelled
            await session.refresh(job)
            if job.status == PdfGenerationJobStatus.CANCELLED:
                return

            try:
                # Update current school
                job.current_school_name = school.name
                job.progress_current += 1
                await session.commit()
                await session.refresh(job)

                # Generate PDFs for this school
                await generate_pdfs_for_exam(
                    session,
                    job.exam_id,
                    school.id,
                    job.subject_id,
                    job.test_types,
                )

                # Combine PDFs for this school
                school_name_safe = school.name.replace("/", " ").replace("\\", " ")
                school_dir = Path(settings.pdf_output_path) / school_name_safe

                if school_dir.exists():
                    # Combine PDFs
                    try:
                        combined_pdf_bytes = combine_pdfs_for_school(school_dir)

                        # Save combined PDF
                        combined_filename = f"{school.code}_{school.name.replace('/', '_').replace('\\', '_')}_combined_score_sheets.pdf"
                        combined_path = school_dir / combined_filename
                        combined_path.write_bytes(combined_pdf_bytes)

                        # Add to results
                        results.append({
                            "school_id": school.id,
                            "school_name": school.name,
                            "school_code": school.code,
                            "pdf_file_path": str(combined_path.relative_to(Path(settings.pdf_output_path))),
                        })
                    except Exception as e:
                        # If combination fails, still mark school as processed but note the error
                        results.append({
                            "school_id": school.id,
                            "school_name": school.name,
                            "school_code": school.code,
                            "error": str(e),
                        })
                else:
                    # No PDFs generated for this school
                    results.append({
                        "school_id": school.id,
                        "school_name": school.name,
                        "school_code": school.code,
                        "error": "No PDFs generated",
                    })

                # Update results in job
                job.results = results
                await session.commit()
                await session.refresh(job)

            except Exception as e:
                # Log error for this school but continue with others
                results.append({
                    "school_id": school.id,
                    "school_name": school.name,
                    "school_code": school.code,
                    "error": str(e),
                })
                job.results = results
                await session.commit()
                await session.refresh(job)
                continue

        # Mark job as completed
        job.status = PdfGenerationJobStatus.COMPLETED
        job.current_school_name = None
        job.completed_at = datetime.utcnow()
        await session.commit()

    except Exception as e:
        # Mark job as failed
        job.status = PdfGenerationJobStatus.FAILED
        job.error_message = str(e)
        job.completed_at = datetime.utcnow()
        await session.commit()


async def cleanup_old_jobs(session: AsyncSession, retention_days: int = 30) -> int:
    """
    Clean up old completed/failed/cancelled jobs.

    Args:
        session: Database session
        retention_days: Number of days to keep jobs (default: 30)

    Returns:
        Number of jobs deleted
    """
    from datetime import timedelta

    cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

    # Delete old completed, failed, or cancelled jobs
    delete_stmt = (
        select(PdfGenerationJob)
        .where(
            PdfGenerationJob.status.in_([
                PdfGenerationJobStatus.COMPLETED,
                PdfGenerationJobStatus.FAILED,
                PdfGenerationJobStatus.CANCELLED,
            ])
        )
        .where(PdfGenerationJob.completed_at < cutoff_date)
    )

    result = await session.execute(delete_stmt)
    old_jobs = result.scalars().all()

    count = len(old_jobs)
    for job in old_jobs:
        await session.delete(job)

    await session.commit()
    return count
