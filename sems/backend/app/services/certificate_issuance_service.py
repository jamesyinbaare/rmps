"""Certificate issuance orchestration (preview/generate/print)."""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import (
    Candidate,
    CandidatePhoto,
    CertificateIssuance,
    CertificateIssuanceStatus,
    CertificateTemplate,
    CertificateTemplateAsset,
    Exam,
    ExamRegistration,
    ExamSubject,
    Grade,
    Programme,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
)
from app.schemas.certificate import DEFAULT_CERTIFICATE_LAYOUT
from app.services.certificate_number_service import (
    assert_certificate_number_available,
    normalize_certificate_number,
)
from app.services.certificate_pdf_service import (
    DEFAULT_DATE_FORMAT,
    build_certificate_context,
    coerce_layout,
    render_certificate_overlay_pdf,
)
from app.services.storage import StorageService, create_photo_storage_service, create_storage_backend

logger = logging.getLogger(__name__)

CANDIDATE_PHOTO_KEY = "candidate_photo"


def create_certificate_storage_service() -> StorageService:
    return StorageService(
        backend=create_storage_backend(
            local_base_path=settings.certificate_output_path,
            gcs_prefix=settings.gcs_certificates_prefix,
        )
    )


certificate_storage_service = create_certificate_storage_service()


def _stored_grade(subject_score: SubjectScore | None) -> Grade:
    if subject_score is None or subject_score.grade is None:
        return Grade.PENDING
    return subject_score.grade


def _layout_date_format(layout: dict[str, Any]) -> str:
    return str(layout.get("date_format") or DEFAULT_DATE_FORMAT)


async def load_registration_bundle(
    session: AsyncSession,
    registration_id: int,
) -> tuple[ExamRegistration, Candidate, School, Programme | None, Exam, list[dict[str, Any]]]:
    stmt = (
        select(ExamRegistration, Candidate, School, Programme, Exam)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id)
        .outerjoin(Programme, Candidate.programme_id == Programme.id)
        .join(Exam, ExamRegistration.exam_id == Exam.id)
        .where(ExamRegistration.id == registration_id)
    )
    row = (await session.execute(stmt)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam registration not found")

    exam_reg, candidate, school, programme, exam = row

    subject_stmt = (
        select(SubjectRegistration, ExamSubject, Subject, SubjectScore)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .outerjoin(SubjectScore, SubjectRegistration.id == SubjectScore.subject_registration_id)
        .where(SubjectRegistration.exam_registration_id == exam_reg.id)
        .order_by(Subject.subject_type, Subject.code)
    )
    subject_rows = (await session.execute(subject_stmt)).all()
    subjects: list[dict[str, Any]] = []
    for _sr, _es, subject, subject_score in subject_rows:
        grade = _stored_grade(subject_score)
        subjects.append(
            {
                "subject_code": subject.code,
                "subject_name": subject.name,
                "grade": grade.value,
            }
        )
    return exam_reg, candidate, school, programme, exam, subjects


async def resolve_template(
    session: AsyncSession,
    *,
    exam: Exam,
    template_id: int | None = None,
) -> CertificateTemplate:
    """Resolve the active template for an examination (templates are exam-specific)."""
    if template_id is not None:
        stmt = (
            select(CertificateTemplate)
            .options(selectinload(CertificateTemplate.assets))
            .where(CertificateTemplate.id == template_id)
        )
        template = (await session.execute(stmt)).scalar_one_or_none()
        if not template or not template.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        if template.exam_id != exam.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Template does not belong to this examination",
            )
        return template

    stmt = (
        select(CertificateTemplate)
        .options(selectinload(CertificateTemplate.assets))
        .where(
            CertificateTemplate.is_active.is_(True),
            CertificateTemplate.exam_id == exam.id,
        )
        .order_by(CertificateTemplate.id.desc())
        .limit(1)
    )
    template = (await session.execute(stmt)).scalar_one_or_none()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No certificate template configured for this examination. "
                "Create one under Results → Certificate settings."
            ),
        )
    return template


