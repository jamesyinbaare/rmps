"""Service for handling results management logic."""
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    CandidateResult,
    RegistrationCandidate,
    RegistrationExam,
    ResultBlock,
    ResultBlockType,
    Subject,
    School,
    PortalUser,
    Grade,
)


async def upload_results_bulk(
    session: AsyncSession,
    exam_id: int,
    results: list[dict[str, Any]],
    uploaded_by_user_id: UUID,
) -> dict[str, Any]:
    """
    Validate and upload results in bulk (without publishing them).

    Args:
        session: Database session
        exam_id: Exam ID
        results: List of result dictionaries with registration_number, subject_code, grade
        uploaded_by_user_id: User ID who is uploading

    Returns:
        Dictionary with total_processed, successful, failed, errors
    """
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError(f"Exam with ID {exam_id} not found")

    successful = 0
    failed = 0
    errors: list[dict[str, str]] = []

    now = datetime.utcnow()

    for idx, result_data in enumerate(results):
        try:
            registration_number = result_data.get("registration_number")
            index_number = result_data.get("index_number")
            subject_code = result_data.get("subject_code")
            grade_str = result_data.get("grade")

            if not registration_number:
                errors.append({"row": str(idx + 1), "error": "Missing registration_number"})
                failed += 1
                continue

            if not subject_code:
                errors.append({"row": str(idx + 1), "error": "Missing subject_code"})
                failed += 1
                continue

            if not grade_str:
                errors.append({"row": str(idx + 1), "error": "Missing grade"})
                failed += 1
                continue

            # Validate grade
            try:
                grade = Grade(grade_str)
            except ValueError:
                errors.append({"row": str(idx + 1), "error": f"Invalid grade: {grade_str}"})
                failed += 1
                continue

            # Find candidate
            candidate_stmt = select(RegistrationCandidate).where(
                and_(
                    RegistrationCandidate.registration_exam_id == exam_id,
                    RegistrationCandidate.registration_number == registration_number,
                )
            )
            if index_number:
                candidate_stmt = candidate_stmt.where(
                    RegistrationCandidate.index_number == index_number
                )

            candidate_result = await session.execute(candidate_stmt)
            candidate = candidate_result.scalar_one_or_none()

            if not candidate:
                errors.append(
                    {
                        "row": str(idx + 1),
                        "error": f"Candidate not found: registration_number={registration_number}",
                    }
                )
                failed += 1
                continue

            # Find subject - try original_code first, then fall back to code
            subject_stmt = select(Subject).where(Subject.original_code == subject_code)
            subject_result = await session.execute(subject_stmt)
            subject = subject_result.scalar_one_or_none()

            # If not found by original_code, try code for backward compatibility
            if not subject:
                subject_stmt = select(Subject).where(Subject.code == subject_code)
                subject_result = await session.execute(subject_stmt)
                subject = subject_result.scalar_one_or_none()

            if not subject:
                errors.append({"row": str(idx + 1), "error": f"Subject not found: {subject_code}"})
                failed += 1
                continue

            # Check if result already exists
            existing_stmt = select(CandidateResult).where(
                and_(
                    CandidateResult.registration_candidate_id == candidate.id,
                    CandidateResult.subject_id == subject.id,
                    CandidateResult.registration_exam_id == exam_id,
                )
            )
            existing_result = await session.execute(existing_stmt)
            existing = existing_result.scalar_one_or_none()

            if existing:
                # Update existing result (but don't change published status)
                existing.grade = grade
                existing.updated_at = now
            else:
                # Create new result (not published yet)
                new_result = CandidateResult(
                    registration_candidate_id=candidate.id,
                    subject_id=subject.id,
                    registration_exam_id=exam_id,
                    grade=grade,
                    is_published=False,
                    published_at=None,
                    published_by_user_id=None,
                )
                session.add(new_result)

            successful += 1

        except Exception as e:
            errors.append({"row": str(idx + 1), "error": str(e)})
            failed += 1

    await session.commit()

    return {
        "total_processed": len(results),
        "successful": successful,
        "failed": failed,
        "errors": errors,
    }


