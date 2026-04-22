"""Import examination candidates from registration-portal-style Excel/CSV export."""
from __future__ import annotations

import io
import re
from datetime import date, datetime
from uuid import UUID

import pandas as pd
from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ExaminationCandidate,
    ExaminationCandidateSubject,
    Programme,
    School,
    Subject,
    school_programmes,
)
from app.schemas.examination_candidates import ExaminationCandidateImportError


def _normalize_key(key: str) -> str:
    return re.sub(r"\s+", "_", str(key).strip().lower())


def _column_lookup(df: pd.DataFrame) -> dict[str, str]:
    return {_normalize_key(c): c for c in df.columns}


def _get_cell(lookup: dict[str, str], row: pd.Series, *keys: str) -> str:
    for k in keys:
        nk = _normalize_key(k)
        if nk in lookup:
            val = row.get(lookup[nk], "")
            if val is None or (isinstance(val, float) and pd.isna(val)):
                return ""
            return str(val).strip()
    return ""


def _parse_dob(raw: str) -> date | None:
    s = raw.strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s.split("T")[0])
    except ValueError:
        pass
    try:
        ts = pd.to_datetime(s, errors="coerce")
        if pd.isna(ts):
            return None
        return ts.date()
    except Exception:
        return None


def parse_candidates_file(content: bytes, filename: str) -> pd.DataFrame:
    name = (filename or "unknown").lower()
    if name.endswith(".csv"):
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1")
        return pd.read_csv(io.StringIO(text), dtype=str).fillna("")
    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(content), engine="openpyxl", dtype=str).fillna("")
    raise ValueError("File must be CSV or Excel (.csv, .xlsx, .xls)")


