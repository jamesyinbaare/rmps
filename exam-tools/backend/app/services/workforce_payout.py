"""Payout list and BoG export for workforce members."""

from __future__ import annotations

from decimal import Decimal
from typing import cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    DataEntryClerk,
    DataEntryClerkBankAccount,
    Examination,
    ExaminationDataEntryClerkRate,
    ExaminationScriptCheckerRate,
    ScriptChecker,
    ScriptCheckerBankAccount,
    Subject,
    WorkforceAssignmentBatchStatus,
)
from app.services.exam_official_bog_export import BogExportRow, bog_workbook_bytes, exam_bog_export_filename
from app.services.exam_official_export import examination_label, safe_filename_part
from app.services.workforce_compensation import (
    compute_script_checker_bulk_payout,
    compute_workforce_payout,
    rate_config_from_data_entry_clerk_row,
    rate_config_from_script_checker_row,
)

DESIGNATION_SCRIPT_CHECKER = "Script checker"
DESIGNATION_DATA_ENTRY_CLERK = "Data entry clerk"


def _bog_display_name(raw: str) -> str:
    return raw.strip().upper()


def _batch_status_value(batch) -> str:
    return batch.status.value if hasattr(batch.status, "value") else str(batch.status)


def _subjects_for_batches(batches) -> set[int]:
    return {
        int(batch.subject_id)
        for batch in batches
        if _batch_status_value(batch) == WorkforceAssignmentBatchStatus.COMPLETED.value
    }


async def _load_subjects_map(session: AsyncSession, subject_ids: set[int]) -> dict[int, Subject]:
    if not subject_ids:
        return {}
    stmt = select(Subject).where(Subject.id.in_(subject_ids))
    return {int(subject.id): subject for subject in (await session.execute(stmt)).scalars().all()}


def _bank_fields(account: ScriptCheckerBankAccount | DataEntryClerkBankAccount | None) -> dict:
    if account is None:
        return {
            "bank_branch_id": None,
            "bank_code": None,
            "bank_name": None,
            "branch_name": None,
            "account_number": None,
            "has_bank_account": False,
        }
    bb = account.bank_branch
    return {
        "bank_branch_id": account.bank_branch_id,
        "bank_code": cast(str, bb.bank_code) if bb else None,
        "bank_name": cast(str, bb.bank_name) if bb else None,
        "branch_name": cast(str, bb.branch_name) if bb else None,
        "account_number": cast(str, account.account_number),
        "has_bank_account": True,
    }


def _payout_item_from_breakdown(
    *,
    person_id: UUID,
    examination_id: int,
    examination_label_value: str,
    full_name: str,
    reference_code: str | None,
    phone_number: str | None,
    breakdown,
    bank: dict,
) -> dict:
    return {
        "id": person_id,
        "examination_id": examination_id,
        "examination_label": examination_label_value,
        "full_name": full_name,
        "reference_code": reference_code,
        "phone_number": phone_number,
        "completed_scripts": breakdown.completed_scripts,
        "num_days": breakdown.num_days,
        "rate_per_script_ghs": breakdown.rate_per_script_ghs,
        "objective_rate_per_script_ghs": breakdown.objective_rate_per_script_ghs,
        "subjective_rate_per_script_ghs": breakdown.subjective_rate_per_script_ghs,
        "commuting_allowance_ghs": breakdown.commuting_allowance_ghs,
        "lunch_allowance_ghs": breakdown.lunch_allowance_ghs,
        "commuting_payable_ghs": breakdown.commuting_payable_ghs,
        "lunch_payable_ghs": breakdown.lunch_payable_ghs,
        "script_gross_ghs": breakdown.script_gross_ghs,
        "withholding_tax_percent": breakdown.withholding_tax_percent,
        "withholding_tax_ghs": breakdown.withholding_tax_ghs,
        "script_net_ghs": breakdown.script_net_ghs,
        "has_rate": breakdown.has_rate,
        "payable_ghs": breakdown.payable_ghs,
        "completed_batch_lines": breakdown.completed_batch_lines,
        **bank,
    }


async def list_script_checker_payouts(
    session: AsyncSession,
    *,
    examination_id: int,
) -> dict:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")

    rate_row = await session.get(ExaminationScriptCheckerRate, examination_id)
    rate_config = rate_config_from_script_checker_row(rate_row)

    stmt = (
        select(ScriptChecker)
        .where(ScriptChecker.examination_id == examination_id)
        .options(
            selectinload(ScriptChecker.bank_account).selectinload(ScriptCheckerBankAccount.bank_branch),
            selectinload(ScriptChecker.bulk_assignment),
        )
        .order_by(ScriptChecker.name)
    )
    people = list((await session.execute(stmt)).scalars().all())

    items = []
    for person in people:
        breakdown = compute_script_checker_bulk_payout(person.bulk_assignment, rate_config)
        bank = _bank_fields(person.bank_account)
        item = _payout_item_from_breakdown(
            person_id=person.id,
            examination_id=examination_id,
            examination_label_value=examination_label(exam),
            full_name=person.name,
            reference_code=person.reference_code,
            phone_number=person.phone_number,
            breakdown=breakdown,
            bank=bank,
        )
        bulk = person.bulk_assignment
        item["paper1_script_count"] = int(getattr(bulk, "paper1_script_count", 0) or 0) if bulk is not None else 0
        item["paper2_script_count"] = int(getattr(bulk, "paper2_script_count", 0) or 0) if bulk is not None else 0
        items.append(item)
    return {"items": items, "total": len(items)}


