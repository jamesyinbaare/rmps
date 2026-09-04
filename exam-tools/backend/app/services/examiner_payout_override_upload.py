"""Bulk upload for special examiners (no phone; marking rate from exam defaults)."""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import BankBranch, Examiner, ExaminerPayoutOverride, ExaminerRosterSource, ExaminerType
from app.services.exam_official_account import normalize_account_for_save
from app.services.examiner_bank_account import upsert_for_examiner
from app.services.examiner_compensation import MarkingDefaults, has_default_marking_rate
from app.services.examiner_portal import generate_portal_token
from app.services.examiner_reference_code import assign_reference_code_to_examiner
from app.services.examiner_report_count import (
    default_report_count,
    parse_report_count_cell,
    parse_reporting_allowance_flag,
    validate_report_count_for_type,
)
from app.services.examiner_roster import (
    normalize_header_key,
    parse_examiner_type_cell,
    parse_region,
    read_examiners_spreadsheet,
)
from app.services.manual_marked_scripts_upload import _parse_total_cell

_MAX_BULK_BYTES = 5 * 1024 * 1024
_MAX_BULK_ROWS = 2000
_MAX_DESCRIPTION_LEN = 200


def _canonical_column_map() -> dict[str, str]:
    return {
        "name": "name",
        "full_name": "name",
        "examiner_type": "examiner_type",
        "type": "examiner_type",
        "role": "examiner_type",
        "region": "region",
        "bank_code": "bank_code",
        "sort_code": "bank_code",
        "account_number": "account_number",
        "account": "account_number",
        "description": "description",
        "notes": "description",
        "paper_1_allocation": "paper_1_allocation",
        "paper1_allocation": "paper_1_allocation",
        "p1_allocation": "paper_1_allocation",
        "paper_2_allocation": "paper_2_allocation",
        "paper2_allocation": "paper_2_allocation",
        "p2_allocation": "paper_2_allocation",
        "total_allocation": "paper_1_allocation",
        "total": "paper_1_allocation",
        "scripts": "paper_1_allocation",
        "report_count": "report_count",
        "reports": "report_count",
        "chief_examiners_report_count": "report_count",
        "reporting_allowance": "reporting_allowance",
        "report_allowance": "reporting_allowance",
    }


def _rename_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = [normalize_header_key(c) for c in out.columns]
    cmap = _canonical_column_map()
    rename = {c: cmap[c] for c in out.columns if c in cmap}
    return out.rename(columns=rename)


def read_payout_override_spreadsheet(file_bytes: bytes, filename: str) -> pd.DataFrame:
    df = read_examiners_spreadsheet(file_bytes, filename)
    return _rename_dataframe_columns(df)


def _parse_account_cell(raw: Any) -> str:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        raise ValueError("account_number is required")
    if isinstance(raw, float):
        if not raw.is_integer():
            raise ValueError("account_number must be a whole number")
        text = str(int(raw))
    elif isinstance(raw, int):
        text = str(raw)
    else:
        text = str(raw).strip()
        if text.endswith(".0") and text[:-2].isdigit():
            text = text[:-2]
    digits = re.sub(r"\D", "", text)
    if not digits:
        raise ValueError("account_number is required")
    return digits


def _parse_optional_total_cell(raw: Any) -> int:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return 0
    text = str(raw).strip()
    if not text:
        return 0
    return _parse_total_cell(raw)


def _normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip()).casefold()


def _row_field(row: pd.Series, key: str) -> str | None:
    value = row.get(key)
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    return text or None


def _parse_description(raw: Any) -> str | None:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    text = str(raw).strip()
    if not text:
        return None
    if len(text) > _MAX_DESCRIPTION_LEN:
        raise ValueError(f"description must be at most {_MAX_DESCRIPTION_LEN} characters")
    return text


def validate_special_allocation_counts(
    *,
    paper_1: int,
    paper_2: int,
    marking_defaults: MarkingDefaults | None,
) -> None:
    if paper_1 < 0 or paper_2 < 0:
        raise ValueError("paper allocations must be >= 0")
    if paper_1 == 0 and paper_2 == 0:
        raise ValueError("At least one of paper_1_allocation or paper_2_allocation must be > 0")
    if paper_1 > 0 and not has_default_marking_rate(marking_defaults, 1):
        raise ValueError("No default marking rate configured for paper 1")
    if paper_2 > 0 and not has_default_marking_rate(marking_defaults, 2):
        raise ValueError("No default marking rate configured for paper 2")


