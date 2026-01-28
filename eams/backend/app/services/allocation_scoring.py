"""Service for calculating examiner scores for allocation."""
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Examiner, ExaminerSubjectHistory, MarkingCycle


async def calculate_examiner_score(
    session: AsyncSession,
    examiner_id: UUID,
    subject_id: UUID,
    cycle_year: int,
) -> float:
    """
    Calculate examiner score for ranking.

    Scoring factors:
    - Years of subject-specific experience (from ExaminerSubjectHistory)
    - Number of times marked (times_marked)
    - Recency of last marking (last_marked_year)
    - Qualification weight (from ExaminerQualification - higher degrees = higher weight)

    Args:
        session: Database session
        examiner_id: Examiner UUID
        subject_id: Subject UUID
        cycle_year: Marking cycle year

    Returns:
        Numeric score for ranking (higher = better)
    """
    # Get examiner with qualifications
    examiner_stmt = select(Examiner).where(Examiner.id == examiner_id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        return 0.0

    # Get subject history
    history_stmt = select(ExaminerSubjectHistory).where(
        ExaminerSubjectHistory.examiner_id == examiner_id,
        ExaminerSubjectHistory.subject_id == subject_id,
    )
    history_result = await session.execute(history_stmt)
    history = history_result.scalar_one_or_none()

    score = 0.0

    # Factor 1: Years of experience (weight: 10 points per year, max 5 years = 50 points)
    if history and history.times_marked > 0:
        years_experience = min(history.times_marked, 5)  # Cap at 5 years
        score += years_experience * 10.0

    # Factor 2: Number of times marked (weight: 2 points per time, max 10 times = 20 points)
    if history:
        times_marked = min(history.times_marked, 10)  # Cap at 10 times
        score += times_marked * 2.0

    # Factor 3: Recency bonus (weight: 5 points if marked in last 2 years)
    if history and history.last_marked_year:
        years_since_last = cycle_year - history.last_marked_year
        if years_since_last <= 2:
            score += 5.0

    # Factor 4: Qualification weight (weight: 5-15 points based on highest degree)
    # Check for PhD, Masters, Bachelors, etc.
    if examiner.qualifications:
        highest_qual_weight = 0.0
        for qual in examiner.qualifications:
            degree_lower = qual.degree_diploma.lower()
            if "phd" in degree_lower or "doctor" in degree_lower:
                highest_qual_weight = max(highest_qual_weight, 15.0)
            elif "master" in degree_lower or "m.sc" in degree_lower or "m.ed" in degree_lower:
                highest_qual_weight = max(highest_qual_weight, 12.0)
            elif "bachelor" in degree_lower or "b.sc" in degree_lower or "b.ed" in degree_lower:
                highest_qual_weight = max(highest_qual_weight, 8.0)
            elif "diploma" in degree_lower:
                highest_qual_weight = max(highest_qual_weight, 5.0)
        score += highest_qual_weight

    return score
