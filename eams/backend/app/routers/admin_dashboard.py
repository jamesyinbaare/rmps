"""Admin dashboard endpoints for examiner summary."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.dependencies.auth import AdminDep
from app.dependencies.database import DBSessionDep
from app.models import (
    Examiner,
    ExaminerApplication,
    ExaminerApplicationStatus,
    ExaminerStatus,
    ExaminerSubjectEligibility,
    Subject,
    SubjectType,
)

router = APIRouter(prefix="/api/v1/admin/dashboard", tags=["admin-dashboard"])

NEW_APPLICATION_STATUSES = (
    ExaminerApplicationStatus.SUBMITTED,
    ExaminerApplicationStatus.UNDER_REVIEW,
)


@router.get("/summary")
async def get_dashboard_summary(
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """
    Return examiner summary for admin dashboard: cards (core subjects + Electives)
    and table (all subjects with active_examiner_count, new_application_count).
    """
    # All subjects ordered by name
    subjects_stmt = select(Subject).order_by(Subject.name)
    result = await session.execute(subjects_stmt)
    subjects = result.scalars().all()

    # Active examiner count per subject_id: distinct examiners with eligibility,
    # eligible=True, Examiner.status=ACTIVE
    active_stmt = (
        select(
            ExaminerSubjectEligibility.subject_id,
            func.count(func.distinct(ExaminerSubjectEligibility.examiner_id)).label("cnt"),
        )
        .join(Examiner, Examiner.id == ExaminerSubjectEligibility.examiner_id)
        .where(
            ExaminerSubjectEligibility.eligible == True,  # noqa: E712
            Examiner.status == ExaminerStatus.ACTIVE,
        )
        .group_by(ExaminerSubjectEligibility.subject_id)
    )
    active_result = await session.execute(active_stmt)
    active_by_subject = {row.subject_id: row.cnt for row in active_result.all()}

    # New application count per subject_id
    new_stmt = (
        select(ExaminerApplication.subject_id, func.count(ExaminerApplication.id).label("cnt"))
        .where(
            ExaminerApplication.subject_id.isnot(None),
            ExaminerApplication.status.in_(NEW_APPLICATION_STATUSES),
        )
        .group_by(ExaminerApplication.subject_id)
    )
    new_result = await session.execute(new_stmt)
    new_by_subject = {row.subject_id: row.cnt for row in new_result.all()}

    # Build table rows (all subjects)
    table_rows = []
    for s in subjects:
        active = active_by_subject.get(s.id, 0)
        new_apps = new_by_subject.get(s.id, 0)
        table_rows.append({
            "subject_id": str(s.id),
            "subject_name": s.name,
            "subject_type": s.type.value if s.type else None,
            "active_examiner_count": active,
            "new_application_count": new_apps,
        })

    # Cards: one per CORE subject + one "Electives" aggregate
    cards = []
    electives_active = 0
    electives_new = 0
    for s in subjects:
        active = active_by_subject.get(s.id, 0)
        new_apps = new_by_subject.get(s.id, 0)
        if s.type == SubjectType.CORE:
            cards.append({
                "subject_id": str(s.id),
                "subject_name": s.name,
                "active_examiner_count": active,
                "new_application_count": new_apps,
            })
        elif s.type == SubjectType.ELECTIVE:
            electives_active += active
            electives_new += new_apps
    cards.append({
        "subject_id": None,
        "subject_name": "Electives",
        "active_examiner_count": electives_active,
        "new_application_count": electives_new,
    })

    return {"cards": cards, "table": table_rows}


@router.get("/subjects/{subject_id}/details")
async def get_subject_details(
    subject_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """
    Return breakdown by region and by gender for a subject: active examiners and new applications.
    """
    # Subject must exist
    sub_stmt = select(Subject).where(Subject.id == subject_id)
    sub_result = await session.execute(sub_stmt)
    subject = sub_result.scalar_one_or_none()
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found",
        )

    # Active examiners for this subject: ExaminerSubjectEligibility + Examiner (region, gender)
    active_examiners_stmt = (
        select(Examiner.region, Examiner.gender)
        .join(ExaminerSubjectEligibility, Examiner.id == ExaminerSubjectEligibility.examiner_id)
        .where(
            ExaminerSubjectEligibility.subject_id == subject_id,
            ExaminerSubjectEligibility.eligible == True,  # noqa: E712
            Examiner.status == ExaminerStatus.ACTIVE,
        )
    )
    active_result = await session.execute(active_examiners_stmt)
    active_rows = active_result.all()

    # New applications for this subject: ExaminerApplication.region, Examiner.gender (via examiner_id)
    new_apps_stmt = (
        select(ExaminerApplication.region, Examiner.gender)
        .join(Examiner, Examiner.id == ExaminerApplication.examiner_id)
        .where(
            ExaminerApplication.subject_id == subject_id,
            ExaminerApplication.status.in_(NEW_APPLICATION_STATUSES),
        )
    )
    new_result = await session.execute(new_apps_stmt)
    new_rows = new_result.all()

    def _norm_region(r):
        if r is None:
            return "Unknown"
        val = getattr(r, "value", r)
        return str(val).strip() if val else "Unknown"

    def _norm_gender(g):
        return g if g is not None and str(g).strip() else "Unknown"

    # By region: aggregate counts
    by_region: dict[str, dict[str, int]] = {}
    for region, gender in active_rows:
        key = _norm_region(region)
        if key not in by_region:
            by_region[key] = {"active": 0, "new_applications": 0}
        by_region[key]["active"] += 1
    for region, gender in new_rows:
        key = _norm_region(region)
        if key not in by_region:
            by_region[key] = {"active": 0, "new_applications": 0}
        by_region[key]["new_applications"] += 1

    # By gender
    by_gender: dict[str, dict[str, int]] = {}
    for region, gender in active_rows:
        key = _norm_gender(gender)
        if key not in by_gender:
            by_gender[key] = {"active": 0, "new_applications": 0}
        by_gender[key]["active"] += 1
    for region, gender in new_rows:
        key = _norm_gender(gender)
        if key not in by_gender:
            by_gender[key] = {"active": 0, "new_applications": 0}
        by_gender[key]["new_applications"] += 1

    return {
        "subject_id": str(subject_id),
        "subject_name": subject.name,
        "by_region": by_region,
        "by_gender": by_gender,
    }


@router.get("/electives/details")
async def get_electives_details(
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """
    Return breakdown by region and by gender for all ELECTIVE subjects combined.
    """
    subjects_stmt = select(Subject).where(Subject.type == SubjectType.ELECTIVE)
    result = await session.execute(subjects_stmt)
    elective_subjects = result.scalars().all()
    subject_ids = [s.id for s in elective_subjects]
    if not subject_ids:
        return {
            "subject_id": None,
            "subject_name": "Electives",
            "by_region": {},
            "by_gender": {},
        }

    # Active examiners for any of these subjects
    active_examiners_stmt = (
        select(Examiner.region, Examiner.gender)
        .join(ExaminerSubjectEligibility, Examiner.id == ExaminerSubjectEligibility.examiner_id)
        .where(
            ExaminerSubjectEligibility.subject_id.in_(subject_ids),
            ExaminerSubjectEligibility.eligible == True,  # noqa: E712
            Examiner.status == ExaminerStatus.ACTIVE,
        )
    )
    active_result = await session.execute(active_examiners_stmt)
    active_rows = active_result.all()

    # New applications for any of these subjects
    new_apps_stmt = (
        select(ExaminerApplication.region, Examiner.gender)
        .join(Examiner, Examiner.id == ExaminerApplication.examiner_id)
        .where(
            ExaminerApplication.subject_id.in_(subject_ids),
            ExaminerApplication.status.in_(NEW_APPLICATION_STATUSES),
        )
    )
    new_result = await session.execute(new_apps_stmt)
    new_rows = new_result.all()

    def _norm_region(r):
        if r is None:
            return "Unknown"
        val = getattr(r, "value", r)
        return str(val).strip() if val else "Unknown"

    def _norm_gender(g):
        return g if g is not None and str(g).strip() else "Unknown"

    by_region: dict[str, dict[str, int]] = {}
    for region, gender in active_rows:
        key = _norm_region(region)
        if key not in by_region:
            by_region[key] = {"active": 0, "new_applications": 0}
        by_region[key]["active"] += 1
    for region, gender in new_rows:
        key = _norm_region(region)
        if key not in by_region:
            by_region[key] = {"active": 0, "new_applications": 0}
        by_region[key]["new_applications"] += 1

    by_gender: dict[str, dict[str, int]] = {}
    for region, gender in active_rows:
        key = _norm_gender(gender)
        if key not in by_gender:
            by_gender[key] = {"active": 0, "new_applications": 0}
        by_gender[key]["active"] += 1
    for region, gender in new_rows:
        key = _norm_gender(gender)
        if key not in by_gender:
            by_gender[key] = {"active": 0, "new_applications": 0}
        by_gender[key]["new_applications"] += 1

    return {
        "subject_id": None,
        "subject_name": "Electives",
        "by_region": by_region,
        "by_gender": by_gender,
    }
