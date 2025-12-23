"""Background task runner for PDF generation jobs."""

import asyncio
import logging

from app.dependencies.database import get_sessionmanager
from app.services.pdf_generation_job_service import process_pdf_generation_job

logger = logging.getLogger(__name__)


async def run_pdf_generation_job(job_id: int) -> None:
    """
    Run a PDF generation job in the background.

    This function is called as a background task and handles the job processing.
    """
    try:
        # Get session manager
        sessionmanager = get_sessionmanager()

        # Get a new database session for this task
        async with sessionmanager.session() as session:
            try:
                await process_pdf_generation_job(job_id, session)
            except Exception as e:
                logger.error(f"Error processing PDF generation job {job_id}: {e}", exc_info=True)
                # Try to update job status to failed
                try:
                    from datetime import datetime

                    from sqlalchemy import select

                    from app.models import PdfGenerationJob, PdfGenerationJobStatus

                    job_stmt = select(PdfGenerationJob).where(PdfGenerationJob.id == job_id)
                    job_result = await session.execute(job_stmt)
                    job = job_result.scalar_one_or_none()
                    if job:
                        job.status = PdfGenerationJobStatus.FAILED
                        job.error_message = str(e)
                        job.completed_at = datetime.utcnow()
                        await session.commit()
                except Exception as update_error:
                    logger.error(f"Error updating job status: {update_error}", exc_info=True)
    except Exception as e:
        logger.error(f"Error in background task for job {job_id}: {e}", exc_info=True)


def start_pdf_generation_job(job_id: int) -> None:
    """
    Start a PDF generation job as a background task.

    This function creates an asyncio task to run the job processing.
    """
    try:
        # Get the running event loop (should exist since we're called from an async endpoint)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # Fallback: try to get any event loop
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                # No event loop available, log error
                logger.error(f"No event loop available to start background task for job {job_id}")
                return

        # Create a new task (fire and forget)
        loop.create_task(run_pdf_generation_job(job_id))
        logger.info(f"Started background task for PDF generation job {job_id}")
    except Exception as e:
        logger.error(f"Error starting background task for job {job_id}: {e}", exc_info=True)
