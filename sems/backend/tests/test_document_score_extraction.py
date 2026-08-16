from datetime import datetime, timedelta

from sqlalchemy import select

from app.models import Document, DocumentScoreExtraction
from app.services.document_score_extraction import (
    apply_extract_result,
    apply_extraction_list_filters,
    is_current_applied,
    is_ready,
    legacy_extraction_provider,
    normalize_provider,
    payload_for_apply,
    reset_stale_extraction_row,
    sync_document_snapshot,
)


def test_normalize_provider_defaults_to_llama() -> None:
    assert normalize_provider(None) == "llama"
    assert normalize_provider("  Llama ") == "llama"
    assert normalize_provider("reducto") == "reducto"


def test_llama_extract_does_not_clear_reducto_row() -> None:
    reducto = DocumentScoreExtraction(
        document_id=1,
        provider="reducto",
        data={"provider": "reducto", "tables": []},
        status="success",
        applied_at=datetime.utcnow(),
    )
    llama = DocumentScoreExtraction(document_id=1, provider="llama", status="pending")

    apply_extract_result(
        llama,
        is_valid=True,
        parsed_content={"provider": "llama", "tables": [{"rows": []}]},
        confidence=0.9,
    )

    assert reducto.data == {"provider": "reducto", "tables": []}
    assert reducto.status == "success"
    assert reducto.applied_at is not None
    assert llama.data == {"provider": "llama", "tables": [{"rows": []}]}
    assert llama.status == "success"
    assert llama.applied_at is None


def test_reextract_after_apply_is_ready_not_current_applied() -> None:
    applied_at = datetime.utcnow() - timedelta(minutes=5)
    row = DocumentScoreExtraction(
        document_id=1,
        provider="reducto",
        status="success",
        data={"tables": [{"rows": [{"index_number": "1"}]}]},
        extracted_at=applied_at,
        applied_at=applied_at,
        applied_count=10,
    )
    assert is_current_applied(row)
    assert not is_ready(row)

    apply_extract_result(
        row,
        is_valid=True,
        parsed_content={"tables": [{"rows": [{"index_number": "2"}]}]},
        confidence=1.0,
    )

    assert row.applied_at == applied_at
    assert row.applied_count == 10
    assert row.extracted_at is not None and row.extracted_at > applied_at
    assert is_ready(row)
    assert not is_current_applied(row)


def test_failed_extract_keeps_previous_data() -> None:
    row = DocumentScoreExtraction(
        document_id=1,
        provider="llama",
        status="success",
        data={"provider": "llama"},
        extracted_at=datetime.utcnow(),
    )
    apply_extract_result(
        row,
        is_valid=False,
        parsed_content=None,
        confidence=0.0,
        error_message="provider error",
    )
    assert row.status == "error"
    assert row.data == {"provider": "llama"}
    assert row.error_message == "provider error"


def test_sync_document_snapshot_copies_last_touched_row() -> None:
    document = Document(
        file_path="x",
        file_name="x.jpg",
        mime_type="image/jpeg",
        file_size=1,
        checksum="a" * 64,
        exam_id=1,
    )
    extracted_at = datetime.utcnow()
    row = DocumentScoreExtraction(
        document_id=1,
        provider="llama",
        status="success",
        data={"provider": "llama"},
        confidence=0.8,
        extracted_at=extracted_at,
        applied_at=None,
    )
    sync_document_snapshot(document, row)
    assert document.scores_extraction_data == {"provider": "llama"}
    assert document.scores_extraction_status == "success"
    assert document.scores_extraction_confidence == 0.8
    assert document.scores_extracted_at == extracted_at
    assert document.scores_applied_at is None


def _document_stub() -> Document:
    return Document(
        file_path="x",
        file_name="x.jpg",
        mime_type="image/jpeg",
        file_size=1,
        checksum="a" * 64,
        exam_id=1,
    )


