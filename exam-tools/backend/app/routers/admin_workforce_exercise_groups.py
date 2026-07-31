"""Admin CRUD for workforce exercise cohorts (script checkers / data entry clerks)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import AppointmentLettersReleaseMode, WorkforceKind
from app.schemas.cohort_examiner_portal_release import NotifyEligibleAppointmentLettersResponse
from app.schemas.workforce_exercise_group import (
    AppointmentLettersReleaseModeApi,
    WorkforceExerciseGroupAssignRequest,
    WorkforceExerciseGroupCreate,
    WorkforceExerciseGroupMembersReplace,
    WorkforceExerciseGroupReleasePut,
    WorkforceExerciseGroupReleaseResponse,
    WorkforceExerciseGroupResponse,
    WorkforceExerciseGroupUpdate,
)
from app.services.sms.workforce_appointment_letter_release import notify_eligible_members_in_group
from app.services.workforce_exercise_group import (
    WorkforceExerciseGroupNotFoundError,
    add_member,
    assign_person_to_cohort_by_name,
    create_group,
    delete_group,
    get_group,
    group_response,
    list_group_member_persons,
    list_groups,
    remove_member,
    set_members,
    update_group,
    update_group_release,
)
from app.services.workforce_portal_release import is_appointment_letter_available_for_person


def _parse_release_mode(raw: str | AppointmentLettersReleaseMode) -> AppointmentLettersReleaseMode:
    if isinstance(raw, AppointmentLettersReleaseMode):
        return raw
    try:
        return AppointmentLettersReleaseMode(str(raw))
    except ValueError:
        return AppointmentLettersReleaseMode.SCHEDULED_DATE


async def _summary_counts(session: AsyncSession, *, examination_id: int, kind: WorkforceKind, group) -> dict:
    persons = await list_group_member_persons(
        session,
        examination_id=examination_id,
        kind=kind,
        group_id=group.id,
    )
    rostered = len(persons)
    pending = 0
    eligible = 0
    notified = 0
    mode = _parse_release_mode(group.appointment_letters_release_mode)
    release_enabled = bool(group.appointment_letters_release_enabled)

    for person in persons:
        if await is_appointment_letter_available_for_person(
            session,
            examination_id=examination_id,
            kind=kind,
            person_id=person.id,
        ):
            eligible += 1
        elif release_enabled:
            if mode == AppointmentLettersReleaseMode.SCHEDULED_DATE and group.appointment_letters_release_at is None:
                pending += 1
            elif (
                mode == AppointmentLettersReleaseMode.SCHEDULED_DATE
                and group.appointment_letters_release_at is not None
                and datetime.utcnow() < group.appointment_letters_release_at
            ):
                pending += 1
        if person.appointment_letter_notified_at is not None:
            notified += 1

    return {
        "rostered_person_count": rostered,
        "pending_release_count": pending,
        "eligible_now_count": eligible,
        "notified_count": notified,
    }


def _release_response_for_group(group, counts: dict) -> WorkforceExerciseGroupReleaseResponse:
    mode = _parse_release_mode(group.appointment_letters_release_mode)
    return WorkforceExerciseGroupReleaseResponse(
        examination_id=int(group.examination_id),
        kind=group.kind.value if hasattr(group.kind, "value") else str(group.kind),
        group_id=group.id,
        group_name=group.name,
        is_default=bool(group.is_default),
        appointment_letters_release_enabled=bool(group.appointment_letters_release_enabled),
        appointment_letters_release_mode=AppointmentLettersReleaseModeApi(mode.value),
        appointment_letters_release_at=group.appointment_letters_release_at,
        bank_details_editable=bool(group.bank_details_editable),
        updated_at=group.updated_at,
        **counts,
    )


def build_workforce_exercise_group_router(*, kind: WorkforceKind, path_segment: str, tag: str) -> APIRouter:
    router = APIRouter(
        prefix=f"/admin/examinations/{{examination_id}}/{path_segment}",
        tags=[tag],
    )

    @router.get("", response_model=list[WorkforceExerciseGroupResponse])
    async def list_cohorts(
        session: DBSessionDep,
        _: SuperAdminOrTestAdminOfficerDep,
        examination_id: int,
    ) -> list[WorkforceExerciseGroupResponse]:
        try:
            rows = await list_groups(session, examination_id=examination_id, kind=kind)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        return [WorkforceExerciseGroupResponse(**row) for row in rows]

    @router.post("", response_model=WorkforceExerciseGroupResponse, status_code=status.HTTP_201_CREATED)
    async def create_cohort(
        session: DBSessionDep,
        _: SuperAdminOrTestAdminOfficerDep,
        examination_id: int,
        body: WorkforceExerciseGroupCreate,
    ) -> WorkforceExerciseGroupResponse:
        try:
            row = await create_group(
                session,
                examination_id=examination_id,
                kind=kind,
                name=body.name,
                exercise_start_date=body.exercise_start_date,
                work_start_time=body.work_start_time,
                work_end_time=body.work_end_time,
                venue=body.venue,
            )
            await session.commit()
        except ValueError as exc:
            await session.rollback()
            code = (
                status.HTTP_404_NOT_FOUND
                if str(exc) == "Examination not found"
                else status.HTTP_400_BAD_REQUEST
            )
            raise HTTPException(status_code=code, detail=str(exc)) from exc
        return WorkforceExerciseGroupResponse(**row)

    @router.patch("/assignments/{person_id}", response_model=WorkforceExerciseGroupResponse)
    async def patch_person_cohort_assignment(
        session: DBSessionDep,
        _: SuperAdminOrTestAdminOfficerDep,
        examination_id: int,
        person_id: UUID,
        body: WorkforceExerciseGroupAssignRequest,
    ) -> WorkforceExerciseGroupResponse:
        try:
            row = await assign_person_to_cohort_by_name(
                session,
                examination_id=examination_id,
                kind=kind,
                person_id=person_id,
                cohort_name=body.cohort_name,
            )
            await session.commit()
        except ValueError as exc:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        return WorkforceExerciseGroupResponse(**row)

    @router.get("/{group_id}", response_model=WorkforceExerciseGroupResponse)
    async def get_cohort(
        session: DBSessionDep,
        _: SuperAdminOrTestAdminOfficerDep,
        examination_id: int,
        group_id: UUID,
    ) -> WorkforceExerciseGroupResponse:
        try:
            group = await get_group(session, examination_id=examination_id, kind=kind, group_id=group_id)
        except WorkforceExerciseGroupNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        return WorkforceExerciseGroupResponse(**group_response(group))

    @router.patch("/{group_id}", response_model=WorkforceExerciseGroupResponse)
    async def patch_cohort(
        session: DBSessionDep,
        _: SuperAdminOrTestAdminOfficerDep,
        examination_id: int,
        group_id: UUID,
        body: WorkforceExerciseGroupUpdate,
    ) -> WorkforceExerciseGroupResponse:
        fields_set = body.model_fields_set
        try:
            row = await update_group(
                session,
                examination_id=examination_id,
                kind=kind,
                group_id=group_id,
                name=body.name,
                exercise_start_date=body.exercise_start_date,
                work_start_time=body.work_start_time,
                work_end_time=body.work_end_time,
                venue=body.venue,
                update_exercise_start_date="exercise_start_date" in fields_set,
                update_work_start_time="work_start_time" in fields_set,
                update_work_end_time="work_end_time" in fields_set,
                update_venue="venue" in fields_set,
            )
            await session.commit()
        except WorkforceExerciseGroupNotFoundError as exc:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        except ValueError as exc:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        return WorkforceExerciseGroupResponse(**row)

    @router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_cohort(
        session: DBSessionDep,
        _: SuperAdminOrTestAdminOfficerDep,
        examination_id: int,
        group_id: UUID,
    ) -> None:
        try:
            await delete_group(session, examination_id=examination_id, kind=kind, group_id=group_id)
            await session.commit()
        except WorkforceExerciseGroupNotFoundError as exc:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        except ValueError as exc:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    @router.put("/{group_id}/members", response_model=WorkforceExerciseGroupResponse)
    async def put_cohort_members(
        session: DBSessionDep,
        _: SuperAdminOrTestAdminOfficerDep,
        examination_id: int,
        group_id: UUID,
        body: WorkforceExerciseGroupMembersReplace,
    ) -> WorkforceExerciseGroupResponse:
        try:
            row = await set_members(
                session,
                examination_id=examination_id,
                kind=kind,
                group_id=group_id,
                person_ids=body.person_ids,
            )
            await session.commit()
        except WorkforceExerciseGroupNotFoundError as exc:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        except ValueError as exc:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        return WorkforceExerciseGroupResponse(**row)

    @router.post("/{group_id}/members/{person_id}", response_model=WorkforceExerciseGroupResponse)
    async def post_cohort_member(
        session: DBSessionDep,
        _: SuperAdminOrTestAdminOfficerDep,
        examination_id: int,
        group_id: UUID,
        person_id: UUID,
    ) -> WorkforceExerciseGroupResponse:
        try:
            row = await add_member(
                session,
                examination_id=examination_id,
                kind=kind,
                group_id=group_id,
                person_id=person_id,
            )
            await session.commit()
        except WorkforceExerciseGroupNotFoundError as exc:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        except ValueError as exc:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        return WorkforceExerciseGroupResponse(**row)

    @router.delete("/{group_id}/members/{person_id}", response_model=WorkforceExerciseGroupResponse)
    async def delete_cohort_member(
        session: DBSessionDep,
        _: SuperAdminOrTestAdminOfficerDep,
        examination_id: int,
        group_id: UUID,
        person_id: UUID,
    ) -> WorkforceExerciseGroupResponse:
        try:
            row = await remove_member(
                session,
                examination_id=examination_id,
                kind=kind,
                group_id=group_id,
                person_id=person_id,
            )
            await session.commit()
        except WorkforceExerciseGroupNotFoundError as exc:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        return WorkforceExerciseGroupResponse(**row)

    @router.get("/{group_id}/release", response_model=WorkforceExerciseGroupReleaseResponse)
    async def get_cohort_release(
        session: DBSessionDep,
        _: SuperAdminOrTestAdminOfficerDep,
        examination_id: int,
        group_id: UUID,
    ) -> WorkforceExerciseGroupReleaseResponse:
        try:
            group = await get_group(session, examination_id=examination_id, kind=kind, group_id=group_id)
        except WorkforceExerciseGroupNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        counts = await _summary_counts(session, examination_id=examination_id, kind=kind, group=group)
        return _release_response_for_group(group, counts)

    @router.put("/{group_id}/release", response_model=WorkforceExerciseGroupReleaseResponse)
    async def put_cohort_release(
        session: DBSessionDep,
        _: SuperAdminOrTestAdminOfficerDep,
        examination_id: int,
        group_id: UUID,
        body: WorkforceExerciseGroupReleasePut,
    ) -> WorkforceExerciseGroupReleaseResponse:
        try:
            await get_group(session, examination_id=examination_id, kind=kind, group_id=group_id)
        except WorkforceExerciseGroupNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

        mode = AppointmentLettersReleaseMode(body.appointment_letters_release_mode.value)
        if mode == AppointmentLettersReleaseMode.SCHEDULED_DATE and body.appointment_letters_release_enabled:
            if body.appointment_letters_release_at is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Set a release date and time when using scheduled release.",
                )

        try:
            await update_group_release(
                session,
                examination_id=examination_id,
                kind=kind,
                group_id=group_id,
                appointment_letters_release_enabled=body.appointment_letters_release_enabled,
                appointment_letters_release_mode=mode.value,
                appointment_letters_release_at=(
                    body.appointment_letters_release_at if mode == AppointmentLettersReleaseMode.SCHEDULED_DATE else None
                ),
                bank_details_editable=body.bank_details_editable,
            )
            await session.commit()
        except WorkforceExerciseGroupNotFoundError as exc:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

        group = await get_group(session, examination_id=examination_id, kind=kind, group_id=group_id)
        counts = await _summary_counts(session, examination_id=examination_id, kind=kind, group=group)
        return _release_response_for_group(group, counts)

    @router.post(
        "/{group_id}/notify-eligible-appointment-letters",
        response_model=NotifyEligibleAppointmentLettersResponse,
    )
    async def post_notify_eligible_appointment_letters(
        session: DBSessionDep,
        user: SuperAdminOrTestAdminOfficerDep,
        examination_id: int,
        group_id: UUID,
    ) -> NotifyEligibleAppointmentLettersResponse:
        try:
            await get_group(session, examination_id=examination_id, kind=kind, group_id=group_id)
        except WorkforceExerciseGroupNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        result = await notify_eligible_members_in_group(
            session,
            examination_id=examination_id,
            kind=kind,
            group_id=group_id,
            triggered_by_user_id=user.id,
            trigger="notify_eligible",
        )
        await session.commit()
        return NotifyEligibleAppointmentLettersResponse(**result)

    return router


router_script_checkers = build_workforce_exercise_group_router(
    kind=WorkforceKind.SCRIPT_CHECKER,
    path_segment="script-checker-cohorts",
    tag="admin-script-checker-cohorts",
)

router_data_entry_clerks = build_workforce_exercise_group_router(
    kind=WorkforceKind.DATA_ENTRY_CLERK,
    path_segment="data-entry-clerk-cohorts",
    tag="admin-data-entry-clerk-cohorts",
)
