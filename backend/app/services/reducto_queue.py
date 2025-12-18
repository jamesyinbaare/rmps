import asyncio
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_sessionmanager
from app.models import Document
from app.services.content_extraction import content_extraction_service
from app.services.storage import storage_service


class ReductoQueueService:
    """Service for queuing and processing documents through Reducto API."""

    def __init__(self):
        self._queue: asyncio.Queue[int] = asyncio.Queue()
        self._queue_items: list[int] = []  # Track queue order for position calculation
        self._processing: bool = False
        self._current_document_id: int | None = None
        self._worker_task: asyncio.Task[None] | None = None

    def enqueue_document(self, document_id: int) -> None:
        """Add document to queue."""
        if document_id not in self._queue_items:
            self._queue.put_nowait(document_id)
            self._queue_items.append(document_id)

    def get_queue_status(self) -> dict[str, Any]:
        """Get queue length and current processing status."""
        return {
            "queue_length": self._queue.qsize(),
            "is_processing": self._processing,
            "current_document_id": self._current_document_id,
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
                    document.scores_extraction_method = extraction_result["parsing_method"]
                    document.scores_extraction_confidence = extraction_result["parsing_confidence"]
                    document.scores_extraction_status = "success"
                    document.scores_extracted_at = datetime.utcnow()
                else:
                    document.scores_extraction_method = extraction_result.get("parsing_method")
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

    async def _worker(self) -> None:
        """Background worker that processes queue items one at a time."""
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

                # Process document
                self._processing = True
                self._current_document_id = document_id
                await self._process_document(document_id)
                self._current_document_id = None
                self._processing = False

                # Mark task as done
                self._queue.task_done()
            except asyncio.CancelledError:
                # Worker was cancelled, exit gracefully
                break
            except Exception:
                # Continue processing even if one document fails
                self._processing = False
                self._current_document_id = None
                continue

    def start_worker(self) -> None:
        """Start the background worker."""
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker())

    async def stop_worker(self) -> None:
        """Stop the background worker gracefully."""
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass


# Global queue service instance
reducto_queue_service = ReductoQueueService()
