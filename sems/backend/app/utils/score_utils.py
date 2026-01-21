"""Utility functions for score validation and parsing."""

from typing import TYPE_CHECKING

from app.models import Grade

if TYPE_CHECKING:
    from app.models import DataExtractionMethod, Document, ExamSubject, SubjectScore


def validate_score_value(value: str | float | None) -> bool:
    """
    Validate that score value is allowed format.
    Returns True if value is: None, numeric string (>=0), "A", "AA", or "AAA"
    """
    if value is None:
        return True

    value_str = str(value).strip().upper()

    # Check for absence indicators
    if value_str in ("A", "AA", "AAA"):
        return True

    # Check for numeric value (>= 0)
    try:
        num_value = float(value_str)
        return num_value >= 0
    except ValueError:
        return False


def parse_score_value(value: str | float | None) -> str | None:
    """
    Parse and normalize score value.
    Returns: None, numeric string (>=0), "A", "AA", or "AAA"
    Raises ValueError if invalid format.
    """
    if value is None:
        return None

    value_str = str(value).strip().upper()

    # Handle empty string as None
    if not value_str:
        return None

    # Check for absence indicators
    if value_str in ("A", "AA", "AAA"):
        return value_str

    # Parse as numeric
    try:
        num_value = float(value_str)
        if num_value < 0:
            raise ValueError(f"Score cannot be negative: {value_str}")
        # Return as string, removing unnecessary trailing zeros for integers
        if num_value == int(num_value):
            return str(int(num_value))
        return str(num_value)
    except ValueError as e:
        if "cannot be negative" in str(e):
            raise
        raise ValueError(f"Score must be a number (>=0), 'A', 'AA', 'AAA', or None. Got: {value_str}")


def is_absent(score: str | None) -> bool:
    """Check if score indicates absence."""
    if score is None:
        return False
    return str(score).strip().upper() in ("A", "AA", "AAA")


def is_present(score: str | None) -> bool:
    """Check if score indicates presence."""
    if score is None:
        return False
    return not is_absent(score)


def is_entered(score: str | None) -> bool:
    """Check if score has been entered (not NULL)."""
    return score is not None


def get_numeric_score(score: str | None) -> float | None:
    """
    Extract numeric value if present, None if absent or not entered.
    Raises ValueError if score format is invalid.
    """
    if score is None or is_absent(score):
        return None

    try:
        num_value = float(str(score))
        if num_value < 0:
            raise ValueError("Score cannot be negative")
        return num_value
    except ValueError as e:
        if "cannot be negative" in str(e):
            raise
        raise ValueError(f"Invalid score format: {score}")


def calculate_total_score(
    obj_raw_score: str | None, essay_raw_score: str | None, pract_raw_score: str | None
) -> float:
    """
    Calculate total score from raw scores.
    Returns 0.0 if all scores are absent or not entered.
    Only includes numeric scores in the calculation.
    """
    total = 0.0

    obj_num = get_numeric_score(obj_raw_score)
    if obj_num is not None:
        total += obj_num

    essay_num = get_numeric_score(essay_raw_score)
    if essay_num is not None:
        total += essay_num

    pract_num = get_numeric_score(pract_raw_score)
    if pract_num is not None:
        total += pract_num

    return total


def validate_score_range(score: str | None, max_score: float) -> tuple[bool, str | None]:
    """
    Validate that a score value is within the allowed range (0 to max_score) or is "A"/"AA"/"AAA".

    Args:
        score: The score value to validate (can be None, "A", "AA", "AAA", or numeric string)
        max_score: The maximum allowed score value

    Returns:
        Tuple of (is_valid, error_message). is_valid is True if score is valid, False otherwise.
        error_message is None if valid, otherwise contains the error description.
    """
    if score is None:
        return False, "Score is required but not set"

    score_str = str(score).strip().upper()

    # Format max_score to remove unnecessary decimals
    max_score_display = int(max_score) if max_score == int(max_score) else max_score

    # Check for absence indicators - these are always valid
    if score_str in ("A", "AA", "AAA"):
        return True, None

    # Check for numeric value
    try:
        num_value = float(score_str)
        if num_value < 0:
            return False, f"Score cannot be negative. Please enter a value between 0 and {max_score_display}, or 'A'/'AA'/'AAA' for absent"
        if num_value > max_score:
            return False, f"Score {score_str} exceeds the maximum of {max_score_display}. Please enter a value between 0 and {max_score_display}, or 'A'/'AA'/'AAA' for absent"
        return True, None
    except ValueError:
        return False, f"Invalid score format. Please enter a number between 0 and {max_score_display}, or 'A'/'AA'/'AAA' for absent"