def template_page_and_layout(
    template: CertificateTemplate,
) -> tuple[float, float, dict[str, Any]]:
    return (
        template.page_width_mm,
        template.page_height_mm,
        coerce_layout(template.layout_json) or dict(DEFAULT_CERTIFICATE_LAYOUT),
    )


def _exam_enum_value(value: Any) -> str:
    if value is None:
        return ""
    return value.value if hasattr(value, "value") else str(value)


def build_context_for_registration(
    *,
    candidate: Candidate,
    exam_reg: ExamRegistration,
    school: School,
    programme: Programme | None,
    exam: Exam,
    subjects: list[dict[str, Any]],
    certificate_number: str | None,
    issuance_date: date | datetime | str | None,
    layout: dict[str, Any],
) -> dict[str, Any]:
    return build_certificate_context(
        candidate_name=candidate.name,
        index_number=exam_reg.index_number or candidate.index_number,
        school_name=school.name or "",
        school_code=school.code or "",
        programme_name=programme.name if programme else "",
        certificate_number=certificate_number or "",
        subjects=_subject_context_rows(subjects),
        issuance_date=issuance_date,
        date_format=_layout_date_format(layout),
        exam_year=str(exam.year),
        exam_type=_exam_enum_value(exam.exam_type),
        exam_series=_exam_enum_value(exam.series),
        exam_description=exam.description or "",
    )


def _pdf_filename(issuance: CertificateIssuance | None = None, *, registration_id: int | None = None) -> str:
    if issuance and issuance.certificate_number:
        return f"{issuance.certificate_number}.pdf"
    if issuance:
        return f"issuance_{issuance.id}.pdf"
    if registration_id is not None:
        return f"reg_{registration_id}.pdf"
    return "certificate.pdf"


