"""Certificate Studio: upload scans, OCR ROIs, match by index number."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Candidate,
    CertificateIssuance,
    CertificateIssuanceStatus,
    CertificateScan,
    CertificateScanBatch,
    CertificateScanBatchStatus,
    CertificateScanMatchStatus,
    Exam,
    ExamRegistration,
    School,
)
from app.services.certificate_issuance_service import (
    certificate_storage_service,
    get_active_issuance,
)
from app.services.certificate_number_service import (
    assert_certificate_number_available,
    normalize_certificate_number,
)
from app.services.certificate_scan_ocr_service import (
    extract_index_and_certificate,
    normalize_ocr_text,
    validate_roi,
)


def _candidate_name(candidate: Candidate) -> str:
    return candidate.name


async def create_scan_batch(
    session: AsyncSession,
    *,
    exam_id: int,
    roi_certificate_number: dict[str, Any],
    roi_index_number: dict[str, Any],
    user_id: UUID | None,
) -> CertificateScanBatch:
    exam = await session.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    try:
        roi_cert = validate_roi(roi_certificate_number, label="certificate number")
        roi_index = validate_roi(roi_index_number, label="index number")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    batch = CertificateScanBatch(
        exam_id=exam_id,
        roi_certificate_number=roi_cert,
        roi_index_number=roi_index,
        status=CertificateScanBatchStatus.OPEN,
        created_by_user_id=user_id,
    )
    session.add(batch)
    await session.commit()
    await session.refresh(batch)
    return batch


async def get_scan_batch(
    session: AsyncSession,
    batch_id: int,
) -> CertificateScanBatch:
    stmt = (
        select(CertificateScanBatch)
        .options(selectinload(CertificateScanBatch.scans))
        .where(CertificateScanBatch.id == batch_id)
    )
    batch = (await session.execute(stmt)).scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan batch not found")
    return batch


async def add_scan_to_batch(
    session: AsyncSession,
    batch_id: int,
    *,
    content: bytes,
    filename: str,
    content_type: str | None = None,
) -> CertificateScan:
    batch = await session.get(CertificateScanBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan batch not found")
    if batch.status == CertificateScanBatchStatus.PROCESSING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot upload while batch is processing",
        )

    safe_name = filename.replace("/", "_").replace("\\", "_") or "scan.jpg"
    path, _ = await certificate_storage_service.save(
        content, f"scans/{batch_id}/{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{safe_name}"
    )
    scan = CertificateScan(
        batch_id=batch_id,
        storage_path=path,
        original_filename=safe_name,
        match_status=CertificateScanMatchStatus.PENDING,
    )
    session.add(scan)
    batch.status = CertificateScanBatchStatus.OPEN
    batch.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(scan)
    return scan


async def _find_registration_by_index(
    session: AsyncSession,
    *,
    exam_id: int,
    index_number: str,
) -> ExamRegistration | None:
    needle = index_number.strip()
    stmt = (
        select(ExamRegistration)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .where(
            ExamRegistration.exam_id == exam_id,
            or_(
                ExamRegistration.index_number == needle,
                Candidate.index_number == needle,
                func.lower(ExamRegistration.index_number) == needle.lower(),
                func.lower(Candidate.index_number) == needle.lower(),
            ),
        )
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def apply_match_to_issuance(
    session: AsyncSession,
    *,
    scan: CertificateScan,
    issuance: CertificateIssuance,
    certificate_number: str,
    ocr_index: str | None,
    user_id: UUID | None,
) -> CertificateScan:
    number = normalize_certificate_number(certificate_number)
    if not number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Certificate number is required to match",
        )
    await assert_certificate_number_available(
        session, number, exclude_issuance_id=issuance.id
    )

    issuance.certificate_number = number
    issuance.ocr_certificate_number = number
    issuance.scan_document_path = scan.storage_path
    issuance.status = CertificateIssuanceStatus.MATCHED_SCAN
    issuance.matched_by_user_id = user_id
    issuance.matched_at = datetime.utcnow()
    if issuance.printed_at is None:
        issuance.printed_at = datetime.utcnow()
        issuance.printed_by_user_id = user_id
    issuance.updated_at = datetime.utcnow()

    scan.ocr_certificate_number = number
    if ocr_index:
        scan.ocr_index_number = ocr_index
    scan.issuance_id = issuance.id
    scan.suggested_exam_registration_id = issuance.exam_registration_id
    scan.match_status = CertificateScanMatchStatus.MATCHED
    scan.error_message = None
    scan.processed_at = datetime.utcnow()
    scan.updated_at = datetime.utcnow()
    return scan


async def _auto_match_scan(
    session: AsyncSession,
    scan: CertificateScan,
    batch: CertificateScanBatch,
    *,
    user_id: UUID | None,
) -> CertificateScan:
    try:
        content = await certificate_storage_service.retrieve(scan.storage_path)
        index_number, cert_number = extract_index_and_certificate(
            content,
            filename=scan.original_filename,
            roi_index=batch.roi_index_number,
            roi_certificate=batch.roi_certificate_number,
        )
    except ValueError as exc:
        scan.match_status = CertificateScanMatchStatus.UNMATCHED
        scan.error_message = str(exc)
        scan.processed_at = datetime.utcnow()
        return scan
    except Exception as exc:
        scan.match_status = CertificateScanMatchStatus.UNMATCHED
        scan.error_message = f"OCR failed: {exc}"
        scan.processed_at = datetime.utcnow()
        return scan

    scan.ocr_index_number = index_number
    scan.ocr_certificate_number = cert_number
    scan.processed_at = datetime.utcnow()

    if not index_number or not cert_number:
        scan.match_status = CertificateScanMatchStatus.UNMATCHED
        scan.error_message = "Could not read index number and/or certificate number from ROIs"
        return scan

    registration = await _find_registration_by_index(
        session, exam_id=batch.exam_id, index_number=index_number
    )
    if not registration:
        scan.match_status = CertificateScanMatchStatus.UNMATCHED
        scan.error_message = f"No registration found for index '{index_number}' in this exam"
        return scan

    scan.suggested_exam_registration_id = registration.id
    issuance = await get_active_issuance(session, registration.id)
    if not issuance:
        scan.match_status = CertificateScanMatchStatus.UNMATCHED
        scan.error_message = (
            f"No active certificate issuance for index '{index_number}'. "
            "Generate the certificate in Manage Certificates first."
        )
        return scan

    try:
        await apply_match_to_issuance(
            session,
            scan=scan,
            issuance=issuance,
            certificate_number=cert_number,
            ocr_index=index_number,
            user_id=user_id,
        )
    except HTTPException as exc:
        scan.match_status = CertificateScanMatchStatus.UNMATCHED
        scan.error_message = str(exc.detail)
        scan.issuance_id = None
    return scan


async def process_scan_batch(
    session: AsyncSession,
    batch_id: int,
    *,
    user_id: UUID | None,
) -> CertificateScanBatch:
    batch = await get_scan_batch(session, batch_id)
    batch.status = CertificateScanBatchStatus.PROCESSING
    batch.updated_at = datetime.utcnow()
    await session.commit()

    stmt = select(CertificateScan).where(
        CertificateScan.batch_id == batch_id,
        CertificateScan.match_status.in_(
            [CertificateScanMatchStatus.PENDING, CertificateScanMatchStatus.UNMATCHED]
        ),
    )
    scans = list((await session.execute(stmt)).scalars().all())
    batch = await session.get(CertificateScanBatch, batch_id)
    assert batch is not None

    for scan in scans:
        await _auto_match_scan(session, scan, batch, user_id=user_id)
        await session.commit()

    batch.status = CertificateScanBatchStatus.COMPLETED
    batch.completed_at = datetime.utcnow()
    batch.updated_at = datetime.utcnow()
    await session.commit()
    return await get_scan_batch(session, batch_id)


async def list_scans(
    session: AsyncSession,
    *,
    match_status: str | None = None,
    exam_id: int | None = None,
    batch_id: int | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[CertificateScan], int]:
    stmt = select(CertificateScan).join(CertificateScanBatch)
    count_stmt = select(func.count(CertificateScan.id)).join(CertificateScanBatch)
    if match_status:
        try:
            status_enum = CertificateScanMatchStatus(match_status)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid match_status"
            ) from exc
        stmt = stmt.where(CertificateScan.match_status == status_enum)
        count_stmt = count_stmt.where(CertificateScan.match_status == status_enum)
    if exam_id is not None:
        stmt = stmt.where(CertificateScanBatch.exam_id == exam_id)
        count_stmt = count_stmt.where(CertificateScanBatch.exam_id == exam_id)
    if batch_id is not None:
        stmt = stmt.where(CertificateScan.batch_id == batch_id)
        count_stmt = count_stmt.where(CertificateScan.batch_id == batch_id)

    total = int((await session.execute(count_stmt)).scalar_one())
    stmt = (
        stmt.order_by(CertificateScan.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list((await session.execute(stmt)).scalars().all())
    return items, total


async def get_scan(session: AsyncSession, scan_id: int) -> CertificateScan:
    scan = await session.get(CertificateScan, scan_id)
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")
    return scan


async def confirm_scan(
    session: AsyncSession,
    scan_id: int,
    *,
    user_id: UUID | None,
    certificate_number: str | None = None,
    index_number: str | None = None,
) -> CertificateScan:
    scan = await get_scan(session, scan_id)
    batch = await session.get(CertificateScanBatch, scan.batch_id)
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan batch not found")

    cert = normalize_certificate_number(certificate_number or scan.ocr_certificate_number)
    idx = normalize_ocr_text(index_number or scan.ocr_index_number)
    if not cert or not idx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both index number and certificate number are required",
        )

    # Prefer lookup by (possibly corrected) index within the batch exam
    registration = await _find_registration_by_index(
        session, exam_id=batch.exam_id, index_number=idx
    )
    if not registration and scan.suggested_exam_registration_id:
        registration = await session.get(ExamRegistration, scan.suggested_exam_registration_id)
        if registration and registration.exam_id != batch.exam_id:
            registration = None
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No registration found for index '{idx}'",
        )
    registration_id = registration.id

    issuance = await get_active_issuance(session, registration_id)
    if not issuance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active issuance for this candidate. Generate the certificate first.",
        )

    await apply_match_to_issuance(
        session,
        scan=scan,
        issuance=issuance,
        certificate_number=cert,
        ocr_index=idx,
        user_id=user_id,
    )
    await session.commit()
    await session.refresh(scan)
    return scan


async def manual_match_scan(
    session: AsyncSession,
    scan_id: int,
    *,
    user_id: UUID | None,
    exam_registration_id: int | None = None,
    index_number: str | None = None,
    certificate_number: str | None = None,
) -> CertificateScan:
    scan = await get_scan(session, scan_id)
    batch = await session.get(CertificateScanBatch, scan.batch_id)
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan batch not found")

    registration: ExamRegistration | None = None
    if exam_registration_id is not None:
        registration = await session.get(ExamRegistration, exam_registration_id)
        if not registration or registration.exam_id != batch.exam_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration not found for this examination",
            )
    elif index_number:
        registration = await _find_registration_by_index(
            session, exam_id=batch.exam_id, index_number=index_number
        )
        if not registration:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No registration found for index '{index_number}'",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide exam_registration_id or index_number",
        )

    cert = normalize_certificate_number(certificate_number or scan.ocr_certificate_number)
    if not cert:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Certificate number is required",
        )

    issuance = await get_active_issuance(session, registration.id)
    if not issuance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active issuance for this candidate. Generate the certificate first.",
        )

    idx = normalize_ocr_text(index_number) or scan.ocr_index_number
    await apply_match_to_issuance(
        session,
        scan=scan,
        issuance=issuance,
        certificate_number=cert,
        ocr_index=idx,
        user_id=user_id,
    )
    await session.commit()
    await session.refresh(scan)
    return scan


async def reject_scan(session: AsyncSession, scan_id: int) -> CertificateScan:
    scan = await get_scan(session, scan_id)
    scan.match_status = CertificateScanMatchStatus.REJECTED
    scan.error_message = scan.error_message or "Rejected by user"
    scan.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(scan)
    return scan


async def enrich_scan_for_response(
    session: AsyncSession, scan: CertificateScan
) -> dict[str, Any]:
    """Build display fields for API responses."""
    candidate_name = None
    index_number = None
    school_code = None
    school_name = None
    reg_id = scan.suggested_exam_registration_id
    if scan.issuance_id and not reg_id:
        issuance = await session.get(CertificateIssuance, scan.issuance_id)
        if issuance:
            reg_id = issuance.exam_registration_id
    if reg_id:
        stmt = (
            select(ExamRegistration, Candidate, School)
            .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
            .join(School, Candidate.school_id == School.id)
            .where(ExamRegistration.id == reg_id)
        )
        row = (await session.execute(stmt)).first()
        if row:
            exam_reg, candidate, school = row
            candidate_name = _candidate_name(candidate)
            index_number = exam_reg.index_number or candidate.index_number
            school_code = school.code
            school_name = school.name

    batch = await session.get(CertificateScanBatch, scan.batch_id)
    return {
        "id": scan.id,
        "batch_id": scan.batch_id,
        "exam_id": batch.exam_id if batch else None,
        "storage_path": scan.storage_path,
        "original_filename": scan.original_filename,
        "ocr_index_number": scan.ocr_index_number,
        "ocr_certificate_number": scan.ocr_certificate_number,
        "match_status": scan.match_status,
        "issuance_id": scan.issuance_id,
        "suggested_exam_registration_id": scan.suggested_exam_registration_id,
        "suggested_candidate_name": candidate_name,
        "suggested_index_number": index_number,
        "suggested_school_code": school_code,
        "suggested_school_name": school_name,
        "error_message": scan.error_message,
        "processed_at": scan.processed_at,
        "created_at": scan.created_at,
        "updated_at": scan.updated_at,
    }
