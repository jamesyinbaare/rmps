"""Router for PDF generation job management."""

import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.config import settings
from app.dependencies.database import DBSessionDep
from app.models import PdfGenerationJob, PdfGenerationJobStatus
from app.schemas.exam import DeleteJobsRequest, PdfGenerationJobListResponse, PdfGenerationJobResponse

router = APIRouter(prefix="/api/v1/pdf-generation-jobs", tags=["pdf-generation-jobs"])


@router.get("", response_model=PdfGenerationJobListResponse)
async def list_pdf_generation_jobs(
    session: DBSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, description="Filter by status (pending, processing, completed, failed, cancelled)"),
) -> PdfGenerationJobListResponse:
    """List all PDF generation jobs with pagination."""
    offset = (page - 1) * page_size

    # Build query
    base_stmt = select(PdfGenerationJob)

    if status_filter:
        try:
            status_enum = PdfGenerationJobStatus(status_filter.lower())
            base_stmt = base_stmt.where(PdfGenerationJob.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status: {status_filter}")

    # Get total count
    count_stmt = select(func.count(PdfGenerationJob.id))
    if status_filter:
        try:
            status_enum = PdfGenerationJobStatus(status_filter.lower())
            count_stmt = count_stmt.where(PdfGenerationJob.status == status_enum)
        except ValueError:
            pass

    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get jobs
    stmt = base_stmt.order_by(PdfGenerationJob.created_at.desc()).offset(offset).limit(page_size)
    result = await session.execute(stmt)
    jobs = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    # Convert to response
    from app.schemas.exam import PdfGenerationJobResult
    items = []
    for job in jobs:
        results = None
        if job.results:
            results = [PdfGenerationJobResult(**r) for r in job.results]

        items.append(PdfGenerationJobResponse(
            id=job.id,
            status=job.status.value,
            exam_id=job.exam_id,
            school_ids=job.school_ids,
            subject_id=job.subject_id,
            test_types=job.test_types,
            progress_current=job.progress_current,
            progress_total=job.progress_total,
            current_school_name=job.current_school_name,
            error_message=job.error_message,
            results=results,
            created_at=job.created_at,
            updated_at=job.updated_at,
            completed_at=job.completed_at,
        ))

    return PdfGenerationJobListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{job_id}", response_model=PdfGenerationJobResponse)
async def get_pdf_generation_job(
    job_id: int,
    session: DBSessionDep,
) -> PdfGenerationJobResponse:
    """Get PDF generation job details."""
    job_stmt = select(PdfGenerationJob).where(PdfGenerationJob.id == job_id)
    job_result = await session.execute(job_stmt)
    job = job_result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    # Convert results
    from app.schemas.exam import PdfGenerationJobResult
    results = None
    if job.results:
        results = [PdfGenerationJobResult(**r) for r in job.results]

    return PdfGenerationJobResponse(
        id=job.id,
        status=job.status.value,
        exam_id=job.exam_id,
        school_ids=job.school_ids,
        subject_id=job.subject_id,
        test_types=job.test_types,
        progress_current=job.progress_current,
        progress_total=job.progress_total,
        current_school_name=job.current_school_name,
        error_message=job.error_message,
        results=results,
        created_at=job.created_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
    )


@router.get("/{job_id}/download/{school_id}")
async def download_job_school_pdf(
    job_id: int,
    school_id: int,
    session: DBSessionDep,
) -> StreamingResponse:
    """Download PDF for a specific school from a job."""
    job_stmt = select(PdfGenerationJob).where(PdfGenerationJob.id == job_id)
    job_result = await session.execute(job_stmt)
    job = job_result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if not job.results:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No results found for this job")

    # Find the school result
    school_result = None
    for result in job.results:
        if result.get("school_id") == school_id:
            school_result = result
            break

    if not school_result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found in job results")

    if not school_result.get("pdf_file_path"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF file not available for this school")

    # Read PDF file
    pdf_path = Path(settings.pdf_output_path) / school_result["pdf_file_path"]

    if not pdf_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF file not found on server")

    pdf_bytes = pdf_path.read_bytes()

    filename = f"{school_result.get('school_code', 'school')}_{school_result.get('school_name', 'unknown').replace('/', '_').replace('\\', '_')}_combined_score_sheets.pdf"

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{job_id}/download-all")
async def download_job_all_pdfs(
    job_id: int,
    session: DBSessionDep,
) -> StreamingResponse:
    """Download all completed PDFs from a job as a ZIP file."""
    job_stmt = select(PdfGenerationJob).where(PdfGenerationJob.id == job_id)
    job_result = await session.execute(job_stmt)
    job = job_result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if not job.results:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No results found for this job")

    # Create ZIP file in memory
    zip_buffer = BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for result in job.results:
            if result.get("pdf_file_path"):
                pdf_path = Path(settings.pdf_output_path) / result["pdf_file_path"]
                if pdf_path.exists():
                    filename = f"{result.get('school_code', 'school')}_{result.get('school_name', 'unknown').replace('/', '_').replace('\\', '_')}_combined_score_sheets.pdf"
                    zip_file.write(pdf_path, filename)

    zip_buffer.seek(0)

    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="job_{job_id}_all_schools.zip"'},
    )


@router.post("/{job_id}/cancel", response_model=PdfGenerationJobResponse)
async def cancel_pdf_generation_job(
    job_id: int,
    session: DBSessionDep,
) -> PdfGenerationJobResponse:
    """Cancel a pending or processing PDF generation job."""
    job_stmt = select(PdfGenerationJob).where(PdfGenerationJob.id == job_id)
    job_result = await session.execute(job_stmt)
    job = job_result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if job.status in [PdfGenerationJobStatus.COMPLETED, PdfGenerationJobStatus.FAILED, PdfGenerationJobStatus.CANCELLED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel job with status: {job.status.value}",
        )

    # Update job status
    from datetime import datetime
    job.status = PdfGenerationJobStatus.CANCELLED
    job.completed_at = datetime.utcnow()
    await session.commit()
    await session.refresh(job)

    # Convert results
    from app.schemas.exam import PdfGenerationJobResult
    results = None
    if job.results:
        results = [PdfGenerationJobResult(**r) for r in job.results]

    return PdfGenerationJobResponse(
        id=job.id,
        status=job.status.value,
        exam_id=job.exam_id,
        school_ids=job.school_ids,
        subject_id=job.subject_id,
        test_types=job.test_types,
        progress_current=job.progress_current,
        progress_total=job.progress_total,
        current_school_name=job.current_school_name,
        error_message=job.error_message,
        results=results,
        created_at=job.created_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
    )


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pdf_generation_job(
    job_id: int,
    session: DBSessionDep,
) -> None:
    """Delete a PDF generation job."""
    job_stmt = select(PdfGenerationJob).where(PdfGenerationJob.id == job_id)
    job_result = await session.execute(job_stmt)
    job = job_result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    # Only allow deletion of completed, failed, or cancelled jobs
    if job.status in [PdfGenerationJobStatus.PENDING, PdfGenerationJobStatus.PROCESSING]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete job with status: {job.status.value}. Cancel it first.",
        )

    await session.delete(job)
    await session.commit()


