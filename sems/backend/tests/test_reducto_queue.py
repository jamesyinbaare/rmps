"""Unit tests for Reducto queue worker pool sizing and runtime resize."""
import asyncio

import pytest

from app.services.reducto_queue import ReductoQueueService


@pytest.mark.asyncio
async def test_set_worker_count_scales_up_and_down(monkeypatch):
    monkeypatch.setattr("app.services.reducto_queue.settings.reducto_queue_workers_max", 10)

    service = ReductoQueueService()
    # Avoid real document processing if anything is dequeued
    async def noop_process(_document_id: int, _method: str = "reducto") -> None:
        await asyncio.sleep(0.05)

    monkeypatch.setattr(service, "_process_document", noop_process)

    service.start_worker()
    assert service._target_workers == 4  # config default
    assert len([t for t in service._worker_tasks.values() if not t.done()]) == 4

    status = await service.set_worker_count(7)
    assert status["target_workers"] == 7
    # Allow spawned tasks to register
    await asyncio.sleep(0.05)
    assert len([t for t in service._worker_tasks.values() if not t.done()]) == 7

    status = await service.set_worker_count(2)
    assert status["target_workers"] == 2
    # Scale-down is graceful — wait for idle poll exits
    await asyncio.sleep(1.2)
    assert len([t for t in service._worker_tasks.values() if not t.done()]) == 2

    # Cap at workers_max
    status = await service.set_worker_count(99)
    assert status["target_workers"] == 10

    await service.stop_worker()
    assert service._target_workers == 0
    assert len(service._worker_tasks) == 0


def test_calculate_optimal_workers_uses_explicit_and_auto(monkeypatch):
    service = ReductoQueueService()

    monkeypatch.setattr("app.services.reducto_queue.settings.reducto_queue_workers", 6)
    monkeypatch.setattr("app.services.reducto_queue.settings.reducto_queue_workers_max", 50)
    assert service._calculate_optimal_workers() == 6

    monkeypatch.setattr("app.services.reducto_queue.settings.reducto_queue_workers", None)
    monkeypatch.setattr("app.services.reducto_queue.settings.reducto_rate_limit_per_second", 10.0)
    # int(10 / 2.5) = 4, capped at min(20, 50)
    assert service._calculate_optimal_workers() == 4

    monkeypatch.setattr("app.services.reducto_queue.settings.reducto_rate_limit_per_second", 100.0)
    assert service._calculate_optimal_workers() == 20


def test_enqueue_document_defaults_to_llama():
    service = ReductoQueueService()
    service.enqueue_document(1)
    assert service._queue_items == [(1, "llama")]


def test_enqueue_document_allows_same_doc_different_providers():
    service = ReductoQueueService()
    service.enqueue_document(1, "llama")
    service.enqueue_document(2, "reducto")
    service.enqueue_document(1, "reducto")
    service.enqueue_document(1, "llama")

    assert service._queue_items == [(1, "llama"), (2, "reducto"), (1, "reducto")]
    assert service.get_document_queue_position(1) == 1
    assert service.get_document_queue_position(1, "llama") == 1
    assert service.get_document_queue_position(1, "reducto") == 3
    assert service.get_document_queue_position(2) == 2
    assert service.get_document_queue_position(99) is None


@pytest.mark.asyncio
async def test_process_document_passes_queued_method(monkeypatch):
    service = ReductoQueueService()
    received: list[tuple[int, str]] = []

    async def capture(document_id: int, method: str = "reducto") -> None:
        received.append((document_id, method))

    monkeypatch.setattr(service, "_process_document", capture)
    service.enqueue_document(42, "llama")
    service.start_worker()
    await asyncio.sleep(0.2)
    await service.stop_worker()

    assert received == [(42, "llama")]
