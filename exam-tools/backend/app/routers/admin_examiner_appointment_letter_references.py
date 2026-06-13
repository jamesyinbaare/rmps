"""Admin: per-examination appointment letter reference numbers."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import (
    Examination,
    ExaminationExaminerAppointmentLetterReference,
    ExaminerType,
    Subject,
)
from app.schemas.examiner_appointment_letter_reference import (
    ExaminerAppointmentLetterReferenceItem,
    ExaminerAppointmentLetterReferenceSubjectRef,
    ExaminationExaminerAppointmentLetterReferencesPut,
    ExaminationExaminerAppointmentLetterReferencesResponse,
)
from app.services.examiner_appointment_letter_reference import (
    load_configured_appointment_letter_reference,
    parse_examiner_type_value,
)
from app.services.examiner_appointment_letter_pdf import build_dummy_appointment_letter_preview_pdf
from app.services.script_control import ordered_subject_papers_on_examination_timetable

router = APIRouter(
    prefix="/admin/examinations",
    tags=["admin-examiner-appointment-letter-references"],
)


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    exam = await session.get(Examination, exam_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return exam


async def _timetable_subject_ids(session: DBSessionDep, exam_id: int) -> set[int]:
    subject_papers = await ordered_subject_papers_on_examination_timetable(session, exam_id)
    return {int(subject.id) for subject, _papers in subject_papers}


def _sanitize_filename_part(s: str) -> str:
    return "".join(c for c in s if c.isalnum() or c in ("_", "-"))


async def _build_references_response(
    session: DBSessionDep,
    exam_id: int,
) -> ExaminationExaminerAppointmentLetterReferencesResponse:
    subject_papers = await ordered_subject_papers_on_examination_timetable(session, exam_id)

    subjects: list[ExaminerAppointmentLetterReferenceSubjectRef] = []
    for subject, _papers in subject_papers:
        code = (subject.original_code or subject.code or "").strip()
        st = subject.subject_type
        subject_type = st.value if hasattr(st, "value") else str(st)
        subjects.append(
            ExaminerAppointmentLetterReferenceSubjectRef(
                id=int(subject.id),
                code=code,
                name=(subject.name or "").strip(),
                subject_type=subject_type,
            )
        )

    stmt = select(ExaminationExaminerAppointmentLetterReference).where(
        ExaminationExaminerAppointmentLetterReference.examination_id == exam_id,
    )
    rows = list((await session.execute(stmt)).scalars().all())
    items = [
        ExaminerAppointmentLetterReferenceItem(
            subject_id=int(row.subject_id),
            examiner_type=row.examiner_type.value
            if isinstance(row.examiner_type, ExaminerType)
            else str(row.examiner_type),
            reference_number=row.reference_number,
        )
        for row in rows
    ]
    return ExaminationExaminerAppointmentLetterReferencesResponse(
        examination_id=exam_id,
        subjects=subjects,
        items=items,
    )


@router.get(
    "/{exam_id}/examiner-appointment-letter-references",
    response_model=ExaminationExaminerAppointmentLetterReferencesResponse,
)
async def get_examiner_appointment_letter_references(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminationExaminerAppointmentLetterReferencesResponse:
    await _load_examination(session, exam_id)
    return await _build_references_response(session, exam_id)


@router.put(
    "/{exam_id}/examiner-appointment-letter-references",
    response_model=ExaminationExaminerAppointmentLetterReferencesResponse,
)
async def put_examiner_appointment_letter_references(
    exam_id: int,
    body: ExaminationExaminerAppointmentLetterReferencesPut,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminationExaminerAppointmentLetterReferencesResponse:
    await _load_examination(session, exam_id)
    allowed_subject_ids = await _timetable_subject_ids(session, exam_id)

    for cell in body.items:
        if cell.subject_id not in allowed_subject_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Subject {cell.subject_id} is not on this examination timetable",
            )
        examiner_type = parse_examiner_type_value(cell.examiner_type.value)
        trimmed = (cell.reference_number or "").strip()

        stmt = select(ExaminationExaminerAppointmentLetterReference).where(
            ExaminationExaminerAppointmentLetterReference.examination_id == exam_id,
            ExaminationExaminerAppointmentLetterReference.subject_id == cell.subject_id,
            ExaminationExaminerAppointmentLetterReference.examiner_type == examiner_type,
        )
        existing = (await session.execute(stmt)).scalar_one_or_none()

        if not trimmed:
            if existing is not None:
                await session.delete(existing)
            continue

        if existing is None:
            session.add(
                ExaminationExaminerAppointmentLetterReference(
                    examination_id=exam_id,
                    subject_id=cell.subject_id,
                    examiner_type=examiner_type,
                    reference_number=trimmed,
                )
            )
        else:
            existing.reference_number = trimmed
            existing.updated_at = datetime.utcnow()

    await session.commit()
    return await _build_references_response(session, exam_id)


@router.get("/{exam_id}/examiner-appointment-letter-preview.pdf")
async def download_examiner_appointment_letter_preview_pdf(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    subject_id: int = Query(...),
    examiner_type: str = Query(...),
) -> Response:
    await _load_examination(session, exam_id)
    allowed_subject_ids = await _timetable_subject_ids(session, exam_id)
    if subject_id not in allowed_subject_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found on this examination timetable",
        )

    subject = await session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    try:
        parsed_type = parse_examiner_type_value(examiner_type)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid examiner type") from exc

    configured = await load_configured_appointment_letter_reference(
        session,
        examination_id=exam_id,
        subject_id=subject_id,
        examiner_type=parsed_type,
    )
    if not configured:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Configure a reference number for this subject and role before previewing",
        )

    try:
        pdf, filename = await build_dummy_appointment_letter_preview_pdf(
            session,
            examination_id=exam_id,
            subject=subject,
            examiner_type=parsed_type,
            reference_number=configured,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    safe = _sanitize_filename_part(filename.replace(".pdf", "")) + ".pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe}"'},
    )