async def publish_results_bulk(
    session: AsyncSession,
    exam_id: int,
    published_by_user_id: UUID,
    school_ids: list[int] | None = None,
    subject_ids: list[int] | None = None,
) -> dict[str, Any]:
    """
    Publish uploaded results for an exam with optional filters (set is_published=True for filtered results).

    Args:
        session: Database session
        exam_id: Exam ID
        published_by_user_id: User ID who is publishing
        school_ids: Optional list of school IDs to filter by (if None, includes all schools)
        subject_ids: Optional list of subject IDs to filter by (if None, includes all subjects)

    Returns:
        Dictionary with total_processed, successful, failed, errors
    """
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError(f"Exam with ID {exam_id} not found")

    now = datetime.utcnow()

    # Build query for unpublished results
    results_stmt = (
        select(CandidateResult)
        .join(RegistrationCandidate, CandidateResult.registration_candidate_id == RegistrationCandidate.id)
        .where(
            and_(
                CandidateResult.registration_exam_id == exam_id,
                CandidateResult.is_published == False,
            )
        )
    )

    # Apply school filter if provided
    if school_ids is not None:
        results_stmt = results_stmt.where(RegistrationCandidate.school_id.in_(school_ids))

    # Apply subject filter if provided
    if subject_ids is not None:
        results_stmt = results_stmt.where(CandidateResult.subject_id.in_(subject_ids))

    results_result = await session.execute(results_stmt)
    results = list(results_result.scalars().all())

    # Update filtered results to published
    for result in results:
        result.is_published = True
        result.published_at = now
        result.published_by_user_id = published_by_user_id
        result.updated_at = now

    await session.commit()

    return {
        "total_processed": len(results),
        "successful": len(results),
        "failed": 0,
        "errors": [],
    }


async def publish_exam_results(
    session: AsyncSession, exam_id: int, published_by_user_id: UUID
) -> RegistrationExam:
    """
    Mark exam as published (allows candidates to view results).

    Args:
        session: Database session
        exam_id: Exam ID
        published_by_user_id: User ID who is publishing

    Returns:
        Updated exam
    """
    from sqlalchemy.orm import selectinload

    exam_stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise ValueError(f"Exam with ID {exam_id} not found")

    exam.results_published = True
    exam.results_published_at = datetime.utcnow()
    exam.results_published_by_user_id = published_by_user_id
    exam.updated_at = datetime.utcnow()

    await session.commit()
    await session.refresh(exam, ["registration_period"])

    return exam


async def unpublish_results_bulk(
    session: AsyncSession,
    exam_id: int,
    school_ids: list[int] | None = None,
    subject_ids: list[int] | None = None,
) -> dict[str, Any]:
    """
    Unpublish results for an exam with optional filters (set is_published=False for filtered results).

    Args:
        session: Database session
        exam_id: Exam ID
        school_ids: Optional list of school IDs to filter by (if None, includes all schools)
        subject_ids: Optional list of subject IDs to filter by (if None, includes all subjects)

    Returns:
        Dictionary with total_processed, successful, failed, errors
    """
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError(f"Exam with ID {exam_id} not found")

    now = datetime.utcnow()

    # Build query for published results
    results_stmt = (
        select(CandidateResult)
        .join(RegistrationCandidate, CandidateResult.registration_candidate_id == RegistrationCandidate.id)
        .where(
            and_(
                CandidateResult.registration_exam_id == exam_id,
                CandidateResult.is_published == True,
            )
        )
    )

    # Apply school filter if provided
    if school_ids is not None:
        results_stmt = results_stmt.where(RegistrationCandidate.school_id.in_(school_ids))

    # Apply subject filter if provided
    if subject_ids is not None:
        results_stmt = results_stmt.where(CandidateResult.subject_id.in_(subject_ids))

    results_result = await session.execute(results_stmt)
    results = list(results_result.scalars().all())

    # Update filtered results to unpublished
    for result in results:
        result.is_published = False
        result.published_at = None
        result.published_by_user_id = None
        result.updated_at = now

    await session.commit()

    return {
        "total_processed": len(results),
        "successful": len(results),
        "failed": 0,
        "errors": [],
    }


async def unpublish_exam_results(session: AsyncSession, exam_id: int) -> RegistrationExam:
    """
    Unpublish exam results (prevents candidates from viewing).

    Args:
        session: Database session
        exam_id: Exam ID

    Returns:
        Updated exam
    """
    from sqlalchemy.orm import selectinload

    exam_stmt = (
        select(RegistrationExam)
        .where(RegistrationExam.id == exam_id)
        .options(selectinload(RegistrationExam.registration_period))
    )
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    if not exam:
        raise ValueError(f"Exam with ID {exam_id} not found")

    exam.results_published = False
    exam.results_published_at = None
    exam.results_published_by_user_id = None
    exam.updated_at = datetime.utcnow()

    await session.commit()
    await session.refresh(exam, ["registration_period"])

    return exam


