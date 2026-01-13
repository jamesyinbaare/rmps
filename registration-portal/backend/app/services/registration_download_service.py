"""Service for generating registration summary and detailed PDFs."""
import base64
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    RegistrationCandidate,
    RegistrationCandidatePhoto,
    RegistrationSubjectSelection,
    School,
    RegistrationExam,
    Programme,
    Subject,
    SubjectType,
)
from app.services.pdf_generator import PdfGenerator, render_html
from app.services.photo_storage import PhotoStorageService


def encode_photo_to_base64(photo_data: bytes) -> str | None:
    """
    Encode photo bytes to base64 data URI.

    Args:
        photo_data: Photo file content as bytes

    Returns:
        Base64 data URI string or None if encoding fails
    """
    try:
        photo_base64 = base64.b64encode(photo_data).decode("utf-8")
        # Detect image format and add appropriate data URI prefix
        if photo_data[:2] == b'\xff\xd8':
            return f"data:image/jpeg;base64,{photo_base64}"
        elif photo_data[:8] == b'\x89PNG\r\n\x1a\n':
            return f"data:image/png;base64,{photo_base64}"
        else:
            # Default to JPEG
            return f"data:image/jpeg;base64,{photo_base64}"
    except Exception:
        return None


async def generate_registration_summary_pdf(
    session: AsyncSession,
    exam_id: int,
    school_id: int,
    programme_id: int | None = None,
) -> bytes:
    """
    Generate summary PDF with candidates grouped by programme.

    Args:
        session: Database session
        exam_id: Registration exam ID
        school_id: School ID to filter candidates
        programme_id: Optional programme ID to filter candidates

    Returns:
        PDF file as bytes
    """
    # Query exam
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError("Registration exam not found")

    # Query school
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise ValueError("School not found")

    # Query candidates
    candidate_stmt = (
        select(RegistrationCandidate)
        .where(
            RegistrationCandidate.registration_exam_id == exam_id,
            RegistrationCandidate.school_id == school_id,
        )
        .options(selectinload(RegistrationCandidate.programme))
    )

    if programme_id:
        candidate_stmt = candidate_stmt.where(RegistrationCandidate.programme_id == programme_id)

    candidate_result = await session.execute(candidate_stmt)
    candidates = candidate_result.scalars().all()

    # Group candidates by programme
    candidates_by_programme: dict[str, list[dict[str, Any]]] = defaultdict(list)

    photo_service = PhotoStorageService()

    for candidate in candidates:
        # Get photo
        photo_base64 = None
        photo_stmt = select(RegistrationCandidatePhoto).where(
            RegistrationCandidatePhoto.registration_candidate_id == candidate.id
        )
        photo_result = await session.execute(photo_stmt)
        photo = photo_result.scalar_one_or_none()
        if photo:
            try:
                photo_data = await photo_service.retrieve(photo.file_path)
                photo_base64 = encode_photo_to_base64(photo_data)
            except Exception:
                pass

        programme_name = "Unknown"
        if candidate.programme:
            programme_name = candidate.programme.name
        elif candidate.programme_code:
            programme_name = candidate.programme_code

        candidates_by_programme[programme_name].append({
            "id": candidate.id,
            "name": candidate.name,
            "registration_number": candidate.registration_number,
            "index_number": candidate.index_number,
            "photo_base64": photo_base64,
            "programme_name": programme_name,
        })

    # Sort programmes alphabetically
    sorted_programmes = sorted(candidates_by_programme.keys())

    # Prepare template context
    context = {
        "exam": exam,
        "school": school,
        "programmes_data": [
            {
                "programme_name": programme_name,
                "candidates": candidates_by_programme[programme_name],
            }
            for programme_name in sorted_programmes
        ],
        "total_candidates": len(candidates),
        "generated_at": datetime.utcnow(),
    }

    # Render the HTML template
    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "registration-downloads/summary.html", templates_dir)

    # Get absolute path to app directory for base_url
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


async def generate_registration_detailed_pdf(
    session: AsyncSession,
    exam_id: int,
    school_id: int,
    programme_id: int | None = None,
) -> bytes:
    """
    Generate detailed PDF with one candidate per page.

    Args:
        session: Database session
        exam_id: Registration exam ID
        school_id: School ID to filter candidates
        programme_id: Optional programme ID to filter candidates

    Returns:
        PDF file as bytes
    """
    # Query exam
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise ValueError("Registration exam not found")

    # Query school
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise ValueError("School not found")

    # Query candidates with relationships
    candidate_stmt = (
        select(RegistrationCandidate)
        .where(
            RegistrationCandidate.registration_exam_id == exam_id,
            RegistrationCandidate.school_id == school_id,
        )
        .options(
            selectinload(RegistrationCandidate.programme),
            selectinload(RegistrationCandidate.subject_selections).selectinload(RegistrationSubjectSelection.subject),
        )
    )

    if programme_id:
        candidate_stmt = candidate_stmt.where(RegistrationCandidate.programme_id == programme_id)

    candidate_stmt = candidate_stmt.order_by(RegistrationCandidate.name)
    candidate_result = await session.execute(candidate_stmt)
    candidates = candidate_result.scalars().all()

    photo_service = PhotoStorageService()
    candidates_data = []

    for candidate in candidates:
        # Get photo
        photo_base64 = None
        photo_stmt = select(RegistrationCandidatePhoto).where(
            RegistrationCandidatePhoto.registration_candidate_id == candidate.id
        )
        photo_result = await session.execute(photo_stmt)
        photo = photo_result.scalar_one_or_none()
        if photo:
            try:
                photo_data = await photo_service.retrieve(photo.file_path)
                photo_base64 = encode_photo_to_base64(photo_data)
            except Exception:
                pass

        # Get subject selections with subject information
        core_subjects = []
        elective_subjects = []

        for sel in (candidate.subject_selections or []):
            # Use original_code if available, otherwise use code
            subject_code = sel.subject_code
            if sel.subject and sel.subject.original_code:
                subject_code = sel.subject.original_code

            subject_data = {
                "subject_code": subject_code,
                "subject_name": sel.subject_name,
            }

            # Group by subject type
            if sel.subject and sel.subject.subject_type == SubjectType.CORE:
                core_subjects.append(subject_data)
            elif sel.subject and sel.subject.subject_type == SubjectType.ELECTIVE:
                elective_subjects.append(subject_data)
            else:
                # Fallback: if subject not loaded, default to elective
                elective_subjects.append(subject_data)

        # Sort subjects by code
        core_subjects.sort(key=lambda x: x["subject_code"])
        elective_subjects.sort(key=lambda x: x["subject_code"])

        programme_name = "Unknown"
        if candidate.programme:
            programme_name = candidate.programme.name
        elif candidate.programme_code:
            programme_name = candidate.programme_code

        candidates_data.append({
            "candidate": candidate,
            "photo_base64": photo_base64,
            "programme_name": programme_name,
            "core_subjects": core_subjects,
            "elective_subjects": elective_subjects,
        })

    # Prepare template context
    context = {
        "exam": exam,
        "school": school,
        "candidates_data": candidates_data,
        "total_candidates": len(candidates_data),
        "generated_at": datetime.utcnow(),
    }

    # Render the HTML template
    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "registration-downloads/detailed.html", templates_dir)

    # Get absolute path to app directory for base_url
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
