"""Helpers for exam progress score-entry aggregation."""


def score_entry_breakdown(expected: int, actual: int) -> dict[str, int | float]:
    """Build expected/actual/completion for one subject-type bucket."""
    completion = (actual / expected * 100.0) if expected > 0 else 0.0
    return {
        "expected": expected,
        "actual": actual,
        "completion_percentage": round(completion, 2),
    }


def slots_per_registration(*, has_pract_max: bool) -> int:
    """Expected score slots: obj + essay, plus pract when configured."""
    return 2 + (1 if has_pract_max else 0)