async def check_result_blocks(
    session: AsyncSession,
    exam_id: int,
    candidate_id: Optional[int] = None,
    school_id: Optional[int] = None,
    subject_id: Optional[int] = None,
) -> bool:
    """
    Check if results are administratively blocked for a candidate/subject.

    Args:
        session: Database session
        exam_id: Exam ID
        candidate_id: Optional candidate ID
        school_id: Optional school ID
        subject_id: Optional subject ID

    Returns:
        True if blocked, False otherwise
    """
    # Check for candidate-level blocks
    if candidate_id:
        # Check CANDIDATE_ALL
        candidate_all_stmt = select(ResultBlock).where(
            and_(
                ResultBlock.registration_exam_id == exam_id,
                ResultBlock.registration_candidate_id == candidate_id,
                ResultBlock.block_type == ResultBlockType.CANDIDATE_ALL,
                ResultBlock.is_active == True,
            )
        )
        candidate_all_result = await session.execute(candidate_all_stmt)
        if candidate_all_result.scalar_one_or_none():
            return True

        # Check CANDIDATE_SUBJECT if subject_id provided
        if subject_id:
            candidate_subject_stmt = select(ResultBlock).where(
                and_(
                    ResultBlock.registration_exam_id == exam_id,
                    ResultBlock.registration_candidate_id == candidate_id,
                    ResultBlock.subject_id == subject_id,
                    ResultBlock.block_type == ResultBlockType.CANDIDATE_SUBJECT,
                    ResultBlock.is_active == True,
                )
            )
            candidate_subject_result = await session.execute(candidate_subject_stmt)
            if candidate_subject_result.scalar_one_or_none():
                return True

    # Check for school-level blocks
    if school_id:
        # Check SCHOOL_ALL
        school_all_stmt = select(ResultBlock).where(
            and_(
                ResultBlock.registration_exam_id == exam_id,
                ResultBlock.school_id == school_id,
                ResultBlock.block_type == ResultBlockType.SCHOOL_ALL,
                ResultBlock.is_active == True,
            )
        )
        school_all_result = await session.execute(school_all_stmt)
        if school_all_result.scalar_one_or_none():
            return True

        # Check SCHOOL_SUBJECT if subject_id provided
        if subject_id:
            school_subject_stmt = select(ResultBlock).where(
                and_(
                    ResultBlock.registration_exam_id == exam_id,
                    ResultBlock.school_id == school_id,
                    ResultBlock.subject_id == subject_id,
                    ResultBlock.block_type == ResultBlockType.SCHOOL_SUBJECT,
                    ResultBlock.is_active == True,
                )
            )
            school_subject_result = await session.execute(school_subject_stmt)
            if school_subject_result.scalar_one_or_none():
                return True

    return False


async def get_candidate_results(
    session: AsyncSession,
    exam_id: int,
    candidate_id: int,
    check_blocks: bool = True,
    only_published: bool = False,
) -> list[CandidateResult]:
    """
    Retrieve results for a candidate with blocking logic applied.

    Args:
        session: Database session
        exam_id: Exam ID
        candidate_id: Candidate ID
        check_blocks: Whether to check for administrative blocks
        only_published: If True, only return published results (for public endpoints)

    Returns:
        List of candidate results
    """
    # Get candidate to check school_id
    candidate_stmt = select(RegistrationCandidate).where(
        RegistrationCandidate.id == candidate_id
    )
    candidate_result = await session.execute(candidate_stmt)
    candidate = candidate_result.scalar_one_or_none()

    if not candidate:
        return []

    # Check if results are blocked
    if check_blocks:
        is_blocked = await check_result_blocks(
            session, exam_id, candidate_id=candidate_id, school_id=candidate.school_id
        )
        if is_blocked:
            return []  # Return empty if blocked

    # Get all results for this candidate and exam
    conditions = [
        CandidateResult.registration_candidate_id == candidate_id,
        CandidateResult.registration_exam_id == exam_id,
    ]
    if only_published:
        conditions.append(CandidateResult.is_published == True)

    results_stmt = (
        select(CandidateResult)
        .where(and_(*conditions))
        .options(selectinload(CandidateResult.subject))
    )
    results_result = await session.execute(results_stmt)
    results = list(results_result.scalars().all())

    # Log the query for debugging
    import logging
    logger = logging.getLogger(__name__)
    logger.debug(
        "Querying candidate results",
        extra={
            "exam_id": exam_id,
            "candidate_id": candidate_id,
            "only_published": only_published,
            "result_count": len(results),
            "result_subject_ids": [r.subject_id for r in results],
        },
    )

    return results


