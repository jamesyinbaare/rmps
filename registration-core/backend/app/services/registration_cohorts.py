"""SQLAlchemy filters separating school-mediated vs private candidate cohorts."""

from __future__ import annotations

from sqlalchemy import or_

from app.models import ExamKind, RegistrationCandidate, RegistrationExam, RegistrationType


def school_mediated_type_filter():
    """fee_paying, free_tvet, referral, or null (legacy school rows)."""
    return or_(
        RegistrationCandidate.registration_type.in_(
            [
                RegistrationType.FEE_PAYING,
                RegistrationType.FREE_TVET,
                RegistrationType.REFERRAL,
            ]
        ),
        RegistrationCandidate.registration_type.is_(None),
    )


def private_type_filter():
    return RegistrationCandidate.registration_type == RegistrationType.PRIVATE


def candidate_type_filter_for_exam(exam: RegistrationExam):
    """Filter candidates so school exams never mix with private rows and vice versa."""
    kind = exam.exam_kind
    if isinstance(kind, str):
        is_private = kind == ExamKind.PRIVATE.value
    else:
        is_private = kind == ExamKind.PRIVATE
    return private_type_filter() if is_private else school_mediated_type_filter()
