"""Results browser and certificate issuance APIs (Phases 1–2)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import func, select

from app.dependencies.auth import CurrentUserDep, OfficerDep, RegistrarDep
from app.dependencies.database import DBSessionDep
from app.models import (
    Candidate,
    CertificateIssuance,
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
from app.schemas.certificate import (
    CERTIFICATE_FIELD_CATALOG,
    DEFAULT_CERTIFICATE_LAYOUT,
    CertificateFieldCatalogResponse,
    CertificateIssuanceResponse,
    CertificateTemplateAssetListResponse,
    CertificateTemplateAssetResponse,
    CertificateTemplateCreate,
    CertificateTemplateListResponse,
    CertificateTemplateResponse,
    CertificateTemplateUpdate,
    MarkPrintedRequest,
)
from app.schemas.certificate_results import (
    CandidateResultSummary,
    ExamProgrammeSummary,
    ExamRegistrationResultDetail,
    ExamSchoolListResponse,
    ExamSchoolSummary,
    SchoolResultsListResponse,
    SubjectResultDetail,
)
from app.services import certificate_issuance_service as issuance_service

router = APIRouter(prefix="/api/v1/certificates", tags=["certificates"])


def _grade_is_complete(grade: Grade | None) -> bool:
    """A subject counts as graded when it has a concrete (non-Pending) stored grade."""
    return grade is not None and grade != Grade.PENDING


def _stored_grade(subject_score: SubjectScore | None) -> Grade:
    """
    Return the persisted grade for a subject score.

    Grades are written during result processing. If the score row is missing or
    grade has not been computed yet, treat as Pending.
    """
    if subject_score is None or subject_score.grade is None:
        return Grade.PENDING
    return subject_score.grade


async def _load_subject_rows_for_registrations(
    session: DBSessionDep,
    registration_ids: list[int],
) -> dict[int, list[tuple[SubjectRegistration, ExamSubject, Subject, SubjectScore | None]]]:
    """Map exam_registration_id -> subject rows."""
    if not registration_ids:
        return {}

    stmt = (
        select(SubjectRegistration, ExamSubject, Subject, SubjectScore)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .outerjoin(SubjectScore, SubjectRegistration.id == SubjectScore.subject_registration_id)
        .where(SubjectRegistration.exam_registration_id.in_(registration_ids))
        .order_by(Subject.subject_type, Subject.code)
    )
    result = await session.execute(stmt)
    by_reg: dict[int, list[tuple[SubjectRegistration, ExamSubject, Subject, SubjectScore | None]]] = (
        defaultdict(list)
    )
    for subject_reg, exam_subject, subject, subject_score in result.all():
        by_reg[subject_reg.exam_registration_id].append(
            (subject_reg, exam_subject, subject, subject_score)
        )
    return by_reg


def _summarize_subjects(
    rows: list[tuple[SubjectRegistration, ExamSubject, Subject, SubjectScore | None]],
) -> tuple[int, int, int, bool]:
    registered = len(rows)
    graded = 0
    pending = 0
    for _sr, _exam_subject, _subject, subject_score in rows:
        grade = _stored_grade(subject_score)
        if _grade_is_complete(grade):
            graded += 1
        else:
            pending += 1
    is_fully = registered > 0 and pending == 0
    return registered, graded, pending, is_fully


@router.get("/exams/{exam_id}/schools", response_model=ExamSchoolListResponse)
async def list_exam_schools(
    exam_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None, description="Filter by school name or code"),
) -> ExamSchoolListResponse:
    """List schools with candidate registrations for an exam."""
    _ = current_user

    exam = await session.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    base_filters = [ExamRegistration.exam_id == exam_id]
    if search and search.strip():
        term = f"%{search.strip()}%"
        base_filters.append((School.name.ilike(term)) | (School.code.ilike(term)))

    count_stmt = (
        select(func.count(func.distinct(School.id)))
        .select_from(ExamRegistration)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id)
        .where(*base_filters)
    )
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = (
        select(
            School.id,
            School.code,
            School.name,
            School.region,
            func.count(ExamRegistration.id).label("candidate_count"),
        )
        .select_from(ExamRegistration)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id)
        .where(*base_filters)
        .group_by(School.id, School.code, School.name, School.region)
        .order_by(School.code)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(stmt)).all()

    # Fully graded counts for schools on this page
    school_ids = [r.id for r in rows]
    fully_graded_by_school: dict[int, int] = defaultdict(int)
    if school_ids:
        reg_stmt = (
            select(ExamRegistration.id, Candidate.school_id)
            .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
            .where(
                ExamRegistration.exam_id == exam_id,
                Candidate.school_id.in_(school_ids),
            )
        )
        reg_rows = (await session.execute(reg_stmt)).all()
        reg_ids = [r.id for r in reg_rows]
        school_by_reg = {r.id: r.school_id for r in reg_rows}
        by_reg = await _load_subject_rows_for_registrations(session, reg_ids)
        for reg_id, subject_rows in by_reg.items():
            _reg, _g, _p, is_fully = _summarize_subjects(subject_rows)
            if is_fully:
                fully_graded_by_school[school_by_reg[reg_id]] += 1
        # Registrations with zero subjects are not fully graded
        for reg_id, school_id in school_by_reg.items():
            if reg_id not in by_reg:
                pass  # remains 0 contribution

    items = [
        ExamSchoolSummary(
            school_id=r.id,
            school_code=r.code,
            school_name=r.name,
            region=r.region.value if r.region is not None and hasattr(r.region, "value") else (
                str(r.region) if r.region is not None else None
            ),
            candidate_count=r.candidate_count,
            fully_graded_count=fully_graded_by_school.get(r.id, 0),
        )
        for r in rows
    ]

    return ExamSchoolListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get(
    "/exams/{exam_id}/schools/{school_id}/programmes",
    response_model=list[ExamProgrammeSummary],
)
async def list_exam_school_programmes(
    exam_id: int,
    school_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> list[ExamProgrammeSummary]:
    """Programmes represented among candidates registered for this exam at this school."""
    _ = current_user

    exam = await session.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    school = await session.get(School, school_id)
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    stmt = (
        select(
            Programme.id,
            Programme.code,
            Programme.name,
            func.count(ExamRegistration.id).label("candidate_count"),
        )
        .select_from(ExamRegistration)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(Programme, Candidate.programme_id == Programme.id)
        .where(
            ExamRegistration.exam_id == exam_id,
            Candidate.school_id == school_id,
        )
        .group_by(Programme.id, Programme.code, Programme.name)
        .order_by(Programme.code)
    )
    rows = (await session.execute(stmt)).all()
    return [
        ExamProgrammeSummary(
            programme_id=r.id,
            programme_code=r.code,
            programme_name=r.name,
            candidate_count=r.candidate_count,
        )
        for r in rows
    ]


@router.get(
    "/exams/{exam_id}/schools/{school_id}/results",
    response_model=SchoolResultsListResponse,
)
async def list_school_results(
    exam_id: int,
    school_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
    programme_id: int | None = Query(None),
    search: str | None = Query(None, description="Filter by candidate name or index number"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> SchoolResultsListResponse:
    """Paginated candidate results for an exam at a school, optionally filtered by programme."""
    _ = current_user

    exam = await session.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    school = await session.get(School, school_id)
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    filters = [
        ExamRegistration.exam_id == exam_id,
        Candidate.school_id == school_id,
    ]
    if programme_id is not None:
        filters.append(Candidate.programme_id == programme_id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(
            (Candidate.name.ilike(term))
            | (Candidate.index_number.ilike(term))
            | (ExamRegistration.index_number.ilike(term))
        )

    count_stmt = (
        select(func.count(ExamRegistration.id))
        .select_from(ExamRegistration)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .where(*filters)
    )
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = (
        select(ExamRegistration, Candidate, Programme)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .outerjoin(Programme, Candidate.programme_id == Programme.id)
        .where(*filters)
        .order_by(ExamRegistration.index_number)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(stmt)).all()
    reg_ids = [exam_reg.id for exam_reg, _c, _p in rows]
    by_reg = await _load_subject_rows_for_registrations(session, reg_ids)

    items: list[CandidateResultSummary] = []
    for exam_reg, candidate, programme in rows:
        registered, graded, pending, is_fully = _summarize_subjects(by_reg.get(exam_reg.id, []))
        items.append(
            CandidateResultSummary(
                exam_registration_id=exam_reg.id,
                candidate_id=candidate.id,
                candidate_name=candidate.name,
                index_number=exam_reg.index_number or candidate.index_number,
                programme_id=programme.id if programme else None,
                programme_code=programme.code if programme else None,
                programme_name=programme.name if programme else None,
                subjects_registered=registered,
                subjects_graded=graded,
                subjects_pending=pending,
                is_fully_graded=is_fully,
            )
        )

    return SchoolResultsListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        school_id=school.id,
        school_code=school.code,
        school_name=school.name,
        exam_id=exam_id,
    )


@router.get(
    "/exam-registrations/{registration_id}/result-detail",
    response_model=ExamRegistrationResultDetail,
)
async def get_exam_registration_result_detail(
    registration_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ExamRegistrationResultDetail:
    """Subject-level raw scores, normalized scores, and grades for one registration."""
    _ = current_user

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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam registration not found",
        )

    exam_reg, candidate, school, programme, exam = row
    by_reg = await _load_subject_rows_for_registrations(session, [exam_reg.id])
    subject_rows = by_reg.get(exam_reg.id, [])

    subjects: list[SubjectResultDetail] = []
    for subject_reg, exam_subject, subject, subject_score in subject_rows:
        grade = _stored_grade(subject_score)
        subjects.append(
            SubjectResultDetail(
                subject_registration_id=subject_reg.id,
                exam_subject_id=exam_subject.id,
                subject_id=subject.id,
                subject_code=subject.code,
                subject_name=subject.name,
                subject_type=subject.subject_type.value
                if subject.subject_type is not None and hasattr(subject.subject_type, "value")
                else (str(subject.subject_type) if subject.subject_type else None),
                series=subject_reg.series,
                obj_raw_score=subject_score.obj_raw_score if subject_score else None,
                essay_raw_score=subject_score.essay_raw_score if subject_score else None,
                pract_raw_score=subject_score.pract_raw_score if subject_score else None,
                obj_normalized=subject_score.obj_normalized if subject_score else None,
                essay_normalized=subject_score.essay_normalized if subject_score else None,
                pract_normalized=subject_score.pract_normalized if subject_score else None,
                total_score=subject_score.total_score if subject_score else None,
                grade=grade,
                obj_max_score=exam_subject.obj_max_score,
                essay_max_score=exam_subject.essay_max_score,
                pract_max_score=exam_subject.pract_max_score,
                has_score=subject_score is not None,
            )
        )

    registered, graded, pending, is_fully = _summarize_subjects(subject_rows)

    return ExamRegistrationResultDetail(
        exam_registration_id=exam_reg.id,
        exam_id=exam.id,
        exam_type=exam.exam_type.value if hasattr(exam.exam_type, "value") else str(exam.exam_type),
        exam_year=exam.year,
        exam_series=exam.series.value if hasattr(exam.series, "value") else str(exam.series),
        candidate_id=candidate.id,
        candidate_name=candidate.name,
        index_number=exam_reg.index_number or candidate.index_number,
        date_of_birth=candidate.date_of_birth,
        gender=candidate.gender,
        school_id=school.id,
        school_code=school.code,
        school_name=school.name,
        programme_id=programme.id if programme else None,
        programme_code=programme.code if programme else None,
        programme_name=programme.name if programme else None,
        subjects=subjects,
        subjects_registered=registered,
        subjects_graded=graded,
        subjects_pending=pending,
        is_fully_graded=is_fully,
    )


# --- Phase 2: templates, preview, generate, mark printed ---


@router.get("/field-catalog", response_model=CertificateFieldCatalogResponse)
async def get_certificate_field_catalog(
    current_user: CurrentUserDep,
) -> CertificateFieldCatalogResponse:
    """List available layout fields (exam-sourced data and static/image fields)."""
    _ = current_user
    return CertificateFieldCatalogResponse(items=CERTIFICATE_FIELD_CATALOG)


@router.get("/templates/default-layout")
async def get_default_layout(current_user: CurrentUserDep) -> dict[str, Any]:
    _ = current_user
    return dict(DEFAULT_CERTIFICATE_LAYOUT)


@router.get("/templates", response_model=CertificateTemplateListResponse)
async def list_certificate_templates(
    session: DBSessionDep,
    current_user: CurrentUserDep,
    exam_id: int | None = Query(None, description="Filter templates for one examination"),
    active_only: bool = Query(True),
) -> CertificateTemplateListResponse:
    _ = current_user
    stmt = select(CertificateTemplate).order_by(CertificateTemplate.name)
    if exam_id is not None:
        stmt = stmt.where(CertificateTemplate.exam_id == exam_id)
    if active_only:
        stmt = stmt.where(CertificateTemplate.is_active.is_(True))
    rows = (await session.execute(stmt)).scalars().all()
    return CertificateTemplateListResponse(
        items=[CertificateTemplateResponse.model_validate(r) for r in rows],
        total=len(rows),
    )


@router.post("/templates", response_model=CertificateTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_certificate_template(
    body: CertificateTemplateCreate,
    session: DBSessionDep,
    current_user: RegistrarDep,
) -> CertificateTemplateResponse:
    _ = current_user
    exam = await session.get(Exam, body.exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    template = CertificateTemplate(
        name=body.name,
        exam_type=exam.exam_type,
        exam_id=exam.id,
        page_width_mm=body.page_width_mm,
        page_height_mm=body.page_height_mm,
        layout_json=body.layout_json or dict(DEFAULT_CERTIFICATE_LAYOUT),
        is_active=body.is_active,
    )
    session.add(template)
    await session.commit()
    await session.refresh(template)
    return CertificateTemplateResponse.model_validate(template)


@router.get("/templates/{template_id}", response_model=CertificateTemplateResponse)
async def get_certificate_template(
    template_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> CertificateTemplateResponse:
    _ = current_user
    template = await session.get(CertificateTemplate, template_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return CertificateTemplateResponse.model_validate(template)


@router.put("/templates/{template_id}", response_model=CertificateTemplateResponse)
async def update_certificate_template(
    template_id: int,
    body: CertificateTemplateUpdate,
    session: DBSessionDep,
    current_user: RegistrarDep,
) -> CertificateTemplateResponse:
    _ = current_user
    template = await session.get(CertificateTemplate, template_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    data = body.model_dump(exclude_unset=True)
    if "exam_id" in data and data["exam_id"] is not None:
        exam = await session.get(Exam, data["exam_id"])
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
        data["exam_type"] = exam.exam_type
    for key, value in data.items():
        setattr(template, key, value)
    template.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(template)
    return CertificateTemplateResponse.model_validate(template)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_certificate_template(
    template_id: int,
    session: DBSessionDep,
    current_user: RegistrarDep,
) -> None:
    _ = current_user
    template = await session.get(CertificateTemplate, template_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    template.is_active = False
    template.updated_at = datetime.utcnow()
    await session.commit()


@router.get("/exam-registrations/{registration_id}/certificate/preview")
async def preview_certificate(
    registration_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
    template_id: int | None = Query(None),
    issuance_date: date | None = Query(
        None, description="Official completion/issuance date shown on the certificate"
    ),
) -> Response:
    _ = current_user
    pdf_bytes = await issuance_service.preview_certificate_pdf(
        session,
        registration_id,
        template_id=template_id,
        issuance_date=issuance_date,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="certificate-preview.pdf"'},
    )


@router.post(
    "/exam-registrations/{registration_id}/certificate/generate",
    response_model=CertificateIssuanceResponse,
)
async def generate_certificate(
    registration_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
    template_id: int | None = Query(None),
    reissue: bool = Query(False),
    void_reason: str | None = Query(None),
    issuance_date: date | None = Query(
        None, description="Official completion/issuance date (distinct from printed date)"
    ),
    download: bool = Query(True, description="If true, response is PDF bytes; issuance JSON via X-Certificate-* headers"),
) -> Response | CertificateIssuanceResponse:
    issuance, pdf_bytes = await issuance_service.generate_certificate(
        session,
        registration_id,
        user_id=current_user.id,
        template_id=template_id,
        reissue=reissue,
        void_reason=void_reason,
        issuance_date=issuance_date,
    )
    if download:
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{issuance.certificate_number}.pdf"',
                "X-Certificate-Number": issuance.certificate_number,
                "X-Certificate-Issuance-Id": str(issuance.id),
                "X-Certificate-Status": issuance.status.value
                if hasattr(issuance.status, "value")
                else str(issuance.status),
            },
        )
    return CertificateIssuanceResponse.model_validate(issuance)


@router.get(
    "/exam-registrations/{registration_id}/certificate/issuance",
    response_model=CertificateIssuanceResponse | None,
)
async def get_registration_issuance(
    registration_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> CertificateIssuanceResponse | None:
    _ = current_user
    issuance = await issuance_service.get_active_issuance(session, registration_id)
    if not issuance:
        return None
    return CertificateIssuanceResponse.model_validate(issuance)


@router.post("/issuances/{issuance_id}/mark-printed", response_model=CertificateIssuanceResponse)
async def mark_certificate_printed(
    issuance_id: int,
    body: MarkPrintedRequest,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> CertificateIssuanceResponse:
    issuance = await issuance_service.mark_issuance_printed(
        session, issuance_id, user_id=current_user.id, printed=body.printed
    )
    return CertificateIssuanceResponse.model_validate(issuance)


@router.get("/issuances/{issuance_id}/download")
async def download_issuance_pdf(
    issuance_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> Response:
    _ = current_user
    issuance = await session.get(CertificateIssuance, issuance_id)
    if not issuance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issuance not found")
    if not issuance.pdf_storage_path:
        # Regenerate from snapshot
        pdf_bytes = await issuance_service.preview_certificate_pdf(
            session,
            issuance.exam_registration_id,
            certificate_number=issuance.certificate_number,
            issuance_date=issuance.issuance_date,
        )
    else:
        pdf_bytes = await issuance_service.certificate_storage_service.retrieve(issuance.pdf_storage_path)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{issuance.certificate_number}.pdf"',
        },
    )


@router.get(
    "/templates/{template_id}/assets",
    response_model=CertificateTemplateAssetListResponse,
)
async def list_template_assets(
    template_id: int,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> CertificateTemplateAssetListResponse:
    _ = current_user
    template = await session.get(CertificateTemplate, template_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    stmt = (
        select(CertificateTemplateAsset)
        .where(CertificateTemplateAsset.template_id == template_id)
        .order_by(CertificateTemplateAsset.key)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return CertificateTemplateAssetListResponse(
        items=[CertificateTemplateAssetResponse.model_validate(r) for r in rows],
        total=len(rows),
    )


@router.post(
    "/templates/{template_id}/assets",
    response_model=CertificateTemplateAssetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_template_asset(
    template_id: int,
    session: DBSessionDep,
    current_user: RegistrarDep,
    file: UploadFile = File(...),
    key: str = Form(..., description="Asset key referenced by layout image fields, e.g. signature"),
    label: str | None = Form(None),
) -> CertificateTemplateAssetResponse:
    _ = current_user
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    mime = file.content_type or "application/octet-stream"
    if not mime.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only image uploads are supported")
    asset = await issuance_service.upsert_template_asset(
        session,
        template_id=template_id,
        key=key,
        label=label,
        content=content,
        filename=file.filename or f"{key}.png",
        mime_type=mime,
    )
    return CertificateTemplateAssetResponse.model_validate(asset)


@router.get("/templates/{template_id}/assets/{asset_key}/file")
async def get_template_asset_file(
    template_id: int,
    asset_key: str,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> Response:
    _ = current_user
    stmt = select(CertificateTemplateAsset).where(
        CertificateTemplateAsset.template_id == template_id,
        CertificateTemplateAsset.key == asset_key,
    )
    asset = (await session.execute(stmt)).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    content = await issuance_service.certificate_storage_service.retrieve(asset.file_path)
    return Response(
        content=content,
        media_type=asset.mime_type,
        headers={"Content-Disposition": f'inline; filename="{asset.file_name}"'},
    )


@router.delete("/templates/{template_id}/assets/{asset_key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template_asset(
    template_id: int,
    asset_key: str,
    session: DBSessionDep,
    current_user: RegistrarDep,
) -> None:
    _ = current_user
    stmt = select(CertificateTemplateAsset).where(
        CertificateTemplateAsset.template_id == template_id,
        CertificateTemplateAsset.key == asset_key,
    )
    asset = (await session.execute(stmt)).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    session.delete(asset)
    await session.commit()
