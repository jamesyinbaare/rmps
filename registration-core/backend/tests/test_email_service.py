"""Tests for SMTP email helpers."""
from unittest.mock import MagicMock, patch

from app.config import settings
from app.services import email_service


def test_send_email_console_fallback_when_no_smtp(monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "email_console_fallback", True)
    monkeypatch.setattr(settings, "environment", "development")

    with patch("builtins.print") as mock_print:
        ok = email_service.send_email(
            "user@example.com",
            "Hello",
            "Body text",
        )
    assert ok is True
    mock_print.assert_called()


def test_send_email_smtp_success(monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "mailpit")
    monkeypatch.setattr(settings, "smtp_port", 1025)
    monkeypatch.setattr(settings, "smtp_user", "")
    monkeypatch.setattr(settings, "smtp_password", "")
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@test.local")
    monkeypatch.setattr(settings, "smtp_from_name", "Test")

    mock_server = MagicMock()
    with patch("smtplib.SMTP", return_value=mock_server) as smtp_cls:
        ok = email_service.send_email(
            "user@example.com",
            "Subject",
            "Plain",
            "<p>HTML</p>",
        )

    assert ok is True
    smtp_cls.assert_called_once_with("mailpit", 1025, timeout=30)
    mock_server.send_message.assert_called_once()
    mock_server.quit.assert_called_once()
    mock_server.login.assert_not_called()


def test_send_email_empty_recipient(monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "mailpit")
    assert email_service.send_email("", "S", "B") is False
