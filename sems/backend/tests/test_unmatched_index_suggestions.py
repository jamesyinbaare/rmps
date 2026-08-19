from app.utils.index_utils import filter_index_matches
from app.services.unmatched_index_suggestions import suggestion_from_candidate_rows


def test_filter_exact_unique() -> None:
    rows = [
        (1, "0121710708", "Jane Doe", "School A"),
        (2, "0121710709", "John Doe", "School A"),
    ]
    assert filter_index_matches("0121710708", rows) == [rows[0]]


def test_filter_exact_ambiguous() -> None:
    rows = [
        (1, "0121710708", "Jane", "A"),
        (2, "0121710708", "Other", "B"),
    ]
    matched = filter_index_matches("0121710708", rows)
    assert len(matched) == 2


def test_filter_unique_suffix_when_no_exact() -> None:
    rows = [
        (1, "0121710708", "Jane", "A"),
        (2, "0999999999", "Other", "B"),
    ]
    matched = filter_index_matches("121710708", rows)
    assert matched == [rows[0]]


def test_filter_ambiguous_prefix_not_unique() -> None:
    rows = [
        (1, "0121710708", "Jane", "A"),
        (2, "01217107081", "Other", "B"),
    ]
    matched = filter_index_matches("0121710708", rows)
    assert matched == [rows[0]]


def test_filter_ambiguous_suffix_not_unique() -> None:
    rows = [
        (1, "01217107081", "Jane", "A"),
        (2, "01217107082", "Other", "B"),
    ]
    matched = filter_index_matches("0121710708", rows)
    assert len(matched) == 2


def test_filter_no_match() -> None:
    rows = [(1, "0999999999", "Other", "B")]
    assert filter_index_matches("0121710708", rows) == []


def test_suggestion_from_rows_unique_ocr_noise() -> None:
    rows = [
        (1, "0121710708", "Jane Doe", "School A"),
        (2, "0121710709", "John Doe", "School A"),
    ]
    payload = suggestion_from_candidate_rows("01217l0708", rows, "1")
    assert payload["likely_ocr_noise"] is True
    assert payload["unique"] is True
    assert payload["cleaned_index_number"] == "0121710708"
    assert payload["score_field"] == "obj"
    assert payload["matches"][0]["subject_registration_id"] == 1
    assert payload["matches"][0]["current_score"] is None


def test_suggestion_from_rows_picks_current_score_for_paper() -> None:
    rows = [
        (1, "0121710708", "Jane Doe", "School A", "12", "34", "56"),
    ]
    obj = suggestion_from_candidate_rows("01217l0708", rows, "1")
    assert obj["matches"][0]["current_score"] == "12"
    essay = suggestion_from_candidate_rows("01217l0708", rows, "2")
    assert essay["matches"][0]["current_score"] == "34"
    pract = suggestion_from_candidate_rows("01217l0708", rows, "3")
    assert pract["matches"][0]["current_score"] == "56"


def test_suggestion_from_rows_clean_exact_not_ocr_noise() -> None:
    rows = [(1, "0121710708", "Jane Doe", "School A")]
    payload = suggestion_from_candidate_rows("0121710708", rows, "2")
    assert payload["unique"] is True
    assert payload["likely_ocr_noise"] is False
    assert payload["score_field"] == "essay"


def test_suggestion_from_rows_ambiguous_not_unique() -> None:
    rows = [
        (1, "0121710708", "Jane", "A"),
        (2, "0121710708", "Other", "B"),
    ]
    payload = suggestion_from_candidate_rows("01217l0708", rows, "1")
    assert payload["unique"] is False
    assert payload["likely_ocr_noise"] is False


def test_suggestion_from_rows_zero_matches() -> None:
    rows = [(1, "0999999999", "Other", "B")]
    payload = suggestion_from_candidate_rows("01217l0708", rows, None)
    assert payload["unique"] is False
    assert payload["likely_ocr_noise"] is False
    assert payload["score_field"] is None
