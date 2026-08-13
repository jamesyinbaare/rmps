"""Unit tests for Reducto queue worker pool sizing and runtime resize."""
import asyncio

import pytest

from app.services.reducto_queue import ReductoQueueService


@pytest.mark.asyncio
async def test_set_worker_count_scales_up_and_down(monkeypatch):
    monkeypatch.setattr("app.services.reducto_queue.settings.reducto_queue_workers_max", 10)

    service = ReductoQueueService()
    # Avoid real document processing if anything is dequeued
    async def noop_process(_document_id: int) -> None:
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
