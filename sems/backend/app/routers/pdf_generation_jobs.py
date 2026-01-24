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
            subject_ids=job.subject_ids,
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
        subject_ids=job.subject_ids,
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

    school_code = school_result.get("school_code", "school")
    school_name_safe = school_result.get("school_name", "unknown").replace("/", "_").replace("\\", "_")
    school_folder = f"{school_code}_{school_name_safe}"

    file_paths = school_result.get("pdf_file_paths") or []
    if not file_paths and school_result.get("pdf_file_path"):
        file_paths = [school_result["pdf_file_path"]]

    if not file_paths:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF files not available for this school")

    zip_buffer = BytesIO()
    files_added = False
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for rel_path in file_paths:
            pdf_path = Path(settings.pdf_output_path) / rel_path
            if pdf_path.exists():
                zip_file.write(pdf_path, f"{school_folder}/{pdf_path.name}")
                files_added = True

    if not files_added:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No PDF files found for this school")

    zip_buffer.seek(0)
    filename = f"{school_folder}_score_sheets.zip"

    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
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
    files_added = False

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for result in job.results:
            school_code = result.get("school_code", "school")
            school_name_safe = result.get("school_name", "unknown").replace("/", "_").replace("\\", "_")
            school_folder = f"{school_code}_{school_name_safe}"

            file_paths = result.get("pdf_file_paths") or []
            if not file_paths and result.get("pdf_file_path"):
                file_paths = [result["pdf_file_path"]]

            for rel_path in file_paths:
                pdf_path = Path(settings.pdf_output_path) / rel_path
                if pdf_path.exists():
                    zip_file.write(pdf_path, f"{school_folder}/{pdf_path.name}")
                    files_added = True

    if not files_added:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No PDF files found for this job")

    zip_buffer.seek(0)

    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="job_{job_id}_all_schools.zip"'},
    )


@router.get("/{job_id}/merge/{school_id}")
async def merge_job_school_pdf(
    job_id: int,
    school_id: int,
    session: DBSessionDep,
) -> StreamingResponse:
    """Merge existing annotated PDFs for a specific school from a job into a single PDF."""
    from app.services.score_sheet_pdf_service import combine_pdfs_for_school

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

    file_paths = school_result.get("pdf_file_paths") or []
    if not file_paths and school_result.get("pdf_file_path"):
        file_paths = [school_result["pdf_file_path"]]

    if not file_paths:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF files not available for this school")

    # Convert relative paths to absolute paths
    absolute_paths = []
    for rel_path in file_paths:
        pdf_path = Path(settings.pdf_output_path) / rel_path
        if pdf_path.exists():
            absolute_paths.append(str(pdf_path))
        else:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"PDF file not found for merge: {pdf_path}")

    if not absolute_paths:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No PDF files found for this school")

    # Combine PDFs using existing annotated files
    # Note: These should be the annotated PDFs from the job
    try:
        combined_pdf_bytes = combine_pdfs_for_school(Path("/"), file_paths=absolute_paths)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to merge PDFs for school {school_id} in job {job_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to merge PDFs: {str(e)}"
        )

    school_code = school_result.get("school_code", "school")
    school_name_safe = school_result.get("school_name", "unknown").replace("/", "_").replace("\\", "_")
    filename = f"{school_code}_{school_name_safe}_combined_score_sheets.pdf"

    return StreamingResponse(
        iter([combined_pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
