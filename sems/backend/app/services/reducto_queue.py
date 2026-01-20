import asyncio
from datetime import datetime
from typing import Any

from sqlalchemy import select

from app.dependencies.database import get_sessionmanager
from app.models import Document, DataExtractionMethod
from app.services.content_extraction import content_extraction_service
from app.services.storage import storage_service
from app.utils.score_utils import add_extraction_method_to_document


class ReductoQueueService:
    """Service for queuing and processing documents through Reducto API."""

    def __init__(self):
        self._queue: asyncio.Queue[int] = asyncio.Queue()
        self._queue_items: list[int] = []  # Track queue order for position calculation
        self._worker_tasks: list[asyncio.Task[None]] = []  # Worker pool tasks
        self._processing_documents: set[int] = set()  # Track actively processing documents

    def enqueue_document(self, document_id: int) -> None:
        """Add document to queue."""
        if document_id not in self._queue_items:
            self._queue.put_nowait(document_id)
            self._queue_items.append(document_id)

    def _calculate_optimal_workers(self) -> int:
        """Calculate optimal number of workers based on rate limit."""
        from app.config import settings

        # If explicitly configured, use that
        if settings.reducto_queue_workers is not None:
            return max(1, settings.reducto_queue_workers)

        # Auto-calculate based on rate limit
        rate_limit = settings.reducto_rate_limit_per_second
        avg_api_calls_per_doc = 2.5  # upload + extract/parse
        optimal = max(1, int(rate_limit / avg_api_calls_per_doc))
        return min(optimal, 10)  # Cap at 10 workers for safety

    def get_queue_status(self) -> dict[str, Any]:
        """Get queue length and current processing status."""
        return {
            "queue_length": self._queue.qsize(),
            "active_workers": len([t for t in self._worker_tasks if not t.done()]),
            "processing_documents": list(self._processing_documents),
            "total_workers": len(self._worker_tasks),
        }

    def get_document_queue_position(self, document_id: int) -> int | None:
        """Get position of document in queue (1-based, None if not in queue)."""
        try:
            return self._queue_items.index(document_id) + 1
        except ValueError:
            return None

    async def _process_document(self, document_id: int) -> None:
        """Process a single document through Reducto API."""
        sessionmanager = get_sessionmanager()
        async with sessionmanager.session() as session:
            try:
                # Get document
                stmt = select(Document).where(Document.id == document_id)
                result = await session.execute(stmt)
                document = result.scalar_one_or_none()

                if not document:
                    return

                # Update status to processing
                document.scores_extraction_status = "processing"
                await session.commit()

                # Retrieve file content
                try:
                    file_content = await storage_service.retrieve(document.file_path)
                except FileNotFoundError:
                    document.scores_extraction_status = "error"
                    await session.commit()
                    return

                # Extract content using Reducto
                extraction_result = await content_extraction_service.extract_content(
                    file_content, method="reducto", test_type=document.test_type
                )

                # Update document with extraction results
                if extraction_result["is_valid"]:
                    document.scores_extraction_data = extraction_result["parsed_content"]
                    add_extraction_method_to_document(document, DataExtractionMethod.AUTOMATED_EXTRACTION)
                    document.scores_extraction_confidence = extraction_result["parsing_confidence"]
                    document.scores_extraction_status = "success"
                    document.scores_extracted_at = datetime.utcnow()
                else:
                    add_extraction_method_to_document(document, DataExtractionMethod.AUTOMATED_EXTRACTION)
                    document.scores_extraction_confidence = extraction_result.get("parsing_confidence", 0.0)
                    document.scores_extraction_status = "error"

                await session.commit()
            except Exception:
                # On error, mark document as error
                try:
                    stmt = select(Document).where(Document.id == document_id)
                    result = await session.execute(stmt)
                    document = result.scalar_one_or_none()
                    if document:
                        document.scores_extraction_status = "error"
                        await session.commit()
                except Exception:
                    pass  # Ignore errors during error handling

    async def _worker(self, worker_id: int) -> None:
        """Background worker that processes queue items."""
        while True:
            try:
                # Get next document from queue (with timeout to allow checking for shutdown)
                try:
                    document_id = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue

                # Remove from tracking list
                if document_id in self._queue_items:
                    self._queue_items.remove(document_id)

                # Track active processing
                self._processing_documents.add(document_id)

                try:
                    # Process document (rate limiter is shared, so it will throttle automatically)
                    await self._process_document(document_id)
                finally:
                    # Remove from active processing
                    self._processing_documents.discard(document_id)
                    # Mark task as done
                    self._queue.task_done()
            except asyncio.CancelledError:
                # Worker was cancelled, exit gracefully
                break
            except Exception:
                # Continue processing even if one document fails
                continue

    def start_worker(self) -> None:
        """Start the worker pool."""
        if self._worker_tasks:
            # Check if any workers are still running
            active_workers = [t for t in self._worker_tasks if not t.done()]
            if active_workers:
                return  # Already started and running

        # Calculate optimal number of workers
        num_workers = self._calculate_optimal_workers()

        # Start worker pool
        for i in range(num_workers):
            task = asyncio.create_task(self._worker(i))
            self._worker_tasks.append(task)

    async def stop_worker(self) -> None:
        """Stop all workers gracefully."""
        if not self._worker_tasks:
            return

        # Cancel all worker tasks
        for task in self._worker_tasks:
            if not task.done():
                task.cancel()

        # Wait for all tasks to complete cancellation
        await asyncio.gather(*self._worker_tasks, return_exceptions=True)

        # Clear the worker tasks list
        self._worker_tasks.clear()
        self._processing_documents.clear()


# Global queue service instance
reducto_queue_service = ReductoQueueService()
