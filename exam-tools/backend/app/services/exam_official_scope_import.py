"""Import exam centre officials between CORE and ELECTIVE scopes at the same centre."""

from __future__ import annotations

from typing import Callable
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ExamCentreOfficial, ExamInspectorSubjectScope, ExamOfficialDesignation
from app.services.subject_scope import opposite_record_scope


def official_identity_key(
    full_name: str,
    designation: ExamOfficialDesignation | str,
    telephone_number: str,
) -> tuple[str, str, str]:
    des = designation.value if isinstance(designation, ExamOfficialDesignation) else str(designation)
    return (full_name.strip().casefold(), des.strip(), telephone_number.strip())


def destination_identity_keys(rows: list[ExamCentreOfficial]) -> set[tuple[str, str, str]]:
    return {
        official_identity_key(
            str(row.full_name),
            row.designation,
            str(row.telephone_number),
        )
        for row in rows
    }


def is_duplicate_in_destination(
    source: ExamCentreOfficial,
    destination_keys: set[tuple[str, str, str]],
) -> bool:
    key = official_identity_key(
        str(source.full_name),
        source.designation,
        str(source.telephone_number),
    )
    return key in destination_keys


async def _load_scope_officials(
    session: AsyncSession,
    *,
    examination_id: int,
    examination_centre_id: UUID,
    subject_scope: ExamInspectorSubjectScope,
) -> list[ExamCentreOfficial]:
    stmt = (
        select(ExamCentreOfficial)
        .where(
            ExamCentreOfficial.examination_id == examination_id,
            ExamCentreOfficial.examination_centre_id == examination_centre_id,
            ExamCentreOfficial.subject_scope == subject_scope,
        )
        .options(selectinload(ExamCentreOfficial.bank_branch))
        .order_by(ExamCentreOfficial.full_name.asc(), ExamCentreOfficial.id.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def load_import_source_and_destination(
    session: AsyncSession,
    *,
    examination_id: int,
    examination_centre_id: UUID,
    destination_scope: ExamInspectorSubjectScope,
) -> tuple[ExamInspectorSubjectScope, list[ExamCentreOfficial], list[ExamCentreOfficial]]:
    source_scope = opposite_record_scope(destination_scope)
    source_rows = await _load_scope_officials(
        session,
        examination_id=examination_id,
        examination_centre_id=examination_centre_id,
        subject_scope=source_scope,
    )
    destination_rows = await _load_scope_officials(
        session,
        examination_id=examination_id,
        examination_centre_id=examination_centre_id,
        subject_scope=destination_scope,
    )
    return source_scope, source_rows, destination_rows


def _preview_row_name(item: dict) -> str:
    off = item["source_official"]
    if hasattr(off, "full_name"):
        return str(off.full_name).casefold()
    return str(off.get("full_name", "")).casefold()


def build_import_preview_rows(
    source_rows: list[ExamCentreOfficial],
    destination_rows: list[ExamCentreOfficial],
    *,
    to_response: Callable[[ExamCentreOfficial], object],
) -> list[dict]:
    dest_keys = destination_identity_keys(destination_rows)
    items: list[dict] = []
    for row in source_rows:
        dup = is_duplicate_in_destination(row, dest_keys)
        items.append(
            {
                "source_official": to_response(row),
                "duplicate_in_destination": dup,
                "importable": not dup,
            }
        )
    # Ready-to-import first; already in destination at the bottom (name order within each group).
    items.sort(key=lambda x: (x["duplicate_in_destination"], _preview_row_name(x)))
    return items


async def import_officials_from_source_scope(
    session: AsyncSession,
    *,
    examination_id: int,
    examination_centre_id: UUID,
    destination_scope: ExamInspectorSubjectScope,
    import_items: list[tuple[UUID, int]],
) -> tuple[list[ExamCentreOfficial], int, int]:
    """Copy selected source-scope officials into destination scope. Returns (created, requested, skipped_duplicates)."""
    _, source_rows, destination_rows = await load_import_source_and_destination(
        session,
        examination_id=examination_id,
        examination_centre_id=examination_centre_id,
        destination_scope=destination_scope,
    )
    source_by_id = {row.id: row for row in source_rows}
    missing = [sid for sid, _ in import_items if sid not in source_by_id]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more source_official_ids are invalid or not in the source scope",
        )

    dest_keys = destination_identity_keys(destination_rows)
    created: list[ExamCentreOfficial] = []
    skipped = 0
    requested = len(import_items)

    for sid, num_days in import_items:
        src = source_by_id[sid]
        if is_duplicate_in_destination(src, dest_keys):
            skipped += 1
            continue
        row = ExamCentreOfficial(
            examination_id=examination_id,
            examination_centre_id=examination_centre_id,
            full_name=src.full_name,
            designation=src.designation,
            bank_branch_id=src.bank_branch_id,
            account_number=src.account_number,
            num_days=num_days,
            telephone_number=src.telephone_number,
            subject_scope=destination_scope,
        )
        session.add(row)
        created.append(row)
        dest_keys.add(
            official_identity_key(
                str(src.full_name),
                src.designation,
                str(src.telephone_number),
            )
        )

    if created:
        await session.commit()
        ids = [r.id for r in created]
        stmt = (
            select(ExamCentreOfficial)
            .where(ExamCentreOfficial.id.in_(ids))
            .options(selectinload(ExamCentreOfficial.bank_branch))
            .order_by(ExamCentreOfficial.full_name.asc(), ExamCentreOfficial.id.asc())
        )
        created = list((await session.execute(stmt)).scalars().all())
    else:
        await session.flush()

    return created, requested, skipped
