"""Smoke tests for workforce appointment letter HTML templates."""

from __future__ import annotations

from app.services.pdf_generator import render_html


def _base_context(**overrides):
    ctx = {
        "invitee_name": "Jane Doe",
        "region": "Greater Accra",
        "examination_label": "2025 May/June Certificate II Core Subjects Examinations",
        "examination_label_upper": "2025 MAY/JUNE CERTIFICATE II CORE SUBJECTS EXAMINATIONS",
        "role_label": "Script Checker",
        "objective_rate_display": "0.40 GHS",
        "subjective_rate_display": "0.50 GHS",
        "rate_display": None,
        "tax_percent_display": "10",
        "venue": "East Legon, Accra",
        "commuting_display": "40.00 GHS",
        "lunch_display": "100.00 GHS",
        "commencement_date_display": "25TH SEPTEMBER 2025",
        "work_start_display": "9:00 am",
        "work_end_display": "4:00 pm",
        "valediction": "Yours faithfully",
        "signatory_name": "ERIC ASIEDU ANSAH",
        "signatory_title": "DIRECTOR 1, ASSESSMENT AND CERTIFICATION",
        "signatory_signature_src": None,
        "signed_for_director_general": True,
        "cc_lines": ["The Accountant.", "The Internal Auditor."],
    }
    ctx.update(overrides)
    return ctx


def test_script_checker_appointment_letter_template_renders() -> None:
    html = render_html(_base_context(), "workforce/appointment-letter-script-checker.html")
    assert "SCRIPT CHECKER" in html
    assert "Dear Jane Doe," in html
    assert "Dear Sir/Madam" not in html
    assert "Greater Accra" not in html
    assert "0.40 GHS" in html
    assert "0.50 GHS" in html
    assert "East Legon" in html
    assert "ERIC ASIEDU ANSAH" in html


def test_data_entry_clerk_appointment_letter_template_renders() -> None:
    html = render_html(
        _base_context(
            role_label="Data Entry Clerk",
            objective_rate_display=None,
            subjective_rate_display=None,
            rate_display="1.25 GHS",
        ),
        "workforce/appointment-letter-data-entry-clerk.html",
    )
    assert "DATA ENTRY CLERK" in html
    assert "1.25 GHS" in html
    assert "Dear Jane Doe," in html
    assert "Dear Sir/Madam" not in html
    assert "Greater Accra" not in html
