"""Tests for CTVET branded email HTML templates."""
from app.config import settings
from app.services.email_templates import (
    BRAND,
    ORG_FOOTER,
    logo_url,
    render_bank_deposit_status_html,
    render_password_setup_html,
    render_payment_receipt_html,
)


def test_layout_includes_brand_green_logo_and_org(monkeypatch):
    monkeypatch.setattr(settings, "frontend_base_url", "http://localhost:3002")
    html = render_password_setup_html(
        full_name="Jane Doe",
        account_email="jane@school.edu",
        setup_url="http://localhost:3002/set-password?token=abc",
        expiry_hours=48,
        purpose="invite",
    )
    assert BRAND["green"] in html
    assert BRAND["gold"] in html
    assert logo_url() in html
    assert 'src="http://localhost:3002/logo-crest-only.png"' in html
    assert "CTVET Registration" in html
    assert ORG_FOOTER in html
    assert 'href="http://localhost:3002/set-password?token=abc"' in html
    assert "Set password" in html


def test_invite_vs_reset_titles_differ():
    invite = render_password_setup_html(
        full_name="A",
        account_email="a@x.com",
        setup_url="https://example.com/set?t=1",
        expiry_hours=24,
        purpose="invite",
    )
    reset = render_password_setup_html(
        full_name="A",
        account_email="a@x.com",
        setup_url="https://example.com/set?t=1",
        expiry_hours=24,
        purpose="reset",
    )
    assert "Set your password" in invite
    assert "Reset your password" in reset
    assert "Reset password" in reset
    assert "Set password" in invite


def test_user_content_is_html_escaped():
    html = render_password_setup_html(
        full_name='<script>alert("x")</script>',
        account_email='evil@x.com"><img src=x>',
        setup_url="https://example.com/ok",
        expiry_hours=12,
        purpose="invite",
    )
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert '"><img' not in html


def test_payment_receipt_detail_panel():
    html = render_payment_receipt_html(
        recipient_name="Ada",
        amount="100.00",
        currency="GHS",
        reference="ref-99",
        paid_at="2026-11-24 12:00",
        detail_line="Registration number: REG-1.",
        dashboard_url="http://localhost:3002/dashboard/private",
    )
    assert "Payment received" in html
    assert "GHS" in html
    assert "100.00" in html
    assert "ref-99" in html
    assert "Open dashboard" in html
    assert BRAND["mint"] in html


def test_rejected_deposit_includes_reason():
    html = render_bank_deposit_status_html(
        recipient_name="Coord",
        invoice_number="INV-001",
        approved=False,
        rejection_reason="Blurry slip <b>scan</b>",
        dashboard_url="http://localhost:3002/dashboard/my-school",
    )
    assert "Deposit rejected" in html
    assert "INV-001" in html
    assert "Blurry slip" in html
    assert "&lt;b&gt;scan&lt;/b&gt;" in html
    assert BRAND["danger_bg"] in html


def test_approved_deposit_uses_mint_panel():
    html = render_bank_deposit_status_html(
        recipient_name="Coord",
        invoice_number="INV-002",
        approved=True,
        dashboard_url="http://localhost:3002/dashboard/my-school",
    )
    assert "Deposit approved" in html
    assert "marked paid" in html
    assert BRAND["mint"] in html
