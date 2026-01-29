"""Service for calculating examiner scores for invitation run."""
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import DegreeType, Examiner, ExaminerSubjectHistory


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
    # Get examiner with qualifications (eager load to avoid lazy load in async)
    examiner_stmt = (
        select(Examiner)
        .where(Examiner.id == examiner_id)
        .options(selectinload(Examiner.qualifications))
    )
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

    # Factor 4: Qualification weight (weight: 5-15 points based on degree_type)
    _DEGREE_WEIGHTS = {
        DegreeType.PhD: 15.0,
        DegreeType.MEd: 12.0,
        DegreeType.MSc: 12.0,
        DegreeType.BEd: 8.0,
        DegreeType.BSc: 8.0,
        DegreeType.Bachelor: 8.0,
        DegreeType.Diploma: 5.0,
        DegreeType.Other: 0.0,
    }
    if examiner.qualifications:
        highest_qual_weight = 0.0
        for qual in examiner.qualifications:
            weight = _DEGREE_WEIGHTS.get(qual.degree_type, 0.0)
            highest_qual_weight = max(highest_qual_weight, weight)
        score += highest_qual_weight

    return score
