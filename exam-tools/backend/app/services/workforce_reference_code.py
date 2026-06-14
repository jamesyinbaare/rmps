"""Auto-generated reference codes for script checkers and data entry clerks."""

from __future__ import annotations

import re
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataEntryClerk, Examination, ScriptChecker

WorkforceReferenceKind = Literal["script_checker", "data_entry_clerk"]

_PREFIX_BY_KIND: dict[WorkforceReferenceKind, str] = {
    "script_checker": "SC",
    "data_entry_clerk": "DE",
}


def workforce_reference_code_prefix(kind: WorkforceReferenceKind, exam_year: int) -> str:
    return f"{_PREFIX_BY_KIND[kind]}{exam_year}-"


def _sequence_pattern(kind: WorkforceReferenceKind, exam_year: int) -> re.Pattern[str]:
    prefix = _PREFIX_BY_KIND[kind]
    return re.compile(rf"^{re.escape(prefix)}{exam_year}-(\d+)$")


async def next_workforce_reference_code(
    session: AsyncSession,
    *,
    kind: WorkforceReferenceKind,
    examination_id: int,
    exam_year: int,
) -> str:
    """Return the next reference code for this examination, e.g. SC2026-3."""
    if kind == "script_checker":
        stmt = select(ScriptChecker.reference_code).where(ScriptChecker.examination_id == examination_id)
    else:
        stmt = select(DataEntryClerk.reference_code).where(DataEntryClerk.examination_id == examination_id)

    codes = list((await session.execute(stmt)).scalars().all())
    pattern = _sequence_pattern(kind, exam_year)
    max_seq = 0
    for code in codes:
        if not code:
            continue
        match = pattern.match(code.strip())
        if match:
            max_seq = max(max_seq, int(match.group(1)))

    prefix = workforce_reference_code_prefix(kind, exam_year)
    return f"{prefix}{max_seq + 1}"


def workforce_reference_kind(person: ScriptChecker | DataEntryClerk) -> WorkforceReferenceKind:
    return "script_checker" if isinstance(person, ScriptChecker) else "data_entry_clerk"


async def ensure_workforce_reference_code(
    session: AsyncSession,
    person: ScriptChecker | DataEntryClerk,
) -> str | None:
    """Assign the next reference code when a person confirms availability."""
    existing = person.reference_code
    if existing and str(existing).strip():
        return str(existing).strip()

    exam = await session.get(Examination, person.examination_id)
    if exam is None:
        raise ValueError("Examination not found")

    kind = workforce_reference_kind(person)
    code = await next_workforce_reference_code(
        session,
        kind=kind,
        examination_id=int(person.examination_id),
        exam_year=int(exam.year),
    )
    person.reference_code = code
    return code
