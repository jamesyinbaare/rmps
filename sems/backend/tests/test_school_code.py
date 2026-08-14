import pytest

from app.utils.school_code import derive_s_code, sheet_id_school_prefix, sheet_prefix_to_school_code


@pytest.mark.parametrize(
    "code,expected",
    [
        ("817000A", "8170001"),
        ("817000C", "8170003"),
        ("817260", "817260"),
        (" 817000a ", "8170001"),
        ("X", "24"),
        ("AB", "2"),
    ],
)
def test_derive_s_code(code: str, expected: str) -> None:
    assert derive_s_code(code) == expected


def test_sheet_id_school_prefix() -> None:
    assert sheet_id_school_prefix("8170001") == "170001"
    assert sheet_id_school_prefix("817260") == "817260"


@pytest.mark.parametrize(
    "prefix,expected",
    [
        ("170901", "817090A"),
        ("709011", "817090K"),
        ("700010", "817000J"),
        ("817090", "817090"),
        ("170900", "170900"),  # 0 is not 1–26
        ("700027", "700027"),  # 27 is not 1–26
    ],
)
def test_sheet_prefix_to_school_code(prefix: str, expected: str) -> None:
    assert sheet_prefix_to_school_code(prefix) == expected


@pytest.mark.parametrize(
    "prefix",
    [
        "170901",
        "709011",
        "700010",
        "817090",
    ],
)
def test_sheet_prefix_round_trip(prefix: str) -> None:
    converted = sheet_prefix_to_school_code(prefix)
    assert sheet_id_school_prefix(derive_s_code(converted)) == prefix
