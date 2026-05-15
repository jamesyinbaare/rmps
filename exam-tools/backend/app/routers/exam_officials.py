"""CRUD for exam centre officials (inspector; one roster per examination centre host)."""

from datetime import datetime
from typing import cast
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import InspectorDep
from app.dependencies.database import DBSessionDep
from app.models import BankBranch, ExamCentreOfficial, ExamOfficialDesignation, User, UserRole
from app.schemas.exam_official import (
    ExamCentreOfficialCreate,
    ExamCentreOfficialListResponse,
    ExamCentreOfficialResponse,
    ExamCentreOfficialUpdate,
)
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.script_control import school_from_inspector_user
from app.services.timetable_service import resolve_center_host_school

router = APIRouter(tags=["exam-officials"])


async def _inspector_examination_centre_id(session: DBSessionDep, user: User) -> UUID:
    if user.role != UserRole.INSPECTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inspector access only")
    try:
        user_school = await school_from_inspector_user(session, user)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inspector access only") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None
    try:
        host = await resolve_center_host_school(session, user_school)
    except ValueError as e:
        detail = str(e)
        if "Centre host school is missing" in detail or "examination centre" in detail.lower():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from None
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from None
    return host.id


def _official_to_response(row: ExamCentreOfficial) -> ExamCentreOfficialResponse:
    bb = row.bank_branch
    des = row.designation
    if isinstance(des, ExamOfficialDesignation):
        des_str = des.value
    else:
        des_str = str(des)
    return ExamCentreOfficialResponse(
        id=row.id,
        examination_id=row.examination_id,
        center_id=row.center_id,
        full_name=cast(str, row.full_name),
        designation=des_str,
        bank_branch_id=row.bank_branch_id,
        bank_code=cast(str, bb.bank_code),
        bank_name=cast(str, bb.bank_name),
        branch_name=cast(str, bb.branch_name),
        account_number=cast(str, row.account_number),
        num_days=cast(int, row.num_days),
        telephone_number=cast(str, row.telephone_number),
        created_at=cast(datetime, row.created_at),
        updated_at=cast(datetime, row.updated_at),
    )


@router.get(
    "/examinations/{exam_id}/exam-officials/my-centre",
    response_model=ExamCentreOfficialListResponse,
)
async def list_exam_officials(
    exam_id: int,
    session: DBSessionDep,
    user: InspectorDep,
) -> ExamCentreOfficialListResponse:
    center_id = await _inspector_examination_centre_id(session, user)
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    stmt = (
        select(ExamCentreOfficial)
        .where(ExamCentreOfficial.examination_id == exam_id, ExamCentreOfficial.center_id == center_id)
        .options(selectinload(ExamCentreOfficial.bank_branch))
        .order_by(ExamCentreOfficial.full_name.asc(), ExamCentreOfficial.id.asc())
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return ExamCentreOfficialListResponse(items=[_official_to_response(r) for r in rows])


@router.post(
    "/examinations/{exam_id}/exam-officials/my-centre",
    response_model=ExamCentreOfficialResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_exam_official(
    exam_id: int,
    session: DBSessionDep,
    user: InspectorDep,
    body: ExamCentreOfficialCreate,
) -> ExamCentreOfficialResponse:
    center_id = await _inspector_examination_centre_id(session, user)
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    bb = await session.get(BankBranch, body.bank_branch_id)
    if bb is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown bank_branch_id")

    des = ExamOfficialDesignation(body.designation.value)
    row = ExamCentreOfficial(
        examination_id=exam_id,
        center_id=center_id,
        full_name=body.full_name,
        designation=des,
        bank_branch_id=body.bank_branch_id,
        account_number=body.account_number,
        num_days=body.num_days,
        telephone_number=body.telephone_number,
    )
    session.add(row)
    await session.commit()
    stmt = (
        select(ExamCentreOfficial)
        .where(ExamCentreOfficial.id == row.id)
        .options(selectinload(ExamCentreOfficial.bank_branch))
    )
    loaded = (await session.execute(stmt)).scalar_one()
    return _official_to_response(loaded)


@router.patch(
    "/examinations/{exam_id}/exam-officials/my-centre/{official_id}",
    response_model=ExamCentreOfficialResponse,
)
async def update_exam_official(
    exam_id: int,
    official_id: UUID,
    session: DBSessionDep,
    user: InspectorDep,
    body: ExamCentreOfficialUpdate,
) -> ExamCentreOfficialResponse:
    center_id = await _inspector_examination_centre_id(session, user)
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    stmt = (
        select(ExamCentreOfficial)
        .where(
            ExamCentreOfficial.id == official_id,
            ExamCentreOfficial.examination_id == exam_id,
            ExamCentreOfficial.center_id == center_id,
        )
        .options(selectinload(ExamCentreOfficial.bank_branch))
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    if body.full_name is not None:
        row.full_name = body.full_name
    if body.designation is not None:
        row.designation = ExamOfficialDesignation(body.designation.value)
    if body.bank_branch_id is not None:
        bb = await session.get(BankBranch, body.bank_branch_id)
        if bb is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown bank_branch_id")
        row.bank_branch_id = body.bank_branch_id
    if body.account_number is not None:
        row.account_number = body.account_number
    if body.num_days is not None:
        row.num_days = body.num_days
    if body.telephone_number is not None:
        row.telephone_number = body.telephone_number

    await session.commit()
    stmt = (
        select(ExamCentreOfficial)
        .where(ExamCentreOfficial.id == row.id)
        .options(selectinload(ExamCentreOfficial.bank_branch))
    )
    loaded = (await session.execute(stmt)).scalar_one()
    return _official_to_response(loaded)


@router.delete(
    "/examinations/{exam_id}/exam-officials/my-centre/{official_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_exam_official(
    exam_id: int,
    official_id: UUID,
    session: DBSessionDep,
    user: InspectorDep,
) -> None:
    center_id = await _inspector_examination_centre_id(session, user)
    try:
        await load_examination_or_raise(session, exam_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    stmt = select(ExamCentreOfficial).where(
        ExamCentreOfficial.id == official_id,
        ExamCentreOfficial.examination_id == exam_id,
        ExamCentreOfficial.center_id == center_id,
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    await session.delete(row)
    await session.commit()
