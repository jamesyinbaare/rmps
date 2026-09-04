"""Roster-source allowance eligibility for examiner compensation."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExaminationRosterAllowanceEligibility, ExaminerRosterSource, RosterAllowanceKey

ROSTER_SOURCES: tuple[ExaminerRosterSource, ...] = (
    ExaminerRosterSource.MANUAL,
    ExaminerRosterSource.INVITATION,
    ExaminerRosterSource.SPECIAL,
)

ROSTER_SOURCE_LABELS: dict[ExaminerRosterSource, str] = {
    ExaminerRosterSource.MANUAL: "Regular (manual)",
    ExaminerRosterSource.INVITATION: "Regular (invitation)",
    ExaminerRosterSource.SPECIAL: "Special",
}

ALLOWANCE_KEY_LABELS: dict[RosterAllowanceKey, str] = {
    RosterAllowanceKey.RESPONSIBILITY: "Responsibility",
    RosterAllowanceKey.INCONVENIENCE: "Inconvenience",
    RosterAllowanceKey.CHIEF_EXAMINERS_REPORT: "Chief Examiner's Report",
    RosterAllowanceKey.VETTING: "Vetting of Scripts",
    RosterAllowanceKey.INTERNAL_COMMUTING: "Internal Commuting",
    RosterAllowanceKey.SITTING: "Sitting allowance",
    RosterAllowanceKey.MARKING: "Marking",
    RosterAllowanceKey.TRAVEL: "T & T",
}

EligibilityMap = dict[tuple[ExaminerRosterSource, RosterAllowanceKey], bool]


def default_eligibility_enabled(
    roster_source: ExaminerRosterSource,
    allowance_key: RosterAllowanceKey,
) -> bool:
    if roster_source == ExaminerRosterSource.SPECIAL:
        return allowance_key in {
            RosterAllowanceKey.MARKING,
            RosterAllowanceKey.RESPONSIBILITY,
            RosterAllowanceKey.INCONVENIENCE,
            RosterAllowanceKey.CHIEF_EXAMINERS_REPORT,
        }
    return True


def default_eligibility_map() -> EligibilityMap:
    return {
        (roster_source, allowance_key): default_eligibility_enabled(roster_source, allowance_key)
        for roster_source in ROSTER_SOURCES
        for allowance_key in RosterAllowanceKey
    }


def roster_allowance_key_from_api_label(label: str) -> RosterAllowanceKey:
    raw = label.strip()
    for member in RosterAllowanceKey:
        if member.value == raw:
            return member
    raise ValueError(f"Invalid allowance key (expected one of: {all_allowance_key_labels()})")


def all_allowance_key_labels() -> list[str]:
    return [member.value for member in RosterAllowanceKey]


def is_allowance_enabled(
    eligibility: EligibilityMap | None,
    roster_source: ExaminerRosterSource,
    allowance_key: RosterAllowanceKey,
) -> bool:
    resolved_source = ExaminerRosterSource.from_stored(roster_source)
    if eligibility is None:
        return default_eligibility_enabled(resolved_source, allowance_key)
    if (resolved_source, allowance_key) in eligibility:
        return eligibility[(resolved_source, allowance_key)]
    return default_eligibility_enabled(resolved_source, allowance_key)


async def load_roster_allowance_eligibility_map(
    session: AsyncSession,
    examination_id: int,
) -> EligibilityMap:
    stmt = select(ExaminationRosterAllowanceEligibility).where(
        ExaminationRosterAllowanceEligibility.examination_id == examination_id,
    )
    rows = list((await session.execute(stmt)).scalars().all())
    if not rows:
        return default_eligibility_map()
    result = default_eligibility_map()
    for row in rows:
        try:
            roster_source = ExaminerRosterSource.from_stored(row.roster_source)
            allowance_key = roster_allowance_key_from_api_label(row.allowance_key)
        except ValueError:
            continue
        result[(roster_source, allowance_key)] = bool(row.enabled)
    return result


async def replace_roster_allowance_eligibility(
    session: AsyncSession,
    examination_id: int,
    items: list[tuple[ExaminerRosterSource, RosterAllowanceKey, bool]],
) -> None:
    from sqlalchemy import delete

    await session.execute(
        delete(ExaminationRosterAllowanceEligibility).where(
            ExaminationRosterAllowanceEligibility.examination_id == examination_id,
        )
    )
    now = datetime.utcnow()
    for roster_source, allowance_key, enabled in items:
        session.add(
            ExaminationRosterAllowanceEligibility(
                id=uuid4(),
                examination_id=examination_id,
                roster_source=roster_source.value,
                allowance_key=allowance_key.value,
                enabled=enabled,
                created_at=now,
                updated_at=now,
            )
        )
