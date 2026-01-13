"""Service for generating aggregated invoices for school candidates."""

from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    RegistrationCandidate,
    RegistrationExam,
    School,
    Programme,
    RegistrationType,
)
from app.services.registration_pricing_service import calculate_registration_amount
from app.services.pdf_generator import PdfGenerator, render_html


async def calculate_candidate_amount(
    session: AsyncSession, candidate: RegistrationCandidate
) -> Decimal:
    """
    Calculate total registration amount for a candidate.

    Args:
        session: Database session
        candidate: RegistrationCandidate instance

    Returns:
        Total amount as Decimal
    """
    result = await calculate_registration_amount(session, candidate.id)
    return result["total"]


async def aggregate_candidates_by_examination(
    session: AsyncSession,
    school_id: int,
    exam_id: int,
    registration_type: str,
) -> dict[str, Any]:
    """
    Aggregate candidates by examination and calculate totals.

    Args:
        session: Database session
        school_id: School ID to filter candidates
        exam_id: Exam ID to filter candidates
        registration_type: Registration type ("free_tvet" or "referral")

    Returns:
        Dictionary with exam details, candidate count, and total amount
    """
    # Query exam
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError("Registration exam not found")

    # Query candidates
    candidate_stmt = (
        select(RegistrationCandidate)
        .where(
            and_(
                RegistrationCandidate.school_id == school_id,
                RegistrationCandidate.registration_exam_id == exam_id,
                RegistrationCandidate.registration_type == registration_type,
            )
        )
        .options(
            selectinload(RegistrationCandidate.subject_selections),
            selectinload(RegistrationCandidate.exam),
        )
    )

    candidate_result = await session.execute(candidate_stmt)
    candidates = candidate_result.scalars().all()

    # Calculate totals
    total_amount = Decimal("0")
    for candidate in candidates:
        amount = await calculate_candidate_amount(session, candidate)
        total_amount += amount

    return {
        "exam_id": exam.id,
        "exam_type": exam.exam_type,
        "exam_series": exam.exam_series,
        "year": exam.year,
        "candidate_count": len(candidates),
        "total_amount": total_amount,
    }


async def aggregate_candidates_by_examination_and_programme(
    session: AsyncSession,
    school_id: int,
    exam_id: int,
    registration_type: str,
) -> dict[str, Any]:
    """
    Aggregate candidates by examination and programme, calculating totals per programme.

    Args:
        session: Database session
        school_id: School ID to filter candidates
        exam_id: Exam ID to filter candidates
        registration_type: Registration type ("free_tvet" or "referral")

    Returns:
        Dictionary with exam details, total candidate count, total amount, and programme breakdown
    """
    # Query exam
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError("Registration exam not found")

    # Query candidates with programme
    candidate_stmt = (
        select(RegistrationCandidate)
        .where(
            and_(
                RegistrationCandidate.school_id == school_id,
                RegistrationCandidate.registration_exam_id == exam_id,
                RegistrationCandidate.registration_type == registration_type,
            )
        )
        .options(
            selectinload(RegistrationCandidate.subject_selections),
            selectinload(RegistrationCandidate.exam),
            selectinload(RegistrationCandidate.programme),
        )
    )

    candidate_result = await session.execute(candidate_stmt)
    candidates = candidate_result.scalars().all()

    # Group by programme
    programme_totals: dict[int, dict[str, Any]] = defaultdict(
        lambda: {"candidates": [], "total_amount": Decimal("0"), "programme": None}
    )

    for candidate in candidates:
        programme_id = candidate.programme_id if candidate.programme_id else 0
        programme_totals[programme_id]["candidates"].append(candidate)
        programme_totals[programme_id]["programme"] = candidate.programme

    # Calculate amounts per programme
    programme_items = []
    grand_total = Decimal("0")

    for programme_id, data in programme_totals.items():
        programme = data["programme"]
        programme_amount = Decimal("0")

        for candidate in data["candidates"]:
            amount = await calculate_candidate_amount(session, candidate)
            programme_amount += amount

        grand_total += programme_amount

        if programme:
            programme_items.append(
                {
                    "programme_id": programme.id,
                    "programme_code": programme.code,
                    "programme_name": programme.name,
                    "candidate_count": len(data["candidates"]),
                    "total_amount": programme_amount,
                }
            )
        else:
            # Candidates without programme
            programme_items.append(
                {
                    "programme_id": 0,
                    "programme_code": "N/A",
                    "programme_name": "No Programme",
                    "candidate_count": len(data["candidates"]),
                    "total_amount": programme_amount,
                }
            )

    # Sort by programme code
    programme_items.sort(key=lambda x: x["programme_code"])

    return {
        "exam_id": exam.id,
        "exam_type": exam.exam_type,
        "exam_series": exam.exam_series,
        "year": exam.year,
        "candidate_count": len(candidates),
        "total_amount": grand_total,
        "programmes": programme_items,
    }