async def import_candidates_dataframe(
    session: AsyncSession,
    examination_id: int,
    df: pd.DataFrame,
) -> tuple[int, int, list[ExaminationCandidateImportError]]:
    """Upsert candidates by (examination_id, registration_number). Returns total_rows, successful, errors."""
    errors: list[ExaminationCandidateImportError] = []
    lookup = _column_lookup(df)

    if "registration_number" not in lookup:
        errors.append(
            ExaminationCandidateImportError(
                row_number=0,
                error_message="Missing required column: registration_number",
                field="columns",
            )
        )
        return len(df), 0, errors
    if "name" not in lookup and "full_name" not in lookup:
        errors.append(
            ExaminationCandidateImportError(
                row_number=0,
                error_message="Missing required column: name (or full_name)",
                field="columns",
            )
        )
        return len(df), 0, errors

    total_rows = len(df)
    successful = 0

    school_codes = set()
    programme_codes = set()
    for _, row in df.iterrows():
        sc = _get_cell(lookup, row, "school_code")
        if sc:
            school_codes.add(sc)
        pc = _get_cell(lookup, row, "programme_code")
        if pc:
            programme_codes.add(pc)

    school_by_code: dict[str, School] = {}
    if school_codes:
        sch_stmt = select(School).where(School.code.in_(school_codes))
        sch_res = await session.execute(sch_stmt)
        for s in sch_res.scalars().all():
            school_by_code[s.code] = s

    programme_by_code: dict[str, Programme] = {}
    if programme_codes:
        prog_stmt = select(Programme).where(Programme.code.in_(programme_codes))
        prog_res = await session.execute(prog_stmt)
        for p in prog_res.scalars().all():
            programme_by_code[p.code] = p

    # Ensure school_programmes reflects every (school, programme) pair present in the file where
    # both codes resolve to existing rows. Runs before per-row processing so a single bulk insert
    # suffices; pairs are linked even if a row later fails (e.g. invalid subjects).
    candidate_school_programme_pairs: set[tuple[UUID, int]] = set()
    for _, row in df.iterrows():
        sc = _get_cell(lookup, row, "school_code")
        pc = _get_cell(lookup, row, "programme_code")
        if not sc or not pc:
            continue
        sch = school_by_code.get(sc)
        prog = programme_by_code.get(pc)
        if sch is not None and prog is not None:
            candidate_school_programme_pairs.add((sch.id, prog.id))

    if candidate_school_programme_pairs:
        school_ids = {sid for sid, _pid in candidate_school_programme_pairs}
        programme_ids = {_pid for _sid, _pid in candidate_school_programme_pairs}
        existing_stmt = select(school_programmes.c.school_id, school_programmes.c.programme_id).where(
            school_programmes.c.school_id.in_(school_ids),
            school_programmes.c.programme_id.in_(programme_ids),
        )
        existing_res = await session.execute(existing_stmt)
        existing_pairs = {(row[0], row[1]) for row in existing_res.all()}
        missing_pairs = candidate_school_programme_pairs - existing_pairs
        if missing_pairs:
            await session.execute(
                pg_insert(school_programmes)
                .values([{"school_id": sid, "programme_id": pid} for sid, pid in missing_pairs])
                .on_conflict_do_nothing(constraint="uq_school_programme")
            )

    for row_offset, (_, row) in enumerate(df.iterrows()):
        row_number = row_offset + 2  # sheet row (header + 1-based data)

        reg = _get_cell(lookup, row, "registration_number")
        full_name = _get_cell(lookup, row, "name", "full_name")
        if not reg:
            errors.append(
                ExaminationCandidateImportError(
                    row_number=row_number,
                    error_message="registration_number is required",
                    field="registration_number",
                )
            )
            continue
        if not full_name:
            errors.append(
                ExaminationCandidateImportError(
                    row_number=row_number,
                    error_message="name (or full_name) is required",
                    field="name",
                )
            )
            continue

        school_code = _get_cell(lookup, row, "school_code")
        school_id = None
        if school_code:
            sch = school_by_code.get(school_code)
            if sch is None:
                errors.append(
                    ExaminationCandidateImportError(
                        row_number=row_number,
                        error_message=f"Unknown school_code '{school_code}'",
                        field="school_code",
                    )
                )
                continue
            school_id = sch.id

        programme_code = _get_cell(lookup, row, "programme_code")
        programme_id = None
        if programme_code:
            prog = programme_by_code.get(programme_code)
            if prog is None:
                errors.append(
                    ExaminationCandidateImportError(
                        row_number=row_number,
                        error_message=f"Unknown programme_code '{programme_code}'",
                        field="programme_code",
                    )
                )
                continue
            programme_id = prog.id

        index_number = _get_cell(lookup, row, "index_number") or None
        dob_raw = _get_cell(lookup, row, "dob", "date_of_birth")
        date_of_birth = _parse_dob(dob_raw)
        reg_status = _get_cell(lookup, row, "registration_status") or None
        if not reg_status:
            reg_status = None

        codes_raw = _get_cell(lookup, row, "subject_original_codes", "subject_codes")
        tokens = [t.strip() for t in codes_raw.split(",") if t.strip()]

        subject_errors: list[str] = []
        resolved: list[tuple[int, str, str]] = []
        for oc in tokens:
            sub_stmt = select(Subject).where(or_(Subject.original_code == oc, Subject.code == oc))
            sub_res = await session.execute(sub_stmt)
            subject = sub_res.scalar_one_or_none()
            if subject is None:
                subject_errors.append(oc)
            else:
                code_to_store = subject.original_code if subject.original_code else subject.code
                resolved.append((subject.id, code_to_store, subject.name))

        if subject_errors:
            errors.append(
                ExaminationCandidateImportError(
                    row_number=row_number,
                    error_message=f"Unknown subject code(s): {', '.join(subject_errors)}",
                    field="subject_original_codes",
                )
            )
            continue

        try:
            async with session.begin_nested():
                cand_stmt = select(ExaminationCandidate).where(
                    ExaminationCandidate.examination_id == examination_id,
                    ExaminationCandidate.registration_number == reg,
                )
                cand_res = await session.execute(cand_stmt)
                candidate = cand_res.scalar_one_or_none()

                now = datetime.utcnow()
                if candidate is None:
                    candidate = ExaminationCandidate(
                        examination_id=examination_id,
                        school_id=school_id,
                        programme_id=programme_id,
                        registration_number=reg,
                        index_number=index_number,
                        full_name=full_name,
                        date_of_birth=date_of_birth,
                        registration_status=reg_status,
                    )
                    session.add(candidate)
                    await session.flush()
                else:
                    candidate.school_id = school_id
                    candidate.programme_id = programme_id
                    candidate.index_number = index_number
                    candidate.full_name = full_name
                    candidate.date_of_birth = date_of_birth
                    candidate.registration_status = reg_status
                    candidate.updated_at = now
                    await session.execute(
                        delete(ExaminationCandidateSubject).where(
                            ExaminationCandidateSubject.examination_candidate_id == candidate.id
                        )
                    )
                    await session.flush()

                for sid, scode, sname in resolved:
                    session.add(
                        ExaminationCandidateSubject(
                            examination_candidate_id=candidate.id,
                            subject_id=sid,
                            subject_code=scode,
                            subject_name=sname,
                            series=None,
                        )
                    )
                await session.flush()
        except Exception as exc:
            errors.append(
                ExaminationCandidateImportError(
                    row_number=row_number,
                    error_message=f"Database error: {exc!s}",
                    field=None,
                )
            )
            continue

        successful += 1

    return total_rows, successful, errors
