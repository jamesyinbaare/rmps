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
    SubjectRegistration,
    SubjectScore,
    SubjectScoreValidationIssue,
    ValidationIssueStatus,
)
from app.services.subject_score_validation import validate_subject_score

logger = logging.getLogger(__name__)


def _apply_validation_scope_filters(
    stmt: Select,
    exam_id: int | None = None,
    school_id: int | None = None,
    subject_id: int | None = None,
) -> Select:
    """Apply exam/subject/school filters shared by score and issue queries."""
    if exam_id is not None:
        stmt = stmt.where(ExamSubject.exam_id == exam_id)

    if subject_id is not None:
        stmt = stmt.where(ExamSubject.subject_id == subject_id)

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
) -> dict[str, Any]:
    """
    Run validation for specified scope.

    Args:
        session: Database session
        exam_id: Optional exam ID to filter by
        school_id: Optional school ID to filter by
        subject_id: Optional subject ID to filter by

    Returns:
        Dictionary with validation results:
        - total_checked: int (number of SubjectScores checked)
        - issues_found: int (total issues found)
        - issues_resolved: int (issues that were previously pending but are now fixed)
        - issues_created: int (new issues created)
    """
    # Build query to get all SubjectScores with their ExamSubjects
    # Always join with Candidate for consistent query structure
    stmt = _apply_validation_scope_filters(
        _scoped_subject_score_joins(select(SubjectScore, ExamSubject)),
        exam_id=exam_id,
        school_id=school_id,
        subject_id=subject_id,
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

    # Pending issues keyed by subject_score_id -> field_name for O(1) lookups.
    # Scanning the flat map per score is O(scores * issues) and hangs at exam scale.
    existing_issues_by_score: dict[int, dict[str, SubjectScoreValidationIssue]] = {}

    # Load pending issues via subquery so we never expand tens of thousands of
    # score IDs into bind parameters (asyncpg limit is 32767).
    score_ids_subq = _apply_validation_scope_filters(
        _scoped_subject_score_joins(select(SubjectScore.id)),
        exam_id=exam_id,
        school_id=school_id,
        subject_id=subject_id,
    )
    existing_issues_stmt = select(SubjectScoreValidationIssue).where(
        SubjectScoreValidationIssue.subject_score_id.in_(score_ids_subq),
        SubjectScoreValidationIssue.status == ValidationIssueStatus.PENDING,
    )
    existing_issues_result = await session.execute(existing_issues_stmt)
    existing_issues = existing_issues_result.scalars().all()

    for issue in existing_issues:
        existing_issues_by_score.setdefault(issue.subject_score_id, {})[issue.field_name] = issue

    # Validate each SubjectScore
    for subject_score, exam_subject in rows:
        try:
            total_checked += 1

            # Validate the score
            validation_issues = validate_subject_score(subject_score, exam_subject)

            # Track which fields had issues in this validation
            current_issue_fields = {issue["field_name"] for issue in validation_issues}
            score_existing = existing_issues_by_score.get(subject_score.id, {})

            # Resolve pending issues for fields that are now clean (O(fields), not O(all issues))
            for field_name, existing_issue in list(score_existing.items()):
                if field_name not in current_issue_fields:
                    existing_issue.status = ValidationIssueStatus.RESOLVED
                    existing_issue.resolved_at = datetime.utcnow()
                    issues_resolved += 1
                    del score_existing[field_name]

            # Create or update issues
            for issue_data in validation_issues:
                issues_found += 1
                field_name = issue_data["field_name"]

                if field_name in score_existing:
                    # Update existing issue (keep it as PENDING if it still exists)
                    existing_issue = score_existing.pop(field_name)
                    existing_issue.message = issue_data["message"]
                    existing_issue.updated_at = datetime.utcnow()
                else:
                    # Create new issue
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

            # Yield so list/detail requests can proceed during large validation runs
            if total_checked % 500 == 0:
                await asyncio.sleep(0)
        except Exception as e:
            logger.error(
                f"Error validating SubjectScore id={subject_score.id}: {e}",
                exc_info=True
            )
            # Continue with next score instead of failing completely
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
    }
