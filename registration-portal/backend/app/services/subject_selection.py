"""Service for handling subject selection logic for programmes."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Programme, Subject, SubjectType, programme_subjects


async def get_programme_subjects_for_registration(
    session: AsyncSession, programme_id: int
) -> dict[str, Any]:
    """
    Get organized subjects for a programme for registration purposes.

    Args:
        session: Database session
        programme_id: Programme ID

    Returns:
        Dictionary with:
        - compulsory_core: list of subject IDs (compulsory core subjects)
        - optional_core_groups: dict[choice_group_id, list of subject IDs]
        - electives: list of subject IDs (elective subjects)
    """
    # Get all subjects for this programme
    subject_stmt = (
        select(
            Subject,
            programme_subjects.c.is_compulsory,
            programme_subjects.c.choice_group_id,
        )
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .where(programme_subjects.c.programme_id == programme_id)
        .order_by(Subject.code)
    )
    subject_result = await session.execute(subject_stmt)
    subjects_data = subject_result.all()

    # Organize subjects into categories
    compulsory_core: list[int] = []
    optional_core_groups: dict[int, list[int]] = {}
    electives: list[int] = []

    for subject, is_compulsory, choice_group_id in subjects_data:
        if subject.subject_type == SubjectType.CORE:
            if is_compulsory is True:
                compulsory_core.append(subject.id)
            elif is_compulsory is False and choice_group_id is not None:
                if choice_group_id not in optional_core_groups:
                    optional_core_groups[choice_group_id] = []
                optional_core_groups[choice_group_id].append(subject.id)
        elif subject.subject_type == SubjectType.ELECTIVE:
            electives.append(subject.id)

    return {
        "compulsory_core": compulsory_core,
        "optional_core_groups": optional_core_groups,
        "electives": electives,
    }


async def auto_select_subjects_for_programme(
    session: AsyncSession, programme_id: int, school_id: int | None = None
) -> list[int]:
    """
    Auto-select subjects for a programme based on requirements.

    Args:
        session: Database session
        programme_id: Programme ID
        school_id: Optional school ID for school-specific defaults (not currently used)

    Returns:
        List of subject IDs to auto-select (compulsory core subjects only).
        Optional core subjects are NOT auto-selected - they must be explicitly chosen.
    """
    subjects_info = await get_programme_subjects_for_registration(session, programme_id)

    selected_subject_ids: list[int] = []

    # Add all compulsory core subjects
    selected_subject_ids.extend(subjects_info["compulsory_core"])

    # Do NOT auto-select optional core subjects - they must be explicitly chosen
    # Optional core subjects with choice_group_id should be selected by the user

    return selected_subject_ids


def normalize_exam_series(exam_series: str | None) -> str | None:
    """
    Normalize exam series string to match enum values.

    Handles variations like "May/June", "MAY/JUNE", "Nov/Dec", "NOV/DEC", etc.

    Args:
        exam_series: Exam series string (case-insensitive)

    Returns:
        Normalized exam series string ("MAY/JUNE" or "NOV/DEC") or None
    """
    if not exam_series:
        return None

    exam_series_upper = exam_series.upper().strip()
    if exam_series_upper in ("MAY/JUNE", "MAY-JUNE", "MAY JUNE"):
        return "MAY/JUNE"
    elif exam_series_upper in ("NOV/DEC", "NOV-DEC", "NOV DEC", "NOVEMBER/DECEMBER", "NOVEMBER-DECEMBER"):
        return "NOV/DEC"

    return exam_series_upper


async def validate_subject_selections(
    session: AsyncSession, programme_id: int, selected_subject_ids: list[int], exam_series: str | None = None
) -> tuple[bool, list[str]]:
    """
    Validate that subject selections meet programme requirements.

    For MAY/JUNE exams:
    - All compulsory core subjects must be registered
    - Exactly one subject from each optional core choice group must be registered
    - ALL elective subjects under the programme must be registered

    For NOV/DEC exams:
    - Must register at least one subject (either core or elective)
    - If optional core subjects are registered, validate that exactly one subject is selected from each optional core group (cannot select 2+ from same group)
    - Compulsory core subjects are NOT required (everything is optional)
    - Elective subjects are optional (no requirement to register all)

    Args:
        session: Database session
        programme_id: Programme ID
        selected_subject_ids: List of selected subject IDs
        exam_series: Exam series string (e.g., "MAY/JUNE", "NOV/DEC") - optional, defaults to MAY/JUNE behavior

    Returns:
        Tuple of (is_valid, list of error messages)
    """
    subjects_info = await get_programme_subjects_for_registration(session, programme_id)

    selected_set = set(selected_subject_ids)
    errors: list[str] = []

    # Normalize exam series
    normalized_series = normalize_exam_series(exam_series)
    is_may_june = normalized_series == "MAY/JUNE"
    is_nov_dec = normalized_series == "NOV/DEC"

    # For NOV/DEC: Allow empty subject list (all subjects are optional)
    # Note: The validation now allows empty list for NOV/DEC to support the new requirement

    # Check compulsory core subjects (only for MAY/JUNE)
    if is_may_june:
        compulsory_core = set(subjects_info["compulsory_core"])
        missing_compulsory = compulsory_core - selected_set
        if missing_compulsory:
            missing_subject_stmt = select(Subject).where(Subject.id.in_(missing_compulsory))
            missing_subject_result = await session.execute(missing_subject_stmt)
            missing_subjects = missing_subject_result.scalars().all()
            missing_names = [s.name for s in missing_subjects]
            errors.append(f"Missing compulsory core subjects: {', '.join(missing_names)}")

    # Check optional core choice groups (exactly one from each group)
    # For MAY/JUNE: if selected, must select exactly one from each group (but selection is optional - can be completed later)
    # For NOV/DEC: if any optional core subjects are registered, must select exactly one from each group
    for group_id, group_subject_ids in subjects_info["optional_core_groups"].items():
        group_set = set(group_subject_ids)
        registered_from_group = group_set & selected_set

        if is_may_june:
            # MAY/JUNE: If any subject from a group is selected, must select exactly one
            # But it's OK to not select from a group - can be completed later
            if len(registered_from_group) > 1:
                # Multiple subjects from same group - not allowed
                registered_subject_stmt = select(Subject).where(Subject.id.in_(registered_from_group))
                registered_subject_result = await session.execute(registered_subject_stmt)
                registered_subjects = registered_subject_result.scalars().all()
                registered_names = [s.name for s in registered_subjects]
                errors.append(f"Can only select one from optional core group {group_id}, but selected: {', '.join(registered_names)}")
            # Note: It's OK to not select from a group - candidate can complete selection later
        elif is_nov_dec:
            # NOV/DEC: If any optional core subjects are registered, validate groups
            if len(registered_from_group) > 1:
                # Multiple subjects from same group - not allowed
                registered_subject_stmt = select(Subject).where(Subject.id.in_(registered_from_group))
                registered_subject_result = await session.execute(registered_subject_stmt)
                registered_subjects = registered_subject_result.scalars().all()
                registered_names = [s.name for s in registered_subjects]
                errors.append(f"Can only select one from optional core group {group_id}, but selected: {', '.join(registered_names)}")
            # For NOV_DEC, it's OK to not select from a group (everything is optional)

    # Check ALL elective subjects are registered (only for MAY/JUNE)
    if is_may_june:
        elective_subject_ids = set(subjects_info["electives"])
        missing_electives = elective_subject_ids - selected_set
        if missing_electives:
            missing_elective_stmt = select(Subject).where(Subject.id.in_(missing_electives))
            missing_elective_result = await session.execute(missing_elective_stmt)
            missing_elective_subjects = missing_elective_result.scalars().all()
            missing_elective_names = [s.name for s in missing_elective_subjects]
            errors.append(f"Missing elective subjects (all are compulsory for MAY/JUNE): {', '.join(missing_elective_names)}")

    # Validate that selected subjects are actually part of the programme
    all_programme_subjects = (
        set(subjects_info["compulsory_core"])
        | set().union(*subjects_info["optional_core_groups"].values())
        | set(subjects_info["electives"])
    )
    invalid_subjects = selected_set - all_programme_subjects
    if invalid_subjects:
        invalid_subject_stmt = select(Subject).where(Subject.id.in_(invalid_subjects))
        invalid_subject_result = await session.execute(invalid_subject_stmt)
        invalid_subjects_list = invalid_subject_result.scalars().all()
        invalid_names = [s.name for s in invalid_subjects_list]
        errors.append(f"Selected subjects are not part of this programme: {', '.join(invalid_names)}")

    return len(errors) == 0, errors
