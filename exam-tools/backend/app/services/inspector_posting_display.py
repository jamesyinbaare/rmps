"""Merge and sort inspector postings shown per examination centre."""

from __future__ import annotations

import re
from uuid import UUID

from app.schemas.examination import ExecutivePostedInspectorItem
from app.schemas.school import PostedInspectorAtCentreRow

_SCOPE_ORDER = {"ALL": 0, "CORE": 1, "ELECTIVE": 2}


def normalize_subject_scope(scope: str) -> str:
    normalized = str(scope).upper()
    if normalized in ("CORE", "ELECTIVE", "ALL"):
        return normalized
    return "ALL"


def merge_subject_scopes(existing: str, incoming: str) -> str:
    left = normalize_subject_scope(existing)
    right = normalize_subject_scope(incoming)
    if left == "ALL" or right == "ALL":
        return "ALL"
    if (left == "CORE" and right == "ELECTIVE") or (left == "ELECTIVE" and right == "CORE"):
        return "ALL"
    return left


def inspector_identity_merge_key(
    *,
    full_name: str,
    phone: str | None = None,
    user_id: UUID | str | None = None,
) -> str:
    normalized_name = full_name.strip().lower()
    normalized_phone = re.sub(r"\D", "", phone or "")
    if normalized_name or normalized_phone:
        return f"np:{normalized_name}|{normalized_phone}"
    if user_id is not None:
        return f"u:{user_id}"
    return "unknown-inspector"


def _sort_inspector_rows_key(
    full_name: str,
    scope: str,
    posting_id: UUID | str,
) -> tuple[int, str, str]:
    return (
        _SCOPE_ORDER.get(normalize_subject_scope(scope), 99),
        full_name.casefold(),
        str(posting_id),
    )


def merge_executive_posted_inspectors(
    rows: list[ExecutivePostedInspectorItem],
) -> list[ExecutivePostedInspectorItem]:
    grouped: dict[str, ExecutivePostedInspectorItem] = {}
    for row in rows:
        key = inspector_identity_merge_key(
            full_name=row.inspector_full_name,
            phone=row.inspector_phone_number,
        )
        scope = normalize_subject_scope(row.subject_scope)
        existing = grouped.get(key)
        if existing is None:
            grouped[key] = row.model_copy(update={"subject_scope": scope})
            continue
        merged_scope = merge_subject_scopes(existing.subject_scope, scope)
        keep_posting = existing.posting_id if str(existing.posting_id) <= str(row.posting_id) else row.posting_id
        grouped[key] = existing.model_copy(
            update={
                "posting_id": keep_posting,
                "inspector_phone_number": existing.inspector_phone_number or row.inspector_phone_number,
                "subject_scope": merged_scope,
            }
        )

    return sorted(
        grouped.values(),
        key=lambda item: _sort_inspector_rows_key(
            item.inspector_full_name,
            item.subject_scope,
            item.posting_id,
        ),
    )


def merge_centre_posted_inspectors(
    rows: list[PostedInspectorAtCentreRow],
) -> list[PostedInspectorAtCentreRow]:
    grouped: dict[str, PostedInspectorAtCentreRow] = {}
    for row in rows:
        key = inspector_identity_merge_key(
            full_name=row.inspector_full_name,
            phone=row.inspector_phone,
            user_id=row.inspector_user_id,
        )
        scope = normalize_subject_scope(row.subject_scope)
        existing = grouped.get(key)
        if existing is None:
            grouped[key] = row.model_copy(update={"subject_scope": scope})
            continue
        merged_scope = merge_subject_scopes(existing.subject_scope, scope)
        keep_posting = existing.posting_id if str(existing.posting_id) <= str(row.posting_id) else row.posting_id
        grouped[key] = existing.model_copy(
            update={
                "posting_id": keep_posting,
                "inspector_phone": existing.inspector_phone or row.inspector_phone,
                "subject_scope": merged_scope,
            }
        )

    return sorted(
        grouped.values(),
        key=lambda item: _sort_inspector_rows_key(
            item.inspector_full_name,
            item.subject_scope,
            item.posting_id,
        ),
    )