def add_extraction_method_to_document(
    document: "Document", extraction_method: "DataExtractionMethod"
) -> None:
    """
    Add an extraction method to a document's scores_extraction_methods array.
    Handles NULL arrays by initializing as empty, and avoids duplicates.

    Args:
        document: The Document model instance to update
        extraction_method: The DataExtractionMethod enum value to add
    """
    if document.scores_extraction_methods is None:
        document.scores_extraction_methods = []

    # Convert to set to avoid duplicates, then back to list
    methods_set = set(document.scores_extraction_methods)
    methods_set.add(extraction_method)
    document.scores_extraction_methods = list(methods_set)


def validate_exam_subject_pcts(exam_subject: "ExamSubject") -> tuple[bool, str | None]:
    """
    Validate that all non-None percentages in ExamSubject sum to 100%.

    Requires at least one percentage to be set (not None). If all percentages are None,
    validation fails as results cannot be processed without any percentage weights.

    Args:
        exam_subject: The ExamSubject instance to validate

    Returns:
        Tuple of (is_valid, error_message). is_valid is True if percentages sum to 100%, False otherwise.
        error_message is None if valid, otherwise contains the error description.
    """
    pcts = []
    if exam_subject.obj_pct is not None:
        pcts.append(("obj_pct", exam_subject.obj_pct))
    if exam_subject.essay_pct is not None:
        pcts.append(("essay_pct", exam_subject.essay_pct))
    if exam_subject.pract_pct is not None:
        pcts.append(("pract_pct", exam_subject.pract_pct))

    if not pcts:
        return False, "Cannot process results: all percentages (obj_pct, essay_pct, pract_pct) are None. At least one percentage must be set."

    total = sum(pct for _, pct in pcts)
    # Allow for small floating point errors (within 0.01)
    if abs(total - 100.0) > 0.01:
        pct_names = ", ".join(name for name, _ in pcts)
        return False, f"Percentages ({pct_names}) sum to {total}%, but must sum to 100%"

    return True, None


def calculate_component_score(
    raw_score: str | None, max_score: float | None, pct: float | None
) -> tuple[float | None, bool]:
    """
    Calculate a single component score: (raw_score/max_score)*pct

    Args:
        raw_score: The raw score value (can be None, numeric string, or "A"/"AA"/"AAA")
        max_score: The maximum score for this component (can be None or positive number)
        pct: The percentage weight for this component (can be None)

    Returns:
        Tuple of (score_value, is_absent):
        - score_value: The calculated component score, or None if component should be excluded
        - is_absent: True if raw_score is "A"/"AA"/"AAA", False otherwise

    Raises:
        ValueError: If max_score is 0 or negative
    """
    # If max_score or pct is None, component is excluded
    if max_score is None or pct is None:
        return None, False

    # Validate max_score is positive
    if max_score <= 0:
        raise ValueError(f"max_score must be positive, got {max_score}")

    # If raw_score is None, component should be excluded (flag as issue)
    if raw_score is None:
        return None, False

    # Check if raw_score is "A"/"AA"/"AAA"
    if is_absent(raw_score):
        # Component contributes 0, but mark as absent
        return 0.0, True

    # Calculate component score: (raw_score/max_score)*pct
    raw_num = get_numeric_score(raw_score)
    if raw_num is None:
        # This shouldn't happen if raw_score is not None and not "A"/"AA"
        return None, False

    component_score = (raw_num / max_score) * pct
    return component_score, False


