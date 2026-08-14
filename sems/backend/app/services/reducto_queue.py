import asyncio
import logging
from typing import Any

from sqlalchemy import select

from app.config import settings
from app.dependencies.database import get_sessionmanager
from app.models import Document, DataExtractionMethod
from app.services.content_extraction import content_extraction_service
from app.services.document_score_extraction import (
    apply_extract_result,
    get_or_create_extraction,
    sync_document_snapshot,
)
from app.services.storage import storage_service
from app.utils.score_utils import add_extraction_method_to_document

logger = logging.getLogger(__name__)


class ReductoQueueService:
    """Service for queuing and processing documents through structured extraction providers."""

    def __init__(self):
        self._queue: asyncio.Queue[tuple[int, str]] = asyncio.Queue()
        self._queue_items: list[tuple[int, str]] = []  # Track queue order for position calculation
        self._worker_tasks: dict[int, asyncio.Task[None]] = {}  # worker_id -> task
        self._processing_documents: set[tuple[int, str]] = set()  # (document_id, method)
        self._stopping_workers: set[int] = set()  # Workers asked to exit after current work
        self._target_workers: int = 0
        self._next_worker_id: int = 0
        self._lock = asyncio.Lock()

    def enqueue_document(self, document_id: int, method: str = "llama") -> None:
        """Add document+provider to queue. Duplicate (document_id, method) pairs are ignored."""
        item = (document_id, method)
        if item in self._queue_items:
            return
        self._queue.put_nowait(item)
        self._queue_items.append(item)

    def _calculate_optimal_workers(self) -> int:
        """Calculate optimal number of workers based on rate limit."""
        # If explicitly configured, use that
        if settings.reducto_queue_workers is not None:
            return max(1, min(settings.reducto_queue_workers, settings.reducto_queue_workers_max))

        # Auto-calculate based on rate limit (~2 API calls/doc: upload + extract)
        rate_limit = settings.reducto_rate_limit_per_second
        avg_api_calls_per_doc = 2.5
        optimal = max(1, int(rate_limit / avg_api_calls_per_doc))
        # Cap below workers_max; default auto ceiling keeps bursts modest
        return min(optimal, min(20, settings.reducto_queue_workers_max))

    def get_queue_status(self) -> dict[str, Any]:
        """Get queue length and current processing status."""
        active = [wid for wid, t in self._worker_tasks.items() if not t.done()]
        return {
            "queue_length": self._queue.qsize(),
            "active_workers": len(active),
            "target_workers": self._target_workers,
            "processing_documents": sorted({doc_id for doc_id, _method in self._processing_documents}),
            "total_workers": len(self._worker_tasks),
            "rate_limit_per_second": settings.reducto_rate_limit_per_second,
            "workers_max": settings.reducto_queue_workers_max,
        }

    def get_document_queue_position(self, document_id: int, method: str | None = None) -> int | None:
        """Get position of document in queue (1-based, None if not in queue)."""
        for index, (queued_id, queued_method) in enumerate(self._queue_items):
            if queued_id != document_id:
                continue
            if method is None or queued_method == method:
                return index + 1
        return None

    async def _process_document(self, document_id: int, method: str = "llama") -> None:
        """Process a single document through the chosen extraction provider."""
        sessionmanager = get_sessionmanager()
        async with sessionmanager.session() as session:
            try:
                # Get document
                stmt = select(Document).where(Document.id == document_id)
                result = await session.execute(stmt)
                document = result.scalar_one_or_none()

                if not document:
                    return

                # Update per-provider status to processing
                row = await get_or_create_extraction(session, document.id, method)
                row.status = "processing"
                sync_document_snapshot(document, row)
                await session.commit()

                # Retrieve file content
                try:
                    file_content = await storage_service.retrieve(document.file_path)
                except FileNotFoundError:
                    row.status = "error"
                    row.error_message = "File not found in storage"
                    sync_document_snapshot(document, row)
                    await session.commit()
                    return

                # Extract content using the requested provider
                extraction_result = await content_extraction_service.extract_content(
                    file_content, method=method, test_type=document.test_type
                )

                apply_extract_result(
                    row,
                    is_valid=extraction_result["is_valid"],
                    parsed_content=extraction_result.get("parsed_content"),
                    confidence=extraction_result.get("parsing_confidence", 0.0),
                    error_message=extraction_result.get("error_message"),
                )
                add_extraction_method_to_document(document, DataExtractionMethod.AUTOMATED_EXTRACTION)
                sync_document_snapshot(document, row)

                await session.commit()
            except Exception:
                # On error, mark this provider as error without clearing prior data
                try:
                    stmt = select(Document).where(Document.id == document_id)
                    result = await session.execute(stmt)
                    document = result.scalar_one_or_none()
                    if document:
                        row = await get_or_create_extraction(session, document.id, method)
                        row.status = "error"
                        sync_document_snapshot(document, row)
                        await session.commit()
                except Exception:
                    pass  # Ignore errors during error handling

    async def _worker(self, worker_id: int) -> None:
        """Background worker that processes queue items."""
        while True:
            # Graceful scale-down: exit once marked, after finishing current work
            if worker_id in self._stopping_workers:
                self._stopping_workers.discard(worker_id)
                break

            try:
                # Get next document from queue (with timeout to allow checking for shutdown/resize)
                try:
                    item = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue

                document_id, method = item

                # Remove from tracking list
                if item in self._queue_items:
                    self._queue_items.remove(item)

                # Track active processing per document+provider
                self._processing_documents.add((document_id, method))

                try:
                    # Process document (rate limiter is shared, so it will throttle automatically)
                    await self._process_document(document_id, method)
                finally:
                    self._processing_documents.discard((document_id, method))
                    # Mark task as done
                    self._queue.task_done()
            except asyncio.CancelledError:
                # Worker was cancelled, exit gracefully
                break
            except Exception:
                # Continue processing even if one document fails
                continue

        self._worker_tasks.pop(worker_id, None)
        logger.info(f"Reducto queue worker {worker_id} stopped")

    def _spawn_workers_unlocked(self, count: int) -> None:
        """Spawn `count` new workers. Caller must hold _lock or be on startup."""
        for _ in range(count):
            worker_id = self._next_worker_id
            self._next_worker_id += 1
            task = asyncio.create_task(self._worker(worker_id), name=f"reducto-worker-{worker_id}")
            self._worker_tasks[worker_id] = task
            logger.info(f"Started Reducto queue worker {worker_id}")

    def start_worker(self) -> None:
        """Start the worker pool."""
        active = {wid: t for wid, t in self._worker_tasks.items() if not t.done()}
        self._worker_tasks = active
        if active and self._target_workers > 0:
            return  # Already started and running

        num_workers = self._calculate_optimal_workers()
        self._target_workers = num_workers
        self._stopping_workers.clear()
        self._spawn_workers_unlocked(num_workers)
        logger.info(
            f"Reducto queue started with {num_workers} workers "
            f"(rate_limit={settings.reducto_rate_limit_per_second}/s)"
        )

    async def set_worker_count(self, count: int) -> dict[str, Any]:
        """
        Resize the worker pool at runtime.

        Scaling up spawns new workers immediately. Scaling down marks excess workers
        to exit after finishing their current document (or on the next idle poll).
        Rate limiting is unchanged — workers still share the token bucket.
        """
        max_workers = settings.reducto_queue_workers_max
        count = max(1, min(int(count), max_workers))

        async with self._lock:
            self._worker_tasks = {wid: t for wid, t in self._worker_tasks.items() if not t.done()}
            previous = self._target_workers
            self._target_workers = count

            active_ids = sorted(self._worker_tasks.keys())
            active_count = len(active_ids)

            if active_count < count:
                # Any previously marked stoppers among keepers should keep running
                for wid in active_ids:
                    self._stopping_workers.discard(wid)
                self._spawn_workers_unlocked(count - active_count)
            elif active_count > count:
                keepers = set(active_ids[:count])
                for wid in active_ids:
                    if wid in keepers:
                        self._stopping_workers.discard(wid)
                    else:
                        self._stopping_workers.add(wid)
            else:
                for wid in active_ids:
                    self._stopping_workers.discard(wid)

            logger.info(f"Reducto queue workers resized: {previous} -> {count}")
            return self.get_queue_status()

    async def stop_worker(self) -> None:
        """Stop all workers gracefully."""
        async with self._lock:
            self._target_workers = 0
            self._stopping_workers.update(self._worker_tasks.keys())
            tasks = list(self._worker_tasks.values())
            self._worker_tasks.clear()

        if not tasks:
            return

        for task in tasks:
            if not task.done():
                task.cancel()

        await asyncio.gather(*tasks, return_exceptions=True)
        self._processing_documents.clear()
        self._stopping_workers.clear()


# Global queue service instance
reducto_queue_service = ReductoQueueService()
