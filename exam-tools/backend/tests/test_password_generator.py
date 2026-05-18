import string

from app.core.passwords import generate_inspector_password


def test_generate_inspector_password_length() -> None:
    pw = generate_inspector_password()
    assert len(pw) == 8


def test_generate_inspector_password_charset() -> None:
    for _ in range(50):
        pw = generate_inspector_password()
        assert any(c in string.ascii_lowercase for c in pw)
        assert any(c in string.ascii_uppercase for c in pw)
        assert any(c in string.digits for c in pw)
        assert all(c in string.ascii_letters + string.digits for c in pw)
