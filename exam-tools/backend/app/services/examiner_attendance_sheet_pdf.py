"""PDF generation for printable cohort marking attendance sheets."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Examiner, ExaminerType, Region, Subject, SubjectMarkingGroup
from app.services.exam_official_export import examination_label
from app.services.examiner_invitation import subject_display_code
from app.services.pdf_generator import PdfGenerator, render_html
from app.services.subject_marking_group import load_group

TEMPLATE_REL = "examiner-attendance/marking-attendance-sheet.html"
ROWS_PER_PAGE = 25

_EXAMINER_TYPE_ABBREVS: dict[str, str] = {
    ExaminerType.CHIEF.value: "CE",
    ExaminerType.ASSISTANT_CHIEF.value: "ACE",
    ExaminerType.ASSISTANT.value: "AE",
    ExaminerType.TEAM_LEADER.value: "TL",
}


def _examiner_type_abbrev(examiner_type: ExaminerType) -> str:
    return _EXAMINER_TYPE_ABBREVS.get(examiner_type.value, examiner_type.value.upper())


def _subject_label(subject: Subject) -> str:
    code = subject_display_code(subject)
    name = (subject.name or "").strip()
    if code and name:
        return f"{code} — {name}"
    return code or name or f"Subject {subject.id}"


def _region_label(region: Region | None) -> str:
    if region is None:
        return ""
    return region.value


def _paginate_rows(rows: list[dict]) -> list[dict]:
    if not rows:
        return [{"rows": [], "is_first": True, "is_last": True, "page_number": 1, "total_pages": 1}]
    chunks: list[list[dict]] = []
    for i in range(0, len(rows), ROWS_PER_PAGE):
        chunks.append(rows[i : i + ROWS_PER_PAGE])
    total_pages = len(chunks)
    return [
        {
            "rows": chunk,
            "is_first": index == 0,
            "is_last": index == total_pages - 1,
            "page_number": index + 1,
            "total_pages": total_pages,
        }
        for index, chunk in enumerate(chunks)
    ]


def _render_attendance_sheet_pdf_sync(context: dict) -> bytes:
    templates_dir = Path(__file__).parent.parent / "templates"
    app_dir = Path(__file__).parent.parent.resolve()
    main_html = render_html(context, TEMPLATE_REL, templates_dir)
    pdf_gen = PdfGenerator(main_html=main_html, base_url=str(app_dir))
    return pdf_gen.render_pdf()


async def load_cohort_examiners_for_attendance_sheet(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID,
) -> tuple[SubjectMarkingGroup, Subject, list[Examiner]]:
    group = await load_group(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cohort not found")

    subject = await session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    examiner_ids = [m.examiner_id for m in group.members]
    if not examiner_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This cohort has no examiners. Add members before printing.",
        )

    stmt = (
        select(Examiner)
        .where(
            Examiner.examination_id == examination_id,
            Examiner.id.in_(examiner_ids),
        )
        .order_by(Examiner.region, Examiner.name)
    )
    examiners = list((await session.execute(stmt)).scalars().all())
    if not examiners:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No examiners found for this cohort.",
        )

    return group, subject, examiners


async def generate_examiner_attendance_sheet_pdf(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    group_id: UUID,
    attendance_date: date,
) -> tuple[bytes, str]:
    from app.models import Examination

    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")

    group, subject, examiners = await load_cohort_examiners_for_attendance_sheet(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )

    rows: list[dict] = []
    for index, examiner in enumerate(examiners, start=1):
        rows.append(
            {
                "index": index,
                "name": examiner.name,
                "designation": _examiner_type_abbrev(examiner.examiner_type),
                "region": _region_label(examiner.region),
            }
        )

    pages = _paginate_rows(rows)
    context = {
        "examination_label": examination_label(exam),
        "subject_label": _subject_label(subject),
        "cohort_name": group.name,
        "attendance_date": attendance_date.strftime("%d %B %Y"),
        "coordination_venue": (group.coordination_venue or "").strip() or None,
        "pages": pages,
    }

    pdf_bytes = _render_attendance_sheet_pdf_sync(context)

    safe_cohort = "".join(c for c in group.name if c.isalnum() or c in ("_", "-", " ")).strip().replace(" ", "_")[:30]
    safe_sub = subject_display_code(subject).replace(" ", "_")[:20]
    filename = f"Attendance_{safe_cohort or 'cohort'}_{safe_sub}_{attendance_date.isoformat()}.pdf"
    return pdf_bytes, filename
