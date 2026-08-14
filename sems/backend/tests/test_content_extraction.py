"""Unit tests for structured extraction transform, Llama Extract, and method routing."""

from types import SimpleNamespace

import pytest

from app.services.content_extraction import (
    ContentExtractionService,
    LlamaExtractExtractor,
    extraction_provider_error,
    transform_candidates_to_tables,
    unwrap_extract_data,
)


class ImmediateLimiter:
    async def acquire(self) -> None:
        return


def test_transform_candidates_numeric_absent_and_blank():
    tables = transform_candidates_to_tables(
        {
            "candidates": [
                {
                    "sn": 1,
                    "index_number": "ABC001",
                    "candidate_name": "Ada",
                    "attend": "✓",
                    "score": 75,
                    "verify": 75,
                },
                {
                    "sn": 2,
                    "index_number": "ABC002",
                    "candidate_name": "Ben",
                    "attend": "A",
                    "score": "AA",
                    "verify": "A",
                },
                {
                    "sn": 3,
                    "index_number": "ABC003",
                    "candidate_name": "Cara",
                    "attend": "",
                    "score": None,
                    "verify": None,
                },
            ],
            "sheet_id": "123456MTH1101",
            "series": 1,
            "paper": 2,
            "centre": "Accra",
            "subject": "701 Mathematics",
        },
        test_type=None,
    )

    assert len(tables) == 1
    table = tables[0]
    assert table["test_type"] == "2"
    rows = table["rows"]
    assert rows[0]["raw_score"] == "75"
    assert rows[0]["verify"] == "75"
    assert rows[1]["raw_score"] == "AA"
    assert rows[1]["verify"] == "A"
    assert rows[2]["raw_score"] is None
    assert rows[2]["verify"] is None
    assert table["metadata"]["sheet_id"] == "123456MTH1101"
    assert table["metadata"]["centre"] == "Accra"


def test_transform_candidates_empty_and_invalid():
    assert transform_candidates_to_tables({}) == []
    assert transform_candidates_to_tables({"candidates": []}) == []
    tables = transform_candidates_to_tables(
        {"candidates": [{"index_number": "X", "score": "not-a-score", "verify": -1}]},
        test_type="1",
    )
    assert tables[0]["test_type"] == "1"
    assert tables[0]["rows"][0]["raw_score"] is None
    assert tables[0]["rows"][0]["verify"] is None


def test_unwrap_extract_data_list_and_dict():
    assert unwrap_extract_data({"candidates": []}) == {"candidates": []}
    assert unwrap_extract_data([{"candidates": [1]}]) == {"candidates": [1]}
    assert unwrap_extract_data([]) == {}
    assert unwrap_extract_data(None) == {}


def test_provider_from_extraction_data():
    from app.routers.scores import _provider_from_extraction_data

    assert _provider_from_extraction_data({"provider": "llama"}) == "llama"
    assert _provider_from_extraction_data({"provider": " reducto "}) == "reducto"
    assert _provider_from_extraction_data({"tables": []}) is None
    assert _provider_from_extraction_data(None) is None
    assert _provider_from_extraction_data("llama") is None


def test_extraction_provider_error(monkeypatch):
    monkeypatch.setattr("app.services.content_extraction.settings.reducto_enabled", True)
    monkeypatch.setattr("app.services.content_extraction.settings.reducto_api_key", "rk")
    monkeypatch.setattr("app.services.content_extraction.settings.llama_extract_enabled", True)
    monkeypatch.setattr("app.services.content_extraction.settings.llama_cloud_api_key", "lk")
    assert extraction_provider_error("reducto") is None
    assert extraction_provider_error("llama") is None

    monkeypatch.setattr("app.services.content_extraction.settings.llama_cloud_api_key", None)
    assert "Llama Cloud API key" in (extraction_provider_error("llama") or "")
    monkeypatch.setattr("app.services.content_extraction.settings.reducto_enabled", False)
    assert "disabled" in (extraction_provider_error("reducto") or "")
    assert "Unknown" in (extraction_provider_error("other") or "")


class FakeExtract:
    def __init__(self, jobs: list[SimpleNamespace]) -> None:
        self.jobs = jobs
        self.index = 0
        self.create_kwargs: dict | None = None

    def create(self, **kwargs: object) -> SimpleNamespace:
        self.create_kwargs = kwargs
        return self.jobs[0]

    def get(self, job_id: object) -> SimpleNamespace:
        self.index = min(self.index + 1, len(self.jobs) - 1)
        return self.jobs[self.index]


class FakeFiles:
    def create(self, **kwargs: object) -> SimpleNamespace:
        self.kwargs = kwargs
        return SimpleNamespace(id="file-1")


class FakeClient:
    def __init__(self, jobs: list[SimpleNamespace]) -> None:
        self.files = FakeFiles()
        self.extract = FakeExtract(jobs)


