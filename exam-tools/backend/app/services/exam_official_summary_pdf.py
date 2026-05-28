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
from app.services.exam_official_designation import designation_pdf_label, sort_officials_by_designation_then_name
from app.services.exam_official_export import designation_str, examination_label
from app.services.inspector_posting import InspectorWorkspaceContext
from app.services.pdf_generator import PdfGenerator, render_html

TEMPLATE_REL = "exam-officials/centre-summary.html"
MAX_ROWS_FIRST_PAGE = 10
MAX_ROWS_CONTINUATION_PAGE = 15
MAX_ROWS_PER_PAGE = MAX_ROWS_FIRST_PAGE

# Max visible characters per cell (ellipsis appended when truncated).
PDF_CELL_LIMITS: dict[str, int] = {
    "full_name": 32,
    "designation": 24,
    "branch_name": 40,
    "telephone_number": 10,
    "account_number": 13,
}


def truncate_pdf_cell(value: str, max_len: int) -> str:
    """Single-line cell text; suffix with ... when over max_len."""
    t = str(value).strip()
    if len(t) <= max_len:
        return t
    if max_len <= 3:
        return "..."
    return f"{t[: max_len - 3]}..."


def format_pdf_row_cells(row: dict[str, Any]) -> dict[str, Any]:
    """Apply truncation limits for PDF table cells."""
    out = dict(row)
    for key, limit in PDF_CELL_LIMITS.items():
        if key in out:
            out[key] = truncate_pdf_cell(str(out[key]), limit)
    return out


def paginate_pdf_rows(
    rows: list[dict[str, Any]],
    *,
    first_page_size: int = MAX_ROWS_FIRST_PAGE,
    continuation_page_size: int = MAX_ROWS_CONTINUATION_PAGE,
    page_size: int | None = None,
) -> list[dict[str, Any]]:
    """Split rows for PDF pages: first page smaller (header/meta), later pages fit more rows."""
    if page_size is not None:
        first_page_size = page_size
        continuation_page_size = page_size
    if not rows:
        return [{"rows": [], "start_index": 1, "is_first": True}]
    pages: list[dict[str, Any]] = []
    offset = 0
    is_first = True
    while offset < len(rows):
        limit = first_page_size if is_first else continuation_page_size
        chunk = rows[offset : offset + limit]
        pages.append({"rows": chunk, "start_index": offset + 1, "is_first": is_first})
        offset += limit
        is_first = False
    return pages


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
        raw = {
            "full_name": cast(str, off.full_name),
            "designation": designation_pdf_label(designation_str(off.designation)),
            "subject_scope": scope,
            "branch_name": cast(str, bb.branch_name),
            "telephone_number": cast(str, off.telephone_number),
            "account_number": cast(str, off.account_number),
            "num_days": int(off.num_days),
        }
        out.append(format_pdf_row_cells(raw))
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
    pages = paginate_pdf_rows(rows)
    main_html = render_html(
        {
            "examination_label": examination_label_str,
            "center_code": center_code,
            "center_name": center_name,
            "subject_scope_label": subject_scope_label,
            "inspector_name": inspector_name,
            "record_count": len(rows),
            "pages": pages,
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
        side_margin=0,
        extra_vertical_margin=0,
    )
    return pdf_gen.render_pdf()


async def load_officials_for_summary(
    session: AsyncSession,
    *,
    examination_id: int,
    examination_centre_id: Any,
    subject_scope: ExamInspectorSubjectScope,
) -> list[ExamCentreOfficial]:
    stmt = (
        select(ExamCentreOfficial)
        .where(
            ExamCentreOfficial.examination_id == examination_id,
            ExamCentreOfficial.examination_centre_id == examination_centre_id,
            ExamCentreOfficial.subject_scope == subject_scope,
        )
        .options(selectinload(ExamCentreOfficial.bank_branch))
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
        examination_centre_id=ctx.examination_centre.id,
        subject_scope=subject_scope,
    )
    if not rows:
        raise ValueError("No official account records to export")

    rows = sort_officials_by_designation_then_name(rows)

    center = ctx.examination_centre
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