def calculate_normalized_scores(
    subject_score: "SubjectScore", exam_subject: "ExamSubject"
) -> tuple[float | None, float | None, float | None]:
    """
    Calculate normalized scores (obj_normalized, essay_normalized, pract_normalized).

    Each normalized score = (raw_score/max_score)*pct if valid, else None.

    Args:
        subject_score: The SubjectScore instance
        exam_subject: The ExamSubject instance with max_scores and percentages

    Returns:
        Tuple of (obj_normalized, essay_normalized, pract_normalized)
    """
    obj_score, _ = calculate_component_score(
        subject_score.obj_raw_score, exam_subject.obj_max_score, exam_subject.obj_pct
    )
    essay_score, _ = calculate_component_score(
        subject_score.essay_raw_score, exam_subject.essay_max_score, exam_subject.essay_pct
    )
    pract_score, _ = calculate_component_score(
        subject_score.pract_raw_score, exam_subject.pract_max_score, exam_subject.pract_pct
    )

    return obj_score, essay_score, pract_score


# Sentinel value to represent "A" result when all components are absent
# This will be handled at the API layer to return "A" as string
ABSENT_RESULT_SENTINEL = -1.0


def calculate_final_score(
    subject_score: "SubjectScore", exam_subject: "ExamSubject"
) -> float:
    """
    Calculate final score using weighted percentage formula: final_score = A + B + C

    Where:
    - A = (obj_raw_score/obj_max_score)*obj_pct (if both obj_max_score and obj_pct are not None)
    - B = (essay_raw_score/essay_max_score)*essay_pct (if both essay_max_score and essay_pct are not None)
    - C = (pract_raw_score/pract_max_score)*pract_pct (if both pract_max_score and pract_pct are not None)

    Special handling:
    - If any raw_score is "A"/"AA"/"AAA" but others have values, that component contributes 0
    - If ALL raw_scores (that have corresponding max_score/pct) are "A"/"AA"/"AAA", returns ABSENT_RESULT_SENTINEL (-1.0)
    - Components are excluded if max_score or pct is None
    - Components are excluded if raw_score is None (should flag as issue)
    - IMPORTANT: This function should NOT be called if is_grade_pending() returns True

    Args:
        subject_score: The SubjectScore instance
        exam_subject: The ExamSubject instance with max_scores and percentages

    Returns:
        The calculated final score, or ABSENT_RESULT_SENTINEL if all valid components are "A"/"AA"

    Raises:
        ValueError: If percentages don't sum to 100%, or if max_score is invalid
    """
    # Validate percentages sum to 100%
    is_valid, error_msg = validate_exam_subject_pcts(exam_subject)
    if not is_valid:
        raise ValueError(error_msg)

    # Calculate each component
    component_a, is_absent_a = calculate_component_score(
        subject_score.obj_raw_score, exam_subject.obj_max_score, exam_subject.obj_pct
    )
    component_b, is_absent_b = calculate_component_score(
        subject_score.essay_raw_score, exam_subject.essay_max_score, exam_subject.essay_pct
    )
    component_c, is_absent_c = calculate_component_score(
        subject_score.pract_raw_score, exam_subject.pract_max_score, exam_subject.pract_pct
    )

    # Track which components are expected (have max_score and pct) and valid (have a calculated score)
    expected_components = []
    valid_components = []

    if exam_subject.obj_max_score is not None and exam_subject.obj_pct is not None:
        expected_components.append(("obj", component_a, is_absent_a))
        if component_a is not None:
            valid_components.append(("obj", component_a, is_absent_a))

    if exam_subject.essay_max_score is not None and exam_subject.essay_pct is not None:
        expected_components.append(("essay", component_b, is_absent_b))
        if component_b is not None:
            valid_components.append(("essay", component_b, is_absent_b))

    if exam_subject.pract_max_score is not None and exam_subject.pract_pct is not None:
        expected_components.append(("pract", component_c, is_absent_c))
        if component_c is not None:
            valid_components.append(("pract", component_c, is_absent_c))

    # If not all expected components are valid (some are None), this indicates pending status
    # This function should not be called when is_grade_pending() returns True
    # But we handle it gracefully by raising an error
    if len(valid_components) < len(expected_components):
        # Some expected components are missing - this indicates pending status
        # The caller should check is_grade_pending first before calling this function
        raise ValueError("Cannot calculate final score: some expected components are missing. Check is_grade_pending() first.")

    # Check if all valid components are absent
    if valid_components:
        all_absent = all(is_absent for _, _, is_absent in valid_components)
        if all_absent:
            return ABSENT_RESULT_SENTINEL

    # Sum all component scores (absent components contribute 0.0)
    final_score = sum(score for _, score, _ in valid_components)
    return final_score