async def generate_school_invoice_pdf(
    session: AsyncSession,
    school_id: int,
    exam_id: int,
    registration_type: str,
    group_by_programme: bool = False,
) -> bytes:
    """
    Generate PDF invoice for school candidates.

    Args:
        session: Database session
        school_id: School ID
        exam_id: Exam ID
        registration_type: Registration type ("free_tvet" or "referral")
        group_by_programme: Whether to group by programme

    Returns:
        PDF file as bytes
    """
    # Get school
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise ValueError("School not found")

    # Get aggregated data
    if group_by_programme:
        invoice_data = await aggregate_candidates_by_examination_and_programme(
            session, school_id, exam_id, registration_type
        )
    else:
        invoice_data = await aggregate_candidates_by_examination(
            session, school_id, exam_id, registration_type
        )

    # Prepare template context
    # Convert programme amounts to float for template
    programmes = []
    if "programmes" in invoice_data:
        for prog in invoice_data["programmes"]:
            programmes.append({
                "programme_id": prog["programme_id"],
                "programme_code": prog["programme_code"],
                "programme_name": prog["programme_name"],
                "candidate_count": prog["candidate_count"],
                "total_amount": float(prog["total_amount"]),
            })

    context = {
        "school": {
            "id": school.id,
            "code": school.code,
            "name": school.name,
        },
        "exam": {
            "id": invoice_data["exam_id"],
            "type": invoice_data["exam_type"],
            "series": invoice_data["exam_series"],
            "year": invoice_data["year"],
        },
        "registration_type": registration_type,
        "candidate_count": invoice_data["candidate_count"],
        "total_amount": float(invoice_data["total_amount"]),
        "programmes": programmes,
        "group_by_programme": group_by_programme,
        "generated_at": datetime.utcnow(),
    }

    # Render the HTML template
    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(
        context, "invoices/school_aggregated_invoice.html", templates_dir
    )

    # Get absolute path to app directory for base_url (so images can be resolved)
    app_dir = Path(__file__).parent.parent.resolve()
    base_url = str(app_dir)

    # Generate PDF using PdfGenerator
    pdf_gen = PdfGenerator(
        main_html=main_html,
        header_html=None,
        footer_html=None,
        base_url=base_url,
        side_margin=1.5,
        extra_vertical_margin=20,
    )

    pdf_bytes = pdf_gen.render_pdf()
    return pdf_bytes


async def aggregate_candidates_by_school(
    session: AsyncSession,
    exam_id: int,
    registration_type: str,
) -> dict[str, Any]:
    """
    Aggregate candidates by school for an examination.

    Args:
        session: Database session
        exam_id: Exam ID to filter candidates
        registration_type: Registration type ("free_tvet" or "referral")

    Returns:
        Dictionary with exam details, list of schools with their totals, and grand totals
    """
    # Query exam
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError("Registration exam not found")

    # Query candidates with school
    candidate_stmt = (
        select(RegistrationCandidate)
        .where(
            and_(
                RegistrationCandidate.registration_exam_id == exam_id,
                RegistrationCandidate.registration_type == registration_type,
                RegistrationCandidate.school_id.isnot(None),  # Only candidates with schools
            )
        )
        .options(
            selectinload(RegistrationCandidate.subject_selections),
            selectinload(RegistrationCandidate.exam),
            selectinload(RegistrationCandidate.school),
        )
    )

    candidate_result = await session.execute(candidate_stmt)
    candidates = candidate_result.scalars().all()

    # Group by school
    school_totals: dict[int, dict[str, Any]] = defaultdict(
        lambda: {"candidates": [], "total_amount": Decimal("0"), "school": None}
    )

    for candidate in candidates:
        if candidate.school_id:
            school_totals[candidate.school_id]["candidates"].append(candidate)
            school_totals[candidate.school_id]["school"] = candidate.school

    # Calculate amounts per school
    school_items = []
    grand_total = Decimal("0")
    grand_candidate_count = 0

    for school_id, data in school_totals.items():
        school = data["school"]
        school_amount = Decimal("0")

        for candidate in data["candidates"]:
            amount = await calculate_candidate_amount(session, candidate)
            school_amount += amount

        grand_total += school_amount
        grand_candidate_count += len(data["candidates"])

        if school:
            school_items.append(
                {
                    "school_id": school.id,
                    "school_code": school.code,
                    "school_name": school.name,
                    "candidate_count": len(data["candidates"]),
                    "total_amount": school_amount,
                }
            )

    # Sort by school code
    school_items.sort(key=lambda x: x["school_code"])

    return {
        "exam_id": exam.id,
        "exam_type": exam.exam_type,
        "exam_series": exam.exam_series,
        "year": exam.year,
        "schools": school_items,
        "total_candidate_count": grand_candidate_count,
        "total_amount": grand_total,
    }


