"""Bank branch directory: super-admin bulk upload; staff search for pickers."""

from datetime import datetime
from typing import cast

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select

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

router = APIRouter(prefix="/bank-branches", tags=["bank-branches"])

_MAX_LIST = 500
_DEFAULT_LIMIT = 200


@router.get("", response_model=BankBranchListResponse)
async def list_bank_branches(
    session: DBSessionDep,
    _user: SupervisorInspectorOrDepotKeeperDep,
    bank_name: str | None = Query(None, description="Substring match (case-insensitive)"),
    bank_name_exact: str | None = Query(None, description="Exact bank name match (case-sensitive)"),
    branch_name: str | None = Query(None, description="Substring match (case-insensitive)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_LIMIT, ge=1, le=_MAX_LIST),
) -> BankBranchListResponse:
    stmt = select(BankBranch)
    count_stmt = select(func.count()).select_from(BankBranch)
    if bank_name_exact and bank_name_exact.strip():
        exact = bank_name_exact.strip()
        stmt = stmt.where(BankBranch.bank_name == exact)
        count_stmt = count_stmt.where(BankBranch.bank_name == exact)
    elif bank_name and bank_name.strip():
        pat = f"%{bank_name.strip()}%"
        stmt = stmt.where(BankBranch.bank_name.ilike(pat))
        count_stmt = count_stmt.where(BankBranch.bank_name.ilike(pat))
    if branch_name and branch_name.strip():
        pat = f"%{branch_name.strip()}%"
        stmt = stmt.where(BankBranch.branch_name.ilike(pat))
        count_stmt = count_stmt.where(BankBranch.branch_name.ilike(pat))

    total = int(await session.scalar(count_stmt) or 0)
    stmt = (
        stmt.order_by(BankBranch.bank_name.asc(), BankBranch.branch_name.asc(), BankBranch.bank_code.asc())
        .offset(skip)
        .limit(limit)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()
    items = [BankBranchRow.model_validate(r) for r in rows]
    return BankBranchListResponse(items=items, total=total)


@router.get("/distinct-bank-names", response_model=list[str])
async def distinct_bank_names(
    session: DBSessionDep,
    _user: SupervisorInspectorOrDepotKeeperDep,
    q: str | None = Query(None, description="Substring filter on bank name"),
    limit: int = Query(100, ge=1, le=500),
) -> list[str]:
    stmt = select(BankBranch.bank_name).distinct()
    if q and q.strip():
        stmt = stmt.where(BankBranch.bank_name.ilike(f"%{q.strip()}%"))
    stmt = stmt.order_by(BankBranch.bank_name.asc()).limit(limit)
    result = await session.execute(stmt)
    return [cast(str, name) for name in result.scalars().all()]


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
