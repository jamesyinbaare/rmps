import pytest

from app.services.sms.phone import format_local_phone_username, normalize_msisdn


@pytest.mark.parametrize(
    ("phone", "msisdn"),
    [
        ("0551234567", "233551234567"),
        ("+233551234567", "233551234567"),
        ("233551234567", "233551234567"),
        ("551234567", "233551234567"),
    ],
)
def test_normalize_msisdn(phone: str, msisdn: str) -> None:
    assert normalize_msisdn(phone) == msisdn


@pytest.mark.parametrize(
    ("phone", "username"),
    [
        ("0551234567", "0551234567"),
        ("233551234567", "0551234567"),
        ("+233551234567", "0551234567"),
    ],
)
def test_format_local_phone_username(phone: str, username: str) -> None:
    assert format_local_phone_username(phone) == username


def test_normalize_msisdn_empty_raises() -> None:
    with pytest.raises(ValueError, match="empty"):
        normalize_msisdn("   ")