def is_grade_pending(subject_score: "SubjectScore", exam_subject: "ExamSubject") -> bool:
    """
    Check if grade should be pending due to missing component scores.

    A grade is pending if any expected component is not explicitly set:
    - An ExamSubject has a max_score set for a component (obj, essay, or pract) - this means the component is expected
    - But the corresponding SubjectScore raw_score is None (not set)
    - Note: "A"/"AA"/"AAA" counts as explicitly set (absent is still a valid value), so it does NOT cause pending status
    - Only None (not set) causes pending status

    Examples:
    - If obj_max_score is set but obj_raw_score is None → PENDING
    - If obj_max_score is set and obj_raw_score is "A" → NOT PENDING (explicitly set as absent)
    - If obj_max_score is set and obj_raw_score is "50" → NOT PENDING (explicitly set as numeric)

    Args:
        subject_score: The SubjectScore instance
        exam_subject: The ExamSubject instance with max_scores

    Returns:
        True if grade should be pending (any expected component is not explicitly set), False otherwise
    """
    # Check if obj component is expected but not explicitly set
    if exam_subject.obj_max_score is not None:
        if subject_score.obj_raw_score is None:
            return True

    # Check if essay component is expected but not explicitly set
    if exam_subject.essay_max_score is not None:
        if subject_score.essay_raw_score is None:
            return True

    # Check if pract component is expected but not explicitly set
    if exam_subject.pract_max_score is not None:
        if subject_score.pract_raw_score is None:
            return True

    return False


def calculate_grade(
    total_score: float,
    grade_ranges_json: list[dict] | None,
    subject_score: "SubjectScore | None" = None,
    exam_subject: "ExamSubject | None" = None,
) -> "Grade | None":
    """
    Calculate grade from total_score using grade ranges JSON array.

    Args:
        total_score: The total score (0-100, or ABSENT_RESULT_SENTINEL -1.0)
        grade_ranges_json: List of grade range dicts: [{"grade": "Fail", "min": 0, "max": 40}, ...]
        subject_score: Optional SubjectScore instance to check for pending components
        exam_subject: Optional ExamSubject instance to check for pending components

    Returns:
        Grade enum if a matching range is found, None otherwise.
        Returns None if:
        - total_score is ABSENT_RESULT_SENTINEL (-1.0)
        - Any required component is missing (pending)
        - No range matches
        - grade_ranges_json is missing or empty
    """
    # Check if grade should be pending due to missing components
    if subject_score is not None and exam_subject is not None:
        if is_grade_pending(subject_score, exam_subject):
            return None

    # Handle absent result sentinel
    if total_score == ABSENT_RESULT_SENTINEL:
        return None

    # Handle missing or empty grade ranges
    if not grade_ranges_json:
        return None

    # Iterate through the array and find matching range
    for grade_range in grade_ranges_json:
        min_score = grade_range.get("min")
        max_score = grade_range.get("max")
        grade_name = grade_range.get("grade")

        # Skip if min/max are None
        if min_score is None or max_score is None:
            continue

        # Check if score falls within this range (inclusive boundaries)
        if min_score <= total_score <= max_score:
            # Convert grade name string to Grade enum
            try:
                return Grade(grade_name)  # e.g., "Fail" -> Grade.FAIL
            except ValueError:
                # Invalid grade name in JSON
                continue

    return None