def _extractor_with_client(jobs: list[SimpleNamespace]) -> LlamaExtractExtractor:
    extractor = LlamaExtractExtractor()
    extractor.enabled = True
    extractor.api_key = "test-key"
    extractor._client = FakeClient(jobs)
    extractor._rate_limiter = ImmediateLimiter()  # type: ignore[assignment]
    return extractor


@pytest.mark.asyncio
async def test_llama_extract_success(monkeypatch):
    monkeypatch.setattr("app.services.content_extraction.settings.llama_extract_poll_interval_seconds", 0)
    monkeypatch.setattr(
        "app.services.content_extraction.settings.reducto_extraction_schema",
        {"type": "object"},
    )
    jobs = [
        SimpleNamespace(id="job-1", status="PENDING", extract_result=None, error_message=None),
        SimpleNamespace(
            id="job-1",
            status="COMPLETED",
            extract_result={
                "candidates": [
                    {
                        "sn": 1,
                        "index_number": "IDX001",
                        "candidate_name": "Ada",
                        "attend": "✓",
                        "score": 80,
                        "verify": 80,
                    }
                ],
                "paper": 1,
                "sheet_id": "123456MTH1101",
            },
            error_message=None,
        ),
    ]
    extractor = _extractor_with_client(jobs)
    parsed, confidence = await extractor.extract(b"image-bytes", test_type="1")
    assert confidence == 0.9
    assert parsed["tables"][0]["rows"][0]["raw_score"] == "80"
    assert parsed["tables"][0]["metadata"]["sheet_id"] == "123456MTH1101"
    assert extractor._client.extract.create_kwargs["file_input"] == "file-1"  # type: ignore[union-attr]
    file_kwargs = extractor._client.files.kwargs  # type: ignore[union-attr]
    assert file_kwargs["external_file_id"] != "score-sheet.jpg"
    assert isinstance(file_kwargs["external_file_id"], str)
    assert len(file_kwargs["external_file_id"]) >= 16
    assert file_kwargs["file"][0].endswith(".jpg")


@pytest.mark.asyncio
async def test_llama_extract_failed_job(monkeypatch):
    monkeypatch.setattr("app.services.content_extraction.settings.llama_extract_poll_interval_seconds", 0)
    monkeypatch.setattr(
        "app.services.content_extraction.settings.reducto_extraction_schema",
        {"type": "object"},
    )
    jobs = [
        SimpleNamespace(id="job-1", status="FAILED", extract_result=None, error_message="boom"),
    ]
    extractor = _extractor_with_client(jobs)
    parsed, confidence = await extractor.extract(b"image-bytes")
    assert confidence == 0.0
    assert parsed["tables"] == []


@pytest.mark.asyncio
async def test_llama_extract_timeout(monkeypatch):
    monkeypatch.setattr("app.services.content_extraction.settings.llama_extract_poll_interval_seconds", 0)
    monkeypatch.setattr("app.services.content_extraction.settings.llama_extract_poll_timeout_seconds", 0)
    monkeypatch.setattr(
        "app.services.content_extraction.settings.reducto_extraction_schema",
        {"type": "object"},
    )
    jobs = [
        SimpleNamespace(id="job-1", status="PENDING", extract_result=None, error_message=None),
    ]
    extractor = _extractor_with_client(jobs)
    parsed, confidence = await extractor.extract(b"image-bytes")
    assert confidence == 0.0
    assert parsed == {"full_text": "", "tables": []}


@pytest.mark.asyncio
async def test_extract_content_llama_attaches_provider(monkeypatch):
    service = ContentExtractionService()

    async def fake_extract(image_data: bytes, test_type: str | None = None):
        return {"full_text": "", "tables": [{"rows": [{"index_number": "X", "raw_score": "1"}]}]}, 0.9

    monkeypatch.setattr(service.llama_extractor, "extract", fake_extract)
    result = await service.extract_content(b"img", method="llama", test_type="1")
    assert result["is_valid"] is True
    assert result["parsing_method"] == "llama"
    assert result["parsed_content"]["provider"] == "llama"


@pytest.mark.asyncio
async def test_extract_content_unknown_method_does_not_fallback_to_ocr():
    service = ContentExtractionService()
    ocr_called = {"full": False, "table": False}

    async def fail_full(_image_data: bytes):
        ocr_called["full"] = True
        return "text", 1.0

    async def fail_table(_image_data: bytes, test_type: str | None = None):
        ocr_called["table"] = True
        return [], 1.0

    service.full_text_extractor.extract = fail_full  # type: ignore[method-assign]
    service.table_extractor.extract = fail_table  # type: ignore[method-assign]

    result = await service.extract_content(b"img", method="not-a-provider")
    assert result["is_valid"] is False
    assert result["parsing_method"] == "not-a-provider"
    assert "Unknown extraction method" in (result["error_message"] or "")
    assert ocr_called == {"full": False, "table": False}
