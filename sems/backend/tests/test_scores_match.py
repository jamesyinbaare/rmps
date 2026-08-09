"""Regression tests for score/verify matching used by apply-from-reducto."""

from app.routers.scores import scores_match


def test_zero_string_matches_zero_int() -> None:
    assert scores_match("0", 0) is True


def test_zero_int_matches_zero_int() -> None:
    assert scores_match(0, 0) is True


def test_zero_string_matches_zero_string() -> None:
    assert scores_match("0", "0") is True


def test_numeric_mismatch_vs_absent() -> None:
    assert scores_match("4", "A") is False


def test_absent_pair_matches() -> None:
    assert scores_match("A", "A") is True
    assert scores_match("A", "AA") is True


def test_sample_sheet_has_exactly_one_mismatch() -> None:
    """Sheet sample: seven 0/0 pairs plus one 4 vs A mismatch."""
    rows = [
        ("0121710708", "6", 6),
        ("0121710714", "0", 0),
        ("0121710720", "4", "A"),
        ("0121710727", "6", 6),
        ("0121710733", "11", 11),
        ("0121710739", "0", 0),
        ("0121710745", "3", 3),
        ("0121710751", "15", 15),
        ("0121710757", "1", 1),
        ("0121710763", "25", 25),
        ("0121710769", "11", 11),
        ("0121710775", "10", 10),
        ("0121710781", "14", 14),
        ("0121710787", "4", 4),
        ("0121710793", "0", 0),
        ("0121710799", "20", 20),
        ("0121810014", "11", 11),
        ("0121810379", "23", 23),
        ("0121810385", "0", 0),
        ("0121810392", "A", "A"),
        ("0121810398", "0", 0),
        ("0121810404", "0", 0),
        ("0121810410", "10", 10),
        ("0121810416", "8", 8),
        ("0121810422", "0", 0),
    ]
    mismatches = [
        index_number
        for index_number, score, verify in rows
        if not scores_match(score, verify)
    ]
    assert mismatches == ["0121710720"]
