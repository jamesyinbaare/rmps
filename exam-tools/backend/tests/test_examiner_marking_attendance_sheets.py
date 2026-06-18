"""Tests for examiner marking attendance sheet helpers and routes."""

from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException, UploadFile

from app.models import UserRole
from app.routers.admin_examiner_attendance_sheets import list_admin_examiner_attendance_sheets
from app.routers.subject_officer_examiner_attendance_sheets import (
    download_blank_examiner_attendance_sheet,
    upload_examiner_attendance_sheet,
)
from app.services.admin_examiner_attendance_zip import unique_zip_entry_names
from app.services.examiner_attendance_sheet_files import (
    ExaminerAttendanceSheetUploadError,
    build_examiner_attendance_sheet_filename,
    examiner_attendance_normalized_extension,
)
from app.services.examiner_attendance_sheet_pdf import (
    _examiner_type_abbrev,
    _paginate_rows,
    _render_attendance_sheet_pdf_sync,
)
from app.models import ExaminerType
from app.services.script_control import assert_script_packing_calendar_allowed

pytest.importorskip("weasyprint", reason="WeasyPrint required for HTML→PDF in this test")
from PyPDF2 import PdfReader


def test_build_examiner_attendance_sheet_filename_basic() -> None:
    name = build_examiner_attendance_sheet_filename(
        "Northern cohort",
        "MATH301",
        date(2026, 6, 14),
        ".pdf",
    )
    assert name.endswith(".pdf")
    assert "2026-06-14" in name
    assert "MATH301" in name


def test_build_examiner_attendance_sheet_filename_collision() -> None:
    name = build_examiner_attendance_sheet_filename(
        "Northern cohort",
        "MATH301",
        date(2026, 6, 14),
        ".pdf",
        collision_index=2,
    )
    assert "(2)" in name


def test_examiner_attendance_normalized_extension_rejects_docx() -> None:
    with pytest.raises(ExaminerAttendanceSheetUploadError):
        examiner_attendance_normalized_extension("notes.docx")


def test_unique_zip_entry_names_dedupes_collisions() -> None:
    names = unique_zip_entry_names(["sheet.pdf", "sheet.pdf", "other.png"])
    assert names == ["sheet.pdf", "sheet_2.pdf", "other.png"]


def test_paginate_rows_splits_pages() -> None:
    rows = [{"index": i} for i in range(1, 26)]
    pages = _paginate_rows(rows)
    assert len(pages) == 1
    assert pages[0]["is_first"] is True
    assert pages[0]["is_last"] is True
    assert len(pages[0]["rows"]) == 25
    assert pages[0]["page_number"] == 1
    assert pages[0]["total_pages"] == 1

    rows_multi = [{"index": i} for i in range(1, 51)]
    pages_multi = _paginate_rows(rows_multi)
    assert len(pages_multi) == 2
    assert len(pages_multi[0]["rows"]) == 25
    assert len(pages_multi[1]["rows"]) == 25
    assert pages_multi[1]["page_number"] == 2


def test_examiner_type_abbreviations() -> None:
    assert _examiner_type_abbrev(ExaminerType.CHIEF) == "CE"
    assert _examiner_type_abbrev(ExaminerType.ASSISTANT_CHIEF) == "ACE"
    assert _examiner_type_abbrev(ExaminerType.ASSISTANT) == "AE"
    assert _examiner_type_abbrev(ExaminerType.TEAM_LEADER) == "TL"


def _attendance_sheet_context(*, row_count: int, with_venue: bool = True) -> dict:
    rows = [
        {
            "index": i,
            "name": f"Examiner {i}",
            "designation": "AE",
            "region": "Greater Accra",
        }
        for i in range(1, row_count + 1)
    ]
    pages = _paginate_rows(rows)
    return {
        "examination_label": "C2 2026",
        "subject_label": "MATH301 — Mathematics",
        "cohort_name": "Northern",
        "attendance_date": "14 June 2026",
        "coordination_venue": "Accra" if with_venue else None,
        "pages": pages,
    }


def test_attendance_sheet_pdf_keeps_each_logical_page_to_one_physical_page() -> None:
    pdf_one_page = _render_attendance_sheet_pdf_sync(_attendance_sheet_context(row_count=25))
    assert len(PdfReader(BytesIO(pdf_one_page)).pages) == 1

    pdf_two_pages = _render_attendance_sheet_pdf_sync(_attendance_sheet_context(row_count=50))
    assert len(PdfReader(BytesIO(pdf_two_pages)).pages) == 2


