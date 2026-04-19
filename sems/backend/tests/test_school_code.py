import pytest

from app.utils.school_code import derive_s_code, sheet_id_school_prefix


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
