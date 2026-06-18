"""Super-admin / finance: read-only subject marking groups (cohorts)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies.auth import SuperAdminOrFinanceOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination
from app.schemas.subject_marking_groups import SubjectMarkingGroupResponse
from app.services.subject_marking_group import list_groups

router = APIRouter(prefix="/admin/examinations", tags=["admin-subject-marking-groups"])


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    ex = await session.get(Examination, exam_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return ex


@router.get(
    "/{examination_id}/subject-marking-groups",
    response_model=list[SubjectMarkingGroupResponse],
)
async def admin_list_subject_marking_groups(
    examination_id: int,
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    subject_id: int = Query(..., description="Subject id"),
) -> list[SubjectMarkingGroupResponse]:
    await _load_examination(session, examination_id)
    rows = await list_groups(session, examination_id=examination_id, subject_id=subject_id)
    return [SubjectMarkingGroupResponse(**row) for row in rows]
