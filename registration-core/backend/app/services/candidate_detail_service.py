"""Shared candidate detail serialization and mutations for school + admin portals."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Programme,
    RegistrationCandidate,
    RegistrationCandidatePhoto,
    RegistrationExam,
    RegistrationSubjectSelection,
    Subject,
)
from app.schemas.registration import (
    RegistrationCandidatePhotoResponse,
    RegistrationCandidateResponse,
    RegistrationCandidateUpdate,
)
from app.services.duplicate_detection import clear_not_duplicate_marks_for_candidate
from app.services.completion_confirmation_service import assert_registration_editable
from app.services.late_registration_service import is_registration_open_for_school
from app.services.mediapipe_photo_validation import replace_background
from app.services.photo_storage import PhotoStorageService, calculate_checksum
from app.services.photo_validation import PhotoValidationService
from app.services.registration_completeness import recompute_registration_status
from app.services.school_fee_invoice_service import sync_fee_payment_status_from_outstanding
from app.services.subject_selection import validate_subject_selections

logger = logging.getLogger(__name__)
photo_storage_service = PhotoStorageService()


def get_enum_value(enum_or_string: Any) -> Any:
    """Safely extract value from enum or return string if already a string."""
    if enum_or_string is None:
        return None
    if hasattr(enum_or_string, "value"):
        return enum_or_string.value
    return enum_or_string


def subject_selection_dict(sel: RegistrationSubjectSelection) -> dict[str, Any]:
    """Serialize a subject selection including optional subject_type from related Subject."""
    subject_type = None
    if sel.subject is not None:
        subject_type = get_enum_value(sel.subject.subject_type)
    return {
        "id": sel.id,
        "subject_id": sel.subject_id,
        "subject_code": sel.subject_code,
        "subject_name": sel.subject_name,
        "series": sel.series,
        "created_at": sel.created_at,
        "subject_type": subject_type,
    }


def candidate_to_response_dict(
    candidate: RegistrationCandidate,
    *,
    include_exam: bool = False,
) -> dict[str, Any]:
    """Build a RegistrationCandidateResponse-compatible dict."""
    exam_response = None
    if include_exam and candidate.exam and candidate.exam.registration_period:
        period = candidate.exam.registration_period
        exam_response = {
            "id": candidate.exam.id,
            "exam_id_main_system": candidate.exam.exam_id_main_system,
            "exam_type": candidate.exam.exam_type,
            "exam_series": candidate.exam.exam_series,
            "year": candidate.exam.year,
            "description": candidate.exam.description,
            "exam_kind": (
                candidate.exam.exam_kind.value
                if hasattr(candidate.exam.exam_kind, "value")
                else str(candidate.exam.exam_kind)
            ),
            "allows_referral_registration": bool(candidate.exam.allows_referral_registration),
            "registration_period": {
                "id": period.id,
                "registration_start_date": period.registration_start_date,
                "registration_end_date": period.registration_end_date,
                "is_active": period.is_active,
                "allows_bulk_registration": period.allows_bulk_registration,
                "allows_private_registration": period.allows_private_registration,
                "created_at": period.created_at,
                "updated_at": period.updated_at,
            },
            "created_at": candidate.exam.created_at,
            "updated_at": candidate.exam.updated_at,
        }

    payload: dict[str, Any] = {
        "id": candidate.id,
        "registration_exam_id": candidate.registration_exam_id,
        "school_id": candidate.school_id,
        "firstname": candidate.firstname,
        "lastname": candidate.lastname,
        "othername": candidate.othername,
        "name": candidate.name,
        "fullname": candidate.fullname,
        "registration_number": candidate.registration_number,
        "index_number": candidate.index_number,
        "date_of_birth": candidate.date_of_birth,
        "gender": candidate.gender,
        "programme_code": candidate.programme_code,
        "programme_id": candidate.programme_id,
        "contact_email": candidate.contact_email,
        "contact_phone": candidate.contact_phone,
        "address": candidate.address,
        "national_id": candidate.national_id,
        "disability": get_enum_value(candidate.disability),
        "registration_type": get_enum_value(candidate.registration_type),
        "guardian_name": candidate.guardian_name,
        "guardian_phone": candidate.guardian_phone,
        "guardian_digital_address": candidate.guardian_digital_address,
        "guardian_national_id": candidate.guardian_national_id,
        "registration_status": candidate.registration_status,
        "fee_payment_status": get_enum_value(candidate.fee_payment_status),
        "fee_paid_at": candidate.fee_paid_at,
        "fee_paid_by_user_id": (
            str(candidate.fee_paid_by_user_id) if candidate.fee_paid_by_user_id else None
        ),
        "registration_date": candidate.registration_date,
        "subject_selections": [
            subject_selection_dict(sel) for sel in (candidate.subject_selections or [])
        ],
        "created_at": candidate.created_at,
        "updated_at": candidate.updated_at,
    }
    if include_exam:
        payload["exam"] = exam_response
    return payload


def candidate_to_response(
    candidate: RegistrationCandidate,
    *,
    include_exam: bool = False,
) -> RegistrationCandidateResponse:
    return RegistrationCandidateResponse.model_validate(
        candidate_to_response_dict(candidate, include_exam=include_exam)
    )


async def load_candidate_for_detail(
    session: AsyncSession,
    candidate_id: int,
) -> RegistrationCandidate | None:
    result = await session.execute(
        select(RegistrationCandidate)
        .where(RegistrationCandidate.id == candidate_id)
        .options(
            selectinload(RegistrationCandidate.subject_selections).selectinload(
                RegistrationSubjectSelection.subject
            ),
            selectinload(RegistrationCandidate.exam).selectinload(
                RegistrationExam.registration_period
            ),
        )
    )
    return result.scalar_one_or_none()


async def apply_candidate_update(
    session: AsyncSession,
    candidate: RegistrationCandidate,
    candidate_update: RegistrationCandidateUpdate,
    *,
    acting_school_id: int | None,
) -> RegistrationCandidateResponse:
    """Apply bio/guardian/programme/subject updates. Caller must have loaded exam + subjects."""
    school_id = acting_school_id or candidate.school_id

    if candidate.exam is not None:
        await assert_registration_editable(session, candidate.exam, school_id)

    if candidate_update.subject_ids is not None:
        if not candidate.exam or not candidate.exam.registration_period:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot update subject selections: exam or registration period not found",
            )
        if school_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot update subject selections: candidate has no school",
            )
        if not await is_registration_open_for_school(session, candidate.exam, school_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot update subject selections: registration period is not open",
            )

    try:
        fields_set = candidate_update.model_fields_set
        if "date_of_birth" in fields_set and candidate_update.date_of_birth is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Date of birth is required",
            )
        if "gender" in fields_set and (
            candidate_update.gender is None or not str(candidate_update.gender).strip()
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Gender is required",
            )

        update_data = candidate_update.model_dump(
            exclude_unset=True, exclude={"subject_ids", "subject_codes"}
        )
        for field, value in update_data.items():
            if value is not None:
                setattr(candidate, field, value)

        if candidate_update.programme_id is not None:
            if candidate_update.programme_id:
                programme_stmt = select(Programme).where(
                    Programme.id == candidate_update.programme_id
                )
                programme = (await session.execute(programme_stmt)).scalar_one_or_none()
                if not programme:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Programme with ID {candidate_update.programme_id} not found",
                    )
                if school_id:
                    from app.services.school_programme_service import ensure_school_programme

                    await ensure_school_programme(session, school_id, programme.id)
                candidate.programme_id = candidate_update.programme_id
                candidate.programme_code = programme.code

        if candidate_update.subject_ids is not None:
            programme_id = candidate.programme_id
            if not programme_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Programme selection is required",
                )
            registration_type = (
                candidate.registration_type.value if candidate.registration_type else None
            )
            is_valid, validation_errors = await validate_subject_selections(
                session,
                programme_id,
                candidate_update.subject_ids,
                registration_type=registration_type,
            )
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Subject selections do not meet programme requirements: "
                        f"{'; '.join(validation_errors)}"
                    ),
                )

            await session.execute(
                delete(RegistrationSubjectSelection).where(
                    RegistrationSubjectSelection.registration_candidate_id == candidate.id
                )
            )
            for subject_id in candidate_update.subject_ids:
                subject = (
                    await session.execute(select(Subject).where(Subject.id == subject_id))
                ).scalar_one_or_none()
                if not subject:
                    continue
                session.add(
                    RegistrationSubjectSelection(
                        registration_candidate_id=candidate.id,
                        subject_id=subject_id,
                        subject_code=subject.code,
                        subject_name=subject.name,
                    )
                )

        await clear_not_duplicate_marks_for_candidate(session, candidate.id)

        selection_changed = (
            candidate_update.programme_id is not None
            or candidate_update.subject_ids is not None
        )
        if selection_changed:
            await session.flush()
            await session.refresh(candidate, ["subject_selections"])
            await sync_fee_payment_status_from_outstanding(session, candidate)
            await recompute_registration_status(session, candidate)

        await session.commit()

        refreshed = await load_candidate_for_detail(session, candidate.id)
        assert refreshed is not None
        return candidate_to_response(refreshed, include_exam=True)
    except HTTPException:
        await session.rollback()
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update candidate: {str(e)}",
        ) from e


async def upload_candidate_photo_content(
    session: AsyncSession,
    candidate: RegistrationCandidate,
    *,
    content: bytes,
    content_type: str | None,
    filename: str | None,
    validation_level: str = "strict",
    do_replace_background: bool = False,
) -> RegistrationCandidatePhotoResponse:
    """Validate and store a candidate passport photo (replace if present)."""
    exam = candidate.exam
    if exam is None and candidate.registration_exam_id:
        exam = (
            await session.execute(
                select(RegistrationExam).where(
                    RegistrationExam.id == candidate.registration_exam_id
                )
            )
        ).scalar_one_or_none()
    if exam is not None:
        await assert_registration_editable(session, exam, candidate.school_id)

    if do_replace_background:
        try:
            content = replace_background(content, background_color=(255, 255, 255))
            logger.info("Background replaced with white for candidate %s", candidate.id)
        except Exception as e:
            logger.warning(
                "Failed to replace background for candidate %s: %s", candidate.id, e
            )

    PhotoValidationService.validate_all(
        content, content_type or "", validation_level=validation_level
    )

    existing_photo = (
        await session.execute(
            select(RegistrationCandidatePhoto).where(
                RegistrationCandidatePhoto.registration_candidate_id == candidate.id
            )
        )
    ).scalar_one_or_none()

    if existing_photo:
        try:
            await photo_storage_service.delete(existing_photo.file_path)
        except Exception as e:
            logger.warning(
                "Failed to delete old photo file %s: %s", existing_photo.file_path, e
            )
        await session.delete(existing_photo)
        await session.commit()

    checksum = calculate_checksum(content)
    original_filename = filename or "photo.jpg"
    ext = Path(original_filename).suffix or ".jpg"
    new_filename = (
        f"{candidate.registration_number}{ext}"
        if candidate.registration_number
        else original_filename
    )

    file_path, _ = await photo_storage_service.save(
        content,
        new_filename,
        candidate.id,
        candidate.registration_exam_id,
        candidate.registration_number,
    )

    db_photo = RegistrationCandidatePhoto(
        registration_candidate_id=candidate.id,
        file_path=file_path,
        file_name=new_filename,
        mime_type=content_type or "image/jpeg",
        checksum=checksum,
    )
    session.add(db_photo)
    await session.flush()
    await recompute_registration_status(session, candidate, has_photo=True)
    await session.commit()
    await session.refresh(db_photo)
    return RegistrationCandidatePhotoResponse.model_validate(db_photo)


async def upload_candidate_photo_file(
    session: AsyncSession,
    candidate: RegistrationCandidate,
    file: UploadFile,
    *,
    validation_level: str = "strict",
    do_replace_background: bool = False,
) -> RegistrationCandidatePhotoResponse:
    content = await file.read()
    return await upload_candidate_photo_content(
        session,
        candidate,
        content=content,
        content_type=file.content_type,
        filename=file.filename,
        validation_level=validation_level,
        do_replace_background=do_replace_background,
    )


async def delete_candidate_photo_record(
    session: AsyncSession,
    candidate: RegistrationCandidate,
) -> None:
    photo = (
        await session.execute(
            select(RegistrationCandidatePhoto).where(
                RegistrationCandidatePhoto.registration_candidate_id == candidate.id
            )
        )
    ).scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    try:
        await photo_storage_service.delete(photo.file_path)
    except Exception as e:
        logger.warning("Failed to delete photo file %s: %s", photo.file_path, e)

    await session.delete(photo)
    await session.flush()
    await recompute_registration_status(session, candidate, has_photo=False)
    await session.commit()