async def create_result_block(
    session: AsyncSession,
    block_type: ResultBlockType,
    exam_id: int,
    blocked_by_user_id: UUID,
    candidate_id: Optional[int] = None,
    school_id: Optional[int] = None,
    subject_id: Optional[int] = None,
    reason: Optional[str] = None,
) -> ResultBlock:
    """
    Create and validate a result block.

    Args:
        session: Database session
        block_type: Type of block
        exam_id: Exam ID
        blocked_by_user_id: User ID creating the block
        candidate_id: Optional candidate ID
        school_id: Optional school ID
        subject_id: Optional subject ID
        reason: Optional reason for blocking

    Returns:
        Created result block
    """
    # Validate block type requirements
    if block_type in (ResultBlockType.CANDIDATE_ALL, ResultBlockType.CANDIDATE_SUBJECT):
        if not candidate_id:
            raise ValueError(f"{block_type.value} requires candidate_id")
    elif block_type in (ResultBlockType.SCHOOL_ALL, ResultBlockType.SCHOOL_SUBJECT):
        if not school_id:
            raise ValueError(f"{block_type.value} requires school_id")

    if block_type in (
        ResultBlockType.CANDIDATE_SUBJECT,
        ResultBlockType.SCHOOL_SUBJECT,
    ):
        if not subject_id:
            raise ValueError(f"{block_type.value} requires subject_id")

    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError(f"Exam with ID {exam_id} not found")

    # Verify candidate exists if provided
    if candidate_id:
        candidate_stmt = select(RegistrationCandidate).where(
            RegistrationCandidate.id == candidate_id
        )
        candidate_result = await session.execute(candidate_stmt)
        if not candidate_result.scalar_one_or_none():
            raise ValueError(f"Candidate with ID {candidate_id} not found")

    # Verify school exists if provided
    if school_id:
        school_stmt = select(School).where(School.id == school_id)
        school_result = await session.execute(school_stmt)
        if not school_result.scalar_one_or_none():
            raise ValueError(f"School with ID {school_id} not found")

    # Verify subject exists if provided
    if subject_id:
        subject_stmt = select(Subject).where(Subject.id == subject_id)
        subject_result = await session.execute(subject_stmt)
        if not subject_result.scalar_one_or_none():
            raise ValueError(f"Subject with ID {subject_id} not found")

    # Create block
    new_block = ResultBlock(
        block_type=block_type,
        registration_exam_id=exam_id,
        registration_candidate_id=candidate_id,
        school_id=school_id,
        subject_id=subject_id,
        is_active=True,
        blocked_by_user_id=blocked_by_user_id,
        reason=reason,
    )

    session.add(new_block)
    await session.commit()
    await session.refresh(new_block)

    return new_block


async def unblock_result(
    session: AsyncSession, result_id: int, new_grade: Grade, updated_by_user_id: UUID
) -> CandidateResult:
    """
    Update BLOCKED grade status to a regular grade (unblocking).

    Args:
        session: Database session
        result_id: Result ID
        new_grade: New grade to set (must be a regular grade, not BLOCKED)
        updated_by_user_id: User ID updating the result

    Returns:
        Updated result
    """
    if new_grade == Grade.BLOCKED:
        raise ValueError("Cannot unblock with BLOCKED grade. Use a regular grade.")

    result_stmt = select(CandidateResult).where(CandidateResult.id == result_id)
    result = await session.execute(result_stmt)
    candidate_result = result.scalar_one_or_none()

    if not candidate_result:
        raise ValueError(f"Result with ID {result_id} not found")

    if candidate_result.grade != Grade.BLOCKED:
        raise ValueError(f"Result is not blocked (current grade: {candidate_result.grade})")

    candidate_result.grade = new_grade
    candidate_result.published_by_user_id = updated_by_user_id
    candidate_result.updated_at = datetime.utcnow()

    await session.commit()
    await session.refresh(candidate_result)

    return candidate_result