def _subject_context_rows(subjects: list[dict[str, Any]]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for item in subjects or []:
        if not isinstance(item, dict):
            continue
        grade = item.get("grade")
        if hasattr(grade, "value"):
            grade = grade.value
        name = item.get("subject_name") or item.get("name") or item.get("subject") or ""
        if not name and not item.get("subject_code") and grade is None:
            continue
        rows.append(
            {
                "subject_code": str(item.get("subject_code") or item.get("code") or ""),
                "subject_name": str(name),
                "grade": "" if grade is None else str(grade),
            }
        )
    return rows


async def load_template_images(
    template: CertificateTemplate | None,
    session: AsyncSession | None = None,
) -> dict[str, bytes]:
    images: dict[str, bytes] = {}
    assets: list[CertificateTemplateAsset] = []
    if session is not None and template is not None:
        stmt = select(CertificateTemplateAsset).where(
            CertificateTemplateAsset.template_id == template.id
        )
        assets = list((await session.execute(stmt)).scalars().all())
    elif template is not None:
        assets = list(template.assets or [])
    for asset in assets:
        try:
            content = await certificate_storage_service.retrieve(asset.file_path)
        except Exception:
            logger.exception("Failed to load certificate template asset %s", asset.key)
            continue
        if not content:
            continue
        images[asset.key] = content
        images[asset.key.strip().lower()] = content
    return images


def layout_includes_candidate_photo(layout: dict[str, Any] | None) -> bool:
    """True when the template places the candidate passport photo field."""
    if not layout:
        return False
    for field in layout.get("fields") or []:
        if not isinstance(field, dict):
            continue
        key = str(field.get("key") or "").strip().lower()
        asset_key = str(field.get("asset_key") or "").strip().lower()
        if key == CANDIDATE_PHOTO_KEY or asset_key == CANDIDATE_PHOTO_KEY:
            return True
    return False


async def load_candidate_photo_bytes(
    session: AsyncSession,
    candidate_id: int,
) -> bytes | None:
    """Load the candidate's active passport photo bytes, if any."""
    stmt = select(CandidatePhoto).where(
        CandidatePhoto.candidate_id == candidate_id,
        CandidatePhoto.is_active.is_(True),
    )
    photo = (await session.execute(stmt)).scalar_one_or_none()
    if not photo:
        logger.info("No active passport photo for candidate %s", candidate_id)
        return None
    try:
        photo_storage = create_photo_storage_service()
        if not await photo_storage.exists(photo.file_path):
            logger.warning(
                "Passport photo record %s for candidate %s points to missing file %s",
                photo.id,
                candidate_id,
                photo.file_path,
            )
            return None
        content = await photo_storage.retrieve(photo.file_path)
        return content or None
    except Exception:
        logger.warning(
            "Failed to load passport photo for candidate %s",
            candidate_id,
            exc_info=True,
        )
        return None


async def load_certificate_images(
    session: AsyncSession,
    template: CertificateTemplate | None,
    *,
    candidate_id: int | None,
    layout: dict[str, Any] | None,
) -> dict[str, bytes]:
    """Template assets plus optional candidate passport photo for generation."""
    images = await load_template_images(template, session)
    if candidate_id is None or not layout_includes_candidate_photo(layout):
        return images
    photo_bytes = await load_candidate_photo_bytes(session, candidate_id)
    if photo_bytes:
        images[CANDIDATE_PHOTO_KEY] = photo_bytes
    return images


async def get_active_issuance(
    session: AsyncSession,
    exam_registration_id: int,
) -> CertificateIssuance | None:
    stmt = (
        select(CertificateIssuance)
        .where(
            CertificateIssuance.exam_registration_id == exam_registration_id,
            CertificateIssuance.status != CertificateIssuanceStatus.VOID,
        )
        .order_by(CertificateIssuance.id.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_issuance_pdf_bytes(
    session: AsyncSession,
    issuance: CertificateIssuance,
) -> bytes:
    """Return certificate PDF bytes for an issuance.

    Always regenerates from the current exam template so signature assets and
    passport photos that were missing (or updated) at original generate time
    still appear on download. Overwrites the stored PDF when possible.
    """
    pdf_bytes = await preview_certificate_pdf(
        session,
        issuance.exam_registration_id,
        certificate_number=issuance.certificate_number,
        issuance_date=issuance.issuance_date,
    )
    path = (issuance.pdf_storage_path or "").strip()
    try:
        save_name = (
            f"{issuance.certificate_number}.pdf"
            if issuance.certificate_number
            else f"issuance_{issuance.id}.pdf"
        )
        if path:
            await certificate_storage_service.save_at_path(path, pdf_bytes)
        else:
            new_path, _ = await certificate_storage_service.save(pdf_bytes, save_name)
            issuance.pdf_storage_path = new_path
            issuance.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(issuance)
    except Exception:
        logger.warning(
            "Regenerated issuance %s PDF but could not re-save to storage",
            issuance.id,
            exc_info=True,
        )
    return pdf_bytes


async def preview_certificate_pdf(
    session: AsyncSession,
    registration_id: int,
    *,
    template_id: int | None = None,
    certificate_number: str | None = None,
    issuance_date: date | None = None,
) -> bytes:
    exam_reg, candidate, school, programme, exam, subjects = await load_registration_bundle(
        session, registration_id
    )
    template = await resolve_template(session, exam=exam, template_id=template_id)
    width_mm, height_mm, layout = template_page_and_layout(template)
    images = await load_certificate_images(
        session, template, candidate_id=candidate.id, layout=layout
    )

    active = await get_active_issuance(session, exam_reg.id)
    provided = normalize_certificate_number(certificate_number)
    number = provided or (active.certificate_number if active else None)
    resolved_date = issuance_date or (active.issuance_date if active else date.today())

    context = build_context_for_registration(
        candidate=candidate,
        exam_reg=exam_reg,
        school=school,
        programme=programme,
        exam=exam,
        subjects=subjects,
        certificate_number=number,
        issuance_date=resolved_date,
        layout=layout,
    )
    return render_certificate_overlay_pdf(
        page_width_mm=width_mm,
        page_height_mm=height_mm,
        layout_json=layout,
        context=context,
        images=images,
    )


async def generate_certificate(
    session: AsyncSession,
    registration_id: int,
    *,
    user_id: UUID,
    template_id: int | None = None,
    reissue: bool = False,
    void_reason: str | None = None,
    issuance_date: date | None = None,
    certificate_number: str | None = None,
) -> tuple[CertificateIssuance, bytes]:
    exam_reg, candidate, school, programme, exam, subjects = await load_registration_bundle(
        session, registration_id
    )
    template = await resolve_template(session, exam=exam, template_id=template_id)
    width_mm, height_mm, layout = template_page_and_layout(template)
    images = await load_certificate_images(
        session, template, candidate_id=candidate.id, layout=layout
    )
    provided = normalize_certificate_number(certificate_number)

    active = await get_active_issuance(session, exam_reg.id)
    if active and not reissue:
        layout_to_use = layout
        grades = subjects or active.grades_snapshot_json or []
        if issuance_date is not None:
            active.issuance_date = issuance_date
        resolved_date = active.issuance_date or issuance_date or date.today()
        if active.issuance_date is None:
            active.issuance_date = resolved_date
        if provided is not None and provided != active.certificate_number:
            await assert_certificate_number_available(
                session, provided, exclude_issuance_id=active.id
            )
            active.certificate_number = provided
        _apply_numbered_as_printed(active, user_id=user_id)
        layout_dict = layout_to_use if isinstance(layout_to_use, dict) else layout
        context = build_context_for_registration(
            candidate=candidate,
            exam_reg=exam_reg,
            school=school,
            programme=programme,
            exam=exam,
            subjects=grades,
            certificate_number=active.certificate_number,
            issuance_date=resolved_date,
            layout=layout_dict,
        )
        pdf_bytes = render_certificate_overlay_pdf(
            page_width_mm=width_mm,
            page_height_mm=height_mm,
            layout_json=layout_to_use,
            context=context,
            images=images,
        )
        path, _ = await certificate_storage_service.save(
            pdf_bytes, _pdf_filename(active, registration_id=exam_reg.id)
        )
        active.layout_snapshot_json = layout_to_use
        active.grades_snapshot_json = grades
        active.pdf_storage_path = path
        active.updated_at = datetime.utcnow()
        await session.commit()
        await session.refresh(active)
        return active, pdf_bytes

    if active and reissue:
        active.status = CertificateIssuanceStatus.VOID
        active.void_reason = void_reason or "Reissued"
        active.updated_at = datetime.utcnow()
        superseded_id = active.id
    else:
        superseded_id = None

    if provided is not None:
        await assert_certificate_number_available(session, provided)

    resolved_date = issuance_date or date.today()
    context = build_context_for_registration(
        candidate=candidate,
        exam_reg=exam_reg,
        school=school,
        programme=programme,
        exam=exam,
        subjects=subjects,
        certificate_number=provided,
        issuance_date=resolved_date,
        layout=layout,
    )
    pdf_bytes = render_certificate_overlay_pdf(
        page_width_mm=width_mm,
        page_height_mm=height_mm,
        layout_json=layout,
        context=context,
        images=images,
    )
    # Temporary filename until we have an issuance id; renamed path after insert not required
    save_name = f"{provided}.pdf" if provided else f"reg_{exam_reg.id}.pdf"
    path, _ = await certificate_storage_service.save(pdf_bytes, save_name)

    issuance = CertificateIssuance(
        exam_registration_id=exam_reg.id,
        certificate_number=provided,
        status=(
            CertificateIssuanceStatus.PRINTED
            if provided
            else CertificateIssuanceStatus.GENERATED
        ),
        layout_snapshot_json=layout,
        grades_snapshot_json=subjects,
        pdf_storage_path=path,
        supersedes_id=superseded_id,
        issuance_date=resolved_date,
        generated_by_user_id=user_id,
        generated_at=datetime.utcnow(),
        printed_by_user_id=user_id if provided else None,
        printed_at=datetime.utcnow() if provided else None,
    )
    session.add(issuance)
    await session.commit()
    await session.refresh(issuance)
    return issuance, pdf_bytes


async def set_certificate_number(
    session: AsyncSession,
    issuance_id: int,
    *,
    certificate_number: str,
    user_id: UUID | None = None,
) -> CertificateIssuance:
    issuance = await session.get(CertificateIssuance, issuance_id)
    if not issuance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issuance not found")
    if issuance.status == CertificateIssuanceStatus.VOID:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot set certificate number on a voided issuance",
        )
    number = normalize_certificate_number(certificate_number)
    if not number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Certificate number is required",
        )
    await assert_certificate_number_available(
        session, number, exclude_issuance_id=issuance.id
    )
    issuance.certificate_number = number
    _apply_numbered_as_printed(issuance, user_id=user_id)
    issuance.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(issuance)
    return issuance


def _apply_numbered_as_printed(
    issuance: CertificateIssuance,
    *,
    user_id: UUID | None = None,
) -> None:
    """Having a certificate number means the stock was printed/assigned."""
    if not issuance.certificate_number:
        return
    if issuance.status == CertificateIssuanceStatus.VOID:
        return
    if issuance.status not in (
        CertificateIssuanceStatus.MATCHED_SCAN,
        CertificateIssuanceStatus.PRINTED,
    ):
        issuance.status = CertificateIssuanceStatus.PRINTED
    if issuance.printed_at is None:
        issuance.printed_at = datetime.utcnow()
        if user_id is not None:
            issuance.printed_by_user_id = user_id


async def mark_issuance_printed(
    session: AsyncSession,
    issuance_id: int,
    *,
    user_id: UUID,
    printed: bool = True,
) -> CertificateIssuance:
    issuance = await session.get(CertificateIssuance, issuance_id)
    if not issuance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issuance not found")
    if issuance.status == CertificateIssuanceStatus.VOID:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot print a voided certificate"
        )

    if printed:
        issuance.status = CertificateIssuanceStatus.PRINTED
        issuance.printed_by_user_id = user_id
        issuance.printed_at = datetime.utcnow()
    else:
        issuance.status = CertificateIssuanceStatus.GENERATED
        issuance.printed_by_user_id = None
        issuance.printed_at = None
    issuance.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(issuance)
    return issuance


async def upsert_template_asset(
    session: AsyncSession,
    *,
    template_id: int,
    key: str,
    label: str | None,
    content: bytes,
    filename: str,
    mime_type: str,
) -> CertificateTemplateAsset:
    template = await session.get(CertificateTemplate, template_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    safe_key = key.strip().lower().replace(" ", "_")
    if not safe_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Asset key is required")

    path, _ = await certificate_storage_service.save(content, f"assets/{template_id}/{safe_key}_{filename}")

    stmt = select(CertificateTemplateAsset).where(
        CertificateTemplateAsset.template_id == template_id,
        CertificateTemplateAsset.key == safe_key,
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing:
        existing.file_path = path
        existing.file_name = filename
        existing.mime_type = mime_type
        existing.label = label or existing.label
        existing.updated_at = datetime.utcnow()
        asset = existing
    else:
        asset = CertificateTemplateAsset(
            template_id=template_id,
            key=safe_key,
            label=label or safe_key.replace("_", " ").title(),
            file_path=path,
            file_name=filename,
            mime_type=mime_type,
        )
        session.add(asset)

    await session.commit()
    await session.refresh(asset)
    return asset