async def list_data_entry_clerk_payouts(
    session: AsyncSession,
    *,
    examination_id: int,
) -> dict:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")

    rate_row = await session.get(ExaminationDataEntryClerkRate, examination_id)
    rate_config = rate_config_from_data_entry_clerk_row(rate_row)

    stmt = (
        select(DataEntryClerk)
        .where(DataEntryClerk.examination_id == examination_id)
        .options(
            selectinload(DataEntryClerk.bank_account).selectinload(DataEntryClerkBankAccount.bank_branch),
            selectinload(DataEntryClerk.assignment_batches),
        )
        .order_by(DataEntryClerk.name)
    )
    people = list((await session.execute(stmt)).scalars().all())
    all_subject_ids: set[int] = set()
    for person in people:
        all_subject_ids |= _subjects_for_batches(person.assignment_batches)
    subjects_map = await _load_subjects_map(session, all_subject_ids)

    items = []
    for person in people:
        breakdown = compute_workforce_payout(
            person.assignment_batches,
            rate_config,
            subjects=subjects_map,
        )
        bank = _bank_fields(person.bank_account)
        items.append(
            _payout_item_from_breakdown(
                person_id=person.id,
                examination_id=examination_id,
                examination_label_value=examination_label(exam),
                full_name=person.name,
                reference_code=person.reference_code,
                phone_number=person.phone_number,
                breakdown=breakdown,
                bank=bank,
            )
        )
    return {"items": items, "total": len(items)}


def _bank_incomplete(item: dict) -> bool:
    account = (item.get("account_number") or "").strip()
    sort_code = (item.get("bank_code") or "").strip()
    return not account or not sort_code


def _bog_rows_from_payout_items(
    items: list[dict],
    *,
    designation: str,
) -> list[BogExportRow]:
    rows: list[BogExportRow] = []
    serial = 0
    sorted_items = sorted(items, key=lambda r: r["full_name"].lower())
    for item in sorted_items:
        completed = int(item.get("completed_scripts") or 0)
        if completed <= 0:
            continue
        amount = cast(Decimal, item["payable_ghs"])
        if amount < 0:
            amount = Decimal("0")
        account = (item.get("account_number") or "").strip()
        sort_code = (item.get("bank_code") or "").strip()
        incomplete = _bank_incomplete(item)
        serial += 1
        paper_script_counts: tuple[int, ...] = ()
        if "paper1_script_count" in item or "paper2_script_count" in item:
            paper_script_counts = (
                int(item.get("paper1_script_count") or 0),
                int(item.get("paper2_script_count") or 0),
            )
        rows.append(
            BogExportRow(
                serial=f"{serial:06d}",
                sort_code=sort_code,
                account_number=account,
                full_name=_bog_display_name(item["full_name"]),
                designation=designation,
                amount=amount,
                phone_number=(item.get("phone_number") or "").strip(),
                incomplete_bank=incomplete,
                work_units=completed,
                num_days=int(item.get("num_days") or 0),
                paper_script_counts=paper_script_counts,
            )
        )
    return rows


def workforce_bog_workbook_bytes(
    items: list[dict],
    *,
    title: str,
    designation: str,
    work_unit_label: str,
    script_paper_numbers: list[int] | None = None,
) -> bytes:
    rows = _bog_rows_from_payout_items(items, designation=designation)
    return bog_workbook_bytes(
        [],
        {},
        title=title,
        prebuilt_rows=rows,
        include_workforce_detail=True,
        work_unit_label=work_unit_label,
        script_paper_numbers=script_paper_numbers,
    )


def script_checker_bog_workbook_bytes(
    exam: Examination,
    items: list[dict],
) -> bytes:
    title = f"BoG payment — {examination_label(exam)} — script checkers"
    return workforce_bog_workbook_bytes(
        items,
        title=title,
        designation=DESIGNATION_SCRIPT_CHECKER,
        work_unit_label="Scripts",
        script_paper_numbers=[1, 2],
    )


def data_entry_clerk_bog_workbook_bytes(
    exam: Examination,
    items: list[dict],
) -> bytes:
    title = f"BoG payment — {examination_label(exam)} — data entry clerks"
    return workforce_bog_workbook_bytes(
        items,
        title=title,
        designation=DESIGNATION_DATA_ENTRY_CLERK,
        work_unit_label="Entries",
    )


def script_checker_bog_export_filename(exam: Examination) -> str:
    exam_part = safe_filename_part(f"exam_{exam.id}_{examination_label(exam)}")
    return exam_bog_export_filename(exam_part, slug="script_checkers")


def data_entry_clerk_bog_export_filename(exam: Examination) -> str:
    exam_part = safe_filename_part(f"exam_{exam.id}_{examination_label(exam)}")
    return exam_bog_export_filename(exam_part, slug="data_entry_clerks")


build_script_checker_payout_rows = list_script_checker_payouts
build_data_entry_clerk_payout_rows = list_data_entry_clerk_payouts
