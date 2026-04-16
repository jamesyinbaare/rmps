"""PDF generation for per-examiner scripts allocation forms (HTML + WeasyPrint)."""
from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from uuid import UUID

from PyPDF2 import PdfMerger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Allocation,
    AllocationAssignment,
    AllocationExaminer,
    AllocationRun,
    Examination,
    Examiner,
    School,
    ScriptEnvelope,
    ScriptPackingSeries,
    Subject,
)
from app.services.pdf_generator import PdfGenerator, render_html

MAX_COPIES = 20
TEMPLATE_REL = "script-allocation/scripts-allocation-form.html"


def examination_label(exam: Examination) -> str:
    parts = [exam.exam_type.strip(), str(exam.year)]
    if exam.exam_series and str(exam.exam_series).strip():
        parts.append(f"({exam.exam_series.strip()})")
    return " ".join(parts)


def _sanitize_filename_part(s: str) -> str:
    return "".join(c for c in s if c.isalnum() or c in ("_", "-"))


def _render_one_examiner_pdf_sync(
    *,
    examination_label_str: str,
    year: int,
    subject_label: str,
    paper_number: int,
    examiner_name: str,
    rows: list[dict[str, int | str]],
    total_count: int,
) -> bytes:
    templates_dir = Path(__file__).parent.parent / "templates"
    app_dir = Path(__file__).parent.parent.resolve()
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    main_html = render_html(
        {
            "examination_label": examination_label_str,
            "year": year,
            "subject_label": subject_label,
            "paper_number": paper_number,
            "examiner_name": examiner_name,
            "rows": rows,
            "total_count": total_count,
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
        side_margin=1.4,
        extra_vertical_margin=18,
    )
    return pdf_gen.render_pdf()


def _merge_pdf_copies(single_pdf: bytes, copies: int) -> bytes:
    if copies <= 1:
        return single_pdf
    merger = PdfMerger()
    try:
        for _ in range(copies):
            merger.append(BytesIO(single_pdf))
        out = BytesIO()
        merger.write(out)
        return out.getvalue()
    finally:
        merger.close()


async def build_scripts_allocation_form_pdf(
    session: AsyncSession,
    run_id: UUID,
    examiner_id: UUID | None,
    copies: int,
) -> tuple[bytes, str]:
    """
    Build PDF (or merged PDFs) for allocation form(s).

    :param examiner_id: If set, only this examiner; must be in campaign pool and have assignments.
    :param copies: Repeat each examiner's form this many times in the output (concatenated).
    """
    if copies < 1 or copies > MAX_COPIES:
        raise ValueError(f"copies must be between 1 and {MAX_COPIES}")

    run = await session.get(
        AllocationRun,
        run_id,
        options=[selectinload(AllocationRun.assignments)],
    )
    if run is None:
        raise ValueError("Run not found")

    allocation = await session.get(Allocation, run.allocation_id)
    if allocation is None:
        raise ValueError("Allocation not found")

    examination = await session.get(Examination, allocation.examination_id)
    if examination is None:
        raise ValueError("Examination not found")

    subject = await session.get(Subject, allocation.subject_id)
    subject_label = f"{subject.name} ({subject.code})" if subject else f"Subject {allocation.subject_id}"
    paper_number = int(allocation.paper_number)
    exam_label_str = examination_label(examination)

    stmt = (
        select(
            AllocationAssignment,
            ScriptEnvelope,
            ScriptPackingSeries,
            School,
        )
        .join(ScriptEnvelope, AllocationAssignment.script_envelope_id == ScriptEnvelope.id)
        .join(ScriptPackingSeries, ScriptEnvelope.packing_series_id == ScriptPackingSeries.id)
        .join(School, ScriptPackingSeries.school_id == School.id)
        .where(AllocationAssignment.allocation_run_id == run.id)
    )
    result = await session.execute(stmt)
    by_examiner: dict[UUID, list[tuple[AllocationAssignment, ScriptEnvelope, ScriptPackingSeries, School]]] = defaultdict(
        list
    )
    for row in result.all():
        aa, env, series, school = row
        by_examiner[aa.examiner_id].append((aa, env, series, school))

    if examiner_id is not None:
        member = await session.get(AllocationExaminer, (allocation.id, examiner_id))
        if member is None:
            raise ValueError("Examiner is not in this allocation pool")
        rows_raw = by_examiner.get(examiner_id, [])
        if not rows_raw:
            raise ValueError("No assignments for this examiner in this run")
        examiner = await session.get(Examiner, examiner_id)
        name = examiner.name if examiner else str(examiner_id)
        ordered = _sorted_assignment_rows(rows_raw)
        total = sum(int(r["booklet_count"]) for r in ordered)
        pdf_bytes = await asyncio.to_thread(
            _render_one_examiner_pdf_sync,
            examination_label_str=exam_label_str,
            year=int(examination.year),
            subject_label=subject_label,
            paper_number=paper_number,
            examiner_name=name,
            rows=ordered,
            total_count=total,
        )
        merged = _merge_pdf_copies(pdf_bytes, copies)
        fn = f"scripts_allocation_form_{_sanitize_filename_part(name)}.pdf"
        return merged, fn

    # All examiners with at least one assignment
    ex_ids = [eid for eid, lst in by_examiner.items() if lst]
    if not ex_ids:
        raise ValueError("No assignments in this run")

    ex_stmt = select(Examiner).where(Examiner.id.in_(ex_ids)).order_by(Examiner.name)
    examiners = list((await session.execute(ex_stmt)).scalars().all())
    merger_all = PdfMerger()
    try:
        for ex in examiners:
            lst = by_examiner.get(ex.id, [])
            if not lst:
                continue
            ordered = _sorted_assignment_rows(lst)
            total = sum(int(r["booklet_count"]) for r in ordered)
            pdf_bytes = await asyncio.to_thread(
                _render_one_examiner_pdf_sync,
                examination_label_str=exam_label_str,
                year=int(examination.year),
                subject_label=subject_label,
                paper_number=paper_number,
                examiner_name=ex.name,
                rows=ordered,
                total_count=total,
            )
            repeated = _merge_pdf_copies(pdf_bytes, copies)
            merger_all.append(BytesIO(repeated))
        out = BytesIO()
        merger_all.write(out)
        fn = "scripts_allocation_forms_all.pdf"
        return out.getvalue(), fn
    finally:
        merger_all.close()


def _sorted_assignment_rows(
    triples: list[tuple[AllocationAssignment, ScriptEnvelope, ScriptPackingSeries, School]],
) -> list[dict[str, int | str]]:
    rows: list[dict[str, int | str]] = []
    for aa, env, series, school in triples:
        rows.append(
            {
                "school_name": school.name,
                "envelope_number": int(env.envelope_number),
                "series_number": int(series.series_number),
                "booklet_count": int(aa.booklet_count),
            }
        )
    rows.sort(key=lambda r: (str(r["school_name"]).lower(), int(r["envelope_number"]), int(r["series_number"])))
    return rows
