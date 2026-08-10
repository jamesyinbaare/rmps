"""Batch certificate generation jobs (Phase 3)."""

from __future__ import annotations

import csv
import io
import logging
import zipfile
from datetime import date, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Candidate,
    CertificateBatchJob,
    CertificateBatchJobStatus,
    CertificateIssuance,
    CertificateIssuanceStatus,
    Exam,
    ExamRegistration,
    Programme,
    School,
    SubjectRegistration,
    SubjectScore,
    Grade,
)
from app.services.certificate_issuance_service import (
    certificate_storage_service,
    generate_certificate,
    get_active_issuance,
)

logger = logging.getLogger(__name__)


def _stored_grade(subject_score: SubjectScore | None) -> Grade:
    if subject_score is None or subject_score.grade is None:
        return Grade.PENDING
    return subject_score.grade


async def _registration_is_fully_graded(session: AsyncSession, registration_id: int) -> bool:
    stmt = (
        select(SubjectRegistration, SubjectScore)
        .outerjoin(SubjectScore, SubjectRegistration.id == SubjectScore.subject_registration_id)
        .where(SubjectRegistration.exam_registration_id == registration_id)
    )
    rows = (await session.execute(stmt)).all()
    if not rows:
        return False
    for _sr, score in rows:
        if _stored_grade(score) == Grade.PENDING:
            return False
    return True


async def list_eligible_registration_ids(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int,
    programme_id: int | None,
    only_fully_graded: bool,
) -> list[int]:
    filters = [
        ExamRegistration.exam_id == exam_id,
        Candidate.school_id == school_id,
    ]
    if programme_id is not None:
        filters.append(Candidate.programme_id == programme_id)

    stmt = (
        select(ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .where(*filters)
        .order_by(ExamRegistration.index_number)
    )
    reg_ids = list((await session.execute(stmt)).scalars().all())
    if not only_fully_graded:
        return reg_ids

    eligible: list[int] = []
    for reg_id in reg_ids:
        if await _registration_is_fully_graded(session, reg_id):
            eligible.append(reg_id)
    return eligible


async def create_batch_job(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int,
    programme_id: int | None,
    template_id: int | None,
    issuance_date: date | None,
    only_fully_graded: bool,
    reissue_existing: bool,
    user_id: UUID,
) -> CertificateBatchJob:
    exam = await session.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    school = await session.get(School, school_id)
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")
    if programme_id is not None:
        programme = await session.get(Programme, programme_id)
        if not programme:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    eligible = await list_eligible_registration_ids(
        session,
        exam_id=exam_id,
        school_id=school_id,
        programme_id=programme_id,
        only_fully_graded=only_fully_graded,
    )
    if not eligible:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No eligible candidates for certificate batch. "
                "Ensure results are fully graded or disable the fully-graded filter."
            ),
        )

    job = CertificateBatchJob(
        status=CertificateBatchJobStatus.PENDING,
        exam_id=exam_id,
        school_id=school_id,
        programme_id=programme_id,
        template_id=template_id,
        issuance_date=issuance_date,
        only_fully_graded=only_fully_graded,
        reissue_existing=reissue_existing,
        progress_current=0,
        progress_total=len(eligible),
        created_by_user_id=user_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


async def process_certificate_batch_job(job_id: int, session: AsyncSession) -> None:
    job = await session.get(CertificateBatchJob, job_id)
    if not job:
        logger.error("Certificate batch job %s not found", job_id)
        return
    if job.status == CertificateBatchJobStatus.CANCELLED:
        return

    job.status = CertificateBatchJobStatus.PROCESSING
    job.updated_at = datetime.utcnow()
    await session.commit()

    try:
        eligible = await list_eligible_registration_ids(
            session,
            exam_id=job.exam_id,
            school_id=job.school_id,
            programme_id=job.programme_id,
            only_fully_graded=job.only_fully_graded,
        )
        job.progress_total = len(eligible)
        await session.commit()

        items: list[dict[str, Any]] = []
        generated_count = 0
        skipped_count = 0
        error_count = 0

        for index, reg_id in enumerate(eligible):
            # Refresh job for cancel checks
            await session.refresh(job)
            if job.status == CertificateBatchJobStatus.CANCELLED:
                job.results = {
                    "items": items,
                    "generated_count": generated_count,
                    "skipped_count": skipped_count,
                    "error_count": error_count,
                }
                job.updated_at = datetime.utcnow()
                job.completed_at = datetime.utcnow()
                await session.commit()
                return

            stmt = (
                select(ExamRegistration, Candidate)
                .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
                .where(ExamRegistration.id == reg_id)
            )
            row = (await session.execute(stmt)).first()
            if not row:
                skipped_count += 1
                items.append(
                    {
                        "exam_registration_id": reg_id,
                        "status": "skipped",
                        "error": "Registration not found",
                    }
                )
                job.progress_current = index + 1
                await session.commit()
                continue

            exam_reg, candidate = row
            job.current_candidate_name = candidate.name
            job.progress_current = index
            job.updated_at = datetime.utcnow()
            await session.commit()

            try:
                active = await get_active_issuance(session, reg_id)
                if active and not job.reissue_existing:
                    items.append(
                        {
                            "exam_registration_id": reg_id,
                            "candidate_name": candidate.name,
                            "index_number": exam_reg.index_number or candidate.index_number,
                            "certificate_number": active.certificate_number,
                            "issuance_id": active.id,
                            "pdf_storage_path": active.pdf_storage_path,
                            "status": "skipped",
                            "error": "Already issued (reissue disabled)",
                        }
                    )
                    skipped_count += 1
                else:
                    if not job.created_by_user_id:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Batch job has no creating user",
                        )
                    issuance, _pdf = await generate_certificate(
                        session,
                        reg_id,
                        user_id=job.created_by_user_id,
                        template_id=job.template_id,
                        reissue=bool(active and job.reissue_existing),
                        void_reason="Reissued via batch" if active and job.reissue_existing else None,
                        issuance_date=job.issuance_date,
                    )
                    items.append(
                        {
                            "exam_registration_id": reg_id,
                            "candidate_name": candidate.name,
                            "index_number": exam_reg.index_number or candidate.index_number,
                            "certificate_number": issuance.certificate_number,
                            "issuance_id": issuance.id,
                            "pdf_storage_path": issuance.pdf_storage_path,
                            "status": "generated",
                        }
                    )
                    generated_count += 1
            except Exception as exc:
                logger.exception("Batch cert failed for registration %s", reg_id)
                error_count += 1
                items.append(
                    {
                        "exam_registration_id": reg_id,
                        "candidate_name": candidate.name,
                        "index_number": exam_reg.index_number or candidate.index_number,
                        "status": "error",
                        "error": str(exc),
                    }
                )

            job.progress_current = index + 1
            job.updated_at = datetime.utcnow()
            await session.commit()

        # Build zip + CSV manifest of successful / existing PDFs
        zip_path = await _build_batch_zip(job_id, items)
        job.zip_storage_path = zip_path
        job.results = {
            "items": items,
            "generated_count": generated_count,
            "skipped_count": skipped_count,
            "error_count": error_count,
        }
        job.status = CertificateBatchJobStatus.COMPLETED
        job.current_candidate_name = None
        job.completed_at = datetime.utcnow()
        job.updated_at = datetime.utcnow()
        await session.commit()
    except Exception as exc:
        logger.exception("Certificate batch job %s failed", job_id)
        job.status = CertificateBatchJobStatus.FAILED
        job.error_message = str(exc)
        job.completed_at = datetime.utcnow()
        job.updated_at = datetime.utcnow()
        await session.commit()


