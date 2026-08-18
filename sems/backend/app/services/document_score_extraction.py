"""Per-provider score extraction storage and list filters."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable

from sqlalchemy import and_, exists, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document, DocumentScoreExtraction

DEFAULT_PROVIDER = "llama"
LEGACY_DEFAULT_PROVIDER = "reducto"
KNOWN_PROVIDERS = ("reducto", "llama", "ocr")
STRUCTURED_PROVIDERS = ("llama", "reducto")


def normalize_provider(provider: str | None) -> str:
    if isinstance(provider, str) and provider.strip():
        return provider.strip().lower()
    return DEFAULT_PROVIDER


def legacy_extraction_provider(data: Any) -> str:
    """Provider used when converting a document-level blob into one extraction row.

    Matches the migration: COALESCE(NULLIF(data->>'provider', ''), 'reducto').
    Unlabeled historical blobs were Reducto, even though new runs default to Llama.
    """
    if isinstance(data, dict):
        value = data.get("provider")
        if isinstance(value, str) and value.strip():
            return normalize_provider(value)
    return LEGACY_DEFAULT_PROVIDER


def payload_for_apply(
    row: DocumentScoreExtraction | None,
    snapshot: dict[str, Any] | None,
    requested_provider: str | None,
) -> dict[str, Any] | None:
    """Return the extract blob apply should read.

    An explicit provider never falls back to the last-touched snapshot, so applying
    Llama cannot pick up a Reducto blob (or vice versa).
    """
    if row and isinstance(row.data, dict) and row.data:
        return row.data
    if requested_provider:
        return None
    return snapshot if isinstance(snapshot, dict) else None


def is_current_applied(row: DocumentScoreExtraction | None) -> bool:
    if row is None or row.status != "success":
        return False
    if row.applied_at is None or row.extracted_at is None:
        return False
    return row.extracted_at <= row.applied_at


def is_ready(row: DocumentScoreExtraction | None) -> bool:
    if row is None or row.status != "success":
        return False
    return not is_current_applied(row)


def extraction_to_item(row: DocumentScoreExtraction) -> dict[str, Any]:
    return {
        "provider": row.provider,
        "status": row.status,
        "confidence": row.confidence,
        "extracted_at": row.extracted_at,
        "applied_at": row.applied_at,
        "applied_count": row.applied_count,
        "unmatched_count": row.unmatched_count,
        "current_applied": is_current_applied(row),
        "error_message": row.error_message,
    }


def ready_clause(ext: type[DocumentScoreExtraction] = DocumentScoreExtraction):
    return and_(
        ext.status == "success",
        or_(
            ext.applied_at.is_(None),
            ext.extracted_at.is_(None),
            ext.extracted_at > ext.applied_at,
        ),
    )


def applied_current_clause(ext: type[DocumentScoreExtraction] = DocumentScoreExtraction):
    return and_(
        ext.status == "success",
        ext.applied_at.isnot(None),
        ext.extracted_at.isnot(None),
        ext.extracted_at <= ext.applied_at,
    )


async def get_extraction(
    session: AsyncSession, document_id: int, provider: str
) -> DocumentScoreExtraction | None:
    stmt = select(DocumentScoreExtraction).where(
        DocumentScoreExtraction.document_id == document_id,
        DocumentScoreExtraction.provider == normalize_provider(provider),
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_or_create_extraction(
    session: AsyncSession, document_id: int, provider: str
) -> DocumentScoreExtraction:
    """Return the (document_id, provider) row, inserting if needed.

    Queue HTTP and the worker can both miss the row and insert at once; the unique
    constraint then 500s. INSERT ON CONFLICT DO NOTHING is safe under that race and
    does not reset an existing success/applied row back to pending.
    """
    provider_key = normalize_provider(provider)
    row = await get_extraction(session, document_id, provider_key)
    if row:
        return row

    stmt = (
        pg_insert(DocumentScoreExtraction)
        .values(document_id=document_id, provider=provider_key, status="pending")
        .on_conflict_do_nothing(constraint="uq_document_score_extraction_provider")
    )
    await session.execute(stmt)

    row = await get_extraction(session, document_id, provider_key)
    if row is None:
        raise RuntimeError(
            f"Failed to get or create extraction for document {document_id} "
            f"provider {provider_key}"
        )
    return row


async def list_extractions_by_document_ids(
    session: AsyncSession, document_ids: Iterable[int]
) -> dict[int, list[DocumentScoreExtraction]]:
    ids = list(document_ids)
    if not ids:
        return {}
    stmt = select(DocumentScoreExtraction).where(DocumentScoreExtraction.document_id.in_(ids))
    result = await session.execute(stmt)
    grouped: dict[int, list[DocumentScoreExtraction]] = {doc_id: [] for doc_id in ids}
    for row in result.scalars().all():
        grouped.setdefault(row.document_id, []).append(row)
    for rows in grouped.values():
        rows.sort(key=lambda r: r.provider)
    return grouped


def sync_document_snapshot(document: Document, row: DocumentScoreExtraction) -> None:
    """Copy last-touched provider row onto document-level columns for legacy readers."""
    document.scores_extraction_data = row.data
    document.scores_extraction_status = row.status
    document.scores_extraction_confidence = row.confidence
    document.scores_extracted_at = row.extracted_at
    document.scores_applied_at = row.applied_at
    document.scores_applied_count = row.applied_count
    document.scores_unmatched_count = row.unmatched_count


STALE_QUEUE_STATUSES = frozenset({"queued", "processing"})


def reset_stale_extraction_row(document: Document, row: DocumentScoreExtraction) -> bool:
    """Set a queued/processing row back to pending without clearing extract payloads.

    Syncs the document snapshot only when it is also queued/processing, so a
    successful other-provider snapshot is not overwritten.
    """
    if row.status not in STALE_QUEUE_STATUSES:
        return False
    row.status = "pending"
    if document.scores_extraction_status in STALE_QUEUE_STATUSES:
        sync_document_snapshot(document, row)
    return True


async def reset_stale_queue_statuses(session: AsyncSession) -> int:
    """Reset orphaned queued/processing extraction rows after an API restart."""
    stmt = (
        select(DocumentScoreExtraction, Document)
        .join(Document, Document.id == DocumentScoreExtraction.document_id)
        .where(DocumentScoreExtraction.status.in_(STALE_QUEUE_STATUSES))
    )
    result = await session.execute(stmt)
    count = 0
    for row, document in result.all():
        if reset_stale_extraction_row(document, row):
            count += 1
    if count:
        await session.commit()
    return count


def apply_extract_result(
    row: DocumentScoreExtraction,
    *,
    is_valid: bool,
    parsed_content: dict[str, Any] | None,
    confidence: float | None,
    error_message: str | None = None,
) -> None:
    row.confidence = confidence
    row.error_message = error_message
    if is_valid:
        row.data = parsed_content
        row.status = "success"
        row.extracted_at = datetime.utcnow()
        return
    row.status = "error"
    if parsed_content and row.data is None:
        row.data = parsed_content


def other_structured_provider(provider: str) -> str:
    return "reducto" if provider == "llama" else "llama"


def parse_extraction_provider_filter(value: str | None) -> tuple[str | None, str]:
    """Return (provider, mode) for list filters.

    mode is 'any' (has this provider), 'only' (this provider and not the other),
    or 'both' (has llama and reducto).
    """
    if not value:
        return None, "any"
    raw = value.strip().lower()
    if raw == "both":
        return None, "both"
    if raw in ("llama_only", "reducto_only"):
        return raw.removesuffix("_only"), "only"
    return normalize_provider(raw), "any"


def status_count_join_provider(extraction_provider: str | None) -> str | None:
    """Provider whose row status drives status-count chips, if any."""
    provider, mode = parse_extraction_provider_filter(extraction_provider)
    if mode == "both" or not provider:
        return None
    return provider


def _match_provider_extraction(
    stmt: Any,
    provider: str,
    *,
    statuses: list[str],
    scores_applied: bool | None,
) -> Any:
    ext = DocumentScoreExtraction
    has_row = exists().where(ext.document_id == Document.id, ext.provider == provider)
    if scores_applied is True:
        return stmt.where(
            exists().where(
                ext.document_id == Document.id,
                ext.provider == provider,
                applied_current_clause(ext),
            )
        )
    if scores_applied is False:
        return stmt.where(
            exists().where(
                ext.document_id == Document.id,
                ext.provider == provider,
                ready_clause(ext),
            )
        )
    if statuses:
        status_match = exists().where(
            ext.document_id == Document.id,
            ext.provider == provider,
            ext.status.in_(statuses),
        )
        if "pending" in statuses:
            return stmt.where(or_(status_match, ~has_row))
        return stmt.where(status_match)
    return stmt.where(has_row)


def apply_extraction_list_filters(
    stmt: Any,
    *,
    extraction_provider: str | None,
    extraction_status: str | None,
    scores_applied: bool | None,
) -> Any:
    """Filter documents by per-provider extraction rows.

    A missing row for the selected provider counts as pending.
    `llama_only` / `reducto_only` exclude documents that also have the other provider.
    `both` requires a row for llama and reducto.
    """
    ext = DocumentScoreExtraction
    statuses: list[str] = []
    if extraction_status:
        statuses = [s.strip() for s in extraction_status.split(",") if s.strip()]

    provider, mode = parse_extraction_provider_filter(extraction_provider)
    if mode == "both":
        stmt = _match_provider_extraction(
            stmt, "llama", statuses=statuses, scores_applied=scores_applied
        )
        return _match_provider_extraction(
            stmt, "reducto", statuses=statuses, scores_applied=scores_applied
        )
    if provider:
        stmt = _match_provider_extraction(
            stmt, provider, statuses=statuses, scores_applied=scores_applied
        )
        if mode == "only":
            other = other_structured_provider(provider)
            stmt = stmt.where(
                ~exists().where(ext.document_id == Document.id, ext.provider == other)
            )
        return stmt

    if scores_applied is True:
        stmt = stmt.where(
            exists().where(ext.document_id == Document.id, applied_current_clause(ext))
        )
    elif scores_applied is False:
        stmt = stmt.where(exists().where(ext.document_id == Document.id, ready_clause(ext)))
    elif statuses:
        row_match = exists().where(ext.document_id == Document.id, ext.status.in_(statuses))
        snapshot_match = Document.scores_extraction_status.in_(statuses)
        if "pending" in statuses:
            has_any = exists().where(ext.document_id == Document.id)
            stmt = stmt.where(or_(row_match, snapshot_match, ~has_any))
        else:
            stmt = stmt.where(or_(row_match, snapshot_match))
    return stmt
