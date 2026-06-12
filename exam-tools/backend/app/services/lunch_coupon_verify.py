"""Subject-officer lunch coupon verification by examiner reference code."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Examiner, ExaminerSubject, Examination, LunchCouponVerification
from app.services.exam_official_export import examination_label
from app.services.examiner_invitation import _examiner_type_label
from app.services.examiner_qr_payload import parse_examiner_qr_scan


def _subject_codes_for_overlap(examiner: Examiner, overlap: set[int]) -> list[str]:
    subject_codes: list[str] = []
    for es in examiner.subjects:
        if int(es.subject_id) not in overlap:
            continue
        subject = es.subject
        if subject is None:
            continue
        orig = (subject.original_code or "").strip()
        subject_codes.append(orig if orig else subject.code)
    subject_codes.sort()
    return subject_codes


def _examiner_payload(
    examiner: Examiner,
    overlap: set[int],
    *,
    examination_id: int | None = None,
    examination_name: str | None = None,
) -> dict:
    payload = {
        "valid": True,
        "reference_code": examiner.reference_code,
        "name": examiner.name,
        "examiner_type": examiner.examiner_type.value,
        "examiner_type_label": _examiner_type_label(examiner.examiner_type),
        "region": examiner.region.value,
        "subject_codes": _subject_codes_for_overlap(examiner, overlap),
        "examiner_id": examiner.id,
    }
    if examination_id is not None:
        payload["examination_id"] = examination_id
    if examination_name is not None:
        payload["examination_name"] = examination_name
    return payload


def _single_subject_id(examiner: Examiner) -> int | None:
    subject_ids = [int(es.subject_id) for es in examiner.subjects]
    if len(subject_ids) != 1:
        return None
    return subject_ids[0]


async def resolve_examiner_for_scan(
    session: AsyncSession,
    reference_code: str,
    *,
    examination_ids: Sequence[int],
    officer_subject_ids_by_exam: dict[int, set[int]] | None,
) -> tuple[Examiner, int, int] | None:
    code = reference_code.strip().upper()
    if not code or not examination_ids:
        return None

    stmt = (
        select(Examiner)
        .where(
            Examiner.reference_code == code,
            Examiner.examination_id.in_(list(examination_ids)),
        )
        .options(
            selectinload(Examiner.subjects).selectinload(ExaminerSubject.subject),
            selectinload(Examiner.examination),
        )
    )
    candidates = list((await session.execute(stmt)).scalars().all())
    if not candidates:
        return None

    valid: list[tuple[Examiner, int, int, datetime]] = []
    for examiner in candidates:
        subject_id = _single_subject_id(examiner)
        if subject_id is None:
            continue
        exam_id = int(examiner.examination_id)
        if officer_subject_ids_by_exam is not None:
            officer_subjects = officer_subject_ids_by_exam.get(exam_id, set())
            if subject_id not in officer_subjects:
                continue
        exam = examiner.examination
        created_at = exam.created_at if exam is not None else datetime.min
        valid.append((examiner, exam_id, subject_id, created_at))

    if not valid:
        return None
    if len(valid) == 1:
        examiner, exam_id, subject_id, _ = valid[0]
        return examiner, exam_id, subject_id

    valid.sort(key=lambda row: row[3], reverse=True)
    examiner, exam_id, subject_id, _ = valid[0]
    return examiner, exam_id, subject_id


async def _resolve_examiner_direct(
    session: AsyncSession,
    *,
    examination_id: int,
    reference_code: str,
    examination_ids: Sequence[int],
    officer_subject_ids_by_exam: dict[int, set[int]] | None,
) -> tuple[Examiner, int, int] | None:
    if officer_subject_ids_by_exam is not None and int(examination_id) not in set(examination_ids):
        return None

    examiner = await _load_examiner_for_code(
        session,
        examination_id=int(examination_id),
        reference_code=reference_code,
    )
    if examiner is None:
        return None

    subject_id = _single_subject_id(examiner)
    if subject_id is None:
        return None

    if officer_subject_ids_by_exam is not None:
        officer_subjects = officer_subject_ids_by_exam.get(int(examination_id), set())
        if subject_id not in officer_subjects:
            return None

    return examiner, int(examination_id), subject_id


async def resolve_examiner_for_scan_payload(
    session: AsyncSession,
    raw_scan: str,
    *,
    examination_ids: Sequence[int],
    officer_subject_ids_by_exam: dict[int, set[int]] | None,
) -> tuple[Examiner, int, int] | None:
    examination_id, reference_code = parse_examiner_qr_scan(raw_scan)
    if not reference_code:
        return None

    if examination_id is not None:
        return await _resolve_examiner_direct(
            session,
            examination_id=examination_id,
            reference_code=reference_code,
            examination_ids=examination_ids,
            officer_subject_ids_by_exam=officer_subject_ids_by_exam,
        )

    return await resolve_examiner_for_scan(
        session,
        reference_code,
        examination_ids=examination_ids,
        officer_subject_ids_by_exam=officer_subject_ids_by_exam,
    )


async def _load_examiner_for_code(
    session: AsyncSession,
    *,
    examination_id: int,
    reference_code: str,
) -> Examiner | None:
    code = reference_code.strip().upper()
    if not code:
        return None

    stmt = (
        select(Examiner)
        .where(
            Examiner.examination_id == examination_id,
            Examiner.reference_code == code,
        )
        .options(selectinload(Examiner.subjects).selectinload(ExaminerSubject.subject))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def verify_lunch_coupon(
    session: AsyncSession,
    *,
    examination_id: int,
    officer_subject_ids: set[int],
    reference_code: str,
) -> dict:
    code = reference_code.strip().upper()
    if not code:
        return {"valid": False, "message": "Reference code is required."}

    examiner = await _load_examiner_for_code(
        session,
        examination_id=examination_id,
        reference_code=code,
    )
    if examiner is None:
        return {
            "valid": False,
            "message": "No examiner with this code on this examination.",
        }

    examiner_subject_ids = {int(es.subject_id) for es in examiner.subjects}
    overlap = examiner_subject_ids & officer_subject_ids
    if not overlap:
        return {"valid": False, "message": "Examiner is not on your subject roster."}

    exam = await session.get(Examination, examination_id)
    exam_name = examination_label(exam) if exam is not None else None
    return _examiner_payload(
        examiner,
        overlap,
        examination_id=examination_id,
        examination_name=exam_name,
    )


async def verify_and_record_lunch_coupon_scan(
    session: AsyncSession,
    *,
    examination_ids: Sequence[int],
    officer_subject_ids_by_exam: dict[int, set[int]] | None,
    reference_code: str,
    verified_by_id: UUID,
) -> dict:
    _, parsed_code = parse_examiner_qr_scan(reference_code)
    if not parsed_code:
        return {"valid": False, "message": "Reference code is required."}

    resolved = await resolve_examiner_for_scan_payload(
        session,
        reference_code,
        examination_ids=examination_ids,
        officer_subject_ids_by_exam=officer_subject_ids_by_exam,
    )
    if resolved is None:
        return {
            "valid": False,
            "message": "No examiner with this code on your roster.",
        }

    examiner, examination_id, subject_id = resolved
    officer_subject_ids = (
        officer_subject_ids_by_exam.get(examination_id, set())
        if officer_subject_ids_by_exam is not None
        else {subject_id}
    )
    return await verify_and_record_lunch_coupon(
        session,
        examination_id=examination_id,
        officer_subject_ids=officer_subject_ids,
        reference_code=parsed_code,
        verified_by_id=verified_by_id,
    )


async def _load_existing_verification(
    session: AsyncSession,
    *,
    examination_id: int,
    examiner_id: UUID,
) -> LunchCouponVerification | None:
    stmt = (
        select(LunchCouponVerification)
        .where(
            LunchCouponVerification.examination_id == examination_id,
            LunchCouponVerification.examiner_id == examiner_id,
        )
        .options(selectinload(LunchCouponVerification.verified_by))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def _already_verified_message(*, verified_at: datetime, verified_by_name: str | None) -> str:
    stamp = verified_at.strftime("%d %b %Y, %H:%M UTC")
    if verified_by_name:
        return f"This examiner was already verified on {stamp} by {verified_by_name}."
    return f"This examiner was already verified on {stamp}."


async def verify_and_record_lunch_coupon(
    session: AsyncSession,
    *,
    examination_id: int,
    officer_subject_ids: set[int],
    reference_code: str,
    verified_by_id: UUID,
) -> dict:
    result = await verify_lunch_coupon(
        session,
        examination_id=examination_id,
        officer_subject_ids=officer_subject_ids,
        reference_code=reference_code,
    )
    if not result.get("valid"):
        return result

    examiner_id = result["examiner_id"]
    existing = await _load_existing_verification(
        session,
        examination_id=examination_id,
        examiner_id=examiner_id,
    )

    if existing is not None:
        verified_by = existing.verified_by
        verified_by_name = verified_by.full_name if verified_by else None
        return {
            **result,
            "valid": False,
            "already_verified": True,
            "verified_at": existing.verified_at,
            "verified_by_name": verified_by_name,
            "recorded": False,
            "message": _already_verified_message(
                verified_at=existing.verified_at,
                verified_by_name=verified_by_name,
            ),
        }

    now = datetime.utcnow()
    session.add(
        LunchCouponVerification(
            examination_id=examination_id,
            examiner_id=examiner_id,
            reference_code=result["reference_code"],
            verified_by_id=verified_by_id,
            verified_at=now,
        )
    )
    await session.flush()

    return {
        **result,
        "already_verified": False,
        "verified_at": now,
        "recorded": True,
    }


async def list_lunch_coupon_verifications(
    session: AsyncSession,
    *,
    examination_id: int,
    officer_subject_ids: set[int],
) -> list[dict]:
    stmt = (
        select(LunchCouponVerification)
        .join(Examiner, LunchCouponVerification.examiner_id == Examiner.id)
        .join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id)
        .where(
            LunchCouponVerification.examination_id == examination_id,
            ExaminerSubject.subject_id.in_(officer_subject_ids),
        )
        .options(
            selectinload(LunchCouponVerification.examiner).selectinload(Examiner.subjects).selectinload(
                ExaminerSubject.subject
            ),
            selectinload(LunchCouponVerification.verified_by),
        )
        .distinct()
        .order_by(LunchCouponVerification.verified_at.desc())
    )
    rows = (await session.execute(stmt)).scalars().all()

    items: list[dict] = []
    for row in rows:
        examiner = row.examiner
        if examiner is None:
            continue
        overlap = {int(es.subject_id) for es in examiner.subjects} & officer_subject_ids
        verified_by = row.verified_by
        items.append(
            {
                "examiner_id": examiner.id,
                "reference_code": row.reference_code,
                "name": examiner.name,
                "examiner_type_label": _examiner_type_label(examiner.examiner_type),
                "region": examiner.region.value,
                "subject_codes": _subject_codes_for_overlap(examiner, overlap),
                "verified_at": row.verified_at,
                "verified_by_name": verified_by.full_name if verified_by else None,
            }
        )
    return items


async def list_lunch_coupon_verifications_all(
    session: AsyncSession,
    *,
    examination_ids: Sequence[int],
    officer_subject_ids_by_exam: dict[int, set[int]],
) -> list[dict]:
    items: list[dict] = []
    for examination_id in examination_ids:
        officer_subject_ids = officer_subject_ids_by_exam.get(int(examination_id), set())
        if not officer_subject_ids:
            continue
        exam = await session.get(Examination, examination_id)
        exam_name = examination_label(exam) if exam is not None else f"Examination {examination_id}"
        rows = await list_lunch_coupon_verifications(
            session,
            examination_id=int(examination_id),
            officer_subject_ids=officer_subject_ids,
        )
        for row in rows:
            items.append({**row, "examination_id": int(examination_id), "examination_name": exam_name})
    items.sort(key=lambda row: row["verified_at"], reverse=True)
    return items
