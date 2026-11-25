"""School registration completion confirmation (signed declaration + QR verify)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import logging
import re
import secrets
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import qrcode
from fastapi import HTTPException, status
from PIL import Image, ImageOps
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import (
    Programme,
    RegistrationCandidate,
    RegistrationExam,
    School,
    SchoolRegistrationCompletion,
    SchoolRegistrationCompletionStatus,
)
from app.schemas.completion import (
    ProgrammeCountBreakdown,
    SchoolCompletionStatusResponse,
    SchoolExamCounts,
)
from app.services.exam_eligibility_service import is_school_eligible_for_exam
from app.services.late_registration_service import is_registration_open_for_school
from app.services.pdf_generator import PdfGenerator, render_html
from app.services.registration_cohorts import school_mediated_type_filter
from app.services.storage.factory import get_storage_backend

logger = logging.getLogger(__name__)

TYPE_LABELS = {
    "fee_paying": "Fee-paying",
    "free_tvet": "Free TVET",
    "referral": "Referral",
}


def _declaration_secret() -> str:
    return (settings.completion_declaration_secret or settings.secret_key).encode("utf-8")


def compute_counts_digest(
    total: int,
    counts_by_type: dict[str, int],
    counts_by_programme: list[dict[str, Any]],
) -> str:
    canonical = {
        "total": total,
        "by_type": {k: counts_by_type[k] for k in sorted(counts_by_type.keys())},
        "by_programme": sorted(
            counts_by_programme,
            key=lambda p: (p.get("programme_id") is None, p.get("programme_id") or 0, p.get("code") or ""),
        ),
    }
    raw = json.dumps(canonical, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def build_signed_qr_payload(
    *,
    exam_id: int,
    school_id: int,
    token: str,
    nonce: str,
    total: int,
    counts_digest: str,
) -> str:
    body = {
        "v": 1,
        "e": exam_id,
        "s": school_id,
        "t": token,
        "n": nonce,
        "tot": total,
        "d": counts_digest,
    }
    body_bytes = json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
    body_b64 = base64.urlsafe_b64encode(body_bytes).decode("ascii").rstrip("=")
    sig = hmac.new(_declaration_secret(), body_b64.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{body_b64}.{sig}"


def verify_signed_qr_payload(payload: str) -> dict[str, Any]:
    try:
        body_b64, sig = payload.strip().split(".", 1)
    except ValueError as exc:
        raise ValueError("Invalid QR payload format") from exc

    expected = hmac.new(_declaration_secret(), body_b64.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise ValueError("QR signature verification failed")

    pad = "=" * (-len(body_b64) % 4)
    try:
        body = json.loads(base64.urlsafe_b64decode(body_b64 + pad))
    except (json.JSONDecodeError, ValueError) as exc:
        raise ValueError("Invalid QR payload body") from exc

    if not isinstance(body, dict) or body.get("v") != 1:
        raise ValueError("Unsupported QR payload version")
    return body


def _generate_qr_base64(payload: str) -> str:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=4,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")


def _opencv_decode_image(image: Image.Image) -> str | None:
    """Primary QR decoder (opencv-python-headless; no libzbar required)."""
    import cv2
    import numpy as np

    rgb = np.array(image.convert("RGB"))
    detector = cv2.QRCodeDetector()
    data, _points, _ = detector.detectAndDecode(rgb)
    if data and data.strip():
        return data.strip()

    # WeChat-style detector is more robust on skewed / noisy scans when available
    try:
        wechat = cv2.wechat_qrcode_WeChatQRCode()
        values, _ = wechat.detectAndDecode(rgb)
        for value in values or []:
            if value and str(value).strip():
                return str(value).strip()
    except Exception:
        pass

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    data, _points, _ = detector.detectAndDecode(gray)
    if data and data.strip():
        return data.strip()
    return None


def _pyzbar_decode_image(image: Image.Image) -> str | None:
    """Optional fallback when libzbar is installed (e.g. Docker)."""
    try:
        from pyzbar.pyzbar import decode as zbar_decode
    except Exception:
        return None

    results = zbar_decode(image)
    for result in results:
        data = result.data.decode("utf-8", errors="replace").strip()
        if data:
            return data
    return None


def decode_qr_from_pil_image(image: Image.Image) -> str | None:
    """Decode QR from a PIL image, trying OpenCV then pyzbar with scan-hardening variants."""
    candidates: list[Image.Image] = [image]
    try:
        gray = ImageOps.grayscale(image)
        candidates.append(gray)
        candidates.append(ImageOps.autocontrast(gray))
        w, h = gray.size
        if max(w, h) < 1800:
            candidates.append(gray.resize((w * 2, h * 2), Image.Resampling.LANCZOS))
    except Exception:
        logger.debug("Failed preparing image variants for QR decode", exc_info=True)

    for candidate in candidates:
        try:
            decoded = _opencv_decode_image(candidate)
            if decoded:
                return decoded
        except Exception:
            logger.debug("OpenCV QR decode attempt failed", exc_info=True)
        try:
            decoded = _pyzbar_decode_image(candidate)
            if decoded:
                return decoded
        except Exception:
            logger.debug("pyzbar QR decode attempt failed", exc_info=True)
    return None


def decode_qr_from_image_bytes(content: bytes) -> str | None:
    image = Image.open(io.BytesIO(content))
    image.load()
    return decode_qr_from_pil_image(image)


def decode_qr_from_pdf_bytes(content: bytes) -> str | None:
    """Rasterize PDF pages with PyMuPDF, then decode QR from page bitmaps."""
    try:
        import pymupdf
    except ImportError as exc:
        raise RuntimeError("pymupdf is required to decode QR codes from PDF uploads") from exc

    doc = pymupdf.open(stream=content, filetype="pdf")
    try:
        # 200 DPI then 300 DPI if needed (matrix = dpi / 72)
        for zoom in (200 / 72, 300 / 72):
            matrix = pymupdf.Matrix(zoom, zoom)
            for page_index in range(len(doc)):
                page = doc.load_page(page_index)
                pix = page.get_pixmap(matrix=matrix, alpha=False)
                png_bytes = pix.tobytes("png")
                decoded = decode_qr_from_image_bytes(png_bytes)
                if decoded:
                    return decoded
    finally:
        doc.close()
    return None


def decode_qr_from_upload(content: bytes, filename: str | None, mime_type: str | None) -> str:
    name = (filename or "").lower()
    mime = (mime_type or "").lower()
    is_pdf = mime == "application/pdf" or name.endswith(".pdf")

    if is_pdf:
        decoded = decode_qr_from_pdf_bytes(content)
        if decoded:
            return decoded
        raise ValueError(
            "Could not find a readable QR code in the PDF. "
            "Upload a clear, uncropped JPEG/PNG scan of the signed completion form "
            "(ensure the QR code is visible and not covered)."
        )

    decoded = decode_qr_from_image_bytes(content)
    if not decoded:
        raise ValueError(
            "Could not find a readable QR code in the uploaded image. "
            "Use a clear, well-lit scan of the signed completion form "
            "with the QR code fully visible."
        )
    return decoded


async def compute_school_exam_counts(
    session: AsyncSession,
    exam_id: int,
    school_id: int,
) -> SchoolExamCounts:
    stmt = (
        select(
            RegistrationCandidate.programme_id,
            Programme.code,
            Programme.name,
            RegistrationCandidate.registration_type,
            func.count(RegistrationCandidate.id),
        )
        .outerjoin(Programme, Programme.id == RegistrationCandidate.programme_id)
        .where(
            RegistrationCandidate.registration_exam_id == exam_id,
            RegistrationCandidate.school_id == school_id,
            school_mediated_type_filter(),
        )
        .group_by(
            RegistrationCandidate.programme_id,
            Programme.code,
            Programme.name,
            RegistrationCandidate.registration_type,
        )
    )
    rows = (await session.execute(stmt)).all()

    by_type: dict[str, int] = {"fee_paying": 0, "free_tvet": 0, "referral": 0}
    programme_map: dict[tuple[Any, ...], dict[str, Any]] = {}
    total = 0

    for programme_id, code, name, reg_type, count in rows:
        count_i = int(count or 0)
        total += count_i
        type_key = reg_type.value if hasattr(reg_type, "value") else (reg_type or "fee_paying")
        if type_key not in by_type:
            # Treat null/legacy as fee_paying for display
            type_key = "fee_paying" if type_key in (None, "null") else str(type_key)
        if type_key not in by_type:
            by_type[type_key] = 0
        by_type[type_key] = by_type.get(type_key, 0) + count_i

        key = (programme_id, code or "—", name or "Unassigned")
        if key not in programme_map:
            programme_map[key] = {
                "programme_id": programme_id,
                "code": code or "—",
                "name": name or "Unassigned",
                "total": 0,
                "by_type": defaultdict(int),
            }
        programme_map[key]["total"] += count_i
        programme_map[key]["by_type"][type_key] += count_i

    programmes = [
        ProgrammeCountBreakdown(
            programme_id=p["programme_id"],
            code=p["code"],
            name=p["name"],
            total=p["total"],
            by_type=dict(p["by_type"]),
        )
        for p in sorted(programme_map.values(), key=lambda x: (x["code"], x["name"]))
    ]
    return SchoolExamCounts(
        total_candidates=total,
        counts_by_type=dict(by_type),
        counts_by_programme=programmes,
    )


def _counts_to_snapshot(counts: SchoolExamCounts) -> tuple[int, dict[str, int], list[dict[str, Any]], str]:
    programmes = [p.model_dump() for p in counts.counts_by_programme]
    digest = compute_counts_digest(counts.total_candidates, counts.counts_by_type, programmes)
    return counts.total_candidates, dict(counts.counts_by_type), programmes, digest


async def _get_exam(session: AsyncSession, exam_id: int) -> RegistrationExam:
    exam = (
        await session.execute(
            select(RegistrationExam)
            .options(selectinload(RegistrationExam.registration_period))
            .where(RegistrationExam.id == exam_id)
        )
    ).scalar_one_or_none()
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    return exam


async def _get_completion_row(
    session: AsyncSession, exam_id: int, school_id: int
) -> SchoolRegistrationCompletion | None:
    return (
        await session.execute(
            select(SchoolRegistrationCompletion).where(
                SchoolRegistrationCompletion.exam_id == exam_id,
                SchoolRegistrationCompletion.school_id == school_id,
            )
        )
    ).scalar_one_or_none()


async def is_school_registration_confirmed(
    session: AsyncSession, exam_id: int, school_id: int
) -> bool:
    row = await _get_completion_row(session, exam_id, school_id)
    return bool(row and row.status == SchoolRegistrationCompletionStatus.CONFIRMED)


async def assert_registration_editable(
    session: AsyncSession,
    exam: RegistrationExam,
    school_id: int | None,
) -> None:
    """Raise if exam requires completion confirmation and school is confirmed."""
    if school_id is None:
        return
    if not bool(getattr(exam, "requires_completion_confirmation", False)):
        return
    if await is_school_registration_confirmed(session, exam.id, school_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Registration is locked because completion has been confirmed. "
                "Withdraw confirmation before making changes."
            ),
        )


async def get_completion_status(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int,
) -> SchoolCompletionStatusResponse:
    if not await is_school_eligible_for_exam(session, exam_id, school_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School is not eligible for this examination",
        )

    exam = await _get_exam(session, exam_id)
    feature_enabled = bool(exam.requires_completion_confirmation)
    registration_open = await is_registration_open_for_school(session, exam, school_id)
    live = await compute_school_exam_counts(session, exam_id, school_id)
    row = await _get_completion_row(session, exam_id, school_id)

    status_value = row.status.value if row else None
    is_confirmed = status_value == SchoolRegistrationCompletionStatus.CONFIRMED.value
    is_locked = feature_enabled and is_confirmed

    return SchoolCompletionStatusResponse(
        exam_id=exam_id,
        school_id=school_id,
        feature_enabled=feature_enabled,
        status=status_value,
        is_confirmed=is_confirmed,
        is_locked=is_locked,
        can_withdraw=feature_enabled and is_confirmed and registration_open,
        can_download=feature_enabled and registration_open,
        can_upload=feature_enabled and registration_open and not is_confirmed,
        registration_open=registration_open,
        live_counts=live,
        snapshot_total=row.total_candidates if row else None,
        snapshot_counts_by_type=dict(row.counts_by_type) if row else None,
        snapshot_counts_by_programme=list(row.counts_by_programme) if row else None,
        declaration_generated_at=row.declaration_generated_at if row else None,
        confirmed_at=row.confirmed_at if row else None,
        withdrawn_at=row.withdrawn_at if row else None,
        principal_email_sent=bool(row and row.principal_email_sent_at),
        principal_sms_sent=bool(row and row.principal_sms_sent_at),
        notify_email_error=row.notify_email_error if row else None,
        notify_sms_error=row.notify_sms_error if row else None,
    )


async def _ensure_pending_or_refresh_row(
    session: AsyncSession,
    *,
    exam: RegistrationExam,
    school_id: int,
    refresh_snapshot: bool,
) -> SchoolRegistrationCompletion:
    live = await compute_school_exam_counts(session, exam.id, school_id)
    total, by_type, by_programme, digest = _counts_to_snapshot(live)
    row = await _get_completion_row(session, exam.id, school_id)
    now = datetime.utcnow()

    if row is None:
        row = SchoolRegistrationCompletion(
            exam_id=exam.id,
            school_id=school_id,
            status=SchoolRegistrationCompletionStatus.PENDING,
            confirmation_token=str(uuid.uuid4()),
            payload_nonce=secrets.token_hex(8),
            total_candidates=total,
            counts_by_type=by_type,
            counts_by_programme=by_programme,
            counts_digest=digest,
            declaration_generated_at=now,
            generation_count=1,
        )
        session.add(row)
        await session.flush()
        return row

    if row.status == SchoolRegistrationCompletionStatus.CONFIRMED:
        return row

    if refresh_snapshot:
        row.confirmation_token = str(uuid.uuid4())
        row.payload_nonce = secrets.token_hex(8)
        row.total_candidates = total
        row.counts_by_type = by_type
        row.counts_by_programme = by_programme
        row.counts_digest = digest
        row.declaration_generated_at = now
        row.generation_count = int(row.generation_count or 0) + 1
        row.status = SchoolRegistrationCompletionStatus.PENDING
        row.withdrawn_at = None
        row.withdrawn_by_user_id = None
        row.confirmed_at = None
        row.confirmed_by_user_id = None
        row.scanned_file_path = None
        row.scanned_mime_type = None
        row.scanned_checksum = None
        row.principal_email_sent_at = None
        row.principal_sms_sent_at = None
        row.notify_email_error = None
        row.notify_sms_error = None
        await session.flush()

    return row


# Keep the signed confirmation form on a single A4 page.
_MAX_PROGRAMMES_ON_FORM = 12


def _sanitize_filename_segment(value: str | int | None) -> str:
    """Keep only alphanumeric characters for filename segments."""
    return re.sub(r"[^A-Za-z0-9]", "", str(value or ""))


def _completion_upload_filename(school: School, exam: RegistrationExam, ext: str) -> str:
    """Build `{school_code}-{exam_type}-{series}-{year}{ext}` with special chars removed."""
    parts = [
        _sanitize_filename_segment(school.code),
        _sanitize_filename_segment(exam.exam_type),
        _sanitize_filename_segment(exam.exam_series),
        _sanitize_filename_segment(exam.year),
    ]
    stem = "-".join(p for p in parts if p) or "completion"
    suffix = ext if ext.startswith(".") else f".{ext}" if ext else ".pdf"
    return f"{stem}{suffix}"


def _render_declaration_pdf(
    *,
    school: School,
    exam: RegistrationExam,
    row: SchoolRegistrationCompletion,
    qr_payload: str,
) -> bytes:
    qr_b64 = _generate_qr_base64(qr_payload)
    exam_label = f"{exam.exam_type} {exam.exam_series or ''} {exam.year}".strip()
    type_rows = [
        {
            "key": key,
            "label": TYPE_LABELS.get(key, key),
            "count": int((row.counts_by_type or {}).get(key, 0)),
        }
        for key in ("fee_paying", "free_tvet", "referral")
    ]
    all_programmes = list(row.counts_by_programme or [])
    programmes = all_programmes[:_MAX_PROGRAMMES_ON_FORM]
    programmes_truncated = max(0, len(all_programmes) - len(programmes))
    programme_type_columns = [
        {"key": key, "label": TYPE_LABELS.get(key, key)}
        for key in ("fee_paying", "free_tvet", "referral")
        if any(int((p.get("by_type") or {}).get(key, 0)) > 0 for p in programmes)
    ]
    context = {
        "school_name": school.name,
        "school_code": school.code,
        "principal_name": school.principal_name or "",
        "exam_label": exam_label,
        "generated_at": (row.declaration_generated_at or datetime.utcnow()).strftime(
            "%d %B %Y at %H:%M UTC"
        ),
        "total_candidates": row.total_candidates,
        "type_rows": type_rows,
        "programmes": programmes,
        "programmes_truncated": programmes_truncated,
        "programme_type_columns": programme_type_columns,
        "type_labels": TYPE_LABELS,
        "qr_code_base64": qr_b64,
        "token_short": row.confirmation_token[:8],
    }
    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(context, "completion/declaration.html", templates_dir)
    app_dir = Path(__file__).parent.parent.resolve()
    return PdfGenerator(main_html=main_html, base_url=str(app_dir)).render_pdf()


async def generate_declaration_pdf(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int,
) -> tuple[bytes, str]:
    if not await is_school_eligible_for_exam(session, exam_id, school_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School is not eligible for this examination",
        )
    exam = await _get_exam(session, exam_id)
    if not exam.requires_completion_confirmation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completion confirmation is not required for this examination",
        )
    if not await is_registration_open_for_school(session, exam, school_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration period is not open",
        )

    school = (
        await session.execute(select(School).where(School.id == school_id))
    ).scalar_one_or_none()
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    row = await _get_completion_row(session, exam_id, school_id)
    if row and row.status == SchoolRegistrationCompletionStatus.CONFIRMED:
        # Re-render from frozen confirmed snapshot (do not refresh token)
        pass
    else:
        row = await _ensure_pending_or_refresh_row(
            session, exam=exam, school_id=school_id, refresh_snapshot=True
        )

    qr_payload = build_signed_qr_payload(
        exam_id=exam_id,
        school_id=school_id,
        token=row.confirmation_token,
        nonce=row.payload_nonce,
        total=row.total_candidates,
        counts_digest=row.counts_digest,
    )
    pdf_bytes = _render_declaration_pdf(school=school, exam=exam, row=row, qr_payload=qr_payload)
    await session.commit()
    filename = f"registration_completion_{school.code}_{exam_id}.pdf"
    return pdf_bytes, filename


async def notify_principal_of_confirmation(
    session: AsyncSession,
    *,
    completion: SchoolRegistrationCompletion,
    school: School,
    exam: RegistrationExam,
) -> None:
    from app.services.email_service import send_completion_confirmation_email
    from app.services.sms import get_sms_provider, normalize_msisdn

    exam_label = f"{exam.exam_type} {exam.exam_series or ''} {exam.year}".strip()
    confirmed_at = (completion.confirmed_at or datetime.utcnow()).strftime("%d %B %Y %H:%M UTC")
    type_parts = []
    for key in ("fee_paying", "free_tvet", "referral"):
        count = int((completion.counts_by_type or {}).get(key, 0))
        type_parts.append(f"{TYPE_LABELS.get(key, key)}: {count}")
    type_summary = "; ".join(type_parts)

    # Email
    if school.principal_email and school.principal_email.strip():
        sent = send_completion_confirmation_email(
            to=school.principal_email.strip(),
            principal_name=school.principal_name or "Principal",
            school_name=school.name,
            school_code=school.code,
            exam_label=exam_label,
            total_candidates=completion.total_candidates,
            counts_by_type=dict(completion.counts_by_type or {}),
            counts_by_programme=list(completion.counts_by_programme or []),
            confirmed_at=confirmed_at,
        )
        if sent:
            completion.principal_email_sent_at = datetime.utcnow()
            completion.notify_email_error = None
        else:
            completion.notify_email_error = "Failed to send email"
    else:
        completion.notify_email_error = "Principal email not set on school profile"

    # SMS
    if not settings.sms_enabled:
        completion.notify_sms_error = "SMS is disabled"
    elif not school.principal_phone or not school.principal_phone.strip():
        completion.notify_sms_error = "Principal phone not set on school profile"
    else:
        try:
            msisdn = normalize_msisdn(school.principal_phone)
            message = (
                f"CTVET: Registration confirmed for {school.code} — {exam_label}. "
                f"Total {completion.total_candidates} ({type_summary}). Locked until withdrawn."
            )
            if len(message) > 320:
                message = (
                    f"CTVET: {school.code} registration confirmed for {exam_label}. "
                    f"Total {completion.total_candidates}. Locked until withdrawn."
                )
            result = await get_sms_provider().send_sms(msisdn, message)
            if result.sent:
                completion.principal_sms_sent_at = datetime.utcnow()
                completion.notify_sms_error = None
            else:
                completion.notify_sms_error = result.error or "SMS send failed"
        except ValueError as exc:
            completion.notify_sms_error = str(exc)
        except Exception as exc:
            logger.exception("SMS notification failed")
            completion.notify_sms_error = str(exc)

    await session.flush()


async def confirm_from_upload(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int,
    user_id: UUID,
    file_content: bytes,
    filename: str | None,
    mime_type: str | None,
    qr_payload_override: str | None = None,
) -> SchoolCompletionStatusResponse:
    if not await is_school_eligible_for_exam(session, exam_id, school_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School is not eligible for this examination",
        )
    exam = await _get_exam(session, exam_id)
    if not exam.requires_completion_confirmation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completion confirmation is not required for this examination",
        )
    if not await is_registration_open_for_school(session, exam, school_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration period is not open",
        )

    existing = await _get_completion_row(session, exam_id, school_id)
    if existing and existing.status == SchoolRegistrationCompletionStatus.CONFIRMED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration is already confirmed",
        )

    if not file_content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")
    if len(file_content) > settings.upload_max_size:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is too large")

    try:
        payload_str = qr_payload_override or decode_qr_from_upload(file_content, filename, mime_type)
        payload = verify_signed_qr_payload(payload_str)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    if int(payload.get("e")) != exam_id or int(payload.get("s")) != school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="QR code does not match this school and examination",
        )

    token = str(payload.get("t") or "")
    row = (
        await session.execute(
            select(SchoolRegistrationCompletion).where(
                SchoolRegistrationCompletion.confirmation_token == token
            )
        )
    ).scalar_one_or_none()
    if row is None or row.exam_id != exam_id or row.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unknown or expired completion form token. Download a new completion form.",
        )
    if row.status == SchoolRegistrationCompletionStatus.CONFIRMED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration is already confirmed",
        )
    if row.payload_nonce != str(payload.get("n") or ""):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completion form token mismatch. Download a new completion form.",
        )

    live = await compute_school_exam_counts(session, exam_id, school_id)
    live_total, live_by_type, live_by_programme, live_digest = _counts_to_snapshot(live)
    if (
        live_digest != row.counts_digest
        or live_total != row.total_candidates
        or int(payload.get("tot") or -1) != row.total_candidates
        or str(payload.get("d") or "") != row.counts_digest
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Candidate counts have changed since the completion form was generated. "
                "Download a new completion form and have it signed again."
            ),
        )

    school = (
        await session.execute(select(School).where(School.id == school_id))
    ).scalar_one()

    storage = get_storage_backend(base_path=settings.storage_path)
    ext = Path(filename or "").suffix or ".pdf"
    custom_name = _completion_upload_filename(school, exam, ext)
    subdir = f"completion-declarations/{school_id}/{exam_id}"
    saved_path, checksum = await storage.save(
        file_content,
        custom_name,
        subdir=subdir,
        use_custom_filename=True,
    )

    row.status = SchoolRegistrationCompletionStatus.CONFIRMED
    row.confirmed_at = datetime.utcnow()
    row.confirmed_by_user_id = user_id
    row.scanned_file_path = saved_path
    row.scanned_mime_type = mime_type
    row.scanned_checksum = checksum
    row.withdrawn_at = None
    row.withdrawn_by_user_id = None
    # Freeze live counts into snapshot (should already match)
    row.total_candidates = live_total
    row.counts_by_type = live_by_type
    row.counts_by_programme = live_by_programme
    row.counts_digest = live_digest
    await session.flush()

    await notify_principal_of_confirmation(
        session, completion=row, school=school, exam=exam
    )
    await session.commit()
    return await get_completion_status(session, exam_id=exam_id, school_id=school_id)


async def withdraw_confirmation(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int,
    user_id: UUID,
) -> SchoolCompletionStatusResponse:
    if not await is_school_eligible_for_exam(session, exam_id, school_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School is not eligible for this examination",
        )
    exam = await _get_exam(session, exam_id)
    if not exam.requires_completion_confirmation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completion confirmation is not required for this examination",
        )
    if not await is_registration_open_for_school(session, exam, school_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot withdraw confirmation after the registration period has closed",
        )

    row = await _get_completion_row(session, exam_id, school_id)
    if row is None or row.status != SchoolRegistrationCompletionStatus.CONFIRMED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration is not confirmed",
        )

    row.status = SchoolRegistrationCompletionStatus.WITHDRAWN
    row.withdrawn_at = datetime.utcnow()
    row.withdrawn_by_user_id = user_id
    await session.commit()
    return await get_completion_status(session, exam_id=exam_id, school_id=school_id)
