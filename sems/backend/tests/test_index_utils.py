from app.utils.index_utils import (
    highlight_index_parts,
    index_noise_chars,
    normalize_index_number,
)


def test_normalize_clean_digits() -> None:
    assert normalize_index_number("0121710708") == "0121710708"


def test_normalize_trailing_punctuation() -> None:
    assert normalize_index_number("0121710708.") == "0121710708"


def test_normalize_whitespace() -> None:
    assert normalize_index_number(" 0121710708 ") == "0121710708"


def test_normalize_ocr_homoglyph_o() -> None:
    assert normalize_index_number("O121710708") == "0121710708"


def test_normalize_glued_absence_mark() -> None:
    assert normalize_index_number("0121710708A") == "0121710708"


def test_normalize_float_like() -> None:
    assert normalize_index_number("0121710708.0") == "0121710708"
    assert normalize_index_number(121710708.0) == "121710708"


def test_normalize_check_mark() -> None:
    assert normalize_index_number("0121710708✓") == "0121710708"


def test_normalize_rejects_short_or_alpha() -> None:
    assert normalize_index_number("abc") is None
    assert normalize_index_number("12345") is None
    assert normalize_index_number(None) is None
    assert normalize_index_number("") is None


def test_noise_chars_and_highlight() -> None:
    raw = "0121710708."
    cleaned = normalize_index_number(raw)
    assert index_noise_chars(raw, cleaned) == "."
    parts = highlight_index_parts(raw, cleaned)
    assert parts == [("0121710708", False), (".", True)]
