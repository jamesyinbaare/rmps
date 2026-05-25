"""Per-examination inspector submission period and official-upload toggles."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExamInspectorSubjectScope, ExaminationInspectorSubmissionSettings
from app.services.script_control import script_packing_today_in_configured_zone


async def get_or_create_submission_settings(
    session: AsyncSession,
    examination_id: int,
) -> ExaminationInspectorSubmissionSettings:
    row = await session.get(ExaminationInspectorSubmissionSettings, examination_id)
    if row is None:
        row = ExaminationInspectorSubmissionSettings(
            examination_id=examination_id,
            officials_core_enabled=True,
            officials_elective_enabled=True,
        )
        session.add(row)
        await session.flush()
    return row


def _period_bounds(
    settings: ExaminationInspectorSubmissionSettings,
    subject_scope: ExamInspectorSubjectScope,
) -> tuple[date | None, date | None]:
    if subject_scope == ExamInspectorSubjectScope.CORE:
        return settings.core_submission_period_start, settings.core_submission_period_end
    return settings.elective_submission_period_start, settings.elective_submission_period_end


def is_submission_period_open(
    settings: ExaminationInspectorSubmissionSettings,
    today: date,
    subject_scope: ExamInspectorSubjectScope,
) -> bool:
    start, end = _period_bounds(settings, subject_scope)
    if start is None or end is None:
        return False
    return start <= today <= end


def submission_status_dict(
    settings: ExaminationInspectorSubmissionSettings,
    today: date | None = None,
) -> dict:
    if today is None:
        today = script_packing_today_in_configured_zone()
    core_open = is_submission_period_open(settings, today, ExamInspectorSubjectScope.CORE)
    elective_open = is_submission_period_open(settings, today, ExamInspectorSubjectScope.ELECTIVE)
    return {
        "core_period_open": core_open,
        "core_submission_period_start": settings.core_submission_period_start,
        "core_submission_period_end": settings.core_submission_period_end,
        "elective_period_open": elective_open,
        "elective_submission_period_start": settings.elective_submission_period_start,
        "elective_submission_period_end": settings.elective_submission_period_end,
        "officials_core_enabled": bool(settings.officials_core_enabled),
        "officials_elective_enabled": bool(settings.officials_elective_enabled),
    }


async def assert_submission_period_open(
    session: AsyncSession,
    examination_id: int,
    subject_scope: ExamInspectorSubjectScope,
    *,
    today: date | None = None,
) -> ExaminationInspectorSubmissionSettings:
    settings = await get_or_create_submission_settings(session, examination_id)
    if today is None:
        today = script_packing_today_in_configured_zone()
    if not is_submission_period_open(settings, today, subject_scope):
        scope_label = "Core" if subject_scope == ExamInspectorSubjectScope.CORE else "Elective"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{scope_label} inspector submissions are closed for this examination",
        )
    return settings


async def assert_officials_scope_enabled(
    session: AsyncSession,
    examination_id: int,
    subject_scope: ExamInspectorSubjectScope,
) -> None:
    settings = await get_or_create_submission_settings(session, examination_id)
    if subject_scope == ExamInspectorSubjectScope.CORE and not settings.officials_core_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Core official uploads are disabled for this examination",
        )
    if subject_scope == ExamInspectorSubjectScope.ELECTIVE and not settings.officials_elective_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Elective official uploads are disabled for this examination",
        )


def validate_submission_period_dates(
    start: date | None,
    end: date | None,
    *,
    field_prefix: str,
) -> None:
    if start is not None and end is not None and start > end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_prefix}_start must be on or before {field_prefix}_end",
        )


async def upsert_submission_settings(
    session: AsyncSession,
    examination_id: int,
    *,
    core_submission_period_start: date | None,
    core_submission_period_end: date | None,
    elective_submission_period_start: date | None,
    elective_submission_period_end: date | None,
    officials_core_enabled: bool,
    officials_elective_enabled: bool,
) -> ExaminationInspectorSubmissionSettings:
    validate_submission_period_dates(
        core_submission_period_start,
        core_submission_period_end,
        field_prefix="core_submission_period",
    )
    validate_submission_period_dates(
        elective_submission_period_start,
        elective_submission_period_end,
        field_prefix="elective_submission_period",
    )
    row = await get_or_create_submission_settings(session, examination_id)
    row.core_submission_period_start = core_submission_period_start
    row.core_submission_period_end = core_submission_period_end
    row.elective_submission_period_start = elective_submission_period_start
    row.elective_submission_period_end = elective_submission_period_end
    row.officials_core_enabled = officials_core_enabled
    row.officials_elective_enabled = officials_elective_enabled
    row.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(row)
    return row
