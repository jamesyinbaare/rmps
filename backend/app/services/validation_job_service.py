"""Service for processing validation jobs."""

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select
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
    stmt = (
        select(SubjectScore, ExamSubject)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
    )

    # Apply filters
    if exam_id is not None:
        stmt = stmt.where(ExamSubject.exam_id == exam_id)

    if subject_id is not None:
        stmt = stmt.where(ExamSubject.subject_id == subject_id)

    # Filter by school_id through Candidate
    if school_id is not None:
        stmt = stmt.where(Candidate.school_id == school_id)

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

    # Track existing issues by (subject_score_id, field_name) for resolution tracking
    existing_issues_map: dict[tuple[int, str], SubjectScoreValidationIssue] = {}

    # Get all existing pending issues for the scores we're checking
    subject_score_ids = [row[0].id for row in rows] if rows else []
    if subject_score_ids:
        existing_issues_stmt = select(SubjectScoreValidationIssue).where(
            SubjectScoreValidationIssue.subject_score_id.in_(subject_score_ids),
            SubjectScoreValidationIssue.status == ValidationIssueStatus.PENDING,
        )
        existing_issues_result = await session.execute(existing_issues_stmt)
        existing_issues = existing_issues_result.scalars().all()

        for issue in existing_issues:
            key = (issue.subject_score_id, issue.field_name)
            existing_issues_map[key] = issue

    # Validate each SubjectScore
    for subject_score, exam_subject in rows:
        try:
            total_checked += 1

            # Validate the score
            validation_issues = validate_subject_score(subject_score, exam_subject)

            # Track which fields had issues in this validation
            current_issue_fields = {issue["field_name"] for issue in validation_issues}

            # Check for resolved issues (previously had issue, now fixed)
            # Use list() to avoid RuntimeError when modifying dict during iteration
            keys_to_remove = []
            for key, existing_issue in existing_issues_map.items():
                if key[0] == subject_score.id and key[1] not in current_issue_fields:
                    # This issue was resolved
                    existing_issue.status = ValidationIssueStatus.RESOLVED
                    existing_issue.resolved_at = datetime.utcnow()
                    issues_resolved += 1
                    keys_to_remove.append(key)

            # Remove resolved issues from map
            for key in keys_to_remove:
                del existing_issues_map[key]

            # Create or update issues
            for issue_data in validation_issues:
                issues_found += 1
                field_name = issue_data["field_name"]
                key = (subject_score.id, field_name)

                if key in existing_issues_map:
                    # Update existing issue (keep it as PENDING if it still exists)
                    existing_issue = existing_issues_map[key]
                    existing_issue.message = issue_data["message"]
                    existing_issue.updated_at = datetime.utcnow()
                    # Remove from map so we don't create a duplicate
                    del existing_issues_map[key]
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
