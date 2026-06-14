"""Configured appointment letter reference numbers (per exam, subject, role)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExaminationExaminerAppointmentLetterReference, ExaminerType, Subject, SubjectType
from app.services.examiner_compensation import examiner_type_from_api_label


def appointment_reference_number_fallback(*, examination_id: int, subject_code: str, entity_id: UUID) -> str:
    code = (subject_code or "SUBJ").replace(" ", "").upper()
    short_id = str(entity_id).replace("-", "").upper()[:8]
    return f"CTVET/EXM/{examination_id}/{code}/{short_id}"


async def load_configured_appointment_letter_reference(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_type: ExaminerType,
) -> str | None:
    row = (
        await session.execute(
            select(ExaminationExaminerAppointmentLetterReference.reference_number).where(
                ExaminationExaminerAppointmentLetterReference.examination_id == examination_id,
                ExaminationExaminerAppointmentLetterReference.subject_id == subject_id,
                ExaminationExaminerAppointmentLetterReference.examiner_type == examiner_type,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    trimmed = str(row).strip()
    return trimmed or None


async def resolve_appointment_letter_reference_number(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_type: ExaminerType,
    subject_code: str,
    entity_id: UUID,
) -> str:
    configured = await load_configured_appointment_letter_reference(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_type=examiner_type,
    )
    if configured:
        return configured
    return appointment_reference_number_fallback(
        examination_id=examination_id,
        subject_code=subject_code,
        entity_id=entity_id,
    )


def parse_examiner_type_value(raw: str) -> ExaminerType:
    return examiner_type_from_api_label(raw)