@dataclass
class PayoutOverrideUploadRowError:
    row_number: int
    message: str


@dataclass
class PayoutOverrideUploadResult:
    created_count: int = 0
    updated_count: int = 0
    errors: list[PayoutOverrideUploadRowError] = field(default_factory=list)


async def _bank_branch_for_code(session: AsyncSession, bank_code: str) -> BankBranch:
    code = bank_code.strip()
    stmt = select(BankBranch).where(BankBranch.bank_code == code)
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise ValueError(f"Unknown bank_code: {code!r}")
    return row


async def _find_existing_override_examiner(
    session: AsyncSession,
    *,
    examination_id: int,
    normalized_name: str,
    normalized_account: str,
) -> Examiner | None:
    from app.models import ExaminerBankAccount

    stmt = (
        select(Examiner)
        .join(ExaminerBankAccount, ExaminerBankAccount.examiner_id == Examiner.id)
        .where(
            Examiner.examination_id == examination_id,
            Examiner.roster_source == ExaminerRosterSource.SPECIAL,
            ExaminerBankAccount.account_number == normalized_account,
        )
        .options(selectinload(Examiner.payout_override))
    )
    candidates = list((await session.execute(stmt)).scalars().all())
    for ex in candidates:
        if _normalize_name(str(ex.name)) == normalized_name:
            return ex
    return None


async def _get_payout_override(
    session: AsyncSession,
    examiner_id: UUID,
) -> ExaminerPayoutOverride | None:
    stmt = select(ExaminerPayoutOverride).where(ExaminerPayoutOverride.examiner_id == examiner_id)
    return (await session.execute(stmt)).scalar_one_or_none()


def _upsert_override_fields(
    override: ExaminerPayoutOverride,
    *,
    description: str | None,
    paper_1_script_count: int,
    paper_2_script_count: int,
    now: datetime,
) -> None:
    override.description = description
    override.paper_1_script_count = paper_1_script_count
    override.paper_2_script_count = paper_2_script_count
    override.updated_at = now


