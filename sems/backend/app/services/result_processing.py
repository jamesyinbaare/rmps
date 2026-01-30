"""Service for processing candidate results and calculating final scores."""

import math
from typing import TYPE_CHECKING

from app.utils.score_utils import (
    ABSENT_RESULT_SENTINEL,
    calculate_final_score,
    calculate_normalized_scores,
    is_grade_pending,
)

if TYPE_CHECKING:
    from app.models import ExamSubject, SubjectScore


class ResultProcessingError(Exception):
    """Base exception for result processing errors."""

    pass


class ResultProcessingService:
    """Service for processing candidate results and calculating scores."""

    @staticmethod
    def process_subject_score(
        subject_score: "SubjectScore", exam_subject: "ExamSubject"
    ) -> None:
        """
        Process a SubjectScore by calculating normalized scores and final score.

        This method updates the subject_score object in-place with calculated values.

        Args:
            subject_score: The SubjectScore instance to process
            exam_subject: The ExamSubject instance with max_scores and percentages

        Raises:
            ResultProcessingError: If calculation fails (e.g., percentages don't sum to 100%)
        """
        # Check if grade should be pending due to missing components
        # If pending, we should not calculate the final score
        if is_grade_pending(subject_score, exam_subject):
            # Set normalized scores to None for missing components
            obj_normalized, essay_normalized, pract_normalized = calculate_normalized_scores(
                subject_score, exam_subject
            )
            # Don't calculate total_score if pending - set it to 0.0 as a placeholder
            # Note: total_score field is not nullable, so we use 0.0
            # The grade calculation will return Grade.PENDING when calculate_grade is called
            subject_score.obj_normalized = obj_normalized
            subject_score.essay_normalized = essay_normalized
            subject_score.pract_normalized = pract_normalized
            # Set total_score to 0.0 when pending (not -1.0 which would show as ABSENT)
            # The frontend will show PENDING when grade is Grade.PENDING
            subject_score.total_score = 0.0
            return

        # Calculate normalized scores
        obj_normalized, essay_normalized, pract_normalized = calculate_normalized_scores(
            subject_score, exam_subject
        )

        # Calculate final score
        # Note: calculate_final_score validates percentages and raises ValueError on failure
        # We catch it and convert to ResultProcessingError for consistency
        try:
            total_score = calculate_final_score(subject_score, exam_subject)
        except ValueError as e:
            raise ResultProcessingError(str(e))

        # Update subject_score with calculated values; apply math.ceil to total_score (except absent sentinel)
        subject_score.obj_normalized = obj_normalized
        subject_score.essay_normalized = essay_normalized
        subject_score.pract_normalized = pract_normalized
        subject_score.total_score = (
            math.ceil(total_score) if total_score != ABSENT_RESULT_SENTINEL else total_score
        )
