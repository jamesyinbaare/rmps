"""Results browser APIs for Certificates module (Phase 1)."""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import (
    Candidate,
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
from app.schemas.certificate_results import (
    CandidateResultSummary,
    ExamProgrammeSummary,
    ExamRegistrationResultDetail,
    ExamSchoolListResponse,
    ExamSchoolSummary,
    SchoolResultsListResponse,
    SubjectResultDetail,
)

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