def test_render_attendance_sheet_pdf_includes_signature_column() -> None:
    pdf_bytes = _render_attendance_sheet_pdf_sync(
        _attendance_sheet_context(row_count=1)
    )
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 500


@pytest.mark.asyncio
async def test_download_blank_sheet_requires_access() -> None:
    user = MagicMock(role=UserRole.SUBJECT_OFFICER)
    session = AsyncMock()
    group_id = uuid4()

    with (
        patch(
            "app.routers.subject_officer_examiner_attendance_sheets.assert_subject_officer_access",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.subject_officer_examiner_attendance_sheets._load_cohort_or_404",
            new_callable=AsyncMock,
            return_value=MagicMock(name="Northern"),
        ),
        patch(
            "app.routers.subject_officer_examiner_attendance_sheets.generate_examiner_attendance_sheet_pdf",
            new_callable=AsyncMock,
            return_value=(b"%PDF-1.4", "Attendance.pdf"),
        ),
    ):
        response = await download_blank_examiner_attendance_sheet(
            examination_id=1,
            session=session,
            user=user,
            subject_id=10,
            group_id=group_id,
            attendance_date=date(2026, 6, 14),
        )

    assert response.headers["content-type"] == "application/pdf"


@pytest.mark.asyncio
async def test_upload_rejects_future_date() -> None:
    user = MagicMock(id=uuid4(), role=UserRole.SUBJECT_OFFICER)
    session = AsyncMock()
    group_id = uuid4()
    cohort = MagicMock()
    cohort.name = "Northern"
    cohort.id = group_id

    file = UploadFile(filename="signed.pdf", file=BytesIO(b"%PDF-1.4"))

    with (
        patch(
            "app.routers.subject_officer_examiner_attendance_sheets.assert_subject_officer_access",
            new_callable=AsyncMock,
        ),
        patch(
            "app.routers.subject_officer_examiner_attendance_sheets._load_cohort_or_404",
            new_callable=AsyncMock,
            return_value=cohort,
        ),
        patch(
            "app.routers.subject_officer_examiner_attendance_sheets.script_packing_today_in_configured_zone",
            return_value=date(2026, 6, 14),
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await upload_examiner_attendance_sheet(
                examination_id=1,
                session=session,
                user=user,
                subject_id=10,
                group_id=group_id,
                attendance_date=date(2026, 6, 15),
                notes=None,
                file=file,
            )

    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_admin_list_returns_items() -> None:
    user = MagicMock(role=UserRole.SUPER_ADMIN)
    session = AsyncMock()

    sheet = MagicMock()
    sheet.id = uuid4()
    sheet.examination_id = 1
    sheet.subject_id = 10
    sheet.subject_marking_group_id = uuid4()
    sheet.attendance_date = date(2026, 6, 14)
    sheet.notes = None
    sheet.original_filename = "Northern MATH301 2026-06-14.pdf"
    sheet.size_bytes = 100
    sheet.uploaded_by_id = uuid4()
    sheet.created_at = datetime.utcnow()

    cohort = MagicMock()
    cohort.name = "Northern"

    subject = MagicMock()
    subject.name = "Mathematics"
    subject.code = "MATH301"
    subject.original_code = "MATH301"

    uploader = MagicMock()
    uploader.full_name = "Officer One"

    count_result = MagicMock()
    count_result.scalar_one.return_value = 1
    list_result = MagicMock()
    list_result.all.return_value = [(sheet, cohort, subject, uploader)]

    session.execute = AsyncMock(side_effect=[count_result, list_result])

    with patch(
        "app.routers.admin_examiner_attendance_sheets.load_examination_or_raise",
        new_callable=AsyncMock,
    ):
        response = await list_admin_examiner_attendance_sheets(
            examination_id=1,
            session=session,
            _user=user,
            subject_id=10,
            group_id=None,
            attendance_date=None,
            q=None,
            page=1,
            page_size=50,
        )

    assert response.total == 1
    assert response.items[0].cohort_name == "Northern"
    assert response.items[0].uploader_full_name == "Officer One"


def test_assert_script_packing_calendar_allowed_blocks_future_date() -> None:
    today = date(2026, 6, 14)
    with pytest.raises(ValueError):
        assert_script_packing_calendar_allowed(date(2026, 6, 15), today)