@router.post("/delete-multiple", status_code=status.HTTP_200_OK)
async def delete_multiple_pdf_generation_jobs(
    request: DeleteJobsRequest,
    session: DBSessionDep,
) -> dict[str, Any]:
    """Delete multiple PDF generation jobs."""
    job_ids = request.job_ids
    if not job_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No job IDs provided")

    # Get all jobs
    jobs_stmt = select(PdfGenerationJob).where(PdfGenerationJob.id.in_(job_ids))
    jobs_result = await session.execute(jobs_stmt)
    jobs = jobs_result.scalars().all()

    if len(jobs) != len(job_ids):
        found_ids = {job.id for job in jobs}
        missing_ids = set(job_ids) - found_ids
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Jobs not found: {list(missing_ids)}",
        )

    # Check that all jobs can be deleted (not pending or processing)
    cannot_delete = [job for job in jobs if job.status in [PdfGenerationJobStatus.PENDING, PdfGenerationJobStatus.PROCESSING]]
    if cannot_delete:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete jobs with status pending or processing: {[job.id for job in cannot_delete]}",
        )

    # Delete all jobs
    deleted_count = 0
    for job in jobs:
        await session.delete(job)
        deleted_count += 1

    await session.commit()

    return {"deleted_count": deleted_count, "deleted_ids": job_ids}
