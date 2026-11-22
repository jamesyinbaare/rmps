"""Detect likely duplicate registration candidates within a school × exam."""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from typing import Iterable

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    FeePaymentStatus,
    RegistrationCandidate,
    RegistrationCandidateNotDuplicate,
    RegistrationExam,
    RegistrationSubjectSelection,
)
from app.schemas.registration import (
    DuplicateCandidateSummary,
    DuplicateMatchGroup,
    DuplicateMatchesResponse,
    RegistrationSubjectSelectionResponse,
)
from app.services.late_registration_service import is_registration_open_for_school
from app.services.registration_cohorts import candidate_type_filter_for_exam

DEFAULT_NAME_THRESHOLD = 0.85

_PUNCT_RE = re.compile(r"[^\w\s]", re.UNICODE)
_WS_RE = re.compile(r"\s+")


def normalize_name_part(value: str | None) -> str:
    """Lowercase, strip accents/punctuation, collapse whitespace."""
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = _PUNCT_RE.sub(" ", text)
    text = _WS_RE.sub(" ", text).strip()
    return text


def name_tokens(candidate: RegistrationCandidate) -> list[str]:
    """Collect normalized name tokens from firstname, othername, and lastname."""
    tokens: list[str] = []
    for field in (candidate.firstname, candidate.othername, candidate.lastname):
        normalized = normalize_name_part(field)
        if not normalized:
            continue
        tokens.extend(t for t in normalized.split(" ") if t)
    return tokens


def sorted_name_key(candidate: RegistrationCandidate) -> str:
    """Order-insensitive name key: sorted normalized tokens joined by space."""
    return " ".join(sorted(name_tokens(candidate)))


def name_similarity(a: str, b: str) -> float:
    """Similarity of two already-normalized (preferably sorted-token) name keys."""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def candidate_name_similarity(a: RegistrationCandidate, b: RegistrationCandidate) -> float:
    """Case- and token-order-insensitive name similarity between two candidates."""
    return name_similarity(sorted_name_key(a), sorted_name_key(b))


def removal_block_reason(
    candidate: RegistrationCandidate,
    *,
    registration_open: bool,
) -> str | None:
    """Return why a candidate cannot be removed, or None if removable."""
    if not registration_open:
        return "Registration is closed for this examination"
    if candidate.index_number:
        return "Candidate already has an index number"
    fee = candidate.fee_payment_status
    fee_value = fee.value if hasattr(fee, "value") else fee
    if fee_value in (FeePaymentStatus.PAID.value, FeePaymentStatus.WAIVED.value):
        return "Fee is paid or waived; cannot remove this registration"
    return None


def _display_subject_code(selection) -> str:
    """Prefer Subject.original_code for school-facing display."""
    subject = getattr(selection, "subject", None)
    if subject is not None and getattr(subject, "original_code", None):
        return subject.original_code
    return selection.subject_code


def _subject_summaries(candidate: RegistrationCandidate) -> list[RegistrationSubjectSelectionResponse]:
    selections = candidate.subject_selections or []
    return [
        RegistrationSubjectSelectionResponse(
            id=sel.id,
            subject_id=sel.subject_id,
            subject_code=_display_subject_code(sel),
            subject_name=sel.subject_name,
            series=sel.series,
            created_at=sel.created_at,
        )
        for sel in selections
    ]


def candidate_to_summary(
    candidate: RegistrationCandidate,
    *,
    registration_open: bool,
) -> DuplicateCandidateSummary:
    blocked = removal_block_reason(candidate, registration_open=registration_open)
    fee = candidate.fee_payment_status
    return DuplicateCandidateSummary(
        id=candidate.id,
        firstname=candidate.firstname,
        lastname=candidate.lastname,
        othername=candidate.othername,
        date_of_birth=candidate.date_of_birth,
        gender=candidate.gender,
        programme_id=candidate.programme_id,
        programme_code=candidate.programme_code,
        registration_number=candidate.registration_number,
        index_number=candidate.index_number,
        registration_status=candidate.registration_status,
        fee_payment_status=fee if fee is not None else FeePaymentStatus.UNPAID,
        contact_email=candidate.contact_email,
        contact_phone=candidate.contact_phone,
        national_id=candidate.national_id,
        registration_type=(
            candidate.registration_type.value
            if candidate.registration_type is not None and hasattr(candidate.registration_type, "value")
            else (str(candidate.registration_type) if candidate.registration_type else None)
        ),
        subject_selections=_subject_summaries(candidate),
        has_photo=candidate.photo is not None,
        can_remove=blocked is None,
        remove_blocked_reason=blocked,
    )


def _cluster_pairs(pairs: list[tuple[int, int, float, list[str]]]) -> list[tuple[set[int], float, set[str]]]:
    """Union-find style clustering of overlapping candidate pairs."""
    parent: dict[int, int] = {}

    def find(x: int) -> int:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for a, b, _score, _match_reasons in pairs:
        union(a, b)

    members: dict[int, set[int]] = defaultdict(set)
    for node in list(parent.keys()):
        members[find(node)].add(node)

    root_scores: dict[int, float] = defaultdict(float)
    root_reasons: dict[int, set[str]] = defaultdict(set)
    for a, _b, score, match_reasons in pairs:
        root = find(a)
        root_scores[root] = max(root_scores[root], score)
        root_reasons[root].update(match_reasons)

    clusters: list[tuple[set[int], float, set[str]]] = []
    for root, ids in members.items():
        if len(ids) < 2:
            continue
        clusters.append((ids, root_scores[root], root_reasons[root]))

    clusters.sort(key=lambda c: (-c[1], -len(c[0])))
    return clusters