async def _build_batch_zip(job_id: int, items: list[dict[str, Any]]) -> str | None:
    buffer = io.BytesIO()
    manifest_rows: list[dict[str, str]] = []
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for item in items:
            path = item.get("pdf_storage_path")
            if not path or item.get("status") not in ("generated", "skipped"):
                continue
            cert_no = item.get("certificate_number")
            reg_id = item.get("exam_registration_id")
            filename = f"{cert_no}.pdf" if cert_no else f"reg_{reg_id}.pdf"
            try:
                pdf_bytes = await certificate_storage_service.retrieve(path)
                zf.writestr(f"certificates/{filename}", pdf_bytes)
                manifest_rows.append(
                    {
                        "index_number": str(item.get("index_number") or ""),
                        "candidate_name": str(item.get("candidate_name") or ""),
                        "certificate_number": str(cert_no or ""),
                        "status": str(item.get("status") or ""),
                    }
                )
            except Exception:
                continue

        csv_buf = io.StringIO()
        writer = csv.DictWriter(
            csv_buf,
            fieldnames=["index_number", "candidate_name", "certificate_number", "status"],
        )
        writer.writeheader()
        writer.writerows(manifest_rows)
        zf.writestr("manifest.csv", csv_buf.getvalue())

    if not manifest_rows:
        return None
    path, _ = await certificate_storage_service.save(
        buffer.getvalue(), f"batches/job_{job_id}/certificates.zip"
    )
    return path


async def cancel_batch_job(session: AsyncSession, job_id: int) -> CertificateBatchJob:
    job = await session.get(CertificateBatchJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch job not found")
    if job.status in (
        CertificateBatchJobStatus.COMPLETED,
        CertificateBatchJobStatus.FAILED,
        CertificateBatchJobStatus.CANCELLED,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a job with status {job.status.value}",
        )
    job.status = CertificateBatchJobStatus.CANCELLED
    job.completed_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(job)
    return job


async def get_batch_zip_bytes(session: AsyncSession, job_id: int) -> tuple[bytes, str]:
    job = await session.get(CertificateBatchJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch job not found")
    if job.status != CertificateBatchJobStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Batch zip is only available after the job completes",
        )
    if job.zip_storage_path:
        data = await certificate_storage_service.retrieve(job.zip_storage_path)
        return data, f"certificate-batch-{job_id}.zip"

    # Rebuild from results if zip missing
    items = (job.results or {}).get("items") or []
    path = await _build_batch_zip(job_id, items)
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No certificate PDFs available for download",
        )
    job.zip_storage_path = path
    await session.commit()
    data = await certificate_storage_service.retrieve(path)
    return data, f"certificate-batch-{job_id}.zip"


async def void_issuance(
    session: AsyncSession,
    issuance_id: int,
    *,
    user_id: UUID,
    reason: str,
) -> CertificateIssuance:
    issuance = await session.get(CertificateIssuance, issuance_id)
    if not issuance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issuance not found")
    if issuance.status == CertificateIssuanceStatus.VOID:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already voided")
    issuance.status = CertificateIssuanceStatus.VOID
    issuance.void_reason = reason.strip() or "Voided"
    issuance.updated_at = datetime.utcnow()
    _ = user_id  # reserved for future audit of who voided
    await session.commit()
    await session.refresh(issuance)
    return issuance


async def bulk_mark_printed(
    session: AsyncSession,
    issuance_ids: list[int],
    *,
    user_id: UUID,
    printed: bool = True,
) -> list[CertificateIssuance]:
    from app.services.certificate_issuance_service import mark_issuance_printed

    updated: list[CertificateIssuance] = []
    for issuance_id in issuance_ids:
        try:
            item = await mark_issuance_printed(
                session, issuance_id, user_id=user_id, printed=printed
            )
            updated.append(item)
        except HTTPException:
            continue
    return updated