def validate_grade_ranges(grade_ranges_json: list[dict]) -> tuple[bool, str | None]:
    """
    Validate that grade ranges don't overlap and cover 0-100 when all ranges are set.

    Args:
        grade_ranges_json: List of grade range dicts: [{"grade": "Fail", "min": 0, "max": 40}, ...]

    Returns:
        Tuple of (is_valid, error_message). is_valid is True if ranges are valid, False otherwise.
        error_message is None if valid, otherwise contains the error description.
    """
    if not grade_ranges_json:
        # Empty ranges are valid (can be set later)
        return True, None

    # Filter to only ranges with both min and max set
    valid_ranges = [
        gr for gr in grade_ranges_json
        if gr.get("min") is not None and gr.get("max") is not None
    ]

    if not valid_ranges:
        # No complete ranges are valid (can be set later)
        return True, None

    # Validate min <= max for each range
    for grade_range in valid_ranges:
        min_score = grade_range.get("min")
        max_score = grade_range.get("max")
        grade_name = grade_range.get("grade", "Unknown")

        if min_score > max_score:
            return False, f"Grade {grade_name}: min ({min_score}) cannot be greater than max ({max_score})"

    # Validate ranges are within 0-100
    for grade_range in valid_ranges:
        min_score = grade_range.get("min")
        max_score = grade_range.get("max")
        grade_name = grade_range.get("grade", "Unknown")

        if min_score < 0 or max_score > 100:
            return False, f"Grade {grade_name}: scores must be between 0 and 100"

    # Check for overlaps
    # Sort by min_score for easier overlap detection
    sorted_ranges = sorted(valid_ranges, key=lambda gr: gr.get("min", 0))

    for i in range(len(sorted_ranges) - 1):
        current = sorted_ranges[i]
        next_range = sorted_ranges[i + 1]

        current_min = current.get("min")
        current_max = current.get("max")
        current_grade = current.get("grade", "Unknown")
        next_min = next_range.get("min")
        next_max = next_range.get("max")
        next_grade = next_range.get("grade", "Unknown")

        # Check if ranges overlap (inclusive boundaries)
        # Overlap if: current.max >= next_range.min
        if current_max >= next_min:
            return False, (
                f"Grade ranges overlap: {current_grade} ({current_min}-{current_max}) "
                f"overlaps with {next_grade} ({next_min}-{next_max})"
            )

    # Check if ranges cover 0-100
    # Get the minimum min_score and maximum max_score
    min_min = min(gr.get("min", 0) for gr in valid_ranges)
    max_max = max(gr.get("max", 100) for gr in valid_ranges)

    if min_min > 0:
        return False, f"Grade ranges do not cover the full range. Lowest min is {min_min}, but should start at 0"

    if max_max < 100:
        return False, f"Grade ranges do not cover the full range. Highest max is {max_max}, but should end at 100"

    # Check for gaps between ranges
    for i in range(len(sorted_ranges) - 1):
        current = sorted_ranges[i]
        next_range = sorted_ranges[i + 1]

        current_max = current.get("max")
        current_grade = current.get("grade", "Unknown")
        next_min = next_range.get("min")
        next_grade = next_range.get("grade", "Unknown")

        # Check if there's a gap: next_min should be exactly current_max + 1 (or less if overlapping, which we already checked)
        # A gap exists if next_min > current_max + 1 (allowing small floating point errors)
        # Consecutive ranges (e.g., 39 and 40) are valid: current_max=39, next_min=40, gap = 40 - 39 = 1, which is acceptable
        gap_size = next_min - current_max
        if gap_size > 1.01:  # Allow small floating point errors (0.01)
            gap_start = current_max
            gap_end = next_min
            return False, (
                f"Grade ranges have a gap: {current_grade} ends at {gap_start} "
                f"but {next_grade} starts at {gap_end}"
            )

    return True, None