async def generate_admin_invoice_pdf(
    session: AsyncSession,
    exam_id: int,
    registration_type: str,
    school_id: int | None = None,
) -> bytes:
    """
    Generate PDF invoice for admin (per-school or summary).

    Args:
        session: Database session
        exam_id: Exam ID
        registration_type: Registration type ("free_tvet" or "referral")
        school_id: Optional school ID for per-school invoice. If None, generates summary for all schools.

    Returns:
        PDF file as bytes
    """
    # Get exam
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError("Registration exam not found")

    if school_id:
        # Per-school invoice
        invoice_data = await aggregate_candidates_by_examination(
            session, school_id, exam_id, registration_type
        )

        # Get school
        school_stmt = select(School).where(School.id == school_id)
        school_result = await session.execute(school_stmt)
        school = school_result.scalar_one_or_none()
        if not school:
            raise ValueError("School not found")

        context = {
            "school": {
                "id": school.id,
                "code": school.code,
                "name": school.name,
            },
            "exam": {
                "id": invoice_data["exam_id"],
                "type": invoice_data["exam_type"],
                "series": invoice_data["exam_series"],
                "year": invoice_data["year"],
            },
            "registration_type": registration_type,
            "candidate_count": invoice_data["candidate_count"],
            "total_amount": float(invoice_data["total_amount"]),
            "programmes": [],
            "group_by_programme": False,
            "is_summary": False,
            "generated_at": datetime.utcnow(),
        }
    else:
        # Summary invoice for all schools
        summary_data = await aggregate_candidates_by_school(
            session, exam_id, registration_type
        )

        # Convert school amounts to float for template
        schools = []
        for school in summary_data["schools"]:
            schools.append({
                "school_id": school["school_id"],
                "school_code": school["school_code"],
                "school_name": school["school_name"],
                "candidate_count": school["candidate_count"],
                "total_amount": float(school["total_amount"]),
            })

        context = {
            "school": None,
            "exam": {
                "id": summary_data["exam_id"],
                "type": summary_data["exam_type"],
                "series": summary_data["exam_series"],
                "year": summary_data["year"],
            },
            "registration_type": registration_type,
            "candidate_count": summary_data["total_candidate_count"],
            "total_amount": float(summary_data["total_amount"]),
            "schools": schools,
            "is_summary": True,
            "generated_at": datetime.utcnow(),
        }

    # Render the HTML template
    templates_dir = Path(__file__).parent.parent / "templates"
    template_name = "invoices/admin_summary_invoice.html" if not school_id else "invoices/school_aggregated_invoice.html"
    main_html = render_html(context, template_name, templates_dir)

    # Get absolute path to app directory for base_url (so images can be resolved)
    app_dir = Path(__file__).parent.parent.resolve()
    base_url = str(app_dir)

    # Generate PDF using PdfGenerator
    pdf_gen = PdfGenerator(
        main_html=main_html,
        header_html=None,
        footer_html=None,
        base_url=base_url,
        side_margin=1.5,
        extra_vertical_margin=20,
    )

    pdf_bytes = pdf_gen.render_pdf()
    return pdf_bytes
