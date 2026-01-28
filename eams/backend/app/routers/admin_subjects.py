"""Admin endpoints for subject management."""
import io
import logging
import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.dependencies.auth import AdminDep
from app.dependencies.database import DBSessionDep
from app.models import Subject, SubjectType
from app.schemas.subject import (
    SubjectBulkUploadError,
    SubjectBulkUploadResponse,
    SubjectCreate,
    SubjectResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/subjects", tags=["admin-subjects"])

VALID_SUBJECT_TYPES = {t.value for t in SubjectType}


def _parse_upload_file(content: bytes, filename: str) -> pd.DataFrame:
    """Parse CSV or Excel file into a DataFrame."""
    name = (filename or "").lower()
    if name.endswith(".csv"):
        return pd.read_csv(io.BytesIO(content))
    if name.endswith(".xlsx") or name.endswith(".xls"):
        return pd.read_excel(io.BytesIO(content))
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="File must be CSV (.csv) or Excel (.xlsx, .xls)",
    )


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names to lowercase with underscores."""
    df = df.copy()
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]
    return df


def _get_str(row: pd.Series, key: str) -> str | None:
    """Get string value from row, strip and return None if empty/NaN."""
    val = row.get(key)
    if pd.isna(val) or val is None:
        return None
    s = str(val).strip()
    return s if s else None


@router.get("", response_model=list[SubjectResponse])
async def list_subjects(
    session: DBSessionDep,
    current_user: AdminDep,
) -> list[SubjectResponse]:
    """List all subjects (admin)."""
    stmt = select(Subject).order_by(Subject.name)
    result = await session.execute(stmt)
    subjects = result.scalars().all()
    return [SubjectResponse.model_validate(s) for s in subjects]


@router.post("", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def create_subject(
    data: SubjectCreate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> SubjectResponse:
    """Create a single subject."""
    stmt = select(Subject).where(Subject.code == data.code.strip())
    existing = await session.execute(stmt)
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Subject with code '{data.code}' already exists",
        )
    subject = Subject(
        code=data.code.strip(),
        name=data.name.strip(),
        type=data.type,
        description=data.description.strip() if data.description else None,
    )
    session.add(subject)
    await session.commit()
    await session.refresh(subject)
    return SubjectResponse.model_validate(subject)


@router.get("/template")
async def download_subject_template(
    current_user: AdminDep,
) -> StreamingResponse:
    """Download Excel template for subject bulk upload."""
    data = {
        "code": ["301", "702", "TD-B"],
        "name": ["Mathematics", "Science", "Technical Drawing (Building)"],
        "type": ["CORE", "ELECTIVE", "TECHNICAL_DRAWING_BUILDING_OPTION"],
        "description": ["Core mathematics", "General science", ""],
    }
    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Subjects")
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=subject_upload_template.xlsx"},
    )


@router.post("/bulk-upload", response_model=SubjectBulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_subjects(
    session: DBSessionDep,
    current_user: AdminDep,
    file: UploadFile = File(...),
) -> SubjectBulkUploadResponse:
    """Bulk upload subjects from CSV or Excel. Columns: code, name, type (optional), description (optional)."""
    content = await file.read()
    try:
        df = _parse_upload_file(content, file.filename or "")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not parse file: {e!s}",
        )
    df = _normalize_columns(df)
    if "code" not in df.columns or "name" not in df.columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must have columns: code, name (and optionally type, description)",
        )

    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[SubjectBulkUploadError] = []
    batch_codes: set[str] = set()

    for idx, row in df.iterrows():
        row_number = int(idx) + 2
        code = _get_str(row, "code")
        name = _get_str(row, "name")
        type_val = _get_str(row, "type")
        description = _get_str(row, "description")

        if not code:
            errors.append(
                SubjectBulkUploadError(
                    row_number=row_number,
                    error_message="Code is required",
                    field="code",
                )
            )
            failed += 1
            continue
        if not name:
            errors.append(
                SubjectBulkUploadError(
                    row_number=row_number,
                    error_message="Name is required",
                    field="name",
                )
            )
            failed += 1
            continue
        if type_val and type_val not in VALID_SUBJECT_TYPES:
            errors.append(
                SubjectBulkUploadError(
                    row_number=row_number,
                    error_message=f"Type must be one of: {', '.join(sorted(VALID_SUBJECT_TYPES))}",
                    field="type",
                )
            )
            failed += 1
            continue
        if code in batch_codes:
            errors.append(
                SubjectBulkUploadError(
                    row_number=row_number,
                    error_message=f"Duplicate code '{code}' in upload file",
                    field="code",
                )
            )
            failed += 1
            continue

        existing_stmt = select(Subject).where(Subject.code == code)
        existing_result = await session.execute(existing_stmt)
        if existing_result.scalar_one_or_none():
            errors.append(
                SubjectBulkUploadError(
                    row_number=row_number,
                    error_message=f"Subject with code '{code}' already exists",
                    field="code",
                )
            )
            failed += 1
            continue

        subject_type = SubjectType(type_val) if type_val else None
        subject = Subject(
            code=code,
            name=name,
            type=subject_type,
            description=description,
        )
        session.add(subject)
        batch_codes.add(code)
        successful += 1

    await session.commit()
    return SubjectBulkUploadResponse(
        total_rows=total_rows,
        successful=successful,
        failed=failed,
        errors=errors,
    )
