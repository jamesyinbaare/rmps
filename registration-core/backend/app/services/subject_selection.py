"""Service for handling subject selection logic for programmes."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RegistrationType, Subject, SubjectType, programme_subjects


async def get_programme_subjects_for_registration(
    session: AsyncSession, programme_id: int
) -> dict[str, Any]:
    """
    Get organized subjects for a programme for registration purposes.

    Returns:
        Dictionary with:
        - compulsory_core: list of subject IDs (compulsory core subjects)
        - optional_core_groups: dict[choice_group_id, list of subject IDs]
        - electives: list of subject IDs (elective subjects)
    """
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


def is_structured_registration_type(registration_type: str | None) -> bool:
    """Fee-paying and FreeTVET share the same structured subject rules."""
    return registration_type in (
        RegistrationType.FEE_PAYING.value,
        RegistrationType.FREE_TVET.value,
    )


def is_lenient_registration_type(registration_type: str | None) -> bool:
    """Referral and Private use lenient subject rules (≥1 freely chosen)."""
    return registration_type in (
        RegistrationType.REFERRAL.value,
        RegistrationType.PRIVATE.value,
    )


async def auto_select_subjects_for_programme(
    session: AsyncSession, programme_id: int, school_id: int | None = None
) -> list[int]:
    """
    Auto-select compulsory cores and all electives for structured registration.

    Optional core group subjects are never auto-selected — the candidate must pick one
    from each group.
    """
    subjects_info = await get_programme_subjects_for_registration(session, programme_id)
    selected_subject_ids: list[int] = []
    selected_subject_ids.extend(subjects_info["compulsory_core"])
    selected_subject_ids.extend(subjects_info["electives"])
    return selected_subject_ids


def normalize_exam_series(exam_series: str | None) -> str | None:
    """
    Normalize exam series string for display/compat.

    Subject validation no longer branches on series; kept for callers that still
    normalize series for templates or messaging.
    """
    if not exam_series:
        return None

    exam_series_upper = exam_series.upper().strip()
    if exam_series_upper in ("MAY/JUNE", "MAY-JUNE", "MAY JUNE"):
        return "MAY/JUNE"
    elif exam_series_upper in (
        "NOV/DEC",
        "NOV-DEC",
        "NOV DEC",
        "NOVEMBER/DECEMBER",
        "NOVEMBER-DECEMBER",
    ):
        return "NOV/DEC"

    return exam_series_upper


async def _subject_names(session: AsyncSession, subject_ids: set[int]) -> list[str]:
    if not subject_ids:
        return []
    result = await session.execute(select(Subject).where(Subject.id.in_(subject_ids)))
    return [s.name for s in result.scalars().all()]


async def validate_subject_selections(
    session: AsyncSession,
    programme_id: int,
    selected_subject_ids: list[int],
    exam_series: str | None = None,
    registration_type: str | None = None,
) -> tuple[bool, list[str]]:
    """
    Validate subject selections by registration type (not exam series).

    Structured (fee_paying / free_tvet):
    - All compulsory cores required
    - All electives required
    - Exactly one subject from each optional core group required

    Lenient (referral / private):
    - At least one subject required overall
    - May select any/all compulsory cores and electives
    - Optional core groups: at most one subject each (or none)

    exam_series is accepted for backward compatibility and ignored for mode selection.
    """
    del exam_series  # unused — mode is registration_type only

    subjects_info = await get_programme_subjects_for_registration(session, programme_id)
    selected_set = set(selected_subject_ids)
    errors: list[str] = []

    structured = is_structured_registration_type(registration_type)
    lenient = is_lenient_registration_type(registration_type)

    # Default unknown/missing types to lenient minimum (≥1) so callers that omit
    # type still cannot submit empty selections when a programme is set.
    if not structured and not lenient:
        lenient = True

    if lenient:
        if len(selected_subject_ids) == 0:
            errors.append("At least one subject must be selected")

    if structured:
        compulsory_core = set(subjects_info["compulsory_core"])
        missing_compulsory = compulsory_core - selected_set
        if missing_compulsory:
            names = await _subject_names(session, missing_compulsory)
            errors.append(f"Missing compulsory core subjects: {', '.join(names)}")

        elective_subject_ids = set(subjects_info["electives"])
        missing_electives = elective_subject_ids - selected_set
        if missing_electives:
            names = await _subject_names(session, missing_electives)
            errors.append(f"Missing elective subjects: {', '.join(names)}")

    for group_id, group_subject_ids in subjects_info["optional_core_groups"].items():
        group_set = set(group_subject_ids)
        registered_from_group = group_set & selected_set

        if len(registered_from_group) > 1:
            names = await _subject_names(session, registered_from_group)
            errors.append(
                f"Choose only one of these subjects, not several: {', '.join(names)}"
            )
        elif structured and len(registered_from_group) == 0:
            names = await _subject_names(session, group_set)
            if names:
                errors.append(
                    f"Please choose one of these subjects: {', '.join(names)}"
                )
            else:
                errors.append(
                    f"Please choose one subject from optional core group {group_id}"
                )

    all_programme_subjects = (
        set(subjects_info["compulsory_core"])
        | set().union(*subjects_info["optional_core_groups"].values())
        | set(subjects_info["electives"])
    )
    invalid_subjects = selected_set - all_programme_subjects
    if invalid_subjects:
        names = await _subject_names(session, invalid_subjects)
        errors.append(
            f"Selected subjects are not part of this programme: {', '.join(names)}"
        )

    return len(errors) == 0, errors
