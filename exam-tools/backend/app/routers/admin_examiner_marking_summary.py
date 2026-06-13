"""Admin per-subject marking summary for finance and coordination."""

from fastapi import APIRouter, HTTPException, status

from app.dependencies.auth import SuperAdminOrFinanceOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination
from app.schemas.admin_examiner_marking_summary import AdminExaminerMarkingSubjectSummaryResponse
from app.services.examiner_marking_subject_summary import build_examiner_marking_subject_summaries

router = APIRouter(prefix="/admin/examinations", tags=["admin-examiner-marking-summary"])


@router.get(
    "/{examination_id}/examiner-marking-subject-summary",
    response_model=AdminExaminerMarkingSubjectSummaryResponse,
)
async def get_examiner_marking_subject_summary(
    examination_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> AdminExaminerMarkingSubjectSummaryResponse:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    items = await build_examiner_marking_subject_summaries(session, examination_id)
    return AdminExaminerMarkingSubjectSummaryResponse(items=items, total=len(items))
