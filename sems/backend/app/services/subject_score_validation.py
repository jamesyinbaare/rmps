"""Service for validating SubjectScore records against ExamSubject requirements."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import ExamSubject, SubjectScore

from app.models import ValidationIssueType
from app.utils.score_utils import validate_integer_format, validate_score_range


def validate_subject_score(
    subject_score: "SubjectScore", exam_subject: "ExamSubject"
) -> list[dict[str, any]]:
    """
    Validate a single SubjectScore against its ExamSubject requirements.

    Args:
        subject_score: The SubjectScore instance to validate
        exam_subject: The ExamSubject instance that defines the requirements

    Returns:
        List of validation issues found. Each issue is a dict with:
        - issue_type: ValidationIssueType enum value
        - field_name: str (obj_raw_score, essay_raw_score, pract_raw_score)
        - test_type: int (1, 2, or 3)
        - message: str (error message)
    """
    issues = []

    # Validate obj_raw_score (test_type=1)
    if exam_subject.obj_max_score is not None and exam_subject.obj_max_score > 0:
        if subject_score.obj_raw_score is None:
            max_score = int(exam_subject.obj_max_score) if exam_subject.obj_max_score == int(exam_subject.obj_max_score) else exam_subject.obj_max_score
            issues.append({
                "issue_type": ValidationIssueType.MISSING_SCORE,
                "field_name": "obj_raw_score",
                "test_type": 1,
                "message": f"Objectives score is missing. Maximum score is {max_score}",
            })
        else:
            # Check for decimal point in integer format
            is_valid, error_message = validate_integer_format(subject_score.obj_raw_score)
            if not is_valid:
                issues.append({
                    "issue_type": ValidationIssueType.INVALID_SCORE,
                    "field_name": "obj_raw_score",
                    "test_type": 1,
                    "message": error_message or f"Objectives score '{subject_score.obj_raw_score}' is invalid",
                })
            else:
                # Check score range
                is_valid, error_message = validate_score_range(
                    subject_score.obj_raw_score, exam_subject.obj_max_score
                )
                if not is_valid:
                    issues.append({
                        "issue_type": ValidationIssueType.INVALID_SCORE,
                        "field_name": "obj_raw_score",
                        "test_type": 1,
                        "message": error_message or f"Objectives score '{subject_score.obj_raw_score}' is invalid",
                    })

    # Validate essay_raw_score (test_type=2)
    if exam_subject.essay_max_score is not None and exam_subject.essay_max_score > 0:
        if subject_score.essay_raw_score is None:
            max_score = int(exam_subject.essay_max_score) if exam_subject.essay_max_score == int(exam_subject.essay_max_score) else exam_subject.essay_max_score
            issues.append({
                "issue_type": ValidationIssueType.MISSING_SCORE,
                "field_name": "essay_raw_score",
                "test_type": 2,
                "message": f"Essay score is missing. Maximum score is {max_score}",
            })
        else:
            # Check for decimal point in integer format
            is_valid, error_message = validate_integer_format(subject_score.essay_raw_score)
            if not is_valid:
                issues.append({
                    "issue_type": ValidationIssueType.INVALID_SCORE,
                    "field_name": "essay_raw_score",
                    "test_type": 2,
                    "message": error_message or f"Essay score '{subject_score.essay_raw_score}' is invalid",
                })
            else:
                # Check score range
                is_valid, error_message = validate_score_range(
                    subject_score.essay_raw_score, exam_subject.essay_max_score
                )
                if not is_valid:
                    issues.append({
                        "issue_type": ValidationIssueType.INVALID_SCORE,
                        "field_name": "essay_raw_score",
                        "test_type": 2,
                        "message": error_message or f"Essay score '{subject_score.essay_raw_score}' is invalid",
                    })

    # Validate pract_raw_score (test_type=3)
    # Check if pract_max_score > 0 OR pract_pct > 0
    pract_required = (
        (exam_subject.pract_max_score is not None and exam_subject.pract_max_score > 0)
        or (exam_subject.pract_pct is not None and exam_subject.pract_pct > 0)
    )
    if pract_required:
        if subject_score.pract_raw_score is None:
            max_score_text = ""
            if exam_subject.pract_max_score is not None and exam_subject.pract_max_score > 0:
                max_score = int(exam_subject.pract_max_score) if exam_subject.pract_max_score == int(exam_subject.pract_max_score) else exam_subject.pract_max_score
                max_score_text = f" Maximum score is {max_score}."
            issues.append({
                "issue_type": ValidationIssueType.MISSING_SCORE,
                "field_name": "pract_raw_score",
                "test_type": 3,
                "message": f"Practical score is missing.{max_score_text}",
            })
        else:
            # Check for decimal point in integer format
            is_valid, error_message = validate_integer_format(subject_score.pract_raw_score)
            if not is_valid:
                issues.append({
                    "issue_type": ValidationIssueType.INVALID_SCORE,
                    "field_name": "pract_raw_score",
                    "test_type": 3,
                    "message": error_message or f"Practical score '{subject_score.pract_raw_score}' is invalid",
                })
            else:
                # Use pract_max_score if available, otherwise we can't validate range (just check it's set)
                if exam_subject.pract_max_score is not None and exam_subject.pract_max_score > 0:
                    is_valid, error_message = validate_score_range(
                        subject_score.pract_raw_score, exam_subject.pract_max_score
                    )
                    if not is_valid:
                        issues.append({
                            "issue_type": ValidationIssueType.INVALID_SCORE,
                            "field_name": "pract_raw_score",
                            "test_type": 3,
                            "message": error_message or f"Practical score '{subject_score.pract_raw_score}' is invalid",
                        })

    return issues
