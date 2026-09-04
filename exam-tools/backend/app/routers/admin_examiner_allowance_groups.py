"""Admin API for exam-scoped examiner allowance groups."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies.auth import SuperAdminOrFinanceOfficerDep, SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, ExaminationAllowanceGroupMember, Examiner, RosterAllowanceKey
from app.schemas.examination_allowance_group import (
    AllowanceGroupCreate,
    AllowanceGroupEligibilityPut,
    AllowanceGroupMemberRow,
    AllowanceGroupMembersPut,
    AllowanceGroupMembersResponse,
    AllowanceGroupRename,
    AllowanceGroupRow,
    ExaminationAllowanceGroupsResponse,
    ExaminerAllowanceGroupMembershipPut,
    ExaminerAllowanceGroupMembershipResponse,
)
from app.services.examiner_allowance_groups import (
    create_allowance_group,
    delete_allowance_group,
    eligibility_dict_for_group,
    ensure_general_group,
    ensure_general_membership,
    get_allowance_group,
    list_allowance_groups,
    load_group_member_summaries,
    rename_allowance_group,
    replace_group_eligibility,
    set_examiner_custom_groups,
    set_group_members,
)
from app.services.examiner_compensation import (
    examiner_type_str,
    parse_roster_source_stored,
    region_str,
)

router = APIRouter(prefix="/admin/examinations", tags=["admin-examiner-allowance-groups"])


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    ex = await session.get(Examination, exam_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return ex


def _group_row(group) -> AllowanceGroupRow:
    return AllowanceGroupRow(
        id=group.id,
        name=group.name,
        is_general=bool(group.is_general),
        member_count=len(group.members or []),
        allowances=eligibility_dict_for_group(group),
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


def _member_row(ex: Examiner) -> AllowanceGroupMemberRow:
    return AllowanceGroupMemberRow(
        id=ex.id,
        name=str(ex.name),
        examiner_type=examiner_type_str(ex.examiner_type),
        region=region_str(ex.region),
        roster_source=parse_roster_source_stored(ex.roster_source).value,
        reference_code=str(ex.reference_code) if ex.reference_code else None,
    )


async def _members_response(
    session: DBSessionDep,
    examination_id: int,
    group,
) -> AllowanceGroupMembersResponse:
    if bool(group.is_general):
        return AllowanceGroupMembersResponse(
            group_id=group.id,
            examiner_ids=[],
            members=[],
            is_general=True,
        )
    # Query member ids from the table — do not trust group.members. With
    # expire_on_commit=False, bulk replace leaves the identity-mapped collection stale.
    examiner_ids = sorted(
        (
            await session.execute(
                select(ExaminationAllowanceGroupMember.examiner_id).where(
                    ExaminationAllowanceGroupMember.group_id == group.id,
                )
            )
        ).scalars().all(),
        key=str,
    )
    examiners = await load_group_member_summaries(session, examination_id, examiner_ids)
    members = [_member_row(ex) for ex in examiners]
    return AllowanceGroupMembersResponse(
        group_id=group.id,
        examiner_ids=[m.id for m in members],
        members=members,
        is_general=False,
    )


@router.get(
    "/{exam_id}/allowance-groups",
    response_model=ExaminationAllowanceGroupsResponse,
)
async def list_examination_allowance_groups(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> ExaminationAllowanceGroupsResponse:
    await _load_examination(session, exam_id)
    groups = await list_allowance_groups(session, exam_id)
    await session.commit()
    return ExaminationAllowanceGroupsResponse(
        examination_id=exam_id,
        groups=[_group_row(g) for g in groups],
    )


@router.post(
    "/{exam_id}/allowance-groups",
    response_model=AllowanceGroupRow,
    status_code=status.HTTP_201_CREATED,
)
async def create_examination_allowance_group(
    exam_id: int,
    body: AllowanceGroupCreate,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> AllowanceGroupRow:
    await _load_examination(session, exam_id)
    try:
        group = await create_allowance_group(session, exam_id, body.name)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    await session.commit()
    return _group_row(group)


@router.patch(
    "/{exam_id}/allowance-groups/{group_id}",
    response_model=AllowanceGroupRow,
)
async def rename_examination_allowance_group(
    exam_id: int,
    group_id: UUID,
    body: AllowanceGroupRename,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> AllowanceGroupRow:
    await _load_examination(session, exam_id)
    try:
        group = await rename_allowance_group(session, exam_id, group_id, body.name)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    await session.commit()
    return _group_row(group)


@router.delete(
    "/{exam_id}/allowance-groups/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_examination_allowance_group(
    exam_id: int,
    group_id: UUID,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> None:
    await _load_examination(session, exam_id)
    try:
        await delete_allowance_group(session, exam_id, group_id)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    await session.commit()


@router.get(
    "/{exam_id}/allowance-groups/{group_id}/eligibility",
    response_model=AllowanceGroupRow,
)
async def get_examination_allowance_group_eligibility(
    exam_id: int,
    group_id: UUID,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> AllowanceGroupRow:
    await _load_examination(session, exam_id)
    await ensure_general_group(session, exam_id)
    group = await get_allowance_group(session, exam_id, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allowance group not found")
    await session.commit()
    return _group_row(group)


@router.put(
    "/{exam_id}/allowance-groups/{group_id}/eligibility",
    response_model=AllowanceGroupRow,
)
async def put_examination_allowance_group_eligibility(
    exam_id: int,
    group_id: UUID,
    body: AllowanceGroupEligibilityPut,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> AllowanceGroupRow:
    await _load_examination(session, exam_id)
    cells: list[tuple[RosterAllowanceKey, bool]] = []
    for cell in body.cells:
        try:
            key = RosterAllowanceKey(cell.allowance_key)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid allowance_key: {cell.allowance_key}",
            ) from e
        cells.append((key, cell.enabled))
    try:
        group = await replace_group_eligibility(session, exam_id, group_id, cells)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    await session.commit()
    return _group_row(group)


@router.get(
    "/{exam_id}/allowance-groups/{group_id}/members",
    response_model=AllowanceGroupMembersResponse,
)
async def get_examination_allowance_group_members(
    exam_id: int,
    group_id: UUID,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> AllowanceGroupMembersResponse:
    await _load_examination(session, exam_id)
    group = await get_allowance_group(session, exam_id, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allowance group not found")
    return await _members_response(session, exam_id, group)


@router.put(
    "/{exam_id}/allowance-groups/{group_id}/members",
    response_model=AllowanceGroupMembersResponse,
)
async def put_examination_allowance_group_members(
    exam_id: int,
    group_id: UUID,
    body: AllowanceGroupMembersPut,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> AllowanceGroupMembersResponse:
    await _load_examination(session, exam_id)
    try:
        group = await set_group_members(session, exam_id, group_id, body.examiner_ids)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    await session.commit()
    # Reload with members relationship populated
    group = await get_allowance_group(session, exam_id, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allowance group not found")
    return await _members_response(session, exam_id, group)


@router.put(
    "/{exam_id}/examiners/{examiner_id}/allowance-groups",
    response_model=ExaminerAllowanceGroupMembershipResponse,
)
async def put_examiner_allowance_group_membership(
    exam_id: int,
    examiner_id: UUID,
    body: ExaminerAllowanceGroupMembershipPut,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> ExaminerAllowanceGroupMembershipResponse:
    """Set custom allowance groups for one examiner (General is always implied)."""
    await _load_examination(session, exam_id)
    try:
        group_ids = await set_examiner_custom_groups(session, exam_id, examiner_id, body.group_ids)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    await session.commit()
    return ExaminerAllowanceGroupMembershipResponse(
        examiner_id=examiner_id,
        group_ids=group_ids,
    )


@router.post(
    "/{exam_id}/allowance-groups/ensure-general-membership",
    status_code=status.HTTP_204_NO_CONTENT,
    include_in_schema=False,
)
async def backfill_general_membership(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> None:
    await _load_examination(session, exam_id)
    await ensure_general_group(session, exam_id)
    examiners = (
        await session.execute(select(Examiner).where(Examiner.examination_id == exam_id))
    ).scalars().all()
    for ex in examiners:
        await ensure_general_membership(session, ex)
    await session.commit()
