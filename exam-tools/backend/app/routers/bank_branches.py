"""Bank branch directory: super-admin bulk upload; staff search for pickers."""

from datetime import datetime
from typing import cast

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select

from app.dependencies.auth import SuperAdminDep, SupervisorInspectorOrDepotKeeperDep
from app.dependencies.database import DBSessionDep
from app.models import BankBranch
from app.schemas.bank_branch import (
    BankBranchBulkUploadError,
    BankBranchBulkUploadResponse,
    BankBranchListResponse,
    BankBranchRow,
)
from app.services.school_bulk_upload import (
    SchoolUploadParseError,
    normalize_column_names,
    parse_bank_branch_label,
    parse_bank_code_cell,
    read_upload_as_dataframe,
    validate_bank_branch_required_columns,
)

from app.services.bank_branch_query import (
    DEFAULT_LIMIT,
    MAX_LIST,
    distinct_bank_names,
    list_bank_branches as query_bank_branches,
)

router = APIRouter(prefix="/bank-branches", tags=["bank-branches"])


@router.get("", response_model=BankBranchListResponse)
async def list_bank_branches(
    session: DBSessionDep,
    _user: SupervisorInspectorOrDepotKeeperDep,
    search: str | None = Query(None, description="Substring match on bank name or branch name"),
    bank_name: str | None = Query(None, description="Substring match (case-insensitive)"),
    bank_name_exact: str | None = Query(None, description="Exact bank name match (case-sensitive)"),
    branch_name: str | None = Query(None, description="Substring match (case-insensitive)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIST),
) -> BankBranchListResponse:
    rows, total = await query_bank_branches(
        session,
        search=search,
        bank_name=bank_name,
        bank_name_exact=bank_name_exact,
        branch_name=branch_name,
        skip=skip,
        limit=limit,
    )
    items = [BankBranchRow.model_validate(r) for r in rows]
    return BankBranchListResponse(items=items, total=total)


@router.get("/distinct-bank-names", response_model=list[str])
async def distinct_bank_names(
    session: DBSessionDep,
    _user: SupervisorInspectorOrDepotKeeperDep,
    q: str | None = Query(None, description="Substring filter on bank name"),
    limit: int = Query(100, ge=1, le=500),
) -> list[str]:
    return await distinct_bank_names(session, q=q, limit=limit)


@router.post("/bulk-upload", response_model=BankBranchBulkUploadResponse)
async def bulk_upload_bank_branches(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    file: UploadFile = File(...),
) -> BankBranchBulkUploadResponse:
    content = await file.read()
    try:
        df = read_upload_as_dataframe(content, file.filename or "", all_columns_as_string=True)
        df = normalize_column_names(df)
        validate_bank_branch_required_columns(df)
    except SchoolUploadParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    errors: list[BankBranchBulkUploadError] = []
    parsed: list[tuple[int, str, str, str]] = []

    for i, (_, row) in enumerate(df.iterrows()):
        row_number = i + 2
        try:
            code = parse_bank_code_cell(row.get("bank_code"))
            bank_name = parse_bank_branch_label(row.get("bank_name"), "bank_name")
            branch_name = parse_bank_branch_label(row.get("branch_name"), "branch_name")
        except ValueError as exc:
            errors.append(BankBranchBulkUploadError(row_number=row_number, error_message=str(exc)))
            continue
        parsed.append((row_number, code, bank_name, branch_name))

    # Last row wins for duplicate bank_code in file
    by_code: dict[str, tuple[int, str, str]] = {}
    for row_number, code, bank_name, branch_name in parsed:
        by_code[code] = (row_number, bank_name, branch_name)

    now = datetime.utcnow()
    created = 0
    updated = 0

    for code, (_row_number, bank_name, branch_name) in by_code.items():
        existing = (await session.execute(select(BankBranch).where(BankBranch.bank_code == code))).scalar_one_or_none()
        if existing is None:
            session.add(
                BankBranch(
                    bank_code=code,
                    bank_name=bank_name,
                    branch_name=branch_name,
                    created_at=now,
                    updated_at=now,
                )
            )
            created += 1
        else:
            existing.bank_name = bank_name
            existing.branch_name = branch_name
            existing.updated_at = now
            updated += 1

    await session.commit()

    total_rows = len(df)
    successful = created + updated
    failed = len(errors)
    return BankBranchBulkUploadResponse(
        total_rows=total_rows,
        successful=successful,
        failed=failed,
        errors=errors,
        created=created,
        updated=updated,
    )
