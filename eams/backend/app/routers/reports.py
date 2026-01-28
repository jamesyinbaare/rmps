"""Reporting endpoints."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
import io
import csv

from app.dependencies.auth import AdminDep, CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.services.reporting_service import generate_allocation_report, generate_examiner_history_report

router = APIRouter(prefix="/api/v1", tags=["reports"])


@router.get("/admin/reports/allocations/{cycle_id}")
async def get_allocation_report(
    cycle_id: UUID,
    subject_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Get allocation report for a cycle and subject."""
    try:
        report = await generate_allocation_report(session, cycle_id, subject_id)
        return report
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/admin/reports/quota-compliance/{cycle_id}")
async def get_quota_compliance_report(
    cycle_id: UUID,
    subject_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Get quota compliance report for a cycle and subject."""
    try:
        report = await generate_allocation_report(session, cycle_id, subject_id)
        return {
            "cycle_id": str(cycle_id),
            "subject_id": str(subject_id),
            "quota_compliance": report.get("quota_compliance", {}),
            "summary": report.get("summary", {}),
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/examiner/reports/history")
async def get_examiner_history(
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """Get examiner history report for current user."""
    from sqlalchemy import select

    from app.models import Examiner

    examiner_stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner profile not found",
        )

    try:
        report = await generate_examiner_history_report(session, examiner.id)
        return report
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/admin/reports/export/{cycle_id}")
async def export_allocations(
    cycle_id: UUID,
    subject_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> StreamingResponse:
    """Export allocations to CSV."""
    try:
        report = await generate_allocation_report(session, cycle_id, subject_id)

        # Create CSV
        output = io.StringIO()
        writer = csv.writer(output)

        # Write header
        writer.writerow(["Examiner ID", "Score", "Rank", "Status"])

        # Write data
        for examiner in report.get("examiners", []):
            writer.writerow([
                examiner["examiner_id"],
                examiner.get("score", ""),
                examiner.get("rank", ""),
                examiner.get("status", ""),
            ])

        output.seek(0)
        csv_content = output.getvalue()

        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="allocations_{cycle_id}_{subject_id}.csv"',
            },
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
