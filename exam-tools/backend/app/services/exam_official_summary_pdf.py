"""PDF summary of exam centre official bank account details (inspector download)."""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ExamCentreOfficial,
    ExamInspectorSubjectScope,
    Examination,
    School,
    User,
)
from app.services.exam_official_export import designation_str, examination_label
from app.services.inspector_posting import InspectorWorkspaceContext
from app.services.pdf_generator import PdfGenerator, render_html

TEMPLATE_REL = "exam-officials/centre-summary.html"


def scope_display_suffix(scope: ExamInspectorSubjectScope | str) -> str:
    """Human-readable scope suffix for PDF labels, e.g. Core or Electives."""
    if isinstance(scope, ExamInspectorSubjectScope):
        raw = scope.value
    else:
        raw = str(scope).strip().upper()
    if raw == ExamInspectorSubjectScope.CORE.value:
        return "Core"
    if raw == ExamInspectorSubjectScope.ELECTIVE.value:
        return "Electives"
    return raw.title() if raw else ""


def examination_scope_label(examination: Examination, scope: ExamInspectorSubjectScope | str) -> str:
    """e.g. 2026 MAY/JUNE Certificate II (Core)."""
    base = examination_label(examination)
    suffix = scope_display_suffix(scope)
    return f"{base} ({suffix})" if suffix else base


def scope_filename_suffix(scope: ExamInspectorSubjectScope | str) -> str:
    if isinstance(scope, ExamInspectorSubjectScope):
        raw = scope.value
    else:
        raw = str(scope).strip().upper()
    if raw == ExamInspectorSubjectScope.CORE.value:
        return "CORE"
    if raw == ExamInspectorSubjectScope.ELECTIVE.value:
        return "ELECTIVE"
    return raw or "ALL"


def summary_export_filename(center_code: str, center_name: str, scope: ExamInspectorSubjectScope | str) -> str:
    def part(s: str) -> str:
        t = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", s.strip())
        return (t or "unknown")[:80]

    suffix = scope_filename_suffix(scope)
    return f"{part(center_code)} {part(center_name)} {suffix} official_accounts_summary.pdf"


def official_rows_for_template(rows: list[ExamCentreOfficial]) -> list[dict[str, Any]]:
    """Build template row dicts from ORM rows (bank_branch must be loaded)."""
    out: list[dict[str, Any]] = []
    for off in rows:
        bb = off.bank_branch
        scope = (
            off.subject_scope.value
            if isinstance(off.subject_scope, ExamInspectorSubjectScope)
            else str(off.subject_scope)
        )
        out.append(
            {
                "full_name": cast(str, off.full_name),
                "designation": designation_str(off.designation),
                "subject_scope": scope,
                "bank_name": cast(str, bb.bank_name),
                "branch_name": cast(str, bb.branch_name),
                "bank_code": str(bb.bank_code),
                "account_number": cast(str, off.account_number),
                "num_days": int(off.num_days),
                "telephone_number": cast(str, off.telephone_number),
            }
        )
    return out


def render_summary_pdf_sync(
    *,
    examination_label_str: str,
    center_code: str,
    center_name: str,
    subject_scope_label: str,
    inspector_name: str,
    rows: list[dict[str, Any]],
    generated_at: str,
) -> bytes:
    templates_dir = Path(__file__).parent.parent / "templates"
    app_dir = Path(__file__).parent.parent.resolve()
    main_html = render_html(
        {
            "examination_label": examination_label_str,
            "center_code": center_code,
            "center_name": center_name,
            "subject_scope_label": subject_scope_label,
            "inspector_name": inspector_name,
            "record_count": len(rows),
            "rows": rows,
            "generated_at": generated_at,
        },
        TEMPLATE_REL,
        templates_dir,
    )
    pdf_gen = PdfGenerator(
        main_html=main_html,
        header_html=None,
        footer_html=None,
        base_url=str(app_dir),
        side_margin=1.2,
        extra_vertical_margin=16,
    )
    return pdf_gen.render_pdf()


async def load_officials_for_summary(
    session: AsyncSession,
    *,
    examination_id: int,
    center_id: Any,
    subject_scope: ExamInspectorSubjectScope,
) -> list[ExamCentreOfficial]:
    stmt = (
        select(ExamCentreOfficial)
        .where(
            ExamCentreOfficial.examination_id == examination_id,
            ExamCentreOfficial.center_id == center_id,
            ExamCentreOfficial.subject_scope == subject_scope,
        )
        .options(selectinload(ExamCentreOfficial.bank_branch))
        .order_by(ExamCentreOfficial.full_name.asc(), ExamCentreOfficial.id.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def build_exam_official_summary_pdf(
    session: AsyncSession,
    *,
    examination: Examination,
    ctx: InspectorWorkspaceContext,
    subject_scope: ExamInspectorSubjectScope,
    inspector_user: User,
) -> tuple[bytes, str]:
    """Return (pdf_bytes, filename) for the inspector centre summary."""
    rows = await load_officials_for_summary(
        session,
        examination_id=examination.id,
        center_id=ctx.center_host.id,
        subject_scope=subject_scope,
    )
    if not rows:
        raise ValueError("No official account records to export")

    center = ctx.center_host
    center_code = cast(str, center.code)
    center_name = cast(str, center.name)
    scope_label = examination_scope_label(examination, subject_scope)
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    template_rows = official_rows_for_template(rows)
    inspector_name = cast(str, inspector_user.full_name)

    pdf_bytes = await asyncio.to_thread(
        render_summary_pdf_sync,
        examination_label_str=scope_label,
        center_code=center_code,
        center_name=center_name,
        subject_scope_label=scope_label,
        inspector_name=inspector_name,
        rows=template_rows,
        generated_at=generated_at,
    )
    filename = summary_export_filename(center_code, center_name, subject_scope)
    return pdf_bytes, filename
