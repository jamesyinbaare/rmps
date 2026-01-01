"""Utility functions for calculating statistics."""

import statistics
from typing import Sequence

try:
    from scipy import stats
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False


def calculate_percentiles(data: Sequence[float], percentiles: list[float]) -> dict[str, float]:
    """
    Calculate percentiles for a dataset.

    Args:
        data: Sequence of numeric values
        percentiles: List of percentile values (e.g., [25, 50, 75, 90, 95])

    Returns:
        Dictionary mapping percentile names to values (e.g., {"25th": 45.5, ...})
    """
    if not data:
        return {f"{int(p)}th": 0.0 for p in percentiles}

    sorted_data = sorted(data)
    n = len(sorted_data)

    result = {}
    for p in percentiles:
        # Calculate index using linear interpolation
        index = (p / 100.0) * (n - 1)
        lower = int(index)
        upper = min(lower + 1, n - 1)
        weight = index - lower

        if lower == upper:
            value = sorted_data[lower]
        else:
            value = sorted_data[lower] * (1 - weight) + sorted_data[upper] * weight

        result[f"{int(p)}th"] = round(value, 2)

    return result


def calculate_statistics(data: Sequence[float]) -> dict[str, float | None]:
    """
    Calculate basic statistics for a dataset.

    Args:
        data: Sequence of numeric values

    Returns:
        Dictionary with mean, median, min, max, std_deviation, skewness, kurtosis
    """
    if not data:
        return {
            "mean": None,
            "median": None,
            "min": None,
            "max": None,
            "std_deviation": None,
            "skewness": None,
            "kurtosis": None,
        }

    try:
        mean = statistics.mean(data)
        median = statistics.median(data)
        min_val = min(data)
        max_val = max(data)
        std_dev = statistics.stdev(data) if len(data) > 1 else 0.0

        # Calculate skewness and kurtosis
        skewness = None
        kurtosis = None
        if SCIPY_AVAILABLE and len(data) > 2:
            try:
                skewness = float(stats.skew(data))
                kurtosis = float(stats.kurtosis(data))
            except Exception:
                pass

        return {
            "mean": round(mean, 2),
            "median": round(median, 2),
            "min": round(min_val, 2),
            "max": round(max_val, 2),
            "std_deviation": round(std_dev, 2),
            "skewness": round(skewness, 2) if skewness is not None else None,
            "kurtosis": round(kurtosis, 2) if kurtosis is not None else None,
        }
    except statistics.StatisticsError:
        return {
            "mean": None,
            "median": None,
            "min": None,
            "max": None,
            "std_deviation": None,
            "skewness": None,
            "kurtosis": None,
        }