def _pair_match_reasons(
    a: RegistrationCandidate,
    b: RegistrationCandidate,
    *,
    same_dob: bool,
) -> list[str]:
    reasons = ["name"]
    if (
        a.date_of_birth is not None
        and b.date_of_birth is not None
        and a.date_of_birth == b.date_of_birth
    ):
        reasons.append("date_of_birth")
    elif same_dob:
        # same_dob path already requires equal DOB; keep reason explicit
        reasons.append("date_of_birth")
    if a.programme_id is not None and a.programme_id == b.programme_id:
        reasons.append("programme")
    return reasons


def _ordered_pair(id1: int, id2: int) -> tuple[int, int]:
    return (id1, id2) if id1 < id2 else (id2, id1)


def find_duplicate_groups(
    candidates: Iterable[RegistrationCandidate],
    *,
    same_programme: bool,
    same_dob: bool = True,
    threshold: float,
    registration_open: bool,
    dismissed_pairs: set[tuple[int, int]] | None = None,
) -> list[DuplicateMatchGroup]:
    """Build duplicate groups from an in-memory candidate list."""
    pool = list(candidates)
    dismissed = dismissed_pairs or set()

    if same_dob:
        with_dob = [c for c in pool if c.date_of_birth is not None]
        cohorts: list[list[RegistrationCandidate]] = []
        by_dob: dict = defaultdict(list)
        for c in with_dob:
            by_dob[c.date_of_birth].append(c)
        cohorts = [group for group in by_dob.values() if len(group) >= 2]
        by_id = {c.id: c for c in with_dob}
    else:
        cohorts = [pool] if len(pool) >= 2 else []
        by_id = {c.id: c for c in pool}

    pairs: list[tuple[int, int, float, list[str]]] = []
    for cohort in cohorts:
        name_keys = {c.id: sorted_name_key(c) for c in cohort}
        for i in range(len(cohort)):
            for j in range(i + 1, len(cohort)):
                a, b = cohort[i], cohort[j]
                if _ordered_pair(a.id, b.id) in dismissed:
                    continue
                if same_programme:
                    if a.programme_id is None or b.programme_id is None:
                        continue
                    if a.programme_id != b.programme_id:
                        continue
                score = name_similarity(name_keys[a.id], name_keys[b.id])
                if score < threshold:
                    continue
                reasons = _pair_match_reasons(a, b, same_dob=same_dob)
                pairs.append((a.id, b.id, score, reasons))

    if not pairs:
        return []

    clusters = _cluster_pairs(pairs)
    groups: list[DuplicateMatchGroup] = []
    for idx, (ids, best_score, reason_set) in enumerate(clusters, start=1):
        members = [by_id[i] for i in sorted(ids) if i in by_id]
        members.sort(key=lambda c: (c.lastname or "", c.firstname or "", c.id))
        reason_order = ["name", "date_of_birth", "programme"]
        ordered_reasons = [r for r in reason_order if r in reason_set]
        groups.append(
            DuplicateMatchGroup(
                group_id=idx,
                best_score=round(best_score, 4),
                match_reasons=ordered_reasons,
                candidates=[
                    candidate_to_summary(c, registration_open=registration_open) for c in members
                ],
            )
        )
    return groups


async def find_school_exam_duplicates(
    session: AsyncSession,
    *,
    school_id: int,
    exam: RegistrationExam,
    same_programme: bool = False,
    same_dob: bool = True,
    threshold: float = DEFAULT_NAME_THRESHOLD,
) -> DuplicateMatchesResponse:
    """Load school×exam candidates and return duplicate match groups."""
    query = (
        select(RegistrationCandidate)
        .where(
            RegistrationCandidate.school_id == school_id,
            RegistrationCandidate.registration_exam_id == exam.id,
            candidate_type_filter_for_exam(exam),
        )
        .options(
            selectinload(RegistrationCandidate.subject_selections).selectinload(
                RegistrationSubjectSelection.subject
            ),
            selectinload(RegistrationCandidate.photo),
            selectinload(RegistrationCandidate.exam).selectinload(
                RegistrationExam.registration_period
            ),
        )
    )
    result = await session.execute(query)
    candidates = list(result.scalars().unique().all())
    candidate_ids = [c.id for c in candidates]

    dismissed_pairs: set[tuple[int, int]] = set()
    if candidate_ids:
        dismiss_stmt = select(
            RegistrationCandidateNotDuplicate.candidate_a_id,
            RegistrationCandidateNotDuplicate.candidate_b_id,
        ).where(
            RegistrationCandidateNotDuplicate.school_id == school_id,
            RegistrationCandidateNotDuplicate.candidate_a_id.in_(candidate_ids),
            RegistrationCandidateNotDuplicate.candidate_b_id.in_(candidate_ids),
        )
        dismiss_result = await session.execute(dismiss_stmt)
        dismissed_pairs = {
            _ordered_pair(a_id, b_id) for a_id, b_id in dismiss_result.all()
        }

    registration_open = await is_registration_open_for_school(session, exam, school_id)
    groups = find_duplicate_groups(
        candidates,
        same_programme=same_programme,
        same_dob=same_dob,
        threshold=threshold,
        registration_open=registration_open,
        dismissed_pairs=dismissed_pairs,
    )
    return DuplicateMatchesResponse(
        exam_id=exam.id,
        groups=groups,
        threshold=threshold,
        same_programme=same_programme,
        same_dob=same_dob,
    )


async def clear_not_duplicate_marks_for_candidate(
    session: AsyncSession,
    candidate_id: int,
) -> None:
    """Remove dismissals involving a candidate so they re-enter duplicate matching."""
    await session.execute(
        delete(RegistrationCandidateNotDuplicate).where(
            or_(
                RegistrationCandidateNotDuplicate.candidate_a_id == candidate_id,
                RegistrationCandidateNotDuplicate.candidate_b_id == candidate_id,
            )
        )
    )
