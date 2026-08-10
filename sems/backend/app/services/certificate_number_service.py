"""Certificate number allocation."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CertificateIssuance, Exam, ExamSeries, School


def series_code(series: ExamSeries) -> str:
    if series == ExamSeries.MAY_JUNE:
        return "MJ"
    return "ND"


def certificate_number_prefix(exam: Exam, school: School) -> str:
    return f"{exam.year}{series_code(exam.series)}-{school.code}-"


async def allocate_certificate_number(
    session: AsyncSession,
    exam: Exam,
    school: School,
) -> str:
    """
    Allocate next unique certificate number for school+exam diet.

    Format: {year}{MJ|ND}-{school_code}-{seq:05d}
    """
    prefix = certificate_number_prefix(exam, school)
    stmt = select(func.count(CertificateIssuance.id)).where(
        CertificateIssuance.certificate_number.like(f"{prefix}%")
    )
    count = (await session.execute(stmt)).scalar() or 0
    # Also check max numeric suffix to avoid reuse after voids
    existing_stmt = select(CertificateIssuance.certificate_number).where(
        CertificateIssuance.certificate_number.like(f"{prefix}%")
    )
    existing = (await session.execute(existing_stmt)).scalars().all()
    max_seq = 0
    for number in existing:
        suffix = number[len(prefix) :]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    next_seq = max(count, max_seq) + 1
    return f"{prefix}{next_seq:05d}"