def test_reset_stale_extraction_row_queued_and_processing() -> None:
    extracted_at = datetime.utcnow()
    applied_at = extracted_at
    payload = {"provider": "llama", "tables": []}

    queued_doc = _document_stub()
    queued_doc.scores_extraction_status = "queued"
    queued_row = DocumentScoreExtraction(
        document_id=1,
        provider="llama",
        status="queued",
        data=payload,
        extracted_at=extracted_at,
        applied_at=applied_at,
        applied_count=4,
    )
    assert reset_stale_extraction_row(queued_doc, queued_row) is True
    assert queued_row.status == "pending"
    assert queued_row.data == payload
    assert queued_row.applied_at == applied_at
    assert queued_row.applied_count == 4
    assert queued_doc.scores_extraction_status == "pending"

    processing_doc = _document_stub()
    processing_doc.scores_extraction_status = "processing"
    processing_row = DocumentScoreExtraction(
        document_id=2,
        provider="llama",
        status="processing",
        data=payload,
    )
    assert reset_stale_extraction_row(processing_doc, processing_row) is True
    assert processing_row.status == "pending"
    assert processing_doc.scores_extraction_status == "pending"


def test_reset_stale_extraction_row_leaves_success_untouched() -> None:
    document = _document_stub()
    document.scores_extraction_status = "success"
    document.scores_extraction_data = {"provider": "reducto"}
    row = DocumentScoreExtraction(
        document_id=1,
        provider="llama",
        status="success",
        data={"provider": "llama"},
    )
    assert reset_stale_extraction_row(document, row) is False
    assert row.status == "success"
    assert document.scores_extraction_status == "success"
    assert document.scores_extraction_data == {"provider": "reducto"}


def test_reset_stale_extraction_row_does_not_overwrite_success_snapshot() -> None:
    document = _document_stub()
    document.scores_extraction_status = "success"
    document.scores_extraction_data = {"provider": "reducto"}
    row = DocumentScoreExtraction(
        document_id=1,
        provider="llama",
        status="processing",
        data={"provider": "llama"},
    )
    assert reset_stale_extraction_row(document, row) is True
    assert row.status == "pending"
    assert document.scores_extraction_status == "success"
    assert document.scores_extraction_data == {"provider": "reducto"}


def test_legacy_blob_conversion_uses_embedded_provider() -> None:
    assert legacy_extraction_provider({"provider": "llama", "tables": []}) == "llama"
    assert legacy_extraction_provider({"provider": "Reducto"}) == "reducto"
    assert legacy_extraction_provider({"tables": []}) == "reducto"
    assert legacy_extraction_provider({"provider": ""}) == "reducto"
    assert legacy_extraction_provider(None) == "reducto"


def test_apply_with_llama_reads_llama_row_only() -> None:
    reducto = DocumentScoreExtraction(
        document_id=1,
        provider="reducto",
        status="success",
        data={"provider": "reducto", "candidates": [{"index_number": "R"}]},
    )
    llama = DocumentScoreExtraction(
        document_id=1,
        provider="llama",
        status="success",
        data={"provider": "llama", "candidates": [{"index_number": "L"}]},
    )
    snapshot = reducto.data

    assert payload_for_apply(llama, snapshot, "llama") == llama.data
    assert payload_for_apply(reducto, snapshot, "reducto") == reducto.data
    assert payload_for_apply(None, snapshot, "llama") is None
    assert payload_for_apply(None, snapshot, None) == snapshot


def test_apply_request_requires_provider() -> None:
    from pydantic import ValidationError

    from app.schemas.score import UpdateScoresFromReductoRequest

    req = UpdateScoresFromReductoRequest(verify=True, provider="llama")
    assert req.provider == "llama"

    try:
        UpdateScoresFromReductoRequest(verify=True)  # type: ignore[call-arg]
        raise AssertionError("provider should be required")
    except ValidationError:
        pass


def test_ready_filter_sql_uses_extracted_after_applied() -> None:
    stmt = apply_extraction_list_filters(
        select(Document.id),
        extraction_provider="reducto",
        extraction_status=None,
        scores_applied=False,
    )
    sql = str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()
    assert "extracted_at" in sql
    assert "applied_at" in sql
    assert "success" in sql
