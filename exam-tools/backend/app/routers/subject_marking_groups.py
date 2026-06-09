from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, status

from app.dependencies.auth import SubjectOfficerDep
from app.dependencies.database import DBSessionDep
from app.schemas.subject_marking_groups import (
    SubjectMarkingGroupCreate,
    SubjectMarkingGroupMembersReplace,
    SubjectMarkingGroupResponse,
    SubjectMarkingGroupUpdate,
)
from app.services.subject_marking_group import (
    create_group,
    delete_group,
    list_groups,
    replace_group_members,
    update_group,
)
from app.services.subject_officer_scope import assert_subject_officer_access

router = APIRouter(tags=["subject-marking-groups"])


@router.get(
    "/examinations/{examination_id}/subject-officer/marking-groups",
    response_model=list[SubjectMarkingGroupResponse],
)
async def get_subject_marking_groups(
    examination_id: int,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
) -> list[SubjectMarkingGroupResponse]:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    rows = await list_groups(session, examination_id=examination_id, subject_id=subject_id)
    return [SubjectMarkingGroupResponse(**row) for row in rows]


@router.post(
    "/examinations/{examination_id}/subject-officer/marking-groups",
    response_model=SubjectMarkingGroupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_subject_marking_group(
    examination_id: int,
    body: SubjectMarkingGroupCreate,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
) -> SubjectMarkingGroupResponse:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    row = await create_group(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        name=body.name,
        coordination_date=body.coordination_date,
        coordination_start_time=body.coordination_start_time,
        coordination_end_time=body.coordination_end_time,
        marking_start_date=body.marking_start_date,
        marking_end_date=body.marking_end_date,
        marked_script_submission_deadline=body.marked_script_submission_deadline,
    )
    return SubjectMarkingGroupResponse(**row)


@router.patch(
    "/examinations/{examination_id}/subject-officer/marking-groups/{group_id}",
    response_model=SubjectMarkingGroupResponse,
)
async def patch_subject_marking_group(
    examination_id: int,
    group_id: UUID,
    body: SubjectMarkingGroupUpdate,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
) -> SubjectMarkingGroupResponse:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    fields_set = body.model_fields_set
    row = await update_group(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
        name=body.name,
        coordination_date=body.coordination_date,
        coordination_start_time=body.coordination_start_time,
        coordination_end_time=body.coordination_end_time,
        marking_start_date=body.marking_start_date,
        marking_end_date=body.marking_end_date,
        marked_script_submission_deadline=body.marked_script_submission_deadline,
        update_coordination_date="coordination_date" in fields_set,
        update_coordination_start_time="coordination_start_time" in fields_set,
        update_coordination_end_time="coordination_end_time" in fields_set,
        update_marking_start_date="marking_start_date" in fields_set,
        update_marking_end_date="marking_end_date" in fields_set,
        update_submission_deadline="marked_script_submission_deadline" in fields_set,
    )
    return SubjectMarkingGroupResponse(**row)


@router.delete(
    "/examinations/{examination_id}/subject-officer/marking-groups/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_subject_marking_group(
    examination_id: int,
    group_id: UUID,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
) -> None:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    await delete_group(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
    )


@router.put(
    "/examinations/{examination_id}/subject-officer/marking-groups/{group_id}/members",
    response_model=SubjectMarkingGroupResponse,
)
async def put_subject_marking_group_members(
    examination_id: int,
    group_id: UUID,
    body: SubjectMarkingGroupMembersReplace,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(...),
) -> SubjectMarkingGroupResponse:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    row = await replace_group_members(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        group_id=group_id,
        source_regions=body.source_regions,
        source_roles=body.source_roles,
        examiner_ids=body.examiner_ids,
    )
    return SubjectMarkingGroupResponse(**row)
