"""Unit tests for lunch coupon examiner filtering and reference-code sort."""

from unittest.mock import MagicMock

from app.services.lunch_coupon_pdf import _filter_examiners_with_codes


def _examiner(*, name: str, reference_code: str | None) -> MagicMock:
    examiner = MagicMock()
    examiner.name = name
    examiner.reference_code = reference_code
    return examiner


def test_filter_examiners_with_codes_sorts_by_natural_reference_code() -> None:
    examiners = [
        _examiner(name="Zed", reference_code="C704-SAE10"),
        _examiner(name="Amy", reference_code="C704-SAE2"),
        _examiner(name="Bob", reference_code="C704-SAE1"),
        _examiner(name="Skip", reference_code=None),
        _examiner(name="Blank", reference_code="  "),
    ]

    with_codes, missing = _filter_examiners_with_codes(
        examiners,
        empty_detail="empty",
        no_codes_detail="no codes",
    )

    assert missing == 2
    assert [e.reference_code for e in with_codes] == [
        "C704-SAE1",
        "C704-SAE2",
        "C704-SAE10",
    ]
    # Not name order (Amy/Bob/Zed)
    assert [e.name for e in with_codes] == ["Bob", "Amy", "Zed"]
