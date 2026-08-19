from datetime import datetime

from app.models import UnmatchedRecordStatus
from app.services.unmatched_apply_reuse import (
    build_unmatched_reuse_index,
    lookup_unmatched_reuse,
    reuse_action,
)


class _Row:
    def __init__(
        self,
        *,
        sn=None,
        index_number=None,
        status=UnmatchedRecordStatus.RESOLVED,
        resolved_subject_registration_id=None,
        resolved_at=None,
        created_at=None,
    ):
        self.sn = sn
        self.index_number = index_number
        self.status = status
        self.resolved_subject_registration_id = resolved_subject_registration_id
        self.resolved_at = resolved_at
        self.created_at = created_at


def test_reuse_action_create_when_missing() -> None:
    assert reuse_action(None, None) == "create"


def test_reuse_action_write_resolved_with_registration() -> None:
    assert reuse_action(UnmatchedRecordStatus.RESOLVED, 42) == "write"
    assert reuse_action("resolved", 42) == "write"


def test_reuse_action_skip_resolved_without_registration() -> None:
    assert reuse_action(UnmatchedRecordStatus.RESOLVED, None) == "skip"


def test_reuse_action_skip_ignored() -> None:
    assert reuse_action(UnmatchedRecordStatus.IGNORED, None) == "skip"
    assert reuse_action(UnmatchedRecordStatus.IGNORED, 9) == "skip"


def test_reuse_action_create_pending() -> None:
    assert reuse_action(UnmatchedRecordStatus.PENDING, None) == "create"


def test_lookup_prefers_sn_and_index() -> None:
    mapped = _Row(sn=3, index_number="01217l0708", resolved_subject_registration_id=10)
    other = _Row(sn=4, index_number="01217l0708", resolved_subject_registration_id=11)
    indexed = build_unmatched_reuse_index([mapped, other])
    hit = lookup_unmatched_reuse(indexed, sn=3, index_number="01217l0708")
    assert hit is mapped
    assert lookup_unmatched_reuse(indexed, sn=4, index_number="01217l0708") is other


def test_lookup_falls_back_to_index_when_sn_unknown() -> None:
    mapped = _Row(sn=3, index_number="01217l0708", resolved_subject_registration_id=10)
    indexed = build_unmatched_reuse_index([mapped])
    assert lookup_unmatched_reuse(indexed, sn=99, index_number="01217l0708") is mapped
    assert lookup_unmatched_reuse(indexed, sn=None, index_number="01217l0708") is mapped


def test_lookup_latest_resolved_wins() -> None:
    older = _Row(
        sn=1,
        index_number="01217l0708",
        resolved_subject_registration_id=1,
        resolved_at=datetime(2026, 1, 1),
    )
    newer = _Row(
        sn=1,
        index_number="01217l0708",
        resolved_subject_registration_id=2,
        resolved_at=datetime(2026, 1, 2),
    )
    indexed = build_unmatched_reuse_index([newer, older])
    hit = lookup_unmatched_reuse(indexed, sn=1, index_number="01217l0708")
    assert hit is newer


def test_lookup_none_without_index() -> None:
    mapped = _Row(sn=3, index_number="01217l0708", resolved_subject_registration_id=10)
    indexed = build_unmatched_reuse_index([mapped])
    assert lookup_unmatched_reuse(indexed, sn=3, index_number=None) is None


def test_second_apply_would_not_create_when_resolved_mapping_exists() -> None:
    """Re-apply of the same noisy row should write via mapping, not create pending."""
    prior = _Row(
        sn=7,
        index_number="01217l0708",
        status=UnmatchedRecordStatus.RESOLVED,
        resolved_subject_registration_id=55,
        created_at=datetime(2026, 1, 1),
    )
    indexed = build_unmatched_reuse_index([prior])
    hit = lookup_unmatched_reuse(indexed, sn=7, index_number="01217l0708")
    assert reuse_action(hit.status, hit.resolved_subject_registration_id) == "write"


def test_ignored_row_not_recreated() -> None:
    prior = _Row(sn=7, index_number="01217l0708", status=UnmatchedRecordStatus.IGNORED)
    indexed = build_unmatched_reuse_index([prior])
    hit = lookup_unmatched_reuse(indexed, sn=7, index_number="01217l0708")
    assert reuse_action(hit.status, hit.resolved_subject_registration_id) == "skip"


def test_new_noisy_index_creates_pending() -> None:
    indexed = build_unmatched_reuse_index([])
    hit = lookup_unmatched_reuse(indexed, sn=1, index_number="09999l0000")
    assert hit is None
    assert reuse_action(None, None) == "create"
