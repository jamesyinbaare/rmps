"""Results browser and certificate issuance APIs (Phases 1–4)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import and_, exists, func, or_, select

from app.background_tasks import start_certificate_batch_job
from app.dependencies.auth import OfficerDep, RegistrarDep
from app.dependencies.database import DBSessionDep
from app.models import (
    Candidate,
    CertificateBatchJob,
    CertificateIssuance,
    CertificateIssuanceStatus,
    CertificateScanBatch,
    CertificateTemplate,
    CertificateTemplateAsset,
    Exam,
    ExamRegistration,
    ExamSubject,
    Grade,
    Programme,
    School,
    SchoolRegion,
    Subject,
    SubjectRegistration,
    SubjectScore,
)
from app.schemas.certificate import (
    CERTIFICATE_FIELD_CATALOG,
    DEFAULT_CERTIFICATE_LAYOUT,
    BulkMarkPrintedRequest,
    CertificateBatchJobCreate,
    CertificateBatchJobListResponse,
    CertificateBatchJobResponse,
    CertificateFieldCatalogResponse,
    CertificateIssuanceLedgerItem,
    CertificateIssuanceLedgerResponse,
    CertificateIssuanceResponse,
    CertificateScanBatchCreate,
    CertificateScanBatchResponse,
    CertificateScanListResponse,
    CertificateScanResponse,
    CertificateTemplateAssetListResponse,
    CertificateTemplateAssetResponse,
    CertificateTemplateCreate,
    CertificateTemplateListResponse,
    CertificateTemplateResponse,
    CertificateTemplateUpdate,
    ConfirmScanRequest,
    ManualMatchScanRequest,
    MarkPrintedRequest,
    SetCertificateNumberRequest,
    VoidIssuanceRequest,
)
from app.schemas.certificate_results import (
    CandidateResultSummary,
    ExamProgrammeSummary,
    ExamRegistrationResultDetail,
    ExamResultsSummary,
    ExamSchoolListResponse,
    ExamSchoolSummary,
    IssueFormCandidate,
    SchoolResultsSummary,
    IssueFormCandidatesResponse,
    IssueFormProgrammeGroup,
    SchoolResultsListResponse,
    SubjectResultDetail,
)
from app.services import certificate_batch_service as batch_service
from app.services import certificate_issue_form_service as issue_form_service
from app.services import certificate_issuance_service as issuance_service
from app.services import certificate_scan_match_service as scan_service

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


def _school_search_filters(search: str | None) -> list:
    if not search or not search.strip():
        return []
    raw = search.strip()
    term = f"%{raw}%"
    school_match = [
        School.name.ilike(term),
        School.code.ilike(term),
        School.s_code.ilike(term),
    ]
    needle = raw.lower()
    matching_regions = [r for r in SchoolRegion if needle in r.value.lower()]
    if matching_regions:
        school_match.append(School.region.in_(matching_regions))
    return [or_(*school_match)]


def _school_region_label(region: object) -> str | None:
    if region is None:
        return None
    if hasattr(region, "value"):
        return region.value
    return str(region)


def _has_subjects_exists():
    """Registration has at least one subject registration."""
    return exists(
        select(SubjectRegistration.id).where(
            SubjectRegistration.exam_registration_id == ExamRegistration.id
        )
    )


def _has_incomplete_subject_exists():
    """Registration has a subject with a missing or Pending grade."""
    return exists(
        select(SubjectRegistration.id)
        .outerjoin(SubjectScore, SubjectRegistration.id == SubjectScore.subject_registration_id)
        .where(
            SubjectRegistration.exam_registration_id == ExamRegistration.id,
            or_(
                SubjectScore.id.is_(None),
                SubjectScore.grade.is_(None),
                SubjectScore.grade == Grade.PENDING,
            ),
        )
    )


def _fully_graded_exists():
    return and_(_has_subjects_exists(), ~_has_incomplete_subject_exists())


def _active_issuance_exists():
    return exists(
        select(CertificateIssuance.id).where(
            CertificateIssuance.exam_registration_id == ExamRegistration.id,
            CertificateIssuance.status != CertificateIssuanceStatus.VOID,
        )
    )


async def _latest_issuances_for_registrations(
    session: DBSessionDep,
    registration_ids: list[int],
) -> dict[int, CertificateIssuance]:
    if not registration_ids:
        return {}
    stmt = (
        select(CertificateIssuance)
        .where(
            CertificateIssuance.exam_registration_id.in_(registration_ids),
            CertificateIssuance.status != CertificateIssuanceStatus.VOID,
        )
        .order_by(CertificateIssuance.generated_at.desc(), CertificateIssuance.id.desc())
    )
    by_reg: dict[int, CertificateIssuance] = {}
    for issuance in (await session.execute(stmt)).scalars().all():
        by_reg.setdefault(issuance.exam_registration_id, issuance)
    return by_reg


def _completion_percentage(fully_graded: int, candidate_count: int) -> float:
    if candidate_count <= 0:
        return 0.0
    return round(fully_graded / candidate_count * 100.0, 1)


@router.get("/exams/{exam_id}/schools", response_model=ExamSchoolListResponse)
async def list_exam_schools(
    exam_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None, description="Filter by school name, code, or region"),
    include_counts: bool = Query(
        True,
        description="When false, skip candidate and fully-graded aggregates for faster search",
    ),
    include_fully_graded: bool = Query(
        True,
        description="When false, skip fully-graded aggregates and return 0 for that column",
    ),
) -> ExamSchoolListResponse:
    """List schools with candidate registrations for an exam."""
    _ = current_user

    exam = await session.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    search_filters = _school_search_filters(search)

    if not include_counts:
        registered = (
            select(ExamRegistration.id)
            .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
            .where(
                ExamRegistration.exam_id == exam_id,
                Candidate.school_id == School.id,
            )
            .exists()
        )
        school_filters = [registered, *search_filters]
        count_stmt = select(func.count(School.id)).where(*school_filters)
        total = (await session.execute(count_stmt)).scalar() or 0
        stmt = (
            select(School.id, School.code, School.name, School.region)
            .where(*school_filters)
            .order_by(School.code)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await session.execute(stmt)).all()
        items = [
            ExamSchoolSummary(
                school_id=r.id,
                school_code=r.code,
                school_name=r.name,
                region=_school_region_label(r.region),
                candidate_count=0,
                fully_graded_count=0,
            )
            for r in rows
        ]
        return ExamSchoolListResponse(items=items, total=total, page=page, page_size=page_size)

    base_filters = [ExamRegistration.exam_id == exam_id, *search_filters]

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

    school_ids = [r.id for r in rows]
    fully_graded_by_school: dict[int, int] = defaultdict(int)
    if include_fully_graded and school_ids:
        graded_stmt = (
            select(
                Candidate.school_id,
                func.count(ExamRegistration.id).label("fully_graded_count"),
            )
            .select_from(ExamRegistration)
            .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
            .where(
                ExamRegistration.exam_id == exam_id,
                Candidate.school_id.in_(school_ids),
                _fully_graded_exists(),
            )
            .group_by(Candidate.school_id)
        )
        graded_rows = (await session.execute(graded_stmt)).all()
        for school_id, count in graded_rows:
            fully_graded_by_school[school_id] = count

    items = [
        ExamSchoolSummary(
            school_id=r.id,
            school_code=r.code,
            school_name=r.name,
            region=_school_region_label(r.region),
            candidate_count=r.candidate_count,
            fully_graded_count=fully_graded_by_school.get(r.id, 0),
        )
        for r in rows
    ]

    return ExamSchoolListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/exams/{exam_id}/summary", response_model=ExamResultsSummary)
async def get_exam_results_summary(
    exam_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> ExamResultsSummary:
    """Exam-level results KPIs: schools, candidates, and grading completion."""
    _ = current_user

    exam = await session.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    school_count = (
        await session.execute(
            select(func.count(func.distinct(Candidate.school_id)))
            .select_from(ExamRegistration)
            .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
            .where(ExamRegistration.exam_id == exam_id)
        )
    ).scalar() or 0

    candidate_count = (
        await session.execute(
            select(func.count(ExamRegistration.id)).where(ExamRegistration.exam_id == exam_id)
        )
    ).scalar() or 0

    fully_graded_count = (
        await session.execute(
            select(func.count(ExamRegistration.id)).where(
                ExamRegistration.exam_id == exam_id,
                _fully_graded_exists(),
            )
        )
    ).scalar() or 0

    pending_count = max(0, candidate_count - fully_graded_count)
    return ExamResultsSummary(
        exam_id=exam_id,
        school_count=school_count,
        candidate_count=candidate_count,
        fully_graded_count=fully_graded_count,
        pending_count=pending_count,
        completion_percentage=_completion_percentage(fully_graded_count, candidate_count),
    )


@router.get(
    "/exams/{exam_id}/schools/{school_id}/programmes",
    response_model=list[ExamProgrammeSummary],
)
async def list_exam_school_programmes(
    exam_id: int,
    school_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
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
    "/exams/{exam_id}/schools/{school_id}/summary",
    response_model=SchoolResultsSummary,
)
async def get_school_results_summary(
    exam_id: int,
    school_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> SchoolResultsSummary:
    """School-level results KPIs for one examination."""
    _ = current_user

    exam = await session.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    school = await session.get(School, school_id)
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    school_filters = [
        ExamRegistration.exam_id == exam_id,
        Candidate.school_id == school_id,
    ]

    candidate_count = (
        await session.execute(
            select(func.count(ExamRegistration.id))
            .select_from(ExamRegistration)
            .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
            .where(*school_filters)
        )
    ).scalar() or 0

    fully_graded_count = (
        await session.execute(
            select(func.count(ExamRegistration.id))
            .select_from(ExamRegistration)
            .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
            .where(*school_filters, _fully_graded_exists())
        )
    ).scalar() or 0

    programme_count = (
        await session.execute(
            select(func.count(func.distinct(Candidate.programme_id)))
            .select_from(ExamRegistration)
            .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
            .where(*school_filters, Candidate.programme_id.is_not(None))
        )
    ).scalar() or 0

    pending_count = max(0, candidate_count - fully_graded_count)
    return SchoolResultsSummary(
        exam_id=exam_id,
        school_id=school.id,
        school_code=school.code,
        school_name=school.name,
        region=_school_region_label(school.region),
        candidate_count=candidate_count,
        fully_graded_count=fully_graded_count,
        pending_count=pending_count,
        completion_percentage=_completion_percentage(fully_graded_count, candidate_count),
        programme_count=programme_count,
    )


@router.get(
    "/exams/{exam_id}/schools/{school_id}/results",
    response_model=SchoolResultsListResponse,
)
async def list_school_results(
    exam_id: int,
    school_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
    programme_id: int | None = Query(None),
    search: str | None = Query(None, description="Filter by candidate name or index number"),
    status: str | None = Query(
        None,
        description="ready | pending | issued | not_issued",
    ),
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
    status_key = (status or "").strip().lower()
    if status_key == "ready":
        filters.append(_fully_graded_exists())
    elif status_key == "pending":
        filters.append(~_fully_graded_exists())
    elif status_key == "issued":
        filters.append(_active_issuance_exists())
    elif status_key == "not_issued":
        filters.append(~_active_issuance_exists())

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
    issuances = await _latest_issuances_for_registrations(session, reg_ids)

    items: list[CandidateResultSummary] = []
    for exam_reg, candidate, programme in rows:
        registered, graded, pending, is_fully = _summarize_subjects(by_reg.get(exam_reg.id, []))
        issuance = issuances.get(exam_reg.id)
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
                issuance_id=issuance.id if issuance else None,
                certificate_number=issuance.certificate_number if issuance else None,
                issuance_status=issuance.status if issuance else None,
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


async def _issue_form_candidates_response(
    session,
    *,
    exam_id: int,
    school_id: int,
    include_unnumbered: bool,
    programme_id: int | None,
    search: str | None = None,
    number_status: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> IssueFormCandidatesResponse:
    exam = await session.get(Exam, exam_id)
    school = await session.get(School, school_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    total = await issue_form_service.count_issue_form_rows(
        session,
        exam_id=exam_id,
        school_id=school_id,
        include_unnumbered=include_unnumbered,
        programme_id=programme_id,
        search=search,
        number_status=number_status,
    )
    rows = await issue_form_service.load_issue_form_rows(
        session,
        exam_id=exam_id,
        school_id=school_id,
        include_unnumbered=include_unnumbered,
        programme_id=programme_id,
        search=search,
        number_status=number_status,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    items: list[IssueFormCandidate] = []
    for issuance, exam_reg, candidate, programme in rows:
        items.append(
            IssueFormCandidate(
                issuance_id=issuance.id if issuance else None,
                exam_registration_id=exam_reg.id,
                candidate_id=candidate.id,
                candidate_name=candidate.name or "",
                index_number=exam_reg.index_number or candidate.index_number or "",
                certificate_number=issuance.certificate_number if issuance else None,
                status=issuance.status if issuance else None,
                programme_id=programme.id if programme else None,
                programme_code=programme.code if programme else None,
                programme_name=programme.name if programme else None,
            )
        )
    programme_rows = await issue_form_service.load_issue_form_programme_groups(
        session,
        exam_id=exam_id,
        school_id=school_id,
        include_unnumbered=include_unnumbered,
        search=search,
        number_status=number_status,
    )
    programmes = [
        IssueFormProgrammeGroup(
            programme_id=prog_id,
            programme_code=prog_code,
            programme_name=prog_name,
            candidate_count=count,
        )
        for prog_id, prog_code, prog_name, count in programme_rows
    ]
    return IssueFormCandidatesResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        school_id=school.id,
        school_code=school.code,
        school_name=school.name,
        exam_id=exam.id,
        exam_label=_exam_label(exam),
        programmes=programmes,
    )


@router.get(
    "/exams/{exam_id}/schools/{school_id}/issue-form-candidates",
    response_model=IssueFormCandidatesResponse,
)
async def list_exam_school_issue_form_candidates(
    exam_id: int,
    school_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
    include_unnumbered: bool = Query(
        False,
        description="Include registered candidates that do not yet have a certificate number",
    ),
    programme_id: int | None = Query(None),
    search: str | None = Query(None),
    number_status: str | None = Query(None, description="all | numbered | missing"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> IssueFormCandidatesResponse:
    _ = current_user
    return await _issue_form_candidates_response(
        session,
        exam_id=exam_id,
        school_id=school_id,
        include_unnumbered=include_unnumbered,
        programme_id=programme_id,
        search=search,
        number_status=number_status,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/exam-registrations/{registration_id}/result-detail",
    response_model=ExamRegistrationResultDetail,
)
async def get_exam_registration_result_detail(
    registration_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
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
    current_user: OfficerDep,
) -> CertificateFieldCatalogResponse:
    """List available layout fields (exam-sourced data and static/image fields)."""
    _ = current_user
    return CertificateFieldCatalogResponse(items=CERTIFICATE_FIELD_CATALOG)


@router.get("/templates/default-layout")
async def get_default_layout(current_user: OfficerDep) -> dict[str, Any]:
    _ = current_user
    return dict(DEFAULT_CERTIFICATE_LAYOUT)


@router.get("/templates", response_model=CertificateTemplateListResponse)
async def list_certificate_templates(
    session: DBSessionDep,
    current_user: OfficerDep,
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
    current_user: OfficerDep,
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
    current_user: OfficerDep,
    template_id: int | None = Query(None),
    issuance_date: date | None = Query(
        None, description="Official completion/issuance date shown on the certificate"
    ),
    certificate_number: str | None = Query(
        None, description="Optional certificate number for preview (not auto-assigned)"
    ),
) -> Response:
    _ = current_user
    pdf_bytes = await issuance_service.preview_certificate_pdf(
        session,
        registration_id,
        template_id=template_id,
        issuance_date=issuance_date,
        certificate_number=certificate_number,
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
    certificate_number: str | None = Query(
        None, description="Optional certificate number (manual; leave blank for later OCR)"
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
        certificate_number=certificate_number,
    )
    if download:
        filename = (
            f"{issuance.certificate_number}.pdf"
            if issuance.certificate_number
            else f"issuance_{issuance.id}.pdf"
        )
        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Certificate-Issuance-Id": str(issuance.id),
            "X-Certificate-Status": issuance.status.value
            if hasattr(issuance.status, "value")
            else str(issuance.status),
        }
        if issuance.certificate_number:
            headers["X-Certificate-Number"] = issuance.certificate_number
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers=headers,
        )
    return CertificateIssuanceResponse.model_validate(issuance)


@router.get(
    "/exam-registrations/{registration_id}/certificate/issuance",
    response_model=CertificateIssuanceResponse | None,
)
async def get_registration_issuance(
    registration_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
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
    current_user: OfficerDep,
) -> Response:
    _ = current_user
    issuance = await session.get(CertificateIssuance, issuance_id)
    if not issuance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issuance not found")
    try:
        pdf_bytes = await issuance_service.get_issuance_pdf_bytes(session, issuance)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate PDF is missing and could not be regenerated",
        ) from exc
    filename = (
        f"{issuance.certificate_number}.pdf"
        if issuance.certificate_number
        else f"issuance_{issuance.id}.pdf"
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.patch("/issuances/{issuance_id}/certificate-number", response_model=CertificateIssuanceResponse)
async def set_issuance_certificate_number(
    issuance_id: int,
    body: SetCertificateNumberRequest,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> CertificateIssuanceResponse:
    issuance = await issuance_service.set_certificate_number(
        session,
        issuance_id,
        certificate_number=body.certificate_number,
        user_id=current_user.id,
    )
    return CertificateIssuanceResponse.model_validate(issuance)


@router.get(
    "/templates/{template_id}/assets",
    response_model=CertificateTemplateAssetListResponse,
)
async def list_template_assets(
    template_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
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
    current_user: OfficerDep,
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


# --- Phase 3: batch generate + issuance ledger ---


def _exam_label(exam: Exam) -> str:
    exam_type = exam.exam_type.value if hasattr(exam.exam_type, "value") else str(exam.exam_type)
    series = exam.series.value if hasattr(exam.series, "value") else str(exam.series)
    return f"{exam_type} · {series} · {exam.year}"


def _batch_status_value(job: CertificateBatchJob) -> str:
    return job.status.value if hasattr(job.status, "value") else str(job.status)


async def _serialize_batch_job(
    session: DBSessionDep,
    job: CertificateBatchJob,
) -> CertificateBatchJobResponse:
    exam = await session.get(Exam, job.exam_id)
    school = await session.get(School, job.school_id)
    programme = await session.get(Programme, job.programme_id) if job.programme_id else None
    base = CertificateBatchJobResponse.model_validate(job)
    return base.model_copy(
        update={
            "status": _batch_status_value(job),
            "school_code": school.code if school else None,
            "school_name": school.name if school else None,
            "programme_name": programme.name if programme else None,
            "exam_label": _exam_label(exam) if exam else None,
        }
    )


@router.post(
    "/batches",
    response_model=CertificateBatchJobResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_certificate_batch(
    body: CertificateBatchJobCreate,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> CertificateBatchJobResponse:
    job = await batch_service.create_batch_job(
        session,
        exam_id=body.exam_id,
        school_id=body.school_id,
        programme_id=body.programme_id,
        template_id=body.template_id,
        issuance_date=body.issuance_date,
        only_fully_graded=body.only_fully_graded,
        reissue_existing=body.reissue_existing,
        user_id=current_user.id,
    )
    start_certificate_batch_job(job.id)
    return await _serialize_batch_job(session, job)


@router.get("/batches", response_model=CertificateBatchJobListResponse)
async def list_certificate_batches(
    session: DBSessionDep,
    current_user: OfficerDep,
    exam_id: int | None = Query(None),
    school_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
) -> CertificateBatchJobListResponse:
    _ = current_user
    stmt = select(CertificateBatchJob).order_by(CertificateBatchJob.id.desc()).limit(limit)
    if exam_id is not None:
        stmt = stmt.where(CertificateBatchJob.exam_id == exam_id)
    if school_id is not None:
        stmt = stmt.where(CertificateBatchJob.school_id == school_id)
    rows = (await session.execute(stmt)).scalars().all()
    items = [await _serialize_batch_job(session, job) for job in rows]
    return CertificateBatchJobListResponse(items=items, total=len(items))


@router.get("/batches/{job_id}", response_model=CertificateBatchJobResponse)
async def get_certificate_batch(
    job_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> CertificateBatchJobResponse:
    _ = current_user
    job = await session.get(CertificateBatchJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch job not found")
    return await _serialize_batch_job(session, job)


@router.post("/batches/{job_id}/cancel", response_model=CertificateBatchJobResponse)
async def cancel_certificate_batch(
    job_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> CertificateBatchJobResponse:
    _ = current_user
    job = await batch_service.cancel_batch_job(session, job_id)
    return await _serialize_batch_job(session, job)


@router.get("/batches/{job_id}/download")
async def download_certificate_batch_zip(
    job_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> Response:
    _ = current_user
    data, filename = await batch_service.get_batch_zip_bytes(session, job_id)
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/issuances", response_model=CertificateIssuanceLedgerResponse)
async def list_certificate_issuances(
    session: DBSessionDep,
    current_user: OfficerDep,
    exam_id: int | None = Query(None),
    school_id: int | None = Query(None),
    programme_id: int | None = Query(None),
    status_filter: CertificateIssuanceStatus | None = Query(None, alias="status"),
    search: str | None = Query(None, description="Candidate name, index, or certificate number"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> CertificateIssuanceLedgerResponse:
    _ = current_user
    filters: list[Any] = []
    if exam_id is not None:
        filters.append(ExamRegistration.exam_id == exam_id)
    if school_id is not None:
        filters.append(Candidate.school_id == school_id)
    if programme_id is not None:
        filters.append(Candidate.programme_id == programme_id)
    if status_filter is not None:
        filters.append(CertificateIssuance.status == status_filter)
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(
            (Candidate.name.ilike(term))
            | (Candidate.index_number.ilike(term))
            | (ExamRegistration.index_number.ilike(term))
            | (CertificateIssuance.certificate_number.ilike(term))
        )

    base = (
        select(CertificateIssuance, ExamRegistration, Candidate, School, Programme, Exam)
        .join(ExamRegistration, CertificateIssuance.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id)
        .join(Exam, ExamRegistration.exam_id == Exam.id)
        .outerjoin(Programme, Candidate.programme_id == Programme.id)
    )
    if filters:
        base = base.where(*filters)

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = (
        base.order_by(CertificateIssuance.generated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(stmt)).all()
    items: list[CertificateIssuanceLedgerItem] = []
    for issuance, exam_reg, candidate, school, programme, exam in rows:
        items.append(
            CertificateIssuanceLedgerItem(
                id=issuance.id,
                exam_registration_id=exam_reg.id,
                certificate_number=issuance.certificate_number,
                status=issuance.status,
                issuance_date=issuance.issuance_date,
                generated_at=issuance.generated_at,
                printed_at=issuance.printed_at,
                void_reason=issuance.void_reason,
                candidate_name=candidate.name,
                index_number=exam_reg.index_number or candidate.index_number,
                school_id=school.id,
                school_code=school.code,
                school_name=school.name,
                programme_id=programme.id if programme else None,
                programme_name=programme.name if programme else None,
                exam_id=exam.id,
                exam_label=_exam_label(exam),
            )
        )
    return CertificateIssuanceLedgerResponse(
        items=items, total=total, page=page, page_size=page_size
    )


@router.post("/issuances/bulk-mark-printed", response_model=list[CertificateIssuanceResponse])
async def bulk_mark_certificates_printed(
    body: BulkMarkPrintedRequest,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> list[CertificateIssuanceResponse]:
    updated = await batch_service.bulk_mark_printed(
        session,
        body.issuance_ids,
        user_id=current_user.id,
        printed=body.printed,
    )
    return [CertificateIssuanceResponse.model_validate(i) for i in updated]


@router.post("/issuances/{issuance_id}/void", response_model=CertificateIssuanceResponse)
async def void_certificate_issuance(
    issuance_id: int,
    body: VoidIssuanceRequest,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> CertificateIssuanceResponse:
    issuance = await batch_service.void_issuance(
        session,
        issuance_id,
        user_id=current_user.id,
        reason=body.reason,
    )
    return CertificateIssuanceResponse.model_validate(issuance)


# ---------------------------------------------------------------------------
# Phase 4 — Certificate Studio
# ---------------------------------------------------------------------------


def _scan_status_value(value: object) -> str:
    return value.value if hasattr(value, "value") else str(value)


async def _batch_response(session: DBSessionDep, batch: CertificateScanBatch) -> CertificateScanBatchResponse:
    scans_out: list[CertificateScanResponse] = []
    for scan in sorted(batch.scans, key=lambda s: s.id):
        data = await scan_service.enrich_scan_for_response(session, scan)
        data["match_status"] = _scan_status_value(data["match_status"])
        scans_out.append(CertificateScanResponse.model_validate(data))
    return CertificateScanBatchResponse(
        id=batch.id,
        exam_id=batch.exam_id,
        roi_certificate_number=batch.roi_certificate_number,
        roi_index_number=batch.roi_index_number,
        status=_scan_status_value(batch.status),
        created_by_user_id=batch.created_by_user_id,
        created_at=batch.created_at,
        updated_at=batch.updated_at,
        completed_at=batch.completed_at,
        scans=scans_out,
    )


@router.post("/studio/batches", response_model=CertificateScanBatchResponse)
async def create_studio_batch(
    body: CertificateScanBatchCreate,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> CertificateScanBatchResponse:
    batch = await scan_service.create_scan_batch(
        session,
        exam_id=body.exam_id,
        roi_certificate_number=body.roi_certificate_number.model_dump(),
        roi_index_number=body.roi_index_number.model_dump(),
        user_id=current_user.id,
    )
    batch = await scan_service.get_scan_batch(session, batch.id)
    return await _batch_response(session, batch)


@router.get("/studio/batches/{batch_id}", response_model=CertificateScanBatchResponse)
async def get_studio_batch(
    batch_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> CertificateScanBatchResponse:
    batch = await scan_service.get_scan_batch(session, batch_id)
    return await _batch_response(session, batch)


@router.post("/studio/batches/{batch_id}/scans", response_model=list[CertificateScanResponse])
async def upload_studio_scans(
    batch_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
    files: list[UploadFile] = File(...),
) -> list[CertificateScanResponse]:
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files uploaded")
    created: list[CertificateScanResponse] = []
    for upload in files:
        content = await upload.read()
        if not content:
            continue
        scan = await scan_service.add_scan_to_batch(
            session,
            batch_id,
            content=content,
            filename=upload.filename or "scan.jpg",
            content_type=upload.content_type,
        )
        data = await scan_service.enrich_scan_for_response(session, scan)
        data["match_status"] = _scan_status_value(data["match_status"])
        created.append(CertificateScanResponse.model_validate(data))
    if not created:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid files uploaded")
    return created


@router.post("/studio/batches/{batch_id}/process", response_model=CertificateScanBatchResponse)
async def process_studio_batch(
    batch_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> CertificateScanBatchResponse:
    batch = await scan_service.process_scan_batch(session, batch_id, user_id=current_user.id)
    return await _batch_response(session, batch)


@router.get("/studio/scans", response_model=CertificateScanListResponse)
async def list_studio_scans(
    session: DBSessionDep,
    current_user: OfficerDep,
    match_status: str | None = Query(None),
    exam_id: int | None = Query(None),
    batch_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> CertificateScanListResponse:
    items, total = await scan_service.list_scans(
        session,
        match_status=match_status,
        exam_id=exam_id,
        batch_id=batch_id,
        page=page,
        page_size=page_size,
    )
    out: list[CertificateScanResponse] = []
    for scan in items:
        data = await scan_service.enrich_scan_for_response(session, scan)
        data["match_status"] = _scan_status_value(data["match_status"])
        out.append(CertificateScanResponse.model_validate(data))
    return CertificateScanListResponse(items=out, total=total, page=page, page_size=page_size)


@router.get("/studio/scans/{scan_id}/image")
async def get_studio_scan_image(
    scan_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> Response:
    scan = await scan_service.get_scan(session, scan_id)
    content = await issuance_service.certificate_storage_service.retrieve(scan.storage_path)
    media = "image/jpeg"
    lower = scan.original_filename.lower()
    if lower.endswith(".png"):
        media = "image/png"
    elif lower.endswith(".tif") or lower.endswith(".tiff"):
        media = "image/tiff"
    elif lower.endswith(".webp"):
        media = "image/webp"
    return Response(content=content, media_type=media)


@router.post("/studio/scans/{scan_id}/confirm", response_model=CertificateScanResponse)
async def confirm_studio_scan(
    scan_id: int,
    body: ConfirmScanRequest,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> CertificateScanResponse:
    scan = await scan_service.confirm_scan(
        session,
        scan_id,
        user_id=current_user.id,
        certificate_number=body.certificate_number,
        index_number=body.index_number,
    )
    data = await scan_service.enrich_scan_for_response(session, scan)
    data["match_status"] = _scan_status_value(data["match_status"])
    return CertificateScanResponse.model_validate(data)


@router.post("/studio/scans/{scan_id}/match", response_model=CertificateScanResponse)
async def manual_match_studio_scan(
    scan_id: int,
    body: ManualMatchScanRequest,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> CertificateScanResponse:
    scan = await scan_service.manual_match_scan(
        session,
        scan_id,
        user_id=current_user.id,
        exam_registration_id=body.exam_registration_id,
        index_number=body.index_number,
        certificate_number=body.certificate_number,
    )
    data = await scan_service.enrich_scan_for_response(session, scan)
    data["match_status"] = _scan_status_value(data["match_status"])
    return CertificateScanResponse.model_validate(data)


@router.post("/studio/scans/{scan_id}/reject", response_model=CertificateScanResponse)
async def reject_studio_scan(
    scan_id: int,
    session: DBSessionDep,
    current_user: OfficerDep,
) -> CertificateScanResponse:
    scan = await scan_service.reject_scan(session, scan_id)
    data = await scan_service.enrich_scan_for_response(session, scan)
    data["match_status"] = _scan_status_value(data["match_status"])
    return CertificateScanResponse.model_validate(data)


@router.get("/studio/issue-form/candidates", response_model=IssueFormCandidatesResponse)
async def list_issue_form_candidates(
    session: DBSessionDep,
    current_user: OfficerDep,
    exam_id: int = Query(...),
    school_id: int = Query(...),
    include_unnumbered: bool = Query(
        False,
        description="Include registered candidates that do not yet have a certificate number",
    ),
    programme_id: int | None = Query(None),
    search: str | None = Query(None),
    number_status: str | None = Query(None, description="all | numbered | missing"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> IssueFormCandidatesResponse:
    _ = current_user
    return await _issue_form_candidates_response(
        session,
        exam_id=exam_id,
        school_id=school_id,
        include_unnumbered=include_unnumbered,
        programme_id=programme_id,
        search=search,
        number_status=number_status,
        page=page,
        page_size=page_size,
    )


@router.get("/studio/issue-form")
async def download_issue_form(
    session: DBSessionDep,
    current_user: OfficerDep,
    exam_id: int = Query(...),
    school_id: int = Query(...),
    include_unnumbered: bool = Query(
        False,
        description="Include generated certificates that do not yet have a certificate number",
    ),
    programme_id: int | None = Query(None),
) -> Response:
    pdf_bytes, filename = await issue_form_service.build_issue_form_pdf(
        session,
        exam_id=exam_id,
        school_id=school_id,
        include_unnumbered=include_unnumbered,
        programme_id=programme_id,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
