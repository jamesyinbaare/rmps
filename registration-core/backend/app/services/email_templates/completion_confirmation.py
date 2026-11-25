"""Registration completion confirmation email HTML."""
from __future__ import annotations

from typing import Any

from app.services.email_templates.brand import BRAND, FONT, ORG_FOOTER, logo_url
from app.services.pdf_generator import render_html

TYPE_LABELS = {
    "fee_paying": "Fee-paying",
    "free_tvet": "Free TVET",
    "referral": "Referral",
}


def render_completion_confirmation_html(
    *,
    recipient_name: str,
    school_name: str,
    school_code: str,
    exam_label: str,
    total_candidates: int,
    counts_by_type: dict[str, int],
    counts_by_programme: list[dict[str, Any]],
    confirmed_at: str,
    dashboard_url: str,
) -> str:
    type_summary = ", ".join(
        f"{TYPE_LABELS.get(k, k)}: {int(counts_by_type.get(k, 0))}"
        for k in ("fee_paying", "free_tvet", "referral")
    )
    programme_lines = []
    for p in counts_by_programme:
        code = p.get("code") or "—"
        name = p.get("name") or "Programme"
        total = int(p.get("total") or 0)
        by_type = p.get("by_type") or {}
        detail = ", ".join(
            f"{TYPE_LABELS.get(k, k)} {int(by_type.get(k, 0))}"
            for k in ("fee_paying", "free_tvet", "referral")
            if int(by_type.get(k, 0)) > 0
        )
        programme_lines.append(f"{code} — {name}: {total}" + (f" ({detail})" if detail else ""))

    context = {
        "brand": BRAND,
        "font": FONT,
        "org_footer": ORG_FOOTER,
        "logo_url": logo_url(),
        "title": "Registration confirmed",
        "preheader": f"{school_code}: {total_candidates} candidates confirmed for {exam_label}.",
        "recipient_name": recipient_name,
        "school_name": school_name,
        "school_code": school_code,
        "exam_label": exam_label,
        "detail_rows": [
            ("School", f"{school_name} ({school_code})"),
            ("Examination", exam_label),
            ("Confirmed at", confirmed_at or "—"),
            ("Total candidates", str(total_candidates)),
            ("By type", type_summary),
        ],
        "programme_lines": programme_lines,
        "cta_label": "Open dashboard",
        "cta_url": dashboard_url,
        "footer_note": "This summary was sent after your school uploaded a signed completion form.",
    }
    return render_html(context, "emails/completion_confirmation.html")