async def bulk_upload_payout_overrides(
    session: AsyncSession,
    *,
    examination_id: int,
    marking_defaults: MarkingDefaults | None,
    df: pd.DataFrame,
) -> PayoutOverrideUploadResult:
    required = {
        "name",
        "examiner_type",
        "region",
        "bank_code",
        "account_number",
    }
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}")

    result = PayoutOverrideUploadResult()
    for row_number, (_, row) in enumerate(df.iterrows(), start=2):
        try:
            name = _row_field(row, "name")
            if not name:
                raise ValueError("Name is required")
            examiner_type = parse_examiner_type_cell(row.get("examiner_type"))
            region = parse_region(_row_field(row, "region"))
            bank_code = _row_field(row, "bank_code")
            if not bank_code:
                raise ValueError("bank_code is required")
            account_number = _parse_account_cell(row.get("account_number"))
            description = _parse_description(row.get("description"))
            paper_1 = _parse_optional_total_cell(row.get("paper_1_allocation"))
            paper_2 = _parse_optional_total_cell(row.get("paper_2_allocation"))
            validate_special_allocation_counts(
                paper_1=paper_1,
                paper_2=paper_2,
                marking_defaults=marking_defaults,
            )
            report_count = parse_report_count_cell(
                row.get("report_count"),
                default=default_report_count(examiner_type),
            )
            reporting_allowance_enabled = parse_reporting_allowance_flag(row.get("reporting_allowance"))
            if report_count > 0:
                reporting_allowance_enabled = True
            validate_report_count_for_type(
                report_count,
                examiner_type,
                reporting_allowance_enabled=reporting_allowance_enabled,
            )
            bank_branch = await _bank_branch_for_code(session, bank_code)
            normalized_account = normalize_account_for_save(
                account_number,
                bank_name=str(bank_branch.bank_name),
                bank_code=str(bank_branch.bank_code),
                for_bulk_import=True,
            )
        except ValueError as exc:
            result.errors.append(PayoutOverrideUploadRowError(row_number=row_number, message=str(exc)))
            continue

        norm_name = _normalize_name(name)
        existing = await _find_existing_override_examiner(
            session,
            examination_id=examination_id,
            normalized_name=norm_name,
            normalized_account=normalized_account,
        )
        now = datetime.utcnow()
        try:
            if existing is None:
                ex = Examiner(
                    examination_id=examination_id,
                    name=name,
                    phone_number=None,
                    msisdn=None,
                    examiner_type=examiner_type,
                    region=region,
                    deviation_weight=None,
                    portal_token=generate_portal_token(),
                    roster_source=ExaminerRosterSource.SPECIAL,
                    chief_examiners_report_count=report_count,
                    reporting_allowance_enabled=reporting_allowance_enabled,
                )
                session.add(ex)
                await session.flush()
                await assign_reference_code_to_examiner(session, ex)
                from app.services.examiner_allowance_groups import (
                    ensure_general_membership,
                    parse_allowance_groups_cell,
                    resolve_custom_groups_by_names,
                    set_examiner_custom_groups,
                )

                await ensure_general_membership(session, ex)
                if "allowance_groups" in df.columns:
                    group_names = parse_allowance_groups_cell(row.get("allowance_groups"))
                    group_ids = await resolve_custom_groups_by_names(
                        session, examination_id, group_names
                    )
                    await set_examiner_custom_groups(session, examination_id, ex.id, group_ids)
                await upsert_for_examiner(
                    session,
                    examiner_id=ex.id,
                    bank_branch_id=bank_branch.id,
                    account_number=account_number,
                    bulk_import=True,
                )
                session.add(
                    ExaminerPayoutOverride(
                        examiner_id=ex.id,
                        description=description,
                        paper_1_script_count=paper_1,
                        paper_2_script_count=paper_2,
                        updated_at=now,
                    )
                )
                await session.commit()
                result.created_count += 1
            else:
                existing.name = name
                existing.examiner_type = examiner_type
                existing.region = region
                existing.chief_examiners_report_count = report_count
                existing.reporting_allowance_enabled = reporting_allowance_enabled
                existing.updated_at = now
                from app.services.examiner_allowance_groups import (
                    ensure_general_membership,
                    parse_allowance_groups_cell,
                    resolve_custom_groups_by_names,
                    set_examiner_custom_groups,
                )

                await ensure_general_membership(session, existing)
                if "allowance_groups" in df.columns:
                    group_names = parse_allowance_groups_cell(row.get("allowance_groups"))
                    group_ids = await resolve_custom_groups_by_names(
                        session, examination_id, group_names
                    )
                    await set_examiner_custom_groups(
                        session, examination_id, existing.id, group_ids
                    )
                await upsert_for_examiner(
                    session,
                    examiner_id=existing.id,
                    bank_branch_id=bank_branch.id,
                    account_number=account_number,
                    bulk_import=True,
                )
                override = await _get_payout_override(session, existing.id)
                if override is None:
                    override = ExaminerPayoutOverride(
                        examiner_id=existing.id,
                        description=description,
                        paper_1_script_count=paper_1,
                        paper_2_script_count=paper_2,
                        updated_at=now,
                    )
                    session.add(override)
                else:
                    _upsert_override_fields(
                        override,
                        description=description,
                        paper_1_script_count=paper_1,
                        paper_2_script_count=paper_2,
                        now=now,
                    )
                await session.commit()
                result.updated_count += 1
        except Exception as exc:  # noqa: BLE001
            await session.rollback()
            result.errors.append(PayoutOverrideUploadRowError(row_number=row_number, message=str(exc)))

    return result


def generate_payout_override_template_bytes() -> bytes:
    df = pd.DataFrame(
        {
            "name": ["Jane Doe", "John Chief"],
            "examiner_type": ["AE", "CE"],
            "region": ["Greater Accra", "Ashanti"],
            "bank_code": ["001111", "002222"],
            "account_number": ["1234567890", "9876543210"],
            "description": ["Extra marking batch A", "Special CE marking"],
            "paper_1_allocation": [120, 0],
            "paper_2_allocation": [0, 80],
            "report_count": ["", "2"],
            "reporting_allowance": ["", "yes"],
            "allowance_groups": ["", "Sitting eligible"],
        }
    )
    bio = io.BytesIO()
    with pd.ExcelWriter(bio, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="SpecialExaminers")
        ws = writer.sheets["SpecialExaminers"]
        for row in range(1, 10001):
            ws.cell(row=row, column=5).number_format = "@"
    bio.seek(0)
    return bio.getvalue()
