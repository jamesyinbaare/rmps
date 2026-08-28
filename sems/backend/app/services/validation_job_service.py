"""Service for processing validation jobs."""

import asyncio
import logging
from datetime import datetime
from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Candidate,
    ExamRegistration,
    ExamSubject,
    Subject,
    SubjectRegistration,
    SubjectScore,
    SubjectScoreValidationIssue,
    SubjectType,
    ValidationIssueStatus,
)
from app.services.subject_score_validation import validate_subject_score

logger = logging.getLogger(__name__)


def _field_test_type(field_name: str) -> int | None:
    if field_name == "obj_raw_score":
        return 1
    if field_name == "essay_raw_score":
        return 2
    if field_name == "pract_raw_score":
        return 3
    return None


def _apply_validation_scope_filters(
    stmt: Select,
    exam_id: int | None = None,
    school_id: int | None = None,
    subject_id: int | None = None,
    subject_type: str | None = None,
) -> Select:
    """Apply exam/subject/school filters shared by score and issue queries."""
    if exam_id is not None:
        stmt = stmt.where(ExamSubject.exam_id == exam_id)

    if subject_id is not None:
        stmt = stmt.where(ExamSubject.subject_id == subject_id)

    if subject_type is not None:
        stmt = stmt.join(Subject, ExamSubject.subject_id == Subject.id)
        try:
            subject_type_enum = SubjectType(subject_type)
            stmt = stmt.where(Subject.subject_type == subject_type_enum)
        except ValueError:
            stmt = stmt.where(False)

    if school_id is not None:
        stmt = stmt.where(Candidate.school_id == school_id)

    return stmt


def _scoped_subject_score_joins(stmt: Select) -> Select:
    """Join SubjectScore scope through registration → exam subject → candidate."""
    return (
        stmt.join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
    )


async def process_validation(
    session: AsyncSession,
    exam_id: int | None = None,
    school_id: int | None = None,
    subject_id: int | None = None,
    subject_type: str | None = None,
    test_types: list[int] | None = None,
) -> dict[str, Any]:
    """
    Run validation for specified scope.

    Issues are unique per (subject_score_id, exam_subject_id, test_type).
    Re-flagging a previously resolved/ignored/skipped field reopens the same row and
    clears resolved_by attribution. Auto-resolve of clean pending/skipped fields does
    not set resolved_by_user_id (does not count for payment).

    Returns:
        Dictionary with validation results:
        - total_checked: int
        - issues_found: int
        - issues_resolved: int (pending → resolved because field is clean)
        - issues_created: int (brand-new rows)
        - issues_reopened: int (resolved/ignored/skipped → pending)
    """
    test_type_set = set(test_types) if test_types else None

    stmt = _apply_validation_scope_filters(
        _scoped_subject_score_joins(select(SubjectScore, ExamSubject)),
        exam_id=exam_id,
        school_id=school_id,
        subject_id=subject_id,
        subject_type=subject_type,
    )

    try:
        result = await session.execute(stmt)
        rows = result.all()
    except Exception as e:
        logger.error(f"Error executing validation query: {e}", exc_info=True)
        raise

    total_checked = 0
    issues_found = 0
    issues_resolved = 0
    issues_created = 0
    issues_reopened = 0

    # All statuses keyed by subject_score_id -> field_name (1:1 with test_type).
    existing_issues_by_score: dict[int, dict[str, SubjectScoreValidationIssue]] = {}

    score_ids_subq = _apply_validation_scope_filters(
        _scoped_subject_score_joins(select(SubjectScore.id)),
        exam_id=exam_id,
        school_id=school_id,
        subject_id=subject_id,
        subject_type=subject_type,
    )
    existing_issues_stmt = select(SubjectScoreValidationIssue).where(
        SubjectScoreValidationIssue.subject_score_id.in_(score_ids_subq),
    )
    existing_issues_result = await session.execute(existing_issues_stmt)
    existing_issues = existing_issues_result.scalars().all()

    for issue in existing_issues:
        existing_issues_by_score.setdefault(issue.subject_score_id, {})[issue.field_name] = issue

    for subject_score, exam_subject in rows:
        try:
            total_checked += 1

            validation_issues = validate_subject_score(subject_score, exam_subject)
            if test_type_set is not None:
                validation_issues = [
                    issue for issue in validation_issues if issue["test_type"] in test_type_set
                ]
            current_issue_fields = {issue["field_name"] for issue in validation_issues}
            score_existing = existing_issues_by_score.get(subject_score.id, {})

            # Auto-resolve pending/skipped issues for fields that are now clean.
            # Already-resolved/ignored clean fields are left alone.
            for field_name, existing_issue in list(score_existing.items()):
                if test_type_set is not None:
                    field_tt = _field_test_type(field_name)
                    if field_tt is None or field_tt not in test_type_set:
                        continue
                if field_name not in current_issue_fields:
                    if existing_issue.status in (
                        ValidationIssueStatus.PENDING,
                        ValidationIssueStatus.SKIPPED,
                    ):
                        existing_issue.status = ValidationIssueStatus.RESOLVED
                        existing_issue.resolved_at = datetime.utcnow()
                        # No resolved_by_user_id — does not count for payment
                        issues_resolved += 1
                    del score_existing[field_name]

            for issue_data in validation_issues:
                issues_found += 1
                field_name = issue_data["field_name"]

                if field_name in score_existing:
                    existing_issue = score_existing.pop(field_name)
                    was_closed = existing_issue.status != ValidationIssueStatus.PENDING
                    existing_issue.status = ValidationIssueStatus.PENDING
                    existing_issue.issue_type = issue_data["issue_type"]
                    existing_issue.message = issue_data["message"]
                    existing_issue.updated_at = datetime.utcnow()
                    if was_closed:
                        existing_issue.resolved_by_user_id = None
                        existing_issue.resolved_at = None
                        issues_reopened += 1
                else:
                    new_issue = SubjectScoreValidationIssue(
                        subject_score_id=subject_score.id,
                        exam_subject_id=exam_subject.id,
                        issue_type=issue_data["issue_type"],
                        field_name=field_name,
                        test_type=issue_data["test_type"],
                        message=issue_data["message"],
                        status=ValidationIssueStatus.PENDING,
                    )
                    session.add(new_issue)
                    issues_created += 1

            if not score_existing:
                existing_issues_by_score.pop(subject_score.id, None)

            if total_checked % 500 == 0:
                await asyncio.sleep(0)
        except Exception as e:
            logger.error(
                f"Error validating SubjectScore id={subject_score.id}: {e}",
                exc_info=True,
            )
            continue

    try:
        await session.commit()
    except Exception as e:
        logger.error(f"Error committing validation results: {e}", exc_info=True)
        await session.rollback()
        raise

    return {
        "total_checked": total_checked,
        "issues_found": issues_found,
        "issues_resolved": issues_resolved,
        "issues_created": issues_created,
        "issues_reopened": issues_reopened,
    }
