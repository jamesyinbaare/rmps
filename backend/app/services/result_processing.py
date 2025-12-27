"""Service for processing candidate results and calculating final scores."""

from typing import TYPE_CHECKING

from app.utils.score_utils import (
    calculate_final_score,
    calculate_normalized_scores,
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

        # Update subject_score with calculated values
        subject_score.obj_normalized = obj_normalized
        subject_score.essay_normalized = essay_normalized
        subject_score.pract_normalized = pract_normalized
        subject_score.total_score = total_score
